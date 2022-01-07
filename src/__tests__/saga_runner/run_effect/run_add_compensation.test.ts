import {SagaRunner} from '../../../saga_runner';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';
import {CompensationPlanKind, ImmediateCompensationPlan} from '../../..';

describe(SagaRunner.name, function() {
    describe('addCompensation', function() {
        it(
            'adds a compensation effect to the compensation chain',
            async function() {
                const runnerUtils = await runnerUtilityFactory();
                const mockHandler = jest.fn();
                const {runner, effectBuilder, context} = runnerUtils;
                const effect = effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                    kind: CompensationPlanKind.IMMEDIATE,
                    handler: mockHandler,
                    payload: {test_data: 'hi i am test data'}
                });

                await runner.runEffect(effect, context);

                expect(context.compensation.viewChain()).toMatchInlineSnapshot(`
                    Array [
                      Object {
                        "headers": Object {},
                        "kind": "ADD_COMPENSATION",
                        "plan": Object {
                          "handler": [MockFunction],
                          "kind": "IMMEDIATE",
                          "payload": Object {
                            "test_data": "hi i am test data",
                          },
                        },
                        "transactionId": "static-transaction-id",
                      },
                    ]
                `);
            },
            DEFAULT_TEST_TIMEOUT
        );
    });
});
