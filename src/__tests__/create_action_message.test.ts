import {createActionMessage} from '../create_action_message';

describe(createActionMessage.name, function() {
    it('creates kafka message from the action', function() {
        expect(
            createActionMessage({
                action: {
                    headers: {
                        key: 'value'
                    },
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
                "key": "value",
              },
              "value": "{\\"transaction_id\\":\\"test-transaction-id\\",\\"payload\\":{\\"persimmon\\":\\"yum\\"}}",
            }
        `);
    });
});
