import {Kafka, Consumer, KafkaMessage, EachMessagePayload, ConsumerConfig} from 'kafkajs';
import Bluebird from 'bluebird';
import pino from 'pino';
import EventEmitter from 'events';
import TypedEmitter from 'typed-emitter';

import {EffectBuilder} from './effect_builder';
import {ConsumerPool} from './consumer_pool';
import {transformKafkaMessageToAction} from './transform_kafka_message_to_action';
import {ThrottledProducer} from './throttled_producer';
import {SagaRunner} from './saga_runner';
import {
    SagaContext,
    Saga,
    ILoggerConfig,
    Middleware,
    IEffectDescription,
    IConsumptionEvent,
    SagaProducerConfig,
    SagaConsumerConfig
} from './types';
import {getLoggerFromConfig} from './logger';
import {parseHeaders} from './parse_headers';
import {TopicAdministrator} from './topic_administrator';
import {isKafkaJSProtocolError} from './type_guard';
import {ConsumptionTimeoutError} from './consumption_timeout_error';

export class TopicSagaConsumer<Payload, Context extends Record<string, any> = Record<string, any>> {
    public eventEmitter = new EventEmitter() as TypedEmitter<{
        comitted_offsets: (...args: any[]) => void;
        started_saga: (...args: any[]) => void;
        completed_saga: (...args: any[]) => void;
        consumed_message: (consumptionEvent: IConsumptionEvent<Payload>) => void;
    }>;

    protected consumer: Consumer;
    protected saga: Saga<Payload, SagaContext<Context>>;
    protected topic: string;
    protected getContext: (message: KafkaMessage) => Promise<Context>;
    protected logger: ReturnType<typeof pino>;
    protected middlewares: Array<Middleware<IEffectDescription, SagaContext<Context>>>;
    protected consumerConfig: ConsumerConfig;
    protected producerConfig: SagaProducerConfig;
    protected consumptionTimeoutMs: number;

    protected topicAdminstrator: TopicAdministrator;
    protected consumerPool: ConsumerPool;
    protected throttledProducer: ThrottledProducer;
    protected backgroundHeartbeat?: NodeJS.Timeout;

    constructor({
        kafka,
        topic,
        saga,
        getContext = async () => {
            return {} as Context;
        },
        loggerConfig,
        middlewares = [],
        consumerConfig = {
            /** How often should heartbeats be sent back to the broker? */
            heartbeatInterval: 3000,

            /** Allows main consumer and action channel consumers to create new topics. */
            allowAutoTopicCreation: false,

            /**
             * Is this a special consumer group?
             * Use case: Provide a custom consumerGroup if this saga is not the primary consumer of an event.
             * For instance, you may want to have multiple different reactions to an event aside from the primary work
             * to kick off notifactions.
             */
            groupId: topic,
            /**
             * How much time should be given to a saga to complete
             * before a consumer is considered unhealthy and killed?
             *
             * Providing -1 will allow a saga to run indefinitely.
             */
            consumptionTimeoutMs: 60000,

            /**
             * How long should the broker wait before responding in the case of too small a number of records to return?
             */
            maxWaitTimeInMs: 100
        },
        producerConfig = {
            /** Allows producer to create new topics. */
            allowAutoTopicCreation: false,
            /** How often should produced message batches be sent out? */
            flushIntervalMs: 100,

            /** When batching produced messages (with the PUT effect), how many should be flushed at a time? */
            maxOutgoingBatchSize: 1000
        },
        topicAdministrator
    }: {
        kafka: Kafka;
        topic: string;
        saga: Saga<Payload, SagaContext<Context>>;
        consumerConfig?: Partial<SagaConsumerConfig>;
        producerConfig?: Partial<SagaProducerConfig>;
        getContext?: (message: KafkaMessage) => Promise<Context>;
        topicAdministrator?: TopicAdministrator;
        loggerConfig?: ILoggerConfig;
        middlewares?: Array<Middleware<IEffectDescription, SagaContext<Context>>>;
    }) {
        const {consumptionTimeoutMs, ...kafkaConsumerConfig} = consumerConfig;

        this.consumerConfig = {
            groupId: topic,
            allowAutoTopicCreation: false,
            retry: {retries: 0},
            heartbeatInterval: 3000,
            maxWaitTimeInMs: 100,
            ...kafkaConsumerConfig
        };

        this.consumptionTimeoutMs = consumptionTimeoutMs || 60000;

        this.producerConfig = {
            /** Allows producer to create new topics. */
            allowAutoTopicCreation: false,
            /** How often should produced message batches be sent out? */
            flushIntervalMs: 100,

            /** When batching produced messages (with the PUT effect), how many should be flushed at a time? */
            maxOutgoingBatchSize: 1000,
            ...producerConfig
        };

        this.saga = saga;
        this.topic = topic;
        this.getContext = getContext;
        this.middlewares = middlewares;

        this.logger = getLoggerFromConfig(loggerConfig).child({
            package: 'snpkg-snapi-kafka-sagas'
        });

        this.topicAdminstrator = topicAdministrator || new TopicAdministrator(kafka);

        this.consumer = kafka.consumer(this.consumerConfig);

        this.consumerPool = new ConsumerPool(
            kafka,
            topic,
            {
                retry: {retries: 0},
                heartbeatInterval: kafkaConsumerConfig.heartbeatInterval || 500,
                maxWaitTimeInMs: kafkaConsumerConfig.maxWaitTimeInMs || 100
            },
            this.topicAdminstrator
        );

        this.throttledProducer = new ThrottledProducer(kafka, this.producerConfig, this.logger);

        this.run = this.run.bind(this);
        this.disconnect = this.disconnect.bind(this);
    }

    /**
     * Catching and crashing is left to consumers of this class
     * so that they can log as they see fit.
     */
    public async run() {
        try {
            await this.consumer.subscribe({
                topic: this.topic,
                fromBeginning: true
            });
        } catch (error) {
            if (isKafkaJSProtocolError(error) && error.type === 'UNKNOWN_TOPIC_OR_PARTITION') {
                this.logger.info(
                    {topic: this.topic},
                    'Unknown topic. Creating topic and partitions.'
                );

                await this.topicAdminstrator.createTopic(this.topic);
            } else {
                throw error;
            }
        }

        await this.throttledProducer.connect();

        const runner = new SagaRunner<Payload, SagaContext<Context>>(
            this.consumerPool,
            this.throttledProducer,
            this.middlewares
        );

        this.consumer.on('consumer.commit_offsets', (...args) => {
            this.eventEmitter.emit('comitted_offsets', ...args);
        });

        this.consumer.on('consumer.end_batch_process', (...args) => {
            this.eventEmitter.emit('completed_saga', ...args);
        });

        await this.consumer.run({
            autoCommit: true,
            autoCommitThreshold: 1,
            eachBatchAutoResolve: true,
            // tslint:disable-next-line: cyclomatic-complexity
            eachBatch: async ({
                batch: {topic, partition, messages},
                commitOffsetsIfNecessary,
                heartbeat,
                resolveOffset,
                isRunning,
                isStale
            }) => {
                for (const message of messages) {
                    if (!isRunning() || isStale()) {
                        break;
                    }

                    try {
                        await heartbeat();

                        this.backgroundHeartbeat = setInterval(async () => {
                            try {
                                await heartbeat();
                            } catch (error) {
                                this.logger.error({step: 'Heartbeat', ...error}, error.message);

                                if (this.backgroundHeartbeat) {
                                    clearInterval(this.backgroundHeartbeat);
                                    this.backgroundHeartbeat = undefined;
                                }
                            }
                        }, this.consumerConfig.heartbeatInterval || 500);

                        await this.eachMessage(runner, {topic, partition, message});

                        clearInterval(this.backgroundHeartbeat);
                        this.backgroundHeartbeat = undefined;

                        await heartbeat();
                    } catch (e) {
                        if (this.backgroundHeartbeat) {
                            clearInterval(this.backgroundHeartbeat);
                            this.backgroundHeartbeat = undefined;
                        }

                        await commitOffsetsIfNecessary();
                        throw e;
                    }

                    resolveOffset(message.offset);
                    await heartbeat();
                    await commitOffsetsIfNecessary();
                }

                if (this.backgroundHeartbeat) {
                    clearInterval(this.backgroundHeartbeat);
                    this.backgroundHeartbeat = undefined;
                }
            }
        });
    }

    public async disconnect() {
        if (this.backgroundHeartbeat) {
            clearInterval(this.backgroundHeartbeat);
            this.backgroundHeartbeat = undefined;
        }

        await this.consumer.stop();
        await this.consumer.disconnect();
        await this.consumerPool.disconnectConsumers();
        await this.throttledProducer.disconnect();
    }

    private eachMessage = async (
        runner: SagaRunner<Payload, SagaContext<Context>>,
        {partition, message}: EachMessagePayload
    ): Promise<void> => {
        const action = transformKafkaMessageToAction<Payload>(this.topic, message);

        this.logger.info(
            {
                partition,
                offset: message.offset,
                topic: action.topic,
                transaction_id: action.transaction_id,
                headers: action.headers,
                timestamp: Date.now()
            },
            'Beginning consumption of message'
        );

        try {
            const externalContext = await this.getContext(message);

            this.eventEmitter.emit('started_saga', {
                headers: parseHeaders(message.headers),
                ...externalContext,
                effects: new EffectBuilder(action.transaction_id),
                originalMessage: {
                    key: message.key,
                    value: message.value,
                    offset: message.offset,
                    timestamp: message.timestamp,
                    partition
                }
            });

            await Bluebird.resolve(
                runner.runSaga(
                    action,
                    {
                        headers: parseHeaders(message.headers),
                        ...externalContext,
                        effects: new EffectBuilder(action.transaction_id),
                        originalMessage: {
                            key: message.key,
                            value: message.value,
                            offset: message.offset,
                            timestamp: message.timestamp,
                            partition
                        }
                    },
                    this.saga
                )
            ).timeout(
                this.consumptionTimeoutMs,
                new ConsumptionTimeoutError(
                    `Message consumption timed out after ${this.consumptionTimeoutMs} milliseconds.`
                )
            );

            this.eventEmitter.emit('consumed_message', {
                partition,
                offset: message.offset,
                payload: action.payload
            });

            this.logger.info(
                {
                    partition,
                    offset: message.offset,
                    topic: action.topic,
                    transaction_id: action.transaction_id,
                    headers: action.headers,
                    timestamp: Date.now()
                },
                'Successfully consumed message'
            );
        } catch (error) {
            this.consumerPool.stopTransaction(action.transaction_id);
            this.logger.error(
                {
                    transaction_id: action.transaction_id,
                    topic: action.topic,
                    headers: action.headers,
                    timestamp: Date.now(),
                    error
                },
                error.message
                    ? `Error while running ${this.topic} saga: ${error.message}`
                    : `Error while running ${this.topic} saga`
            );
        }
    };
}
