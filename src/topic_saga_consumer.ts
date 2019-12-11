import {Kafka, Consumer} from 'kafkajs';
import Bluebird from 'bluebird';
import {EffectBuilder} from './effect_builder';
import {ConsumerMessageBus} from './consumer_message_bus';
import {buildActionFromPayload} from './build_action_from_payload';
import {ProducerMessageBus} from './producer_message_bus';
import {SagaRunner} from './saga_runner';
import {SagaContext, Saga} from './types';

export class TopicSagaConsumer<
    InitialActionPayload,
    Context extends Record<string, any> = Record<string, any>
> {
    private consumer: Consumer;
    private saga: Saga<InitialActionPayload, SagaContext<Context>>;
    private topic: string;
    private getContext: () => Promise<Context>;

    private consumerMessageBus: ConsumerMessageBus;
    private producerMessageBus: ProducerMessageBus;

    constructor({
        kafka,
        topic,
        saga,
        getContext = async () => {
            return {} as Context;
        }
    }: {
        kafka: Kafka;
        topic: string;
        saga: Saga<InitialActionPayload, SagaContext<Context>>;
        getContext: () => Promise<Context>;
    }) {
        this.consumer = kafka.consumer({
            groupId: topic,
            allowAutoTopicCreation: true
        });

        this.saga = saga;
        this.topic = topic;
        this.getContext = getContext;

        this.consumerMessageBus = new ConsumerMessageBus(kafka, topic);
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

        const runner = new SagaRunner(this.consumerMessageBus, this.producerMessageBus);

        await this.consumer.run({
            autoCommit: true,
            autoCommitThreshold: 1,
            eachMessage: async ({message}) => {
                const initialAction = buildActionFromPayload<InitialActionPayload>(
                    this.topic,
                    message
                );

                try {
                    const externalContext = await this.getContext();

                    await runner.runSaga<InitialActionPayload, SagaContext<Context>>(
                        initialAction,
                        {
                            ...externalContext,
                            effects: new EffectBuilder(initialAction.transaction_id)
                        },
                        this.saga
                    );
                } catch (error) {
                    this.consumerMessageBus.stopTransaction(initialAction.transaction_id);
                    throw error;
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
