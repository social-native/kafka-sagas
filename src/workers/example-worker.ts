import gql from 'graphql-tag';
import {IBaseSagaContext, IAction} from 'types';
import initializeWorker from '../initialize_worker';

function* exampleSaga<Action extends IAction<any>, Context extends IBaseSagaContext = IBaseSagaContext>(
    action: Action,
    context: Context
) {
    const {gqlClient} = context;
    const {put, take, call} = context.effects;
    yield put(action.topic);
    yield take(action.topic);
    yield call(gqlClient.query, [
        {
            query: gql`
                query campaignCreate($input: CampaignInput!) {
                    campaignCreate(input: $input) {
                        createdNodeId
                        wasSuccessful
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `,
            variables: {
                input: {
                    brandId: 2,
                    name: 'Blog'
                }
            }
        }
    ]);
}

initializeWorker({topic: 'example-topic', saga: exampleSaga});
