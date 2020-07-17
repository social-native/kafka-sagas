import {createActionMessage} from '../create_action_message';

describe(createActionMessage.name, function() {
    it('creates kafka message from the action', function() {
        expect(
            createActionMessage({
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
                "Snapi-Worker-User-Id": Object {
                  "data": Array [
                    53,
                  ],
                  "type": "Buffer",
                },
                "Snapi-Worker-User-Roles": Object {
                  "data": Array [
                    97,
                    100,
                    109,
                    105,
                    110,
                  ],
                  "type": "Buffer",
                },
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
              },
              "value": "{\\"transaction_id\\":\\"test-transaction-id\\",\\"payload\\":{\\"persimmon\\":\\"yum\\"}}",
            }
        `);
    });
});
