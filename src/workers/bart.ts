import {IAction, IBaseSagaContext} from '../types';

function* myFirstSaga(initialAction: IAction, context: IBaseSagaContext) {
    const {
        effects: {actionChannel, put, take}
    } = context;

    const channel = yield actionChannel<IAction<{bart: string}>>(
        aktion => !!aktion.payload && aktion.payload.bart === 'simpson'
    );

    while (true) {
        const action: IAction<{
            name: string;
        }> = yield take(channel);

        yield put('bart-found', {
            name: action.payload.name
        });
    }
}

export default {
    topic: 'MY_FIRST_SAGA',
    saga: myFirstSaga
};
