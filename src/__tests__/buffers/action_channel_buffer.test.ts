import {ActionChannelBuffer} from '../../../src/buffers';
import Bluebird from 'bluebird';

describe(ActionChannelBuffer.name, function() {
    it('allows `take`s in a first-come-first-served manner', async function() {
        const buffer = new ActionChannelBuffer();
        const firstAction = {topic: '5', transaction_id: 'a', payload: {poptart: true}};
        const secondAction = {topic: '5', transaction_id: 'a', payload: {sugar: true}};

        let firstResult;
        let secondResult;
        let thirdResult;

        setImmediate(async () => {
            firstResult = await buffer.take();
            secondResult = await buffer.take();
            thirdResult = await buffer.take();
        });

        buffer.put(firstAction);
        buffer.put(secondAction);

        await Bluebird.delay(1000);

        expect(firstResult).toEqual(firstAction);
        expect(secondResult).toEqual(secondResult);
        expect(thirdResult).toBeUndefined();
    });
});
