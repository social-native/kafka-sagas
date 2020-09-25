import {Kafka, Consumer, KafkaMessage, EachMessagePayload} from 'kafkajs';
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
    ITopicSagaConsumerConfig,
    IConsumptionEvent
} from './types';
import {getLoggerFromConfig} from './logger';
import {parseHeaders} from './parse_headers';
import {TopicAdministrator} from './topic_administrator';
import {isKafkaJSProtocolError} from './type_guard';
import {ConsumptionTimeoutError} from './consumption_timeout_error';

export class TopicSagaConsumer<Payload, Context extends Record<string, any> = Record<string, any>> {
    public eventEmitter = new EventEmitter() as TypedEmitter<{
        comitted_offsets: (...args: any[]) => void;
        completed_saga: (...args: any[]) => void;
        consumed_message: (consumptionEvent: IConsumptionEvent<Payload>) => void;
    }>;

    private config: ITopicSagaConsumerConfig;
    private consumer: Consumer;
    private saga: Saga<Payload, SagaContext<Context>>;
    private topic: string;
    private getContext: (message: KafkaMessage) => Promise<Context>;
    private logger: ReturnType<typeof pino>;
    private middlewares: Array<Middleware<IEffectDescription, SagaContext<Context>>>;

    private topicAdminstrator: TopicAdministrator;
    private consumerPool: ConsumerPool;
    private throttledProducer: ThrottledProducer;

    constructor({
        kafka,
        topic,
        saga,
        getContext = async () => {
            return {} as Context;
        },
        loggerConfig,
        middlewares = [],
        config = {
            /** How often should produced message batches be sent out? */
            producerFlushIntervalMs: 200,

            /** When batching produced messages (with the PUT effect), how many should be flushed at a time? */
            producerBatchSize: 2000,
            /**
             * How much time should be given to a saga to complete
             * before a consumer is considered unhealthy and killed?
             *
             * Providing -1 will allow a saga to run indefinitely.
             */
            consumptionTimeoutMs: 30000,

            /** How often should heartbeats be sent back to the broker? */
            heartbeatInterval: 3000,

            /** How many partitions should be consumed concurrently? */
            partitionConcurrency: 1,

            /**
             * Is this a special consumer group?
             * Use case: Provide a custom consumerGroup if this saga is not the primary consumer of an event.
             * For instance, you may want to have multiple different reactions to an event aside from the primary work
             * to kick off notifactions.
             */
            consumerGroup: undefined
        },
        topicAdministrator
    }: {
        kafka: Kafka;
        topic: string;
        saga: Saga<Payload, SagaContext<Context>>;

        config?: Partial<ITopicSagaConsumerConfig>;
        getContext?: (message: KafkaMessage) => Promise<Context>;
        topicAdministrator?: TopicAdministrator;
        loggerConfig?: ILoggerConfig;
        middlewares?: Array<Middleware<IEffectDescription, SagaContext<Context>>>;
    }) {
        this.consumer = kafka.consumer({
            groupId: config.consumerGroup || topic,
            allowAutoTopicCreation: false,
            retry: {retries: 0},
            heartbeatInterval: config.heartbeatInterval
        });

        this.saga = saga;
        this.topic = topic;
        this.getContext = getContext;
        this.middlewares = middlewares;
        this.config = {
            producerFlushIntervalMs: 200,
            producerBatchSize: 2000,
            consumptionTimeoutMs: 30000,
            heartbeatInterval: 3000,
            partitionConcurrency: 1,
            ...config
        };

        this.logger = getLoggerFromConfig(loggerConfig).child({
            package: 'snpkg-snapi-kafka-sagas'
        });

        this.topicAdminstrator = topicAdministrator || new TopicAdministrator(kafka);

        this.consumerPool = new ConsumerPool(
            kafka,
            topic,
            {retry: {retries: 0}},
            this.topicAdminstrator
        );

        this.throttledProducer = new ThrottledProducer(
            kafka,
            {
                flushIntervalMs: config.producerFlushIntervalMs,
                maxOutgoingBatchSize: config.producerBatchSize
            },
            this.logger
        );

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
            partitionsConsumedConcurrently: this.config.partitionConcurrency,
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
                const backgroundHeartbeat = setInterval(async () => {
                    try {
                        await heartbeat();
                    } catch (error) {
                        this.logger.error(error, error.message);
                    }
                }, this.config.heartbeatInterval);

                for (const message of messages) {
                    if (!isRunning() || isStale()) {
                        break;
                    }

                    try {
                        if (this.config.consumptionTimeoutMs === -1) {
                            await this.eachMessage(runner, {topic, partition, message});
                        } else {
                            await Bluebird.resolve(
                                this.eachMessage(runner, {topic, partition, message})
                            ).timeout(
                                this.config.consumptionTimeoutMs,
                                new ConsumptionTimeoutError(
                                    `Message consumption timed out after ${this.config.consumptionTimeoutMs} milliseconds.`
                                )
                            );
                        }
                    } catch (e) {
                        await commitOffsetsIfNecessary();
                        throw e;
                    }

                    resolveOffset(message.offset);
                    await heartbeat();
                    await commitOffsetsIfNecessary();
                }

                clearInterval(backgroundHeartbeat);
            }
        });
    }

    public async disconnect() {
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

            await runner.runSaga(
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
