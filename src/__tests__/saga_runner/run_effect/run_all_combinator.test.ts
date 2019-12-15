import {SagaRunner} from '../../../saga_runner';
import {withTopicCleanup} from '../../kafka_utils';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';
import Bluebird from 'bluebird';

describe(SagaRunner.name, function() {
    describe('all', function() {
        it(
            'runs all of an array of effects',
            async function() {
                await withTopicCleanup(['test-all-1'])(async ([topic]) => {
                    const {
                        effectBuilder,
                        runner,
                        closeBuses,
                        context
                    } = await runnerUtilityFactory();

                    const channel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(topic);
                    await runner.runEffect(channel, context);
                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'first'
                        }),
                        context
                    );

                    await Bluebird.delay(2000);

                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'second'
                        }),
                        context
                    );

                    const actions = await runner.runEffect(
                        effectBuilder.all([
                            effectBuilder.take(channel),
                            effectBuilder.take(channel)
                        ]),
                        context
                    );

                    /** Order doesn't matter in this case */
                    expect(actions).toHaveLength(2);

                    await closeBuses();
                });
            },
            DEFAULT_TEST_TIMEOUT
        );

        it(
            'runs all of a record of effects',
            async function() {
                await withTopicCleanup(['test-all-1'])(async ([topic]) => {
                    const {
                        effectBuilder,
                        runner,
                        closeBuses,
                        context
                    } = await runnerUtilityFactory();
                    const channel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(topic);
                    await runner.runEffect(channel, context);
                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'first'
                        }),
                        context
                    );

                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'second'
                        }),
                        context
                    );

                    const payload = await runner.runEffect(
                        effectBuilder.all({
                            one: effectBuilder.take(channel),
                            two: effectBuilder.take(channel)
                        }),
                        context
                    );

                    expect(payload).toMatchInlineSnapshot(`
                        Object {
                          "one": Object {
                            "payload": Object {
                              "bart_simpson": "first",
                            },
                            "topic": "test-all-1",
                            "transaction_id": "static-transaction-id",
                          },
                          "two": Object {
                            "payload": Object {
                              "bart_simpson": "second",
                            },
                            "topic": "test-all-1",
                            "transaction_id": "static-transaction-id",
                          },
                        }
                    `);

                    await closeBuses();
                });
            },
            DEFAULT_TEST_TIMEOUT
        );
    });
});
