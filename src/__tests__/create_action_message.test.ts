import {createActionMessage} from '../create_action_message';

describe(createActionMessage.name, function() {
    it('creates kafka message from the action', function() {
        expect(
            createActionMessage({
                userId: 5,
                roles: ['admin'],
                headers: {
                    key: Buffer.from('value')
                },
                action: {
                    transaction_id: 'test-transaction-id',
                    topic: 'my-topic',
                    payload: {
                        persimmon: 'yum'
                    }
                }
            })
        ).toMatchInlineSnapshot(`
            Object {
              "headers": Object {
                "key": Object {
                  "data": Array [
                    118,
                    97,
                    108,
                    117,
                    101,
                  ],
                  "type": "Buffer",
                },
                "roles": Object {
                  "data": Array [
                    91,
                    34,
                    97,
                    100,
                    109,
                    105,
                    110,
                    34,
                    93,
                  ],
                  "type": "Buffer",
                },
                "user_id": Object {
                  "data": Array [
                    53,
                  ],
                  "type": "Buffer",
                },
              },
              "value": "{\\"transaction_id\\":\\"test-transaction-id\\",\\"payload\\":{\\"hello\\":\\"friend\\"}}",
            }
        `);
    });
});
