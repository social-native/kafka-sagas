import {SagaRunner} from 'saga_runner';
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
                        closeBuses
                    } = await runnerUtilityFactory();

                    const channel = effectBuilder.actionChannel<{bart: string}>(topic);
                    await runner.runEffect(channel);

                    const takeActionChannel = effectBuilder.take(channel);

                    await seedTopic(topic, [
                        {
                            transaction_id: transactionId,
                            payload: {
                                bart_simpson: 'eat_my_shorts'
                            }
                        }
                    ]);

                    const payload = await runner.runEffect(takeActionChannel);

                    await closeBuses();

                    expect(payload).toMatchSnapshot();
                });
            },
            DEFAULT_TEST_TIMEOUT
        );
    });
});
