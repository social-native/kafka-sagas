import {allPromise} from '../../promise_combinators/all_promise';
import Bluebird from 'bluebird';

describe('allPromise', function() {
    it('returns the array or object of resolved promises', async function() {
        expect(await allPromise([Bluebird.resolve(1), Bluebird.resolve(2)])).toEqual([1, 2]);

        expect(
            await allPromise({
                a: Bluebird.resolve(1),
                b: Bluebird.resolve(2)
            })
        ).toEqual({
            a: 1,
            b: 2
        });
    });

    it('rejects if any promise rejects', async function() {
        expect(allPromise([Bluebird.resolve(1), Bluebird.reject(false)])).rejects.toReturnWith(
            false
        );
    });
});
