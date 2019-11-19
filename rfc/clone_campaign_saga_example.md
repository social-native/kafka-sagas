```typescript
import gql from 'graphql-tag';
import {copyCampaign, copyProduction} from '@social-native/kafka-topics';
import {fragments} from '@social-native/registry';

const action = ({campaignId, retryCount}, {effects})* => {
    const {put, take, call, finish, retry} = effects;

    try {
        const campaignCopySuccess = actionChannel(copyCampaign.success.topic);
        const campaignCopyFailure = actionChannel(copyCampaign.failure.topic);

        yield put(copyCampaign.start.topic, copyCampaign.start.payload({campaignId}))
        const campaignAction = yield takeEvery([campaignCopySuccess, campaignCopyFailure]);
        if (campaignAction.topic === copyCampaign.success.topic) {
            const campaignProductionCopySuccess = actionChannel(copyCampaignProductions.success.topic);
            const campaignProductionCopyFailure = actionChannel(copyCampaignProductions.failure.topic);

            yield put(
                copyCampaignProductions.start.topic, 
                copyCampaignProductions.start.payload({campaignId: campaignAction.payload.campaignId})
            )
            const productionAction = yield takeEvery([campaignProductionCopySuccess, campaignProductionCopyFailure]);
            if (productionAction.topic === campaignProductionCopy.success.topic) {
                const productionDirectionCopySuccess = actionChannel(copyProductionDirections.success.topic);
                const productionDirectionCopyFailure = actionChannel(copyProductionDirections.failure.topic);

                yield put(copyProductionDirections.start.topic, copyProductionDirections.start.payload({campaignId: action.payload.campaignId}))
                const directionAction = yield takeEvery([productionDirectionCopySuccess, productionDirectionCopyFailure]);
                if (directionAction.topic === copyProductionDirections.success.topic) {
                    yield finish();
                } else {
                    throw new Error('Unable to copy directions')
                }
            } else {
                throw new Error('Unable to copy productions')
            }
        } else {
            throw new Error('Unable to copy campaign)
        }
    } catch {
        yield retry(retryCount - 1)
    }
}
```

```typescript
const action = ({campaignId}, {gqlClient, effects})* => {
    try {
        const {call, put} = effects;
    
        const {data: queryData} = yield call(gqlClient.query({
            query: gql`
                query campaignQuery($id: ID!) {
                    campaign(id: $id) {
                        ... campaignFullNode
                    }
                }
                ${fragments.campaignFullNode}
            `,
            variables: {id: campaignId}
        }));

        const {data: createData} = yield call(gqlClient.query({
            query: gql`
                query campaignCreate($input: CampaignInput!) {
                    campaignCreate(input: $input) {
                        ... campaignCreate
                    }
                }
                ${fragments.campaignCreate}
            `,
            variables: {input: queryData.campaign}
        }));

        yield put(copyCampaign.success.topic, copyCampaign.success.payload(createData))
    } catch (e) {
        yield put(copyCampaign.failure.topic, copyCampaign.failure.payload(e))
    }
}
```
