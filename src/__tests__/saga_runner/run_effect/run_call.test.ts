import {SagaRunner} from '../../../saga_runner';
import {EffectBuilder} from '../../../effect_builder';
import {runnerUtilityFactory} from '../runner_utility_factory';

describe(SagaRunner.name, function() {
    describe('call', function() {
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
    });
});
