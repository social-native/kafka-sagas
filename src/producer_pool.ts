import {Producer, Kafka, CompressionTypes, ProducerConfig} from 'kafkajs';
import {IAction, IOutgoingRecord} from './types';
import {createActionMessage} from './create_action_message';
import {TopicAdministrator} from './topic_administrator';
import {isKafkaJSProtocolError} from './type_guard';

export class ProducerPool {
    private producer: Producer;
    private topicAdministrator: TopicAdministrator;
    private isConnected: boolean = false;
    private intervalTimeout: NodeJS.Timeout;
    private createdTopics = new Set<string>();
    private recordOutbox: IOutgoingRecord[] = [];
    private isFlushingOutbox = false;

    constructor(
        protected kafka: Kafka,
        protected producerConfig: Omit<
            ProducerConfig,
            'allowAutoTopicCreation' | 'maxInFlightRequests' | 'idempotent'
        > & {maxOutgoingBatchSize: number} = {maxOutgoingBatchSize: 1000},
        topicAdministrator?: TopicAdministrator
    ) {
        this.createProducer();
        this.topicAdministrator = topicAdministrator || new TopicAdministrator(kafka);
    }

    // tslint:disable-next-line: cyclomatic-complexity
    public putAction = async <Action extends IAction>(action: Action) => {
        if (!this.isConnected) {
            throw new Error('You must .connect before producing actions');
        }

        if (!this.createdTopics.has(action.topic)) {
            await this.topicAdministrator.createTopic(action.topic);
            this.createdTopics.add(action.topic);
        }

        let _resolve: IOutgoingRecord['resolve'] | undefined;
        let _reject: IOutgoingRecord['reject'] | undefined;

        const promise = new Promise<any>((resolve, reject) => {
            _resolve = resolve;
            _reject = reject;
        });

        this.recordOutbox = [
            ...this.recordOutbox,
            {
                resolve: _resolve as any,
                reject: _reject as any,
                record: {
                    acks: -1,
                    compression: CompressionTypes.GZIP,
                    topic: action.topic,
                    messages: [createActionMessage({action})]
                }
            }
        ];

        return promise;
    };

    public connect = async () => {
        if (this.isConnected) {
            return;
        }

        await this.producer.connect();

        this.intervalTimeout = setInterval(async () => {
            await this.flushOutbox();
        }, 100);

        this.isConnected = true;
    };

    public disconnect = async () => {
        if (!this.isConnected) {
            return;
        }

        clearInterval(this.intervalTimeout);

        await this.producer.disconnect();
        this.isConnected = false;
    };

    private createProducer = () => {
        this.producer = this.kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            ...this.producerConfig
        });
    };

    // tslint:disable-next-line: cyclomatic-complexity
    private flushOutbox = async (retryRecord?: IOutgoingRecord[], retryCounter = 0) => {
        if (this.isFlushingOutbox) {
            return;
        }

        /**
         * Ensures that if the interval call ends up being concurrent due latency in sendBatch,
         * another cycle is deferred to the next interval.
         */
        this.isFlushingOutbox = true;

        const outgoingRecords =
            retryRecord ||
            this.recordOutbox.slice(0, this.producerConfig.maxOutgoingBatchSize || 1000);

        if (!outgoingRecords) {
            return;
        }

        try {
            await this.producer.sendBatch({
                topicMessages: outgoingRecords.map(({record}) => ({
                    topic: record.topic,
                    messages: record.messages
                })),
                acks: -1,
                compression: CompressionTypes.GZIP
            });

            outgoingRecords.map(({resolve}) => resolve());
        } catch (error) {
            /**
             * If for some reason this producer is no longer recognized by the broker,
             * create a new producer.
             */
            if (
                isKafkaJSProtocolError(error) &&
                error.type === 'UNKNOWN_PRODUCER_ID' &&
                retryCounter < 6
            ) {
                await this.producer.disconnect();
                this.createProducer();
                await this.producer.connect();
                await this.flushOutbox(outgoingRecords, retryCounter + 1);
                return;
            }

            outgoingRecords.map(({reject}) => reject(error));
            return;
        } finally {
            this.isFlushingOutbox = false;
        }
    };
}
