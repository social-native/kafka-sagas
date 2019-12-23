import {Kafka, Consumer, KafkaMessage} from 'kafkajs';
import Bluebird from 'bluebird';
import pino from 'pino';

import {EffectBuilder} from './effect_builder';
import {ConsumerMessageBus} from './consumer_message_bus';
import {transformKafkaMessageToAction} from './transform_kafka_message_to_action';
import {ProducerMessageBus} from './producer_message_bus';
import {SagaRunner} from './saga_runner';
import {SagaContext, Saga, ILoggerConfig, Middleware} from './types';
import {getLoggerFromConfig} from './logger';
import {parseHeaders} from './parse_headers';
import {TopicAdministrator} from './topic_administrator';

export class TopicSagaConsumer<
    InitialActionPayload,
    Context extends Record<string, any> = Record<string, any>
> {
    private consumer: Consumer;
    private saga: Saga<InitialActionPayload, SagaContext<Context>>;
    private topic: string;
    private getContext: (message: KafkaMessage) => Promise<Context>;
    private logger: ReturnType<typeof pino>;
    private middlewares: Middleware[];

    private consumerMessageBus: ConsumerMessageBus;
    private producerMessageBus: ProducerMessageBus;

    constructor({
        kafka,
        topic,
        saga,
        getContext = async () => {
            return {} as Context;
        },
        loggerConfig,
        middlewares = [],
        topicAdministrator
    }: {
        kafka: Kafka;
        topic: string;
        topicAdministrator?: TopicAdministrator;
        saga: Saga<InitialActionPayload, SagaContext<Context>>;
        getContext?: (message: KafkaMessage) => Promise<Context>;
        loggerConfig?: ILoggerConfig;
        middlewares?: Middleware[];
    }) {
        this.consumer = kafka.consumer({
            groupId: topic,
            allowAutoTopicCreation: true
        });

        this.saga = saga;
        this.topic = topic;
        this.getContext = getContext;
        this.middlewares = middlewares;

        this.logger = getLoggerFromConfig(loggerConfig).child({
            package: 'snpkg-snapi-kafka-sagas'
        });

        this.consumerMessageBus = new ConsumerMessageBus(
            kafka,
            topic,
            undefined,
            topicAdministrator
        );

        this.producerMessageBus = new ProducerMessageBus(kafka);

        this.run = this.run.bind(this);
        this.disconnect = this.disconnect.bind(this);
    }

    /**
     * Catching and crashing is left to consumers of this class
     * so that they can log as they see fit.
     */
    public async run() {
        await this.consumer.subscribe({
            topic: this.topic,
            fromBeginning: true
        });

        await this.producerMessageBus.connect();

        const runner = new SagaRunner(
            this.consumerMessageBus,
            this.producerMessageBus,
            this.middlewares
        );

        await this.consumer.run({
            autoCommit: true,
            autoCommitThreshold: 1,
            eachMessage: async ({message}) => {
                const initialAction = transformKafkaMessageToAction<InitialActionPayload>(
                    this.topic,
                    message
                );

                this.logger.info(
                    {
                        topic: initialAction.topic,
                        transaction_id: initialAction.transaction_id,
                        user_id: initialAction.userId,
                        user_roles: initialAction.userRoles,
                        timestamp: Date.now()
                    },
                    'Beginning consumption of message'
                );

                try {
                    const externalContext = await this.getContext(message);

                    await runner.runSaga<InitialActionPayload, SagaContext<Context>>(
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
                            user_id: initialAction.userId,
                            user_roles: initialAction.userRoles,
                            timestamp: Date.now()
                        },
                        'Successfully consumed message'
                    );
                } catch (error) {
                    this.consumerMessageBus.stopTransaction(initialAction.transaction_id);
                    this.logger.error(
                        {
                            transaction_id: initialAction.transaction_id,
                            topic: initialAction.topic,
                            user_id: initialAction.userId,
                            user_roles: initialAction.userRoles,
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
            this.consumerMessageBus.disconnectConsumers(),
            this.producerMessageBus.disconnect()
        ]);
    }
}
