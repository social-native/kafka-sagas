import {transformKafkaMessageToAction} from '../transform_kafka_message_to_action';
import {createKafkaMessageFromAction} from './kafka_utils';

describe(transformKafkaMessageToAction.name, function() {
    it('returns an action, preserving transaction_id', function() {
        expect(
            transformKafkaMessageToAction(
                'test',
                createKafkaMessageFromAction({
                    payload: undefined,
                    topic: 'test',
                    transaction_id: '420'
                })
            )
        ).toMatchInlineSnapshot(`
            Object {
              "headers": Object {},
              "payload": undefined,
              "topic": "test",
              "transaction_id": "420",
            }
        `);
    });

    it('throws if it receives a misshapen message', function() {
        const getAction = () =>
            transformKafkaMessageToAction(
                'test',
                createKafkaMessageFromAction({
                    payload: {
                        bart: 'expelled'
                    }
                } as any)
            );

        expect(getAction).toThrow();
    });
});
