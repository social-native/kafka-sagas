import Bluebird from 'bluebird';

import {SagaRunner} from '../../../saga_runner';
import {seedTopic, withTopicCleanup} from '../../kafka_utils';
import {ActionChannelBuffer} from '../../../buffers';
import {ActionChannelInput, IAction} from '../../../types';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';

describe(SagaRunner.name, function() {
    describe('actionChannel', function() {
        const patterns: Array<{
            patternKind: string;
            topics: string[];
            pattern: ActionChannelInput<IAction<any>>;
        }> = [
            {
                patternKind: 'string',
                topics: ['test-topic-1-pattern-1'],
                pattern: 'test-topic-1-pattern-1'
            },
            {
                patternKind: 'string[]',
                topics: ['test-topic-1-pattern-2', 'test-topic-2-pattern-2'],
                pattern: ['test-topic-1-pattern-2', 'test-topic-2-pattern-2']
            },
            {
                patternKind: 'PredicateRecord',
                topics: ['test-topic-1-pattern-3'],
                pattern: {
                    pattern: 'test-topic-1-pattern-3',
                    predicate: () => true
                }
            }
        ];

        for (const {patternKind, pattern, topics} of patterns) {
            describe(`given a pattern of kind ${patternKind}`, function() {
                it(
                    `begins streaming from the topic into a channel and returns it`,
                    async function() {
                        await withTopicCleanup(topics)(async () => {
                            const runnerUtils = await runnerUtilityFactory();
                            const {runner, effectBuilder, spy, context} = runnerUtils;
                            const observerRegisteredSpy = spy.consumer('registerTopicObserver');
                            const streamActionsSpy = spy.consumer('streamActionsFromTopic');

                            const channel = effectBuilder.actionChannel(pattern);

                            await runner.runEffect(channel, context);

                            expect(observerRegisteredSpy.mock.calls).toMatchSnapshot();
                            expect(streamActionsSpy.mock.calls).toMatchSnapshot();

                            await seedTopic(topics[0], [
                                {
                                    transaction_id: runnerUtils.transactionId,
                                    payload: {
                                        bart_simpson: 'eat_my_shorts'
                                    }
                                }
                            ]);

                            await Bluebird.delay(300);

                            expect(await channel.buffer.take()).toMatchSnapshot();

                            await runnerUtils.closePools();
                        });
                    },
                    DEFAULT_TEST_TIMEOUT
                );

                it(
                    'uses the buffer provided if one is provided',
                    async function() {
                        await withTopicCleanup(topics)(async () => {
                            const runnerUtils = await runnerUtilityFactory();
                            const {runner, effectBuilder, spy, context} = runnerUtils;
                            const observerRegisteredSpy = spy.consumer('registerTopicObserver');
                            const streamActionsSpy = spy.consumer('streamActionsFromTopic');
                            const buffer = new ActionChannelBuffer();
                            const channel = effectBuilder.actionChannel(pattern, buffer);

                            await runner.runEffect(channel, context);

                            expect(observerRegisteredSpy.mock.calls).toMatchSnapshot();
                            expect(streamActionsSpy.mock.calls).toMatchSnapshot();

                            await seedTopic(topics[0], [
                                {
                                    transaction_id: runnerUtils.transactionId,
                                    payload: {
                                        bart_simpson: 'eat_my_shorts'
                                    }
                                }
                            ]);

                            await Bluebird.delay(300);

                            expect(await buffer.take()).toMatchSnapshot();

                            await runnerUtils.closePools();
                        });
                    },
                    DEFAULT_TEST_TIMEOUT
                );
            });
        }

        describe('given a specific predicate', function() {
            it(
                'only buffers actions that adhere to the predicate',
                async function() {
                    await withTopicCleanup(['test-topic-1'])(async ([topic]) => {
                        const runnerUtils = await runnerUtilityFactory();
                        const {runner, effectBuilder, spy, context} = runnerUtils;
                        const observerRegisteredSpy = spy.consumer('registerTopicObserver');
                        const streamActionsSpy = spy.consumer('streamActionsFromTopic');

                        const channel = effectBuilder.actionChannel<{bart_simpson: string}>({
                            pattern: topic,
                            predicate: (action: IAction<{bart_simpson: string}>) => {
                                return action.payload.bart_simpson === 'eat_my_jeans';
                            }
                        });

                        await runner.runEffect(channel, context);

                        expect(observerRegisteredSpy.mock.calls).toMatchSnapshot();
                        expect(streamActionsSpy.mock.calls).toMatchSnapshot();

                        await seedTopic(topic, [
                            {
                                transaction_id: runnerUtils.transactionId,
                                payload: {
                                    bart_simpson: 'eat_my_shorts'
                                }
                            },
                            {
                                transaction_id: runnerUtils.transactionId,
                                payload: {
                                    bart_simpson: 'eat_my_jeans'
                                }
                            }
                        ]);

                        await Bluebird.delay(300);

                        expect(await channel.buffer.take()).toMatchSnapshot();

                        await runnerUtils.closePools();
                    });
                },
                DEFAULT_TEST_TIMEOUT
            );
        });
    });
});
