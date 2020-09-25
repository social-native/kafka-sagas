import {Producer, Kafka, CompressionTypes, ProducerConfig} from 'kafkajs';
import {IAction, IQueuedRecord} from './types';
import {createActionMessage} from './create_action_message';
import {isKafkaJSProtocolError} from './type_guard';
import Bluebird from 'bluebird';
import pino from 'pino';
import uuid from 'uuid';

export class ThrottledProducer {
    public recordsSent = 0;

    private producer: Producer;
    private isConnected: boolean = false;
    private intervalTimeout: NodeJS.Timeout;
    private recordQueue: IQueuedRecord[] = [];
    private isFlushing = false;
    private logger: pino.Logger;

    constructor(
        protected kafka: Kafka,
        protected producerConfig: Omit<
            ProducerConfig,
            'allowAutoTopicCreation' | 'maxInFlightRequests' | 'idempotent'
        > & {maxOutgoingBatchSize?: number; flushIntervalMs?: number} = {
            maxOutgoingBatchSize: 10000,
            flushIntervalMs: 1000
        },
        logger?: pino.Logger
    ) {
        this.logger = logger
            ? logger.child({class: 'KafkaSagasThrottledProducer'})
            : pino().child({class: 'KafkaSagasThrottledProducer'});
        this.createProducer();
    }

    // tslint:disable-next-line: cyclomatic-complexity
    public putAction = async <Action extends IAction>(action: Action) => {
        if (!this.isConnected) {
            throw new Error('You must .connect before producing actions');
        }

        return new Promise<void>((resolve, reject) => {
            this.recordQueue = [
                ...this.recordQueue,
                {
                    resolve,
                    reject,
                    record: {
                        topic: action.topic,
                        messages: [createActionMessage({action})]
                    }
                }
            ];

            return;
        });
    };

    public connect = async () => {
        if (this.isConnected) {
            return;
        }

        const flushIntervalMs = this.producerConfig.flushIntervalMs || 1000;

        this.logger.debug('Connecting producer');
        await this.producer.connect();
        this.logger.debug('Connected producer');

        this.logger.debug({flushIntervalMs}, 'Creating flush interval');
        this.intervalTimeout = setInterval(this.flush, flushIntervalMs);
        this.logger.debug('Created flush interval');

        this.isConnected = true;
    };

    public disconnect = async () => {
        if (!this.isConnected) {
            return;
        }

        this.logger.debug('Disconnecting');
        clearInterval(this.intervalTimeout);

        await this.producer.disconnect();
        this.logger.debug('Disconnected');
        this.isConnected = false;
    };

    private createProducer = () => {
        this.logger.debug('Creating a new producer');
        this.producer = this.kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            allowAutoTopicCreation: true,
            ...this.producerConfig
        });
        this.logger.debug('Created a new producer');
    };

    // tslint:disable-next-line: cyclomatic-complexity
    private flush = async (
        retryRecords?: IQueuedRecord[],
        retryCounter = 0,
        retryBatchId?: string
    ) => {
        if (!retryRecords && this.isFlushing) {
            return;
        }

        if (retryCounter) {
            /** Wait for a max of 30 seconds before retrying */
            const retryDelay = Math.min(retryCounter * 1000, 30000);
            this.logger.debug({retryDelay}, 'Waiting before attempting retry');
            await Bluebird.delay(retryDelay);
        }

        /**
         * Ensures that if the interval call ends up being concurrent due latency in sendBatch,
         * unintentinally overlapping cycles are deferred to the next interval.
         */
        this.isFlushing = true;

        const batchSize = this.producerConfig.maxOutgoingBatchSize || 1000;
        const outgoingRecords = retryRecords || this.recordQueue.slice(0, batchSize);
        this.recordQueue = this.recordQueue.slice(batchSize);
        const batchId = retryBatchId || uuid.v4();

        if (!outgoingRecords.length) {
            this.logger.debug({batchId}, 'No records to flush');
            this.isFlushing = false;
            return;
        }

        this.logger.debug(
            {
                remaining: this.recordQueue.length,
                records: outgoingRecords.length,
                batchId
            },
            'Flushing queue'
        );

        try {
            await this.producer.sendBatch({
                topicMessages: outgoingRecords.map(({record}) => record),
                acks: -1,
                compression: CompressionTypes.GZIP
            });

            this.recordsSent += outgoingRecords.length;
            this.logger.debug({batchId}, 'Flushed queue');
            outgoingRecords.map(({resolve}) => resolve());
            this.isFlushing = false;
            return;
        } catch (error) {
            /**
             * If for some reason this producer is no longer recognized by the broker,
             * create a new producer.
             */
            if (isKafkaJSProtocolError(error) && error.type === 'UNKNOWN_PRODUCER_ID') {
                await this.producer.disconnect();
                this.createProducer();
                await this.producer.connect();
                this.logger.debug(
                    {batchId},
                    'Retrying failed flush attempt due to UNKNOWN_PRODUCER_ID'
                );
                await this.flush(outgoingRecords, retryCounter + 1, batchId);
                return;
            }

            outgoingRecords.map(({reject}) => reject(error));
            this.isFlushing = false;
            return;
        }
    };
}
