import {EffectBuilder} from '../effect_builder';
import {EphemeralBuffer, ActionChannelBuffer} from '../buffers';
import {CompensationPlanKind, ImmediateCompensationPlan, KafkaSagaCompensationPlan} from '..';

// tslint:disable-next-line: no-empty
describe(EffectBuilder.name, function() {
    const builder = new EffectBuilder('test-transaction-id');

    afterEach(() => {
        builder.clearCompensation();
    });

    describe('#put', function() {
        it('returns a put effect description', function() {
            expect(builder.put('pattern')).toMatchInlineSnapshot(`
                Object {
                  "kind": "PUT",
                  "pattern": "pattern",
                  "payload": undefined,
                  "topic": "pattern",
                  "transactionId": "test-transaction-id",
                }
            `);
            expect(builder.put('pattern', {something: true})).toMatchInlineSnapshot(`
                Object {
                  "kind": "PUT",
                  "pattern": "pattern",
                  "payload": Object {
                    "something": true,
                  },
                  "topic": "pattern",
                  "transactionId": "test-transaction-id",
                }
            `);
        });
    });

    describe('#take', function() {
        describe('given simple patterns', function() {
            it('returns a take effect description with an ephemeral buffer', function() {
                const {buffer, ...rest} = builder.take('test');
                expect(rest).toMatchInlineSnapshot(`
                    Object {
                      "kind": "TAKE",
                      "observer": [Function],
                      "patterns": "test",
                      "topics": Array [
                        "test",
                      ],
                      "transactionId": "test-transaction-id",
                    }
                `);
                expect(buffer).toBeInstanceOf(EphemeralBuffer);
            });
        });

        describe('given an action channel pattern', function() {
            it("returns a take effect description with the action channel's buffer", function() {
                const {buffer, ...rest} = builder.take(builder.actionChannel<any>('plemp'));
                expect(rest).toMatchInlineSnapshot(`
                    Object {
                      "kind": "TAKE_ACTION_CHANNEL",
                      "observer": [Function],
                      "patterns": "plemp",
                      "topics": Array [
                        "plemp",
                      ],
                      "transactionId": "test-transaction-id",
                    }
                `);
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
            ).toMatchInlineSnapshot(`
                Object {
                  "args": Array [],
                  "effect": [Function],
                  "kind": "CALL",
                  "transactionId": "test-transaction-id",
                }
            `);
        });
    });

    describe('#actionChannel', function() {
        it('returns an action channel effect description', function() {
            expect(builder.actionChannel('smart')).toMatchInlineSnapshot(`
                Object {
                  "buffer": ActionChannelBuffer {
                    "actions": Array [],
                    "observers": Array [],
                  },
                  "kind": "ACTION_CHANNEL",
                  "observer": [Function],
                  "pattern": "smart",
                  "topics": Array [
                    "smart",
                  ],
                  "transactionId": "test-transaction-id",
                }
            `);
            expect(builder.actionChannel(['smart', 'dumb'])).toMatchInlineSnapshot(`
                Object {
                  "buffer": ActionChannelBuffer {
                    "actions": Array [],
                    "observers": Array [],
                  },
                  "kind": "ACTION_CHANNEL",
                  "observer": [Function],
                  "pattern": Array [
                    "smart",
                    "dumb",
                  ],
                  "topics": Array [
                    "smart",
                    "dumb",
                  ],
                  "transactionId": "test-transaction-id",
                }
            `);
        });
    });

    describe('#all', function() {
        it('returns an all effect combinator description', function() {
            expect(builder.all([builder.put('asf'), builder.put('bsf')])).toMatchInlineSnapshot(`
                Object {
                  "combinator": [Function],
                  "effects": Array [
                    Object {
                      "kind": "PUT",
                      "pattern": "asf",
                      "payload": undefined,
                      "topic": "asf",
                      "transactionId": "test-transaction-id",
                    },
                    Object {
                      "kind": "PUT",
                      "pattern": "bsf",
                      "payload": undefined,
                      "topic": "bsf",
                      "transactionId": "test-transaction-id",
                    },
                  ],
                  "kind": "COMBINATOR",
                  "transactionId": "test-transaction-id",
                }
            `);

            expect(
                builder.all({
                    a: builder.put('asf'),
                    b: builder.put('asf')
                })
            ).toMatchInlineSnapshot(`
                Object {
                  "combinator": [Function],
                  "effects": Object {
                    "a": Object {
                      "kind": "PUT",
                      "pattern": "asf",
                      "payload": undefined,
                      "topic": "asf",
                      "transactionId": "test-transaction-id",
                    },
                    "b": Object {
                      "kind": "PUT",
                      "pattern": "asf",
                      "payload": undefined,
                      "topic": "asf",
                      "transactionId": "test-transaction-id",
                    },
                  },
                  "kind": "COMBINATOR",
                  "transactionId": "test-transaction-id",
                }
            `);
        });
    });

    describe('#race', function() {
        it('returns a race effect combinator description', function() {
            expect(builder.race([builder.put('asf'), builder.put('bsf')])).toMatchInlineSnapshot(`
                Object {
                  "combinator": [Function],
                  "effects": Array [
                    Object {
                      "kind": "PUT",
                      "pattern": "asf",
                      "payload": undefined,
                      "topic": "asf",
                      "transactionId": "test-transaction-id",
                    },
                    Object {
                      "kind": "PUT",
                      "pattern": "bsf",
                      "payload": undefined,
                      "topic": "bsf",
                      "transactionId": "test-transaction-id",
                    },
                  ],
                  "kind": "COMBINATOR",
                  "transactionId": "test-transaction-id",
                }
            `);

            expect(
                builder.race({
                    a: builder.put('asf'),
                    b: builder.put('asf')
                })
            ).toMatchInlineSnapshot(`
                Object {
                  "combinator": [Function],
                  "effects": Object {
                    "a": Object {
                      "kind": "PUT",
                      "pattern": "asf",
                      "payload": undefined,
                      "topic": "asf",
                      "transactionId": "test-transaction-id",
                    },
                    "b": Object {
                      "kind": "PUT",
                      "pattern": "asf",
                      "payload": undefined,
                      "topic": "asf",
                      "transactionId": "test-transaction-id",
                    },
                  },
                  "kind": "COMBINATOR",
                  "transactionId": "test-transaction-id",
                }
            `);
        });
    });

    describe('#addCompensation', function() {
        it('returns an addCompensation effect description', function() {
            expect([
                builder.addCompensation<any, ImmediateCompensationPlan<any>>({
                    kind: CompensationPlanKind.IMMEDIATE,
                    payload: {
                        test: '123'
                    },
                    handler: jest.fn()
                }),
                builder.addCompensation<any, KafkaSagaCompensationPlan<any>>({
                    kind: CompensationPlanKind.KAFKA_SAGA,
                    payload: {
                        testing: '2345'
                    },
                    topic: 'SOME_TOPIC'
                })
            ]).toMatchInlineSnapshot(`
                Array [
                  Object {
                    "kind": "ADD_COMPENSATION",
                    "plan": Object {
                      "handler": [MockFunction],
                      "kind": "IMMEDIATE",
                      "payload": Object {
                        "test": "123",
                      },
                    },
                    "transactionId": "test-transaction-id",
                  },
                  Object {
                    "kind": "ADD_COMPENSATION",
                    "plan": Object {
                      "kind": "KAFKA_SAGA",
                      "payload": Object {
                        "testing": "2345",
                      },
                      "topic": "SOME_TOPIC",
                    },
                    "transactionId": "test-transaction-id",
                  },
                ]
            `);
        });
    });

    describe('#runCompensation', function() {
        it('returns a run compensation effect description', function() {
            expect(builder.runCompensation()).toMatchInlineSnapshot(`
                Object {
                  "config": Object {
                    "dontReverse": false,
                    "parallel": false,
                  },
                  "kind": "RUN_COMPENSATION",
                  "transactionId": "test-transaction-id",
                }
            `);
        });
    });

    describe('#clearCompensation', function() {
        it('returns a clear compensation effect description', function() {
            expect(builder.clearCompensation()).toMatchInlineSnapshot(`
                Object {
                  "kind": "CLEAR_COMPENSATION",
                  "transactionId": "test-transaction-id",
                }
            `);
        });
    });

    describe('#viewCompensation', function() {
        it('returns a view compensation effect description', function() {
            expect(builder.viewCompensationChain()).toMatchInlineSnapshot(`
                Object {
                  "kind": "VIEW_COMPENSATION",
                  "transactionId": "test-transaction-id",
                }
            `);
        });
    });
});
