import {SagaRunner} from 'saga_runner';
import {withTopicCleanup} from '../../kafka_utils';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';

describe(SagaRunner.name, function() {
    describe('all', function() {
        it(
            'runs all of an array of effects',
            async function() {
                await withTopicCleanup(['test-all-1'])(async ([topic]) => {
                    const {effectBuilder, runner, closeBuses} = await runnerUtilityFactory();
                    const channel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(topic);
                    await runner.runEffect(channel);
                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'first'
                        })
                    );

                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'second'
                        })
                    );

                    const payload = await runner.runEffect(
                        effectBuilder.all([
                            effectBuilder.take(channel),
                            effectBuilder.take(channel)
                        ])
                    );

                    expect(payload).toMatchSnapshot();

                    await closeBuses();
                });
            },
            DEFAULT_TEST_TIMEOUT
        );

        it(
            'runs all of a record of effects',
            async function() {
                await withTopicCleanup(['test-all-1'])(async ([topic]) => {
                    const {effectBuilder, runner, closeBuses} = await runnerUtilityFactory();
                    const channel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(topic);
                    await runner.runEffect(channel);
                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'first'
                        })
                    );

                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'second'
                        })
                    );

                    const payload = await runner.runEffect(
                        effectBuilder.all({
                            one: effectBuilder.take(channel),
                            two: effectBuilder.take(channel)
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
