import {buildActionFromPayload} from 'build_action_from_payload';
import {createKafkaMessageFromAction} from './kafka_utils';

describe(buildActionFromPayload.name, function() {
    it('returns an action, preserving transaction_id', function() {
        expect(
            buildActionFromPayload(
                'test',
                createKafkaMessageFromAction({
                    transaction_id: '420'
                })
            )
        ).toEqual({
            topic: 'test',
            transaction_id: '420'
        });
    });

    it('adds transaction_id if missing one', function() {
        const action = buildActionFromPayload(
            'test',
            createKafkaMessageFromAction({
                payload: {
                    bart: 'expelled'
                }
            })
        );

        expect(action.payload).toEqual({bart: 'expelled'});
        expect(action.topic).toEqual('test');
        expect(action.transaction_id).toBeDefined();
    });
});
