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
                headers: {}
            });

            await util.closeBuses();

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
                headers: {}
            });

            await util.closeBuses();

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
                        headers: {}
                    },
                    function*(_, ctx) {
                        result = yield ctx.effects.callFn(otherSaga, [{ding: 3}, ctx]);
                    }
                );

                await util.closeBuses();

                expect(result).toEqual('return-value-from-other-saga');
            });
        });
    });
});
