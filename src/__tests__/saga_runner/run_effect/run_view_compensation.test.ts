import {SagaRunner} from '../../../saga_runner';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';
import {CompensationPlanKind, ImmediateCompensationPlan} from '../../..';

describe(SagaRunner.name, function() {
    describe('viewCompensationChain', function() {
        it(
            'returns a readonly compensation chain',
            async function() {
                const runnerUtils = await runnerUtilityFactory();
                const mockHandler = jest.fn();
                const {runner, effectBuilder, context} = runnerUtils;

                await runner.runEffect(
                    effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                        kind: CompensationPlanKind.IMMEDIATE,
                        handler: mockHandler,
                        payload: {test_data: 'hi i am test data'}
                    }),
                    context
                );

                await runner.runEffect(
                    effectBuilder.addCompensation<any, ImmediateCompensationPlan<any>>({
                        kind: CompensationPlanKind.IMMEDIATE,
                        handler: mockHandler,
                        payload: {test_data: 'hi i am test data as well'}
                    }),
                    context
                );

                expect(await runner.runEffect(effectBuilder.viewCompensationChain(), context))
                    .toMatchInlineSnapshot(`
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
                      Object {
                        "headers": Object {},
                        "kind": "ADD_COMPENSATION",
                        "plan": Object {
                          "handler": [MockFunction],
                          "kind": "IMMEDIATE",
                          "payload": Object {
                            "test_data": "hi i am test data as well",
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
