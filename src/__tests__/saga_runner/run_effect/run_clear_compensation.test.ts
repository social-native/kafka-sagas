import {SagaRunner} from '../../../saga_runner';
import {runnerUtilityFactory} from '../runner_utility_factory';
import {DEFAULT_TEST_TIMEOUT} from '../../constants';
import {CompensationPlanKind, ImmediateCompensationPlan} from '../../..';

describe(SagaRunner.name, function() {
    describe('clearCompensation', function() {
        it(
            'clears the compensation chain',
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

                await runner.runEffect(effectBuilder.clearCompensation(), context);

                expect(mockHandler.mock.calls).toMatchInlineSnapshot(`Array []`);
            },
            DEFAULT_TEST_TIMEOUT
        );
    });
});
