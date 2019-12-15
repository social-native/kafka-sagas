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
        ).toEqual({
            topic: 'test',
            transaction_id: '420'
        });
    });

    it('adds userId and roles if present in headers', function() {
        expect(
            transformKafkaMessageToAction(
                'topic',
                createKafkaMessageFromAction({
                    payload: 'asdf',
                    topic: 'dsaf',
                    transaction_id: 'fafas',
                    userId: 4,
                    userRoles: ['admin', 'machine']
                })
            )
        ).toMatchInlineSnapshot(`
            Object {
              "payload": "asdf",
              "topic": "topic",
              "transaction_id": "fafas",
              "userId": "4",
              "userRoles": Array [
                "admin",
                "machine",
              ],
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
