# Kafka Sagas 🌼

Kafka-sagas is a package that allows you to use eerily similar semantics to [Redux-Sagas](https://redux-saga.js.org/) built on top of [KafkaJS](https://kafka.js.org/). With Kafka-Sagas, Kafka topics are treated as streams that a saga can dispatch actions into, as well as tapped for particular actions to initiate a saga.

## [API Reference](https://social-native.github.io/kafka-sagas/index.html)

- [Kafka Sagas 🌼](#kafka-sagas-)
  - [API Reference](#api-reference)
  - [Usage](#usage)
  - [Glossary](#glossary)
  - [Advanced](#advanced)

## Usage

1. Install

```typescript
npm install --save kafka-sagas
```

2. Make sure peer dependencies are installed

```typescript
npm install --save kafkajs
```

## Glossary

<details>
<summary>Saga</summary>

A saga is a generator function that receives a payload from a topic and runs some effects as a response. Effects performed by the saga will all be executed within the same transaction as the initiating action.

Example:

```ts
const topics = {
    BEGIN: 'BEGIN',
    STARTED: 'STARTED',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
};

const saga = function*<Payload>(
    {
        topic,
        transaction_id,
        payload
    }: {
        topic: string;
        transaction_id: string;
        payload: Payload;
    },
    context
) {
    const {effects} = context;

    console.log(`${topic} message received`, {
        transaction_id
    });

    try {
        yield effects.put(topics.STARTED, payload); // This will put send an action to the STARTED topic with our current transaction_id.

        const result = yield effects.callFn(async function() {
            const {data} = await axios.post('/status');
            return data;
        });

        yield effects.put(topics.COMPLETED, result); // This will put send an action to the COMPLETED topic with our current transaction_id.

        console.log(`${topic} message processed`, {
            transaction_id
        });
    } catch (error) {
        yield effects.put(topics.FAILED, {
            // This will put send an action to the FAILED topic with our current transaction_id.
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        });
    }
};
```

</details>

<details>
<summary>Consumer</summary>

A consumer, in this realm, is a [Kafka consumer](https://www.confluent.io/blog/tutorial-getting-started-with-the-new-apache-kafka-0-9-consumer-client/#:~:text=In%20Kafka%2C%20each%20topic%20is,sharing%20a%20common%20group%20identifier.). You may choose to have one or many consumers within a single group. In order to do so, simply create another TopicSagaConsumer with the same topic.

</details>

<details>
<summary>Action</summary>
An action is an event sent to a saga consumer that includes information about the topic, transactionId, and a payload. Under the hood, actions are just specialized kafka messages.
</details>

<details>
<summary>Effect</summary>
An effect is a side-effect a saga may perform within a transaction. Effects may be either intercepted by or stubbed out by using middleware.
</details>

<details>
<summary>Transaction</summary>

A transaction is a string of events that share a transaction_id. By being in the same transaction, we are able to create consumers under-the-hood to other topics while only receiving messages from those topics that are in the current transaction we are working within.

</details>

## Advanced

<details>
<summary>Communication Between Sagas</summary>

The following diagram illustrates how 3 independently deployed sagas can interact and react to each other.
![3 sagas communicate](https://kafka-sagas-documentation.s3.amazonaws.com/3+Sagas+Communicate.png)

</details>

<details>
<summary>Production Speed</summary>

Due to [this bug](https://github.com/tulios/kafkajs/issues/598), the underlying producer batches messages into sets of 10,000 and sends a batch of 10,000 messages per second. This isn't currently configurable, but it is my understanding that this should be no trouble for a Kafka cluster. This means `PUT` effects may take up to a second to resolve. See the `ThrottledProducer` class to understand the finer workings of the producer.

</details>

<details>
<summary>Auto Topic Creation</summary>

By default, a TopicSagaConsumer will automatically create a topic if it attempts to subscribe to nonexistent one. If you would like to control how topics are created by both the primary consumer and underlying consumers and producers, instantiate the TopicSagaConsumer with your own TopicAdministrator instance.

The following example creates **three** topics with 10 partitions each:

```ts
const topic = 'some_topic_that_does_not_exist_yet';

const topicAdministrator = new TopicAdministrator(kafka, {
    numPartitions: 10
});

const topicConsumer = new TopicSagaConsumer({
    kafka,
    topic,
    topicAdministrator,
    *saga(_, {effects: {put, actionChannel}}) {
        /**
         * A new topic (with 10 partitions) is created here using the provided topicAdministrator.
         */
        yield put('some_other_non_existent_topic');

        /**
         * A new topic (again, with 10 partitions) is created here as well.
         */
        const channel = yield actionChannel('a_third_nonexistent_topic');
    }
});

/**
 * The some_topic_that_does_not_exist_yet topic is created during the consumer startup.
 */
await topicConsumer.run();
```

The topics in the above example will be created in the following order, since the saga won't execute until messages are flowing in:

1. some_topic_that_does_not_exist_yet
2. some_other_non_existent_topic
3. a_third_nonexistent_topic
    </details>

<details>
<summary>Concurrency</summary>

By instantiating multiple `TopicSagaConsumer` instances, you are able consume from the same topic concurrently, given there are partitions to support the number of consumers. This is a scenario you would encountere if you were running multiple Kubernetes pods each of which instantiate a single consumer. In the future, concurrency as a config will be available.

</details>
