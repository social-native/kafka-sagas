import {SagaRunner} from 'saga_runner';
import {withTopicCleanup} from '../../kafka_utils';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';
import Bluebird from 'bluebird';

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

                    setImmediate(async () => {
                        await runner.runEffect(
                            effectBuilder.put(fast, {
                                bart_simpson: 'first'
                            })
                        );

                        await Bluebird.delay(2000);

                        await runner.runEffect(
                            effectBuilder.put(slow, {
                                bart_simpson: 'second'
                            })
                        );
                    });

                    const payload = await runner.runEffect(
                        effectBuilder.race([effectBuilder.take(fast), effectBuilder.take(slow)])
                    );

                    await closeBuses();

                    expect(payload).toMatchInlineSnapshot(`
                        Object {
                          "payload": Object {
                            "bart_simpson": "first",
                          },
                          "topic": "race-fast",
                          "transaction_id": "static-transaction-id",
                        }
                    `);
                });
            },
            DEFAULT_TEST_TIMEOUT
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

                    setImmediate(async () => {
                        await runner.runEffect(
                            effectBuilder.put(fast, {
                                bart_simpson: 'first'
                            })
                        );

                        await Bluebird.delay(2000);

                        await runner.runEffect(
                            effectBuilder.put(slow, {
                                bart_simpson: 'second'
                            })
                        );
                    });

                    const payload = await runner.runEffect(
                        effectBuilder.race({
                            fast: effectBuilder.take(fast),
                            slow: effectBuilder.take(slow)
                        })
                    );

                    await closeBuses();

                    expect(payload).toMatchInlineSnapshot(`
                        Object {
                          "fast": Object {
                            "payload": Object {
                              "bart_simpson": "first",
                            },
                            "topic": "race-fast",
                            "transaction_id": "static-transaction-id",
                          },
                          "slow": null,
                        }
                    `);
                });
            },
            DEFAULT_TEST_TIMEOUT
        );
    });
});
