import {SagaRunner} from 'saga_runner';
import {withTopicCleanup} from '../../kafka_utils';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';

describe(SagaRunner.name, function() {
    describe('put', function() {
        it(
            'puts a payload onto the stream',
            async function() {
                await withTopicCleanup(['test-put'])(async ([topic]) => {
                    const {effectBuilder, runner, closeBuses} = await runnerUtilityFactory();
                    const channel = effectBuilder.actionChannel<{
                        bart_simpson: string;
                    }>(topic);
                    await runner.runEffect(channel);
                    await runner.runEffect(
                        effectBuilder.put(topic, {
                            bart_simpson: 'good'
                        })
                    );

                    const payload = await runner.runEffect(effectBuilder.take(channel));

                    expect(payload).toMatchInlineSnapshot(`
                        Object {
                          "payload": Object {
                            "bart_simpson": "good",
                          },
                          "topic": "test-put",
                          "transaction_id": "static-transaction-id",
                        }
                    `);

                    await closeBuses();
                });
            },
            DEFAULT_TEST_TIMEOUT
        );
    });
});
