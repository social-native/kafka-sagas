import {SagaRunner} from 'saga_runner';
import {withTopicCleanup} from '../../kafka_utils';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';

describe(SagaRunner.name, function() {
    describe('race', function() {
        it(
            'races an array of effects',
            async function() {
                await withTopicCleanup(['race-fast', 'race-slow'])(async ([fast, slow]) => {
                    const {effectBuilder, runner, closeBuses} = await runnerUtilityFactory();
                    const fastChannel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(fast);

                    const slowChannel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(slow);

                    await runner.runEffect(fastChannel);
                    await runner.runEffect(slowChannel);

                    setTimeout(async () => {
                        await runner.runEffect(
                            effectBuilder.put(fast, {
                                bart_simpson: 'first'
                            })
                        );
                    }, 2000);

                    setTimeout(async () => {
                        await runner.runEffect(
                            effectBuilder.put(slow, {
                                bart_simpson: 'second'
                            })
                        );
                    }, 5000);

                    const payload = await runner.runEffect(
                        effectBuilder.race([effectBuilder.take(fast), effectBuilder.take(slow)])
                    );

                    expect(payload).toMatchSnapshot();

                    await closeBuses();
                });
            },
            DEFAULT_TEST_TIMEOUT * 2
        );

        it(
            'runs all of a record of effects',
            async function() {
                await withTopicCleanup(['race-fast', 'race-slow'])(async ([fast, slow]) => {
                    const {effectBuilder, runner, closeBuses} = await runnerUtilityFactory();
                    const fastChannel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(fast);

                    const slowChannel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(slow);

                    await runner.runEffect(fastChannel);
                    await runner.runEffect(slowChannel);

                    setTimeout(async () => {
                        await runner.runEffect(
                            effectBuilder.put(fast, {
                                bart_simpson: 'first'
                            })
                        );
                    }, 2000);

                    setTimeout(async () => {
                        await runner.runEffect(
                            effectBuilder.put(slow, {
                                bart_simpson: 'second'
                            })
                        );
                    }, 5000);

                    const payload = await runner.runEffect(
                        effectBuilder.race({
                            fast: effectBuilder.take(fast),
                            slow: effectBuilder.take(slow)
                        })
                    );

                    expect(payload).toMatchSnapshot();

                    await closeBuses();
                });
            },
            DEFAULT_TEST_TIMEOUT
        );
    });
});
