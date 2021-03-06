import {SagaRunner} from '../../../saga_runner';
import {EffectBuilder} from '../../../effect_builder';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {CallableSaga} from '../../../types';
import {withTopicCleanup} from '../../kafka_utils';

describe(SagaRunner.name, function() {
    describe('callFn', function() {
        it('calls the function', async function() {
            const effectBuilder = new EffectBuilder('marge');

            const callEffectDescription = effectBuilder.callFn((tortoise: string) => tortoise, [
                'is not a turtle'
            ]);

            const spy = jest.spyOn(callEffectDescription, 'effect');

            const util = await runnerUtilityFactory();

            await util.runner.runEffect(callEffectDescription, {
                effects: effectBuilder,
                headers: {},
                originalMessage: {
                    key: Buffer.from('key'),
                    value: Buffer.from('value'),
                    offset: '1',
                    partition: 1,
                    timestamp: (new Date().valueOf() / 1000).toString()
                }
            });

            await util.closePools();

            expect(spy.mock.calls).toMatchInlineSnapshot(`
                Array [
                  Array [
                    "is not a turtle",
                  ],
                ]
            `);
        });

        it('allows calling with no arguments provided', async function() {
            const effectBuilder = new EffectBuilder('marge');

            const callEffectDescription = effectBuilder.callFn((tortoise: string) => tortoise);

            const spy = jest.spyOn(callEffectDescription, 'effect');

            const util = await runnerUtilityFactory();

            await util.runner.runEffect(callEffectDescription, {
                effects: effectBuilder,
                headers: {},
                originalMessage: {
                    key: Buffer.from('key'),
                    value: Buffer.from('value'),
                    offset: '1',
                    partition: 1,
                    timestamp: (new Date().valueOf() / 1000).toString()
                }
            });

            await util.closePools();

            expect(spy.mock.calls).toMatchInlineSnapshot(`
                Array [
                  Array [],
                ]
            `);
        });

        it('allows calling another saga', async function() {
            await withTopicCleanup(['smell-ya-later'])(async function() {
                const effectBuilder = new EffectBuilder('marge');

                const util = await runnerUtilityFactory();

                const otherSaga: CallableSaga = function*(input: any, ctx) {
                    yield ctx.effects.callFn(function() {
                        return input;
                    });

                    return 'return-value-from-other-saga';
                };

                let result: any;

                await util.runner.runSaga(
                    {
                        transaction_id: '1',
                        topic: 'smell-ya-later',
                        payload: 3
                    },
                    {
                        effects: effectBuilder,
                        headers: {},
                        originalMessage: {
                            key: Buffer.from('key'),
                            value: Buffer.from('value'),
                            offset: '1',
                            partition: 1,
                            timestamp: (new Date().valueOf() / 1000).toString()
                        }
                    },
                    function*(_, ctx) {
                        result = yield ctx.effects.callFn(otherSaga, [{ding: 3}, ctx]);
                    }
                );

                await util.closePools();

                expect(result).toEqual('return-value-from-other-saga');
            });
        });

        it('Bubbles errors from callable sagas', async function() {
            await withTopicCleanup(['puppies'])(async function([topic]) {
                const effectBuilder = new EffectBuilder('marge');

                const util = await runnerUtilityFactory();

                const otherSaga: CallableSaga = function*() {
                    throw new Error('Big Fail');
                };

                let error: any;

                await util.runner.runSaga(
                    {
                        transaction_id: '1',
                        topic,
                        payload: 3
                    },
                    {
                        effects: effectBuilder,
                        headers: {},
                        originalMessage: {
                            key: Buffer.from('key'),
                            value: Buffer.from('value'),
                            offset: '1',
                            partition: 1,
                            timestamp: (new Date().valueOf() / 1000).toString()
                        }
                    },
                    function*(_, ctx) {
                        try {
                            yield ctx.effects.callFn(otherSaga, [{ding: 3}, ctx]);
                        } catch (err) {
                            error = err;
                        }
                    }
                );

                await util.closePools();

                expect(error).toMatchInlineSnapshot(`[Error: Big Fail]`);
            });
        });
    });
});
