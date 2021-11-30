import {ConsumerPool} from '../../consumer_pool';
import {kafka} from '../test_clients';
import {ThrottledProducer} from '../../throttled_producer';
import {EffectBuilder} from '../../effect_builder';
import {SagaRunner} from '../../saga_runner';
import {Compensator} from '../../compensator';
import {ICompensationConfig, ICompensationEffectDescription} from '../..';

export async function runnerUtilityFactory() {
    const transactionId = 'static-transaction-id';
    const consumerPool = new ConsumerPool(kafka, 'test');

    const throttledProducer = new ThrottledProducer(kafka);

    consumerPool.startTransaction(transactionId);
    await throttledProducer.connect();

    const runner = new SagaRunner<unknown, any>(consumerPool, throttledProducer);
    const effectBuilder = new EffectBuilder(transactionId);
    const compensator = new Compensator(consumerPool, throttledProducer);
    const compensationId = 'static-compensation-id';

    return {
        transactionId,
        effectBuilder,
        spy: {
            consumer: (methodName: keyof typeof consumerPool) =>
                jest.spyOn(consumerPool, methodName),
            producer: (methodName: keyof Omit<typeof throttledProducer, 'recordsSent'>) =>
                jest.spyOn(throttledProducer, methodName)
        },
        runner,
        context: {
            effects: effectBuilder,
            headers: {},
            originalMessage: {
                key: Buffer.from('key'),
                value: Buffer.from('value'),
                offset: '1',
                partition: 1,
                timestamp: (new Date().valueOf() / 1000).toString()
            },
            compensation: {
                add: (effect: ICompensationEffectDescription<any>) =>
                    compensator.addCompensation(compensationId, effect),
                runAll: async (
                    config: ICompensationConfig = {
                        dontReverse: false,
                        parallel: false
                    }
                ) => {
                    await compensator.compensate(compensationId, config, {
                        effects: effectBuilder,
                        headers: {},
                        originalMessage: {
                            key: Buffer.from('key'),
                            value: Buffer.from('value'),
                            offset: '1',
                            partition: 1,
                            timestamp: (new Date().valueOf() / 1000).toString()
                        }
                    });

                    // Reset chain to an empty state.
                    compensator.initializeCompensationChain(compensationId);
                },
                clearAll: () => compensator.initializeCompensationChain(compensationId),
                viewChain: () => compensator.getChain(compensationId)
            }
        },
        async closePools() {
            consumerPool.stopTransaction(transactionId);
            await consumerPool.disconnectConsumers();
            await throttledProducer.disconnect();
        }
    };
}
