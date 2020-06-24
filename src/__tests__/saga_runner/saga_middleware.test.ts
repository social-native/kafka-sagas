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
                next => async (effectDescription, ctx) => {
                    calls.push('first');
                    const result = await next(effectDescription, ctx);
                    calls.push('fourth');
                    return result;
                },
                next => async (effectDescription, ctx) => {
                    calls.push('second');
                    const result = await next(effectDescription, ctx);
                    calls.push('third');
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
                    next => async (effect, ctx) => {
                        if (isPutEffectDescription(effect)) {
                            effect.pattern = 'redirected';
                        }

                        return await next(effect, ctx);
                    },
                    next => async (effect, ctx) => {
                        if (isPutEffectDescription(effect)) {
                            redirectedPattern = effect.pattern;
                        }

                        return await next(effect, ctx);
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

    it('bubbles errors up from middleware into the saga', async function() {
        await withTopicCleanup(['middleware-test-error-bubbling'])(async ([topic]) => {
            const consumerBus = new ConsumerMessageBus(kafka, topic);
            const producerbus = new ProducerMessageBus(kafka);
            await producerbus.connect();

            const sagaRunner = new SagaRunner(consumerBus, producerbus, [
                () => async () => {
                    throw new Error('Symbolic Error');
                }
            ]);

            let error: Error | undefined;

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
                    try {
                        yield effects.put(topic);
                    } catch (err) {
                        error = err;
                    }
                }
            );

            await consumerBus.disconnectConsumers();
            await producerbus.disconnect();
            expect(error).toMatchInlineSnapshot(`[Error: Symbolic Error]`);
        });
    });

    it('runs effects with middleware from error continuation in the saga', async function() {
        await withTopicCleanup(['middleware-test-error-bubbling'])(async ([topic]) => {
            const consumerBus = new ConsumerMessageBus(kafka, topic);
            const producerbus = new ProducerMessageBus(kafka);
            await producerbus.connect();

            const spyMiddleware = jest
                .fn()
                .mockImplementation(
                    (next: (...args: any[]) => any) => async (effect: any, context: any) =>
                        next(effect, context)
                );

            const sagaRunner = new SagaRunner(consumerBus, producerbus, [spyMiddleware]);

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
                    try {
                        throw new Error('Asdf1');
                    } catch (err) {
                        yield effects.put(topic);
                    }
                }
            );

            await consumerBus.disconnectConsumers();
            await producerbus.disconnect();
            expect(spyMiddleware.mock.calls.length).toEqual(1);
        });
    });
});
