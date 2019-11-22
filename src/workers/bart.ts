import {IAction, IBaseSagaContext, ActionChannel} from '../types';

function* myFirstSaga(_initialAction: IAction, context: IBaseSagaContext) {
    const {
        effects: {actionChannel, put, take, race, timeout}
    } = context;

    const channel: ActionChannel = yield actionChannel<IAction<{bart: string}>>(
        aktion => !!aktion.payload && aktion.payload.bart === 'simpson'
    );

    while (true) {
        const action: IAction<{
            name: string;
        }> = yield take(channel);

        yield put('bart-found', {
            name: action.payload.name
        });

        const {timeout, isSuspendedFromSchool} = yield race({
            timeout: timeout(3000),
            isSuspendedFromSchool: take('BART_IS_SUSPENDED_FROM_SCHOOL')
        });
    }
}

export default {
    topic: 'MY_FIRST_SAGA',
    saga: myFirstSaga
};
