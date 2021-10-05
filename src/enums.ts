export enum EffectDescriptionKind {
    PUT = 'PUT',
    TAKE = 'TAKE',
    CALL = 'CALL',
    DELAY = 'DELAY',
    COMBINATOR = 'COMBINATOR',
    ACTION_CHANNEL = 'ACTION_CHANNEL',
    TAKE_ACTION_CHANNEL = 'TAKE_ACTION_CHANNEL',
    ADD_COMPENSATION = 'ADD_COMPENSATION'
}

export enum CompensationPlanKind {
    KAFKA_SAGA = 'KAFKA_SAGA',
    IMMEDIATE = 'IMMEDIATE'
}
