import {SagaRunner} from '../../saga_runner';
import {kafka} from '../test_clients';
import {ConsumerMessageBus} from '../../consumer_message_bus';
import {withTopicCleanup} from '../kafka_utils';
import {ProducerMessageBus} from '../../producer_message_bus';
import {EffectBuilder} from '../../effect_builder';
import {isPutEffectDescription} from '../../type_guard';

describe('Saga middleware', function() {
    it('calls middlewares in the correct order', async function() {
        await withTopicCleanup(['middleware-test-order'])(async ([topic]) => {
            const calls: string[] = [];
            const consumerBus = new ConsumerMessageBus(kafka, topic);
            const producerbus = new ProducerMessageBus(kafka);
            await producerbus.connect();

            const sagaRunner = new SagaRunner(consumerBus, producerbus, [
                next => async effect => {
                    calls.push('first');
                    const result = await next(effect);
                    calls.push('second');
                    return result;
                },
                next => async effect => {
                    calls.push('third');
                    const result = await next(effect);
                    calls.push('fourth');
                    return result;
                }
            ]);

            await sagaRunner.runSaga(
                {
                    topic,
                    transaction_id: 'boop',
                    payload: {}
                },
                {
                    effects: new EffectBuilder('boop'),
                    headers: {}
                },
                function*(_, {effects}) {
                    yield effects.put(topic);
                }
            );

            await consumerBus.disconnectConsumers();
            await producerbus.disconnect();

            expect(calls).toEqual(['first', 'second', 'third', 'fourth']);
        });
    });

    it('allows modifying effectDescriptions', async function() {
        await withTopicCleanup(['middleware-test-mutating-effect', 'redirected'])(
            async ([topic]) => {
                const consumerBus = new ConsumerMessageBus(kafka, topic);
                const producerbus = new ProducerMessageBus(kafka);
                await producerbus.connect();

                let redirectedPattern: string | null = null;

                const sagaRunner = new SagaRunner(consumerBus, producerbus, [
                    next => async effect => {
                        if (isPutEffectDescription(effect)) {
                            effect.pattern = 'redirected';
                        }

                        return await next(effect);
                    },
                    next => async effect => {
                        if (isPutEffectDescription(effect)) {
                            redirectedPattern = effect.pattern;
                        }

                        return await next(effect);
                    }
                ]);

                await sagaRunner.runSaga(
                    {
                        topic,
                        transaction_id: 'boop',
                        payload: {}
                    },
                    {
                        effects: new EffectBuilder('boop'),
                        headers: {}
                    },
                    function*(_, {effects}) {
                        yield effects.put(topic);
                    }
                );

                await consumerBus.disconnectConsumers();
                await producerbus.disconnect();

                expect(redirectedPattern).toEqual('redirected');
            }
        );
    });
});
