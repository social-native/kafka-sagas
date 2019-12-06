import {EphemeralBuffer} from '../../../src/buffers';
import Bluebird from 'bluebird';

describe(EphemeralBuffer.name, function() {
    it('notifies all observers when an item arrives', async function() {
        const buffer = new EphemeralBuffer();
        const firstAction = {topic: '5', transaction_id: 'a', payload: {poptart: true}};
        const secondAction = {topic: '5', transaction_id: 'a', payload: {sugar: true}};

        let missedResult;
        let receivedResult;

        // this will add a waiting resolve *after* the two puts have occurred
        setImmediate(async () => {
            missedResult = await buffer.take();
        });

        buffer.take().then(result => {
            receivedResult = result;
        });

        buffer.put(firstAction);
        buffer.put(secondAction);

        await Bluebird.delay(300);

        expect(missedResult).toBeUndefined();
        expect(receivedResult).toEqual(firstAction);
    });
});
