import {EffectBuilder} from 'effect_builder';
import {EphemeralBuffer, ActionChannelBuffer} from 'buffers';

// tslint:disable-next-line: no-empty
describe(EffectBuilder.name, function() {
    const builder = new EffectBuilder('test-transaction-id');

    describe('#put', function() {
        it('returns a put effect description', function() {
            expect(builder.put('pattern')).toMatchSnapshot();
            expect(builder.put('pattern', {something: true})).toMatchSnapshot();
        });
    });

    describe('#take', function() {
        describe('given simple patterns', function() {
            it('returns a take effect description with an ephemeral buffer', function() {
                const {buffer, ...rest} = builder.take('test');
                expect(rest).toMatchSnapshot();
                expect(buffer).toBeInstanceOf(EphemeralBuffer);
            });
        });

        describe('given an action channel pattern', function() {
            it("returns a take effect description with the action channel's buffer", function() {
                const {buffer, ...rest} = builder.take<undefined>(builder.actionChannel('plemp'));
                expect(rest).toMatchSnapshot();
                expect(buffer).toBeInstanceOf(ActionChannelBuffer);
            });
        });
    });

    describe('#call', function() {
        it('returns a call effect description', function() {
            expect(
                builder.callFn(() => {
                    return 3;
                }, [])
            ).toMatchSnapshot();
        });
    });

    describe('#actionChannel', function() {
        it('returns an action channel effect description', function() {
            expect(builder.actionChannel('smart')).toMatchSnapshot();
            expect(builder.actionChannel(['smart', 'dumb'])).toMatchSnapshot();
        });
    });

    describe('#all', function() {
        it('returns an all effect combinator description', function() {
            expect(builder.all([builder.put('asf'), builder.put('bsf')])).toMatchSnapshot();

            expect(
                builder.all({
                    a: builder.put('asf'),
                    b: builder.put('asf')
                })
            ).toMatchSnapshot();
        });
    });

    describe('#race', function() {
        it('returns a race effect combinator description', function() {
            expect(builder.race([builder.put('asf'), builder.put('bsf')])).toMatchSnapshot();

            expect(
                builder.race({
                    a: builder.put('asf'),
                    b: builder.put('asf')
                })
            ).toMatchSnapshot();
        });
    });
});
