import pino from 'pino';
import {ThrottledProducer} from './throttled_producer';
import {IHeaders} from 'kafkajs';
import {
    ICompensationConfig,
    ICompensationEffectDescription,
    Logger,
    IAction,
    DefaultPayload
} from './types';
import {isGenerator, isImmediateCompensationPlan, isKafkaSagaCompensationPlan} from './type_guard';
import {ConsumerPool, IBaseSagaContext, ICompensationPlan, SagaRunner} from '.';

export class Compensator<Context extends IBaseSagaContext> {
    protected sagaRunner: SagaRunner<any, Context>;
    protected config: ICompensationConfig;
    protected compensationChains: Map<
        string,
        Array<
            ICompensationEffectDescription<any, any> & {
                headers?: Record<keyof IHeaders, string | undefined>;
            }
        >
    >;
    protected logger: Logger;

    constructor(
        protected consumerPool: ConsumerPool,
        protected producer: ThrottledProducer,
        config: Partial<ICompensationConfig> = {async: false},
        logger?: Logger
    ) {
        this.config = {
            async: false,
            ...config
        };

        this.compensationChains = new Map();

        this.logger = logger
            ? logger.child({class: 'KafkaSagaCompensator'})
            : pino().child({class: 'KafkaSagaCompensator'});

        this.sagaRunner = new SagaRunner(consumerPool, producer);
    }

    public initializeCompensationChain(id: string) {
        this.compensationChains.set(id, []);
        this.logger.debug({id}, 'Initialized compensation chain');
    }

    public addCompensation(
        id: string,
        effect: ICompensationEffectDescription<any, any>,
        headers: Record<keyof IHeaders, string | undefined> = {}
    ) {
        const chain = this.compensationChains.get(id) || [];
        this.compensationChains.set(id, [...chain, {...effect, headers}]);
        this.logger.debug({id}, 'Added compensation to chain');
    }

    public async compensate(id: string, context: Context) {
        const chain = this.compensationChains.get(id);

        if (!chain || !chain.length) {
            this.logger.debug({id}, 'Empty compensation chain');
            return;
        }

        if (this.config.async) {
            /** Since it's in async mode, order doesn't matter. */
            await Promise.all(chain.map(effect => this.executeCompensationEffect(effect, context)));
        }

        /**
         * Create a copy of `chain` and reverse that
         * since `Array.reverse` is destructive.
         */
        const reversed = [...chain].reverse();

        for (const effect of reversed) {
            await this.executeCompensationEffect(effect, context);
        }
    }

    public removeCompensationChain(id: string) {
        this.compensationChains.delete(id);
    }

    protected async executeCompensationEffect<Payload extends DefaultPayload>(
        effect: ICompensationEffectDescription<Payload, ICompensationPlan<Payload>> & {
            headers?: Record<keyof IHeaders, string | undefined>;
        },
        context: Context
    ) {
        const {plan, transactionId, headers} = effect;

        if (isImmediateCompensationPlan(plan)) {
            const result = await plan.handler(plan.payload);

            if (isGenerator(result)) {
                await this.sagaRunner.runGeneratorFsm(result, context);
                return;
            }

            return;
        }

        if (isKafkaSagaCompensationPlan(plan)) {
            await this.producer.connect();
            await this.producer.putAction<IAction<Payload>>({
                topic: plan.topic,
                payload: plan.payload,
                transaction_id: transactionId,
                headers
            });
        }
    }
}
