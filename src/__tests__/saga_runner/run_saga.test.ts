import {SagaRunner} from '../../saga_runner';
import {withTopicCleanup} from '../kafka_utils';
import {DEFAULT_TEST_TIMEOUT} from '../constants';
import {ConsumerMessageBus} from '../../consumer_message_bus';
import {kafka} from '../test_clients';
import {ProducerMessageBus} from '../../producer_message_bus';
import {EffectBuilder} from '../../effect_builder';
import uuid from 'uuid';
import Bluebird from 'bluebird';
import {CompressionTypes} from 'kafkajs';
import {ActionChannel, IAction, SagaContext} from '../../types';
import {parseHeaders} from '../../parse_headers';

const topics = {
    CLONE_CAMPAIGN_START: 'clone-campaign-start',
    CLONE_CAMPAIGN_COMPLETE: 'clone-campaign-complete',
    CLONE_CAMPAIGN_FAILURE: 'clone-campaign-failure',
    COPY_CAMPAIGN_START: 'copy-campaign-start',
    COPY_CAMPAIGN_COMPLETE: 'copy-campaign-complete',
    COPY_CAMPAIGN_FAILURE: 'copy-campaign-failure'
};

describe(SagaRunner.name, function() {
    describe('.runSaga', function() {
        function coinFlip() {
            return Math.random() >= 0.5;
        }

        function createMockRemoteCopyCampaignSaga(transactionId: string) {
            const consumer = kafka.consumer({
                groupId: uuid.v4()
            });

            const producer = kafka.producer({
                idempotent: true
            });

            return {
                async start() {
                    await producer.connect();
                    await consumer.connect();
                    await consumer.subscribe({topic: 'copy-campaign-start'});
                    await consumer.run({
                        async eachMessage() {
                            /** Simulate some latency */
                            await Bluebird.delay(300);

                            const heads = coinFlip();

                            if (heads) {
                                await producer.send({
                                    acks: -1,
                                    compression: CompressionTypes.GZIP,
                                    topic: topics.COPY_CAMPAIGN_COMPLETE,
                                    messages: [
                                        {
                                            value: JSON.stringify({
                                                transaction_id: transactionId,
                                                payload: {
                                                    createdNodeId: 2022,
                                                    wasSuccessfull: true
                                                }
                                            })
                                        }
                                    ]
                                });
                            } else {
                                await producer.send({
                                    acks: -1,
                                    compression: CompressionTypes.GZIP,
                                    topic: topics.COPY_CAMPAIGN_FAILURE,
                                    messages: [
                                        {
                                            value: JSON.stringify({
                                                transaction_id: transactionId,
                                                payload: {
                                                    createdNodeId: null,
                                                    wasSuccessful: false,
                                                    userErrors: [
                                                        {
                                                            field: 'name',
                                                            message:
                                                                'A campaign already exists with that name.'
                                                        }
                                                    ]
                                                }
                                            })
                                        }
                                    ]
                                });
                            }
                        }
                    });
                },
                async stop() {
                    await producer.disconnect();
                    await consumer.disconnect();
                }
            };
        }

        it(
            'runs a saga to completion',
            async function() {
                await withTopicCleanup(Object.values(topics))(async () => {
                    const transactionId = 'run-saga-trx-id';
                    const remoteSaga = createMockRemoteCopyCampaignSaga(transactionId);
                    await remoteSaga.start();
                    const consumerBus = new ConsumerMessageBus(kafka, topics.CLONE_CAMPAIGN_START);
                    const producerBus = new ProducerMessageBus(kafka);
                    await producerBus.connect();

                    const runner = new SagaRunner<{campaignId: number}, SagaContext>(
                        consumerBus,
                        producerBus
                    );

                    const effectBuilder = new EffectBuilder(transactionId);

                    let cloneSuccess: ICopyResultPayload | null = null;
                    let cloneFailure: ICopyResultPayload | null = null;

                    await runner.runSaga(
                        {
                            transaction_id: transactionId,
                            topic: topics.CLONE_CAMPAIGN_START,
                            payload: {campaignId: 2082}
                        },
                        {
                            effects: effectBuilder,
                            headers: parseHeaders({})
                        },
                        function*({payload: {campaignId}}, {effects}) {
                            const {actionChannel, put, race, take} = effects;

                            const copySuccesschannel: ActionChannel<ICloneCampaignPayload> = yield actionChannel(
                                topics.COPY_CAMPAIGN_COMPLETE
                            );

                            const copyFailureChannel: ActionChannel<{
                                cause: Record<string, any>;
                            }> = yield actionChannel(topics.COPY_CAMPAIGN_FAILURE);

                            const cloneCompleteChannel: ActionChannel<ICloneCampaignPayload> = yield actionChannel(
                                topics.CLONE_CAMPAIGN_COMPLETE
                            );

                            const cloneFailureChannel: ActionChannel<{
                                cause: Record<string, any>;
                            }> = yield actionChannel(topics.CLONE_CAMPAIGN_FAILURE);

                            yield put(topics.COPY_CAMPAIGN_START, {campaignId});

                            const {
                                success,
                                failure
                            }: Record<
                                'success' | 'failure',
                                IAction<ICopyResultPayload>
                            > = yield race({
                                success: take(copySuccesschannel),
                                failure: take(copyFailureChannel)
                            });

                            if (failure) {
                                yield put(topics.CLONE_CAMPAIGN_FAILURE, failure.payload);
                                cloneFailure = yield take(cloneFailureChannel);
                                return;
                            }

                            if (success) {
                                yield put(topics.CLONE_CAMPAIGN_COMPLETE, success.payload);
                                cloneSuccess = yield take(cloneCompleteChannel);
                            }
                        }
                    );

                    /** the next line asserts this. calm down */
                    const finalResult = ((cloneSuccess || cloneFailure) as any) as IAction<
                        ICopyResultPayload
                    >;

                    expect(finalResult).toBeDefined();

                    if (finalResult.payload.wasSuccessful) {
                        expect(finalResult.payload.createdNodeId).toBeDefined();
                    }

                    expect(finalResult.transaction_id).toEqual(transactionId);

                    await consumerBus.disconnectConsumers();
                    await producerBus.disconnect();
                    await remoteSaga.stop();
                });
            },
            DEFAULT_TEST_TIMEOUT * 3
        );
    });
});

interface ICopyResultPayload {
    createdNodeId?: string | number;
    wasSuccessful: boolean;
    userErrors?: Array<{
        field: string;
        message: string;
    }>;
}

interface ICloneCampaignPayload {
    new_campaign_id: number;
}
