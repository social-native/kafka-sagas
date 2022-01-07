import {SagaRunner} from '../../../saga_runner';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {CompensationPlanKind, ImmediateCompensationPlan} from '../../..';
import Bluebird from 'bluebird';

describe(SagaRunner.name, function() {
    describe('runCompensation', function() {
        it('runs the compensation chain in order in non-parallel mode', async function() {
            const runnerUtils = await runnerUtilityFactory();
            const mockHandler = jest.fn();
            const {runner, effectBuilder, context} = runnerUtils;

            await runner.runEffect(
                effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                    kind: CompensationPlanKind.IMMEDIATE,
                    handler: mockHandler,
                    payload: {order: 'I go second'}
                }),
                context
            );

            await runner.runEffect(
                effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                    kind: CompensationPlanKind.IMMEDIATE,
                    handler: mockHandler,
                    payload: {order: 'I go first'}
                }),
                context
            );

            await runner.runEffect(
                effectBuilder.runCompensation({
                    dontReverse: false,
                    parallel: false
                }),
                context
            );

            expect(mockHandler.mock.calls).toMatchInlineSnapshot(`
                    Array [
                      Array [
                        Object {
                          "order": "I go first",
                        },
                      ],
                      Array [
                        Object {
                          "order": "I go second",
                        },
                      ],
                    ]
                `);
        });

        it('runs the compensation chain in reverse in reverse mode', async function() {
            const runnerUtils = await runnerUtilityFactory();
            const mockHandler = jest.fn();
            const {runner, effectBuilder, context} = runnerUtils;

            await runner.runEffect(
                effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                    kind: CompensationPlanKind.IMMEDIATE,
                    handler: mockHandler,
                    payload: {order: 'I go first'}
                }),
                context
            );

            await runner.runEffect(
                effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                    kind: CompensationPlanKind.IMMEDIATE,
                    handler: mockHandler,
                    payload: {order: 'I go second'}
                }),
                context
            );

            await runner.runEffect(
                effectBuilder.runCompensation({
                    dontReverse: true,
                    parallel: false
                }),
                context
            );

            expect(mockHandler.mock.calls).toMatchInlineSnapshot(`
                    Array [
                      Array [
                        Object {
                          "order": "I go first",
                        },
                      ],
                      Array [
                        Object {
                          "order": "I go second",
                        },
                      ],
                    ]
                `);
        });

        it('runs the compensation chain in order in parallel mode', async function() {
            const runnerUtils = await runnerUtilityFactory();

            const results: any[] = [];

            const mockSlowFunction = jest.fn().mockImplementation(async () => {
                await Bluebird.delay(2000);
                results.push('slow_fn_completed');
            });

            const mockFastFunction = jest.fn().mockImplementation(async () => {
                await Bluebird.delay(100);
                results.push('fast_fn_completed');
            });
            const {runner, effectBuilder, context} = runnerUtils;

            await runner.runEffect(
                effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                    kind: CompensationPlanKind.IMMEDIATE,
                    handler: mockFastFunction
                }),
                context
            );

            /**
             * This is the slower function, taking a full 2 seconds.
             * In non-parallel mode would show this handler being called first.
             * However, since we run in parallel mode in this test,
             * we should see in our test assertion that the faster function pushes
             * to the result array first, indicating both functions were called in parallel.
             */
            await runner.runEffect(
                effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                    kind: CompensationPlanKind.IMMEDIATE,
                    handler: mockSlowFunction
                }),
                context
            );

            await runner.runEffect(
                effectBuilder.runCompensation({
                    dontReverse: false,
                    parallel: true
                }),
                context
            );

            expect(results).toMatchInlineSnapshot(`
                Array [
                  "fast_fn_completed",
                  "slow_fn_completed",
                ]
            `);
        });
    });
});
