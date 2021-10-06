import {Kafka, Consumer, KafkaMessage, EachMessagePayload, ConsumerConfig} from 'kafkajs';
import Bluebird from 'bluebird';
import EventEmitter from 'events';
import TypedEmitter from 'typed-emitter';
import pino from 'pino';

import {EffectBuilder} from './effect_builder';
import {ConsumerPool} from './consumer_pool';
import {transformKafkaMessageToAction} from './transform_kafka_message_to_action';
import {ThrottledProducer} from './throttled_producer';
import {SagaRunner} from './saga_runner';
import {
    SagaContext,
    Saga,
    Middleware,
    IEffectDescription,
    IConsumptionEvent,
    SagaProducerConfig,
    SagaConsumerConfig,
    ICompensationConfig,
    Logger
} from './types';
import {parseHeaders} from './parse_headers';
import {TopicAdministrator} from './topic_administrator';
import {isKafkaJSProtocolError} from './type_guard';
import {ConsumptionTimeoutError} from './consumption_timeout_error';
import {Compensator} from './compensator';
import {ICompensationEffectDescription} from '.';

export class TopicSagaConsumer<Payload, Context extends Record<string, any> = Record<string, any>> {
    public eventEmitter = new EventEmitter() as TypedEmitter<{
        comitted_offsets: (...args: any[]) => void;
        started_saga: (...args: any[]) => void;
        completed_saga: (...args: any[]) => void;
        consumed_message: (consumptionEvent: IConsumptionEvent<Payload>) => void;
    }>;

    protected consumer: Consumer;
    protected compensator: Compensator<SagaContext<Context>>;
    protected saga: Saga<Payload, SagaContext<Context>>;
    protected topic: string;
    protected getContext: (message: KafkaMessage) => Promise<Context>;
    protected logger: Logger;
    protected middlewares: Array<Middleware<IEffectDescription, SagaContext<Context>>>;
    protected consumerConfig: ConsumerConfig;
    protected producerConfig: SagaProducerConfig;
    protected consumptionTimeoutMs: number;

    protected topicAdminstrator: TopicAdministrator;
    protected consumerPool: ConsumerPool;
    protected throttledProducer: ThrottledProducer;
    protected backgroundHeartbeat?: NodeJS.Timeout;

    // tslint:disable-next-line: cyclomatic-complexity
    constructor({
        kafka,
        topic,
        saga,
        getContext = async () => {
            return {} as Context;
        },
        logger,
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
        compensationConfig?: Partial<ICompensationConfig>;
        getContext?: (message: KafkaMessage) => Promise<Context>;
        topicAdministrator?: TopicAdministrator;
        middlewares?: Array<Middleware<IEffectDescription, SagaContext<Context>>>;
        logger?: Logger;
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

        if (this.consumptionTimeoutMs !== -1 && this.consumptionTimeoutMs < 0) {
            throw new Error(
                `Invalid consumptionTimeoutMs provided: ${consumptionTimeoutMs}. Must be either -1 or a positive integer.`
            );
        }

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

        this.logger = logger
            ? logger.child({
                  kafka_saga: true,
                  topic
              })
            : pino({
                  base: {
                      kafka_saga: true,
                      topic
                  }
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

        this.compensator = new Compensator<SagaContext<Context>>(
            this.consumerPool,
            this.throttledProducer
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

        const externalContext = await this.getContext(message);

        /**
         * Do not include `addCompensation` hook by default to prevent
         * adding compensation while already compensating, creating
         * undefined behavior.
         */
        const context: SagaContext<Context> = {
            ...externalContext,
            headers: parseHeaders(message.headers),
            effects: new EffectBuilder(action.transaction_id),
            originalMessage: {
                key: message.key,
                value: message.value,
                offset: message.offset,
                timestamp: message.timestamp,
                partition
            }
        };

        /** Compensation is per each distinct workload. */
        // tslint:disable-next-line: max-line-length
        const compensationId = `${action.topic}-part_${partition}-offset_${message.offset}-trx_${action.transaction_id}`;

        this.compensator.initializeCompensationChain(compensationId);

        try {
            this.eventEmitter.emit('started_saga', {
                headers: parseHeaders(message.headers),
                ...externalContext,
                originalMessage: {
                    key: message.key,
                    value: message.value,
                    offset: message.offset,
                    timestamp: message.timestamp,
                    partition
                }
            });

            let didCompleteSaga: boolean = false;
            let isCompensating: boolean = false;

            const tasks: Array<() => Promise<void>> = [
                async () => {
                    runner.runSaga(
                        action,
                        {
                            ...context,
                            compensation: {
                                add: (effect: ICompensationEffectDescription<any>) =>
                                    this.compensator.addCompensation(compensationId, effect),
                                runAll: async (
                                    config: ICompensationConfig = {
                                        dontReverse: false,
                                        parallel: false
                                    }
                                ) => {
                                    isCompensating = true;

                                    await this.compensator.compensate(
                                        compensationId,
                                        config,
                                        context
                                    );

                                    // Reset chain to an empty state.
                                    this.compensator.initializeCompensationChain(compensationId);
                                },
                                viewChain: () => this.compensator.getChain(compensationId)
                            }
                        },
                        this.saga
                    );

                    didCompleteSaga = true;
                }
            ];

            if (this.consumptionTimeoutMs !== -1) {
                tasks.push(async () => {
                    await Bluebird.delay(this.consumptionTimeoutMs);

                    if (!didCompleteSaga && !isCompensating) {
                        throw new ConsumptionTimeoutError(
                            `Message consumption timed out after ${this.consumptionTimeoutMs} milliseconds.`
                        );
                    }
                });
            }

            await Bluebird.race(tasks.map(task => task()));

            this.compensator.removeCompensationChain(compensationId);

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
            this.compensator.removeCompensationChain(compensationId);

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
