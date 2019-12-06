import Bluebird from 'bluebird';
import {racePromise} from 'promise_combinators/race_promise';

describe(racePromise.name, function() {
    it('races an object of promises', async function() {
        const {winner, loser} = await racePromise({
            winner: Bluebird.resolve('Success'),
            loser: Bluebird.delay(300)
        });

        expect(winner).toEqual('Success');
        expect(loser).toBeNull();
    });

    it('races an array of promises', async function() {
        const winner = await racePromise([Bluebird.resolve('Success'), Bluebird.delay(300)]);

        expect(winner).toEqual('Success');
    });
});
