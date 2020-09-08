import Bluebird from 'bluebird';
import {SagaRunner} from '../../../saga_runner';
import {EffectBuilder} from '../../../effect_builder';
import {runnerUtilityFactory} from '../runner_utility_factory';

describe(SagaRunner.name, function() {
    describe('delay', function() {
        it('delays for the amount of time specified and then resolves the payload', async function() {
            const effectBuilder = new EffectBuilder('marge');

            const delayEffectDescription = effectBuilder.delay(500, 'toolbelt');

            const util = await runnerUtilityFactory();

            const result = await Bluebird.race([
                Bluebird.delay(600).then(() => 'poolbelt'),
                util.runner.runEffect(delayEffectDescription, {
                    effects: effectBuilder,
                    headers: {},
                    originalMessage: {
                        key: Buffer.from('key'),
                        value: Buffer.from('value'),
                        offset: '1',
                        partition: 1,
                        timestamp: (new Date().valueOf() / 1000).toString()
                    }
                })
            ]);

            await util.closePools();

            expect(result).toEqual('toolbelt');
        });
    });
});
