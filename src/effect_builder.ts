import {
    PutEffect,
    CallEffect,
    IAction,
    IActionBuffer,
    AllCombinatorEffect,
    RaceCombinatorEffect,
    ActionChannelEffect,
    ActionChannelInput,
    ITakeEffectDescription,
    ITakeActionChannelEffectDescription,
    TakePattern,
    IActionChannelEffectDescription
} from './types';
import {ActionChannelBuffer, EphemeralBuffer} from './buffers';

import {
    actionPatternIsPredicateRecord,
    takeInputIsActionChannelEffectDescription
} from './type_guard';

import {racePromise} from './promise_combinators/race_promise';
import {allPromise} from './promise_combinators/all_promise';
import {EffectDescriptionKind} from './enums';

export class EffectBuilder {
    constructor(protected transactionId: string) {
        this.put = this.put.bind(this);
        this.take = this.take.bind(this);
        this.callFn = this.callFn.bind(this);
        this.actionChannel = this.actionChannel.bind(this);
        this.all = this.all.bind(this);
        this.race = this.race.bind(this);
    }

    public put = <Payload>(
        ...args: Parameters<PutEffect<Payload>>
    ): ReturnType<PutEffect<Payload>> => {
        const pattern = args[0];
        const payload = args[1];

        return {
            pattern,
            topic: pattern,
            payload,
            transactionId: this.transactionId,
            kind: EffectDescriptionKind.PUT
        };
    };

    public take<Payload extends {} | undefined = {}>(
        input: ActionChannelInput<IAction<Payload>>
    ): ITakeEffectDescription<IAction<Payload>>;

    public take<Payload extends {} | undefined = {}>(
        input: IActionChannelEffectDescription<IAction<Payload>>
    ): ITakeActionChannelEffectDescription<IAction<Payload>>;

    public take<Payload extends {} | undefined = {}>(
        patterns: TakePattern<IAction<Payload>>
    ):
        | ITakeEffectDescription<IAction<Payload>>
        | ITakeActionChannelEffectDescription<IAction<Payload>> {
        if (takeInputIsActionChannelEffectDescription<IAction<Payload>>(patterns)) {
            return {
                transactionId: this.transactionId,
                patterns: patterns.pattern,
                kind: EffectDescriptionKind.TAKE_ACTION_CHANNEL,
                buffer: patterns.buffer,
                topics: this.generateTopics(patterns),
                observer: this.generateTopicStreamObserver<
                    IAction<Payload>,
                    IActionBuffer<IAction<Payload>>
                >(patterns.pattern, patterns.buffer)
            };
        }

        if (
            typeof patterns === 'string' ||
            Array.isArray(patterns) ||
            actionPatternIsPredicateRecord(patterns)
        ) {
            const buffer = new EphemeralBuffer<IAction<Payload>>();

            const takeEffectDescription: ITakeEffectDescription<IAction<Payload>> = {
                transactionId: this.transactionId,
                patterns,
                kind: EffectDescriptionKind.TAKE,
                buffer,
                topics: this.generateTopics(patterns),
                observer: this.generateTopicStreamObserver<
                    IAction<Payload>,
                    IActionBuffer<IAction<Payload>>
                >(patterns, buffer)
            };

            return takeEffectDescription;
        }

        throw new Error(
            'Invalid input provided for take: expected string | string[] | IPredicateRecord | ActionChannelEffectDescription'
        );
    }

    public callFn<Fn extends (...args: any[]) => any>(
        effect: Fn,
        args: Parameters<Fn>
    ): ReturnType<CallEffect<Fn>> {
        return {
            transactionId: this.transactionId,
            kind: 'CALL',
            effect,
            args
        };
    }

    public actionChannel<Payload>(
        input: Parameters<ActionChannelEffect<Payload>>[0],
        actionBuffer?: Parameters<ActionChannelEffect<Payload>>[1]
    ): ReturnType<ActionChannelEffect<Payload>> {
        const defaultActionBuffer = new ActionChannelBuffer<IAction<Payload>>();
        const buffer = actionBuffer || defaultActionBuffer;

        return {
            transactionId: this.transactionId,
            pattern: input,
            buffer,
            kind: EffectDescriptionKind.ACTION_CHANNEL,
            topics: this.generateTopics(input),
            observer: this.generateTopicStreamObserver(input, buffer)
        };
    }

    public all<Payload>(
        effects: Parameters<AllCombinatorEffect<Payload>>[0]
    ): ReturnType<AllCombinatorEffect<Payload>> {
        return {
            transactionId: this.transactionId,
            kind: EffectDescriptionKind.COMBINATOR,
            combinator: allPromise,
            effects
        };
    }

    public race<Payload>(
        effects: Parameters<RaceCombinatorEffect<Payload>>[0]
    ): ReturnType<RaceCombinatorEffect<Payload>> {
        return {
            transactionId: this.transactionId,
            kind: EffectDescriptionKind.COMBINATOR,
            combinator: racePromise,
            effects
        };
    }

    // tslint:disable-next-line: cyclomatic-complexity
    private generateTopics<Action extends IAction>(
        input: TakePattern<Action> | ActionChannelInput<Action>
    ): string[] {
        if (takeInputIsActionChannelEffectDescription(input)) {
            return input.topics;
        }

        if (actionPatternIsPredicateRecord(input)) {
            return this.generateTopics<Action>(input.pattern);
        }

        if (Array.isArray(input)) {
            return input;
        }

        if (typeof input === 'string') {
            return [input];
        }

        throw new Error('Cannot handle patterns of type ' + typeof input);
    }

    private generateTopicStreamObserver<
        Action extends IAction,
        Buffest extends IActionBuffer<Action>
    >(input: TakePattern<Action> | ActionChannelInput<Action>, buffer: Buffest) {
        return (action: Action) => {
            if (actionPatternIsPredicateRecord(input)) {
                if (input.predicate(action)) {
                    buffer.put(action);
                }
            } else {
                buffer.put(action);
            }
        };
    }
}
