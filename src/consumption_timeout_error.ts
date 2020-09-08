export class ConsumptionTimeoutError extends Error {
    constructor(message: string) {
        super(message);

        this.name = 'ConsumptionTimeoutError';
        this.message = message;
        this.stack = new Error().stack;
    }
}
