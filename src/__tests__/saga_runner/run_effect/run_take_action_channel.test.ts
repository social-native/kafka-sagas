import {SagaRunner} from '../../../saga_runner';
import {withTopicCleanup, seedTopic} from '../../kafka_utils';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';

describe(SagaRunner.name, function() {
    describe('takeActionChannel', function() {
        it(
            "takes from the action channel's buffer",
            async function() {
                await withTopicCleanup(['take-action-channel-test'])(async ([topic]) => {
                    const {
                        effectBuilder,
                        runner,
                        transactionId,
                        closePools,
                        context
                    } = await runnerUtilityFactory();

                    const channel = effectBuilder.actionChannel<{bart: string}>(topic);
                    await runner.runEffect(channel, context);

                    const takeActionChannel = effectBuilder.take(channel);

                    await seedTopic(topic, [
                        {
                            transaction_id: transactionId,
                            payload: {
                                bart_simpson: 'eat_my_shorts'
                            }
                        }
                    ]);

                    const payload = await runner.runEffect(takeActionChannel, context);

                    await closePools();

                    expect(payload).toMatchInlineSnapshot(`
                        Object {
                          "headers": Object {},
                          "payload": Object {
                            "bart_simpson": "eat_my_shorts",
                          },
                          "topic": "take-action-channel-test",
                          "transaction_id": "static-transaction-id",
                        }
                    `);
                });
            },
            DEFAULT_TEST_TIMEOUT
        );
    });
});
