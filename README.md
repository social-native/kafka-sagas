# Kafka Sagas 🌼

Kafka-sagas is a package that allows you to use eerily similar semantics to [Redux-Sagas](https://redux-saga.js.org/) built on top of [KafkaJS](https://kafka.js.org/). With Kafka-Sagas, Kafka topics are treated as streams that a saga can dispatch actions into, as well as tapped for particular actions to initiate a saga.

## [API Reference](https://social-native.github.io/kafka-sagas/index.html)

- [Kafka Sagas 🌼](#kafka-sagas-)
  - [API Reference](#api-reference)
  - [Usage](#usage)
  - [Effects](#effects)
    - [put](#put)
    - [actionChannel](#actionchannel)
      - [Using a topic as input](#using-a-topic-as-input)
    - [take](#take)
      - [Using an action channel as input](#using-an-action-channel-as-input)
      - [Using a topic as input](#using-a-topic-as-input-1)
      - [Using a topic + predicate as input](#using-a-topic--predicate-as-input)
    - [callFn](#callfn)
    - [all](#all)
    - [race](#race)
    - [delay](#delay)
  - [Recipes](#recipes)
    - [Communication with another saga (and timeout if it doesn't respond in time)](#communication-with-another-saga-and-timeout-if-it-doesnt-respond-in-time)
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

3. Write a saga:

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

A saga is implemented using a [generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*). This library attempts to bring an interface similar to AWS lambda, so you could think of sagas as analogous to `exports.handler`. As shown in the above example, two arguments are expected during each run of a saga (which would be executed per each message received on the input topic from kafka).

## Effects

In a saga, `effects` are plain javascript objects that the saga runner can interpret and act upon. A rough demonstration of this loop is as follows:

```ts
import {IAction} from 'kafka-sagas';
const sagaRunner = new SagaRunner();

function* saga(action: IAction<{status: string}>, context) {
    /** This action is provided below in .runSaga */
    const status = action.payload.status;

    /** context.logger is provided below in .runSaga */
    const logger = context.logger;

    /** All effects are inside of the `context` parameter. */
    const {put} = context.effects;

    /**
     * `effect` is a plain object describing a `put` of `{status}` into the `LOG_STATUS` topic.
     * It looks like this:
     * {
     *      pattern: 'LOG_STATUS';
     *      payload: {status: 'SUCCEEDED'};
     *      kind: 'put';
     *      topic: 'LOG_STATUS';
     * }
     *
     * At this point, the saga is continuing synchronously and hasn't performed effect.
     */
    const effect = put('LOG_STATUS', {status});

    /**
     * `yield`ing an effect will pause execution of the saga, and the object above will be yielded out to the sagaRunner.
     * sagaRunner will perform the effect and return the result of it, which will be assigned to `result`.
     */
    const result = yield effect;

    /**
     * This will throw!
     *
     * `yielding` a promise (which is not an effect) will kick the promise off.
     * However, once the sagaRunner sees this promise it will throw due to having not received an effect.
     *
     * In order to await promises, use the `callFn` effect (which can be a plain, asynchronous, or generator function).
     */
    const aPromiseThatIsNotAwaited = yield new Promise(((resolve, reject)) => {
        resolve(true);
    });
}

await sagaRunner.runSaga({
    transaction_id: 'some-uuid' // The transactionID is typically generated by execution of a `put` under the hood. It will be included in the kafka message.
    topic: 'INPUT_TOPIC' // irrelevant here, but allows the saga to see what topic its message came from.
    payload: {status: 'SUCCEEDED'} // the action payload.
});
```

Internally, `sagaRunner` iterates over the saga generator function recursively once you call runSaga:

```ts
class SagaRunner {
    constructor(middleware) {
        this.middleware = middleware;
    }

    // a simplified view of what runSaga is doing
    runSaga = async (action, context, saga) => {
        await this.recurseOverSaga(saga(action, context), context);
    };

    runEffect = async (effect, context) => {
        if (isPutEffect(effect)) {
            /** A "put" effect was given, so we are sending a message to the topic in the "put" effect. */
            const result = await kafkaProducer.sendMessageToTopic(effect.topic, effect.payload);
            return result;
        }
    };

    recurseOverSaga = async (generator, context, previous) => {
        /**
         * calling .next on the generator causes it to continue past the last `yield`.
         * The argument passed to .next will be used as the return value of the `yield`.
         */
        const {done, effect} = generator.next(previous);

        /** The generator function (saga) has reached the end of its execution */
        if (done) {
            return;
        }

        /**
         * Middleware can be given to intercept and modify effects
         * to, for example, modify the effect or run some other effect entirely.
         * This can be useful for stubbing effects out in tests.
         */
        const effectAfterMiddleware = await this.middleware(effect, context);

        const effectResult = await this.runEffect(effectAfterMiddleware, context);

        return this.recurseOverSaga(generator, context, effectResult);
    };
}
```

### put

`put` will produce a message to a topic given an optional payload. It can take a type argument to give strictness on the shape of the payload.

```ts
type OutgoingPayload = {bart: string};
const topic = 'FETCH_INSIGHTS_BEGIN';

function* mySaga(action, context) {
    const {put} = context.effects;
    yield put<OutgoingPayload>(topic, {bart: 'simpson'});
}
```

### actionChannel

`actionChannel` can be given a stream to watch for messages. As messages arrive from that stream, it will add them to a buffer (which has FIFO queue semantics), until something comes along and pops the message off of the buffer. Action channels should be established before sending a message to some other saga in order to listen _before_ enqueuing work. Doing so ensures you will not miss the response. A typical example of kicking off another saga and waiting for it to respond:

#### Using a topic as input

```ts
function* () {

}
```

Action channels can also take predicate functions that allow you to filter only for actions that match. In the following example, we create a channel that will only buffer actions if `payload.toppings` includes `pepperonis`:

```ts
function* waitForPepperoniPizza(action, context) {
    const pepperoniChannel = yield actionChannel({
        pattern: 'PIZZA_CREATE_SUCCESS',
        predicate: action => action.payload.toppings.includes('pepperonis')
    });

    const {payload: pizza} = yield take(pepperoniChannel);

    yield put('PEPPERONI_PIZZA_CREATE_SUCCESS', pizza);
}
```

### take

`take`, given either a stream or channel to watch, will give back the first message it receives on that channel.

#### Using an action channel as input

Given an action channel, `take` will pull the oldest action out of the channel's buffer, or if one has not arrived yet, will wait until one does.

```ts
function* waitForPepperoniPizza(action, context) {
    const {put, take, actionChannel} = context.effects;

    yield put('PIZZA_CREATE_BEGIN', {toppings: ['pepperonis']});

    const pepperoniChannel = yield actionChannel({
        pattern: 'PIZZA_CREATE_SUCCESS',
        predicate: action => action.payload.toppings.includes('pepperonis')
    });

    const {payload: pizza} = yield take(pepperoniChannel);

    yield put('PEPPERONI_PIZZA_CREATE_SUCCESS', pizza);
}
```

#### Using a topic as input

Given a topic, `take` will immediately return the first action it receives from that topic, when it does, similar to when given an action channel. The difference between these two inputs is that an action channel allows listening for and buffering actions in the background while doing other things in the saga.

```ts
function* dontWaitForPepperoniPizza(action, context) {
    const {payload: pizza} = yield take('PIZZA_CREATE_SUCCESS');

    yield put('PEPPERONI_PIZZA_CREATE_SUCCESS', pizza);
}
```

#### Using a topic + predicate as input

Given a topic+predicate, `take` will behave the same as if it were given just a topic, however, it will only return once it sees an action that also matches the predicate, i.e., calling the provided function on the action returns `true`.

```ts
function* dontWaitForPepperoniPizza(action, context) {
    const {payload: pizza} = yield take({
        pattern: 'PIZZA_CREATE_SUCCESS',
        predicate: action => action.payload.toppings.includes('pepperonis')
    });

    yield put('PEPPERONI_PIZZA_CREATE_SUCCESS', pizza);
}
```

### callFn

### all

### race

### delay

## Recipes

### Communication with another saga (and timeout if it doesn't respond in time)

In the example, below, we perform an "actionchannel-put-take" cycle, where we:

1. Open a channel to start listening for responses from another saga.
2. Enqueue some work for that saga to begin.
3. Race `take`s on the response channels and the delay effect to ensure we don't wait forever in case neither of the channels respond.

**Why?**
Typical Kafka brokers will assume a consumer is unhealthy if it does not commit a message within 30 seconds. This means that an entire transaction is beholden to the time limit of the topmost saga, in this case `enqueuePepperoniPizza`. In order to give ourselves some time to handle the timeout, we use the delay effect with a delay timeout of something ~10 seconds less than the timeout.

In this scenario, you may want to initiate a rollback in case the saga you've kicked off is simply taking a long time.

```ts
/**
 * A saga to enqueue creation of pepperoni pizza.
 */
function* enqueuePepperoniPizza(action, context) {
    const {actionChannel, race, take, put, delay} = context.effects;

    const successChannel = yield actionChannel('PIZZA_CREATE_SUCCESS');
    const failureChannel = yield actionChannel('PIZZA_CREATE_FAILED');

    yield put('CREATE_PIZZA_BEGIN', {toppings: ['pepperonis']});

    /**
     * `race` will return the first effect to respond.
     */
    const {succeeded, failed, timedOut} = yield race({
        /** `take` will pull the first action out of an action channel. If the channel hasn't buffered one yet, it will wait until it does. */
        succeeded: take(successChannel),
        failed: take(failureChannel),
        /** `delay` will wait the given milliseconds and then respond with the second (optional) argument */
        timedOut: delay(20000, true)
    });
}

/**
 * A saga to create a pizza given a set of toppings.
 */

/**
 * Extracts the returntype of a promise-returning function.
 */
import {Awaited} from 'types/promise';

function* createPizza(action, context) {
    const {callFn} = context.effects;

    try {
        /** Let consumers that care know we started work on this pizza */
        yield put('PIZZA_CREATE_STARTED', action.payload);
        /**
         * `callFn` will execute the function provided and await its response if it is async.
         *
         * Since we are in a generator function and return types are nondeterministic, we must make type assertions ourselves.
         */
        const pizza: Awaited<typeof createPizza> = yield callFn(createPizza, [
            action.payload.toppings
        ]);
        /** Success! send the pizza out on the "success" channel for consumers of that channel (topic) to see. */
        yield put('PIZZA_CREATE_SUCCESS', {pizza});
    } catch (error) {
        /** Failed! send the error out on the failed channel for consumers of that channel to see. */
        yield put('PIZZA_CREATE_FAILED', {error});
    }
}

/**
 * The function that actually creates a pizza.
 */
async function createPizza(toppings) {
    return await axios.put('https://pizza.api', {toppings});
}
```

## Glossary

<details>
<summary>Saga</summary>

A saga is a generator function that receives a payload from a topic and runs some effects as a response. Effects performed by the saga will all be executed within the same transaction as the initiating action.

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
