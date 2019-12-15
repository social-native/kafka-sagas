import {SagaRunner} from '../../../saga_runner';
import {withTopicCleanup, seedTopic} from '../../kafka_utils';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';
import {IAction, ActionChannelInput, IActionChannelEffectDescription} from '../../../types';

describe(SagaRunner.name, function() {
    describe('take', function() {
        describe('given simple patterns', function() {
            const simplePatterns: Array<{
                patternKind: string;
                topics: string[];
                pattern: ActionChannelInput<IAction<{bart_simpson: string}>>;
            }> = [
                {
                    patternKind: 'string',
                    topics: ['test-topic-1'],
                    pattern: 'test-topic-1'
                },
                {
                    patternKind: 'string[]',
                    topics: ['test-topic-1', 'test-topic-2'],
                    pattern: ['test-topic-1', 'test-topic-2']
                },
                {
                    patternKind: 'PredicateRecord',
                    topics: ['test-topic-1'],
                    pattern: {
                        pattern: 'test-topic-1',
                        predicate: () => true
                    }
                }
            ];

            for (const {patternKind, topics, pattern} of simplePatterns) {
                describe(`given a pattern of kind ${patternKind}`, function() {
                    it(
                        'begins streaming actions from the stream matching the pattern',
                        async function() {
                            await withTopicCleanup(topics)(async () => {
                                const runnerUtils = await runnerUtilityFactory();
                                const {runner, effectBuilder, spy, context} = runnerUtils;
                                const observerRegisteredSpy = spy.consumer('registerTopicObserver');
                                const streamActionsSpy = spy.consumer('streamActionsFromTopic');

                                /** This will execute after the runEffect promise is initiated. */

                                setTimeout(async () => {
                                    await seedTopic(topics[0], [
                                        {
                                            transaction_id: runnerUtils.transactionId,
                                            payload: {
                                                bart_simpson: 'eat_my_shorts'
                                            }
                                        }
                                    ]);
                                }, 5000);

                                const payload = await runner.runEffect(
                                    effectBuilder.take(pattern),
                                    context
                                );

                                expect(payload).toMatchSnapshot();
                                expect(observerRegisteredSpy.mock.calls).toMatchSnapshot();
                                expect(streamActionsSpy.mock.calls).toMatchSnapshot();

                                await runnerUtils.closeBuses();
                            });
                        },
                        DEFAULT_TEST_TIMEOUT * 2
                    );
                });
            }
        });

        it(
            'races results from the streams',
            async function() {
                await withTopicCleanup(['test-take-slow', 'test-take-fast'])(
                    async ([slow, fast]) => {
                        const runnerUtils = await runnerUtilityFactory();
                        const {runner, effectBuilder, spy, context} = runnerUtils;
                        const observerRegisteredSpy = spy.consumer('registerTopicObserver');
                        const streamActionsSpy = spy.consumer('streamActionsFromTopic');

                        /** This will execute after the runEffect promise is initiated. */

                        setTimeout(async () => {
                            await seedTopic(slow, [
                                {
                                    transaction_id: runnerUtils.transactionId,
                                    payload: {
                                        bart_simpson: 'loser'
                                    }
                                }
                            ]);
                        }, 3000);

                        setTimeout(async () => {
                            await seedTopic(fast, [
                                {
                                    transaction_id: runnerUtils.transactionId,
                                    payload: {
                                        bart_simpson: 'winner'
                                    }
                                }
                            ]);
                        }, 1000);

                        const payload = await runner.runEffect(
                            effectBuilder.take([slow, fast]),
                            context
                        );

                        expect(payload).toMatchSnapshot();
                        expect(observerRegisteredSpy.mock.calls).toMatchSnapshot();
                        expect(streamActionsSpy.mock.calls).toMatchSnapshot();

                        await runnerUtils.closeBuses();
                    }
                );
            },
            DEFAULT_TEST_TIMEOUT * 2
        );

        describe('given an action channel pattern', function() {
            it(
                "takes from the action channel's buffer",
                async function() {
                    await withTopicCleanup(['test-take-action-channel'])(async ([topic]) => {
                        const runnerUtils = await runnerUtilityFactory();
                        const {runner, effectBuilder, spy, context} = runnerUtils;
                        const observerRegisteredSpy = spy.consumer('registerTopicObserver');
                        const streamActionsSpy = spy.consumer('streamActionsFromTopic');

                        setTimeout(async () => {
                            await seedTopic(topic, [
                                {
                                    transaction_id: runnerUtils.transactionId,
                                    payload: {
                                        bart_simpson: 'bad'
                                    }
                                }
                            ]);
                        }, 2000);

                        const channel: IActionChannelEffectDescription<IAction<{
                            bart_simpson: string;
                        }>> = await runner.runEffect(effectBuilder.actionChannel(topic), context);

                        const bufferSpy = jest.spyOn(channel.buffer, 'put');

                        const payload = await runner.runEffect(
                            effectBuilder.take(channel),
                            context
                        );

                        expect(payload).toMatchSnapshot();
                        expect(observerRegisteredSpy.mock.calls).toMatchSnapshot();
                        expect(streamActionsSpy.mock.calls).toMatchSnapshot();
                        expect(bufferSpy.mock.calls).toMatchSnapshot();

                        await runnerUtils.closeBuses();
                    });
                },
                DEFAULT_TEST_TIMEOUT
            );
        });
    });
});
