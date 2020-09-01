import {Kafka, Consumer, KafkaMessage} from 'kafkajs';
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
    ITopicSagaConsumerConfig
} from './types';
import {getLoggerFromConfig} from './logger';
import {parseHeaders} from './parse_headers';
import {TopicAdministrator} from './topic_administrator';
import {isKafkaJSProtocolError} from './type_guard';

export class TopicSagaConsumer<
    InitialActionPayload,
    Context extends Record<string, any> = Record<string, any>
> {
    public eventEmitter = new EventEmitter() as TypedEmitter<{
        comitted_offsets: (...args: any[]) => void;
        completed_saga: (...args: any[]) => void;
    }>;

    private config: ITopicSagaConsumerConfig;
    private consumer: Consumer;
    private saga: Saga<InitialActionPayload, SagaContext<Context>>;
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
            /** How long should a message be allowed to process before automatic retry? */
            consumptionTimeoutMs: 30000,
            /** How many partitions should be consumed concurrently? */
            partitionConcurrency: 1
        },
        topicAdministrator
    }: {
        kafka: Kafka;
        topic: string;
        saga: Saga<InitialActionPayload, SagaContext<Context>>;

        config?: ITopicSagaConsumerConfig;
        getContext?: (message: KafkaMessage) => Promise<Context>;
        topicAdministrator?: TopicAdministrator;
        loggerConfig?: ILoggerConfig;
        middlewares?: Array<Middleware<IEffectDescription, SagaContext<Context>>>;
    }) {
        this.consumer = kafka.consumer({
            groupId: topic,
            allowAutoTopicCreation: false,
            retry: {retries: 0},
            sessionTimeout: config.consumptionTimeoutMs
        });

        this.saga = saga;
        this.topic = topic;
        this.getContext = getContext;
        this.middlewares = middlewares;
        this.config = config;

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
            undefined,
            this.topicAdminstrator,
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

        const runner = new SagaRunner<InitialActionPayload, SagaContext<Context>>(
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
            eachMessage: async ({message}) => {
                const initialAction = transformKafkaMessageToAction<InitialActionPayload>(
                    this.topic,
                    message
                );

                this.logger.info(
                    {
                        topic: initialAction.topic,
                        transaction_id: initialAction.transaction_id,
                        headers: initialAction.headers,
                        timestamp: Date.now()
                    },
                    'Beginning consumption of message'
                );

                try {
                    const externalContext = await this.getContext(message);

                    await runner.runSaga(
                        initialAction,
                        {
                            headers: parseHeaders(message.headers),
                            ...externalContext,
                            effects: new EffectBuilder(initialAction.transaction_id)
                        },
                        this.saga
                    );

                    this.logger.info(
                        {
                            topic: initialAction.topic,
                            transaction_id: initialAction.transaction_id,
                            headers: initialAction.headers,
                            timestamp: Date.now()
                        },
                        'Successfully consumed message'
                    );
                } catch (error) {
                    this.consumerPool.stopTransaction(initialAction.transaction_id);
                    this.logger.error(
                        {
                            transaction_id: initialAction.transaction_id,
                            topic: initialAction.topic,
                            headers: initialAction.headers,
                            timestamp: Date.now(),
                            error
                        },
                        error.message
                            ? `Error while running ${this.topic} saga: ${error.message}`
                            : `Error while running ${this.topic} saga`
                    );
                }
            }
        });
    }

    public async disconnect() {
        await this.consumer.disconnect();
        await Bluebird.all([
            this.consumerPool.disconnectConsumers(),
            this.throttledProducer.disconnect()
        ]);
    }
}
