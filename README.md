# Kafka Sagas 🌼

Kafka-sagas is a package that allows you to use eerily similar semantics to [Redux-Sagas](https://redux-saga.js.org/) built on top of [KafkaJS](https://kafka.js.org/). With Kafka-Sagas, Kafka topics are treated as streams that a saga can dispatch actions into, as well as tapped for particular actions to initiate a saga.

- [Kafka Sagas 🌼](#kafka-sagas-)
  - [Usage](#usage)
  - [1. Install](#1-install)
  - [2. Make sure peer dependencies are installed](#2-make-sure-peer-dependencies-are-installed)
  - [API Reference](#api-reference)
    - [What's A Saga?](#whats-a-saga)
    - [What's A Consumer?](#whats-a-consumer)
    - [What's An Action?](#whats-an-action)
    - [What's an Effect?](#whats-an-effect)
    - [What's A Transaction?](#whats-a-transaction)
  - [Advanced](#advanced)
    - [Communication between sagas](#communication-between-sagas)
    - [Production speed](#production-speed)

## Usage

## 1. Install

```typescript
npm install --save kafka-sagas
```

##  2. Make sure peer dependencies are installed

```typescript
npm install --save kafkajs
```

## [API Reference](https://social-native.github.io/kafka-sagas/index.html)

### What's A Saga?

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

### What's A Consumer?

A consumer, in this realm, is a [Kafka consumer](https://www.confluent.io/blog/tutorial-getting-started-with-the-new-apache-kafka-0-9-consumer-client/#:~:text=In%20Kafka%2C%20each%20topic%20is,sharing%20a%20common%20group%20identifier.). You may choose to have one or many consumers within a single group. In order to do so, simply create another TopicSagaConsumer with the same topic.

### What's An Action?

An action is an event sent to a saga consumer that includes information about the topic, transactionId, and a payload. Under the hood, actions are just specialized kafka messages.

### What's an Effect?

An effect is a side-effect a saga may perform within a transaction. Effects may be either intercepted by or stubbed out by using middleware.

### What's A Transaction?

A transaction is a string of events that share a transaction_id. By being in the same transaction, we are able to create consumers under-the-hood to other topics while only receiving messages from those topics that are in the current transaction we are working within.

## Advanced

### Communication between sagas

The following diagram illustrates how 3 independently deployed sagas can interact and react to each other.
![3 sagas communicate](https://kafka-sagas-documentation.s3.amazonaws.com/3+Sagas+Communicate.png)

### Production speed
Due to [this bug](https://github.com/tulios/kafkajs/issues/598), the underlying producer batches messages into sets of 10,000 and sends a batch of 10,000 messages per second. This isn't currently configurable, but it is my understanding that this should be no trouble for a Kafka cluster. This means `PUT` effects may take up to a second to resolve. See the `ThrottledProducer` class to understand the finer workings of the producer.