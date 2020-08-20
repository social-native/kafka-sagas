import {SagaRunner} from '../../../saga_runner';
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
                    const {
                        effectBuilder,
                        runner,
                        closePools,
                        context
                    } = await runnerUtilityFactory();
                    const fastChannel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(fast);

                    const slowChannel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(slow);

                    await runner.runEffect(fastChannel, context);
                    await runner.runEffect(slowChannel, context);

                    setImmediate(async () => {
                        await runner.runEffect(
                            effectBuilder.put(fast, {
                                bart_simpson: 'first'
                            }),
                            context
                        );

                        await Bluebird.delay(2000);

                        await runner.runEffect(
                            effectBuilder.put(slow, {
                                bart_simpson: 'second'
                            }),
                            context
                        );
                    });

                    const payload = await runner.runEffect(
                        effectBuilder.race([effectBuilder.take(fast), effectBuilder.take(slow)]),
                        context
                    );

                    await closePools();

                    expect(payload).toMatchInlineSnapshot(`
                        Object {
                          "headers": Object {},
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
                    const {
                        effectBuilder,
                        runner,
                        closePools,
                        context
                    } = await runnerUtilityFactory();
                    const fastChannel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(fast);

                    const slowChannel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(slow);

                    await runner.runEffect(fastChannel, context);
                    await runner.runEffect(slowChannel, context);

                    setImmediate(async () => {
                        await runner.runEffect(
                            effectBuilder.put(fast, {
                                bart_simpson: 'first'
                            }),
                            context
                        );

                        await Bluebird.delay(2000);

                        await runner.runEffect(
                            effectBuilder.put(slow, {
                                bart_simpson: 'second'
                            }),
                            context
                        );
                    });

                    const payload = await runner.runEffect(
                        effectBuilder.race({
                            fast: effectBuilder.take(fast),
                            slow: effectBuilder.take(slow)
                        }),
                        context
                    );

                    await closePools();

                    expect(payload).toMatchInlineSnapshot(`
                        Object {
                          "fast": Object {
                            "headers": Object {},
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
