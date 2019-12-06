import Bluebird from 'bluebird';

export async function racePromiseRecord<Keys extends string>(
    raceable: Record<Keys, Promise<any>>
): Promise<Record<Keys, any>> {
    const [resolvedKey, resolvedValue] = await new Promise<[string, any]>((resolve, reject) => {
        Object.entries<Promise<any>>(raceable).forEach(([key, promiseValue]) => {
            promiseValue.then(
                value => resolve([key, value]),
                err => reject(err)
            );
        });
    });

    const withNullifiedValues = Object.keys(raceable).reduce((record, keyName) => {
        return {
            ...record,
            [keyName]: null
        };
    }, {} as Record<Keys, null>);

    return {
        ...withNullifiedValues,
        [resolvedKey]: resolvedValue
    };
}

export async function racePromise(raceable: Array<Promise<any>> | Record<string, Promise<any>>) {
    if (Array.isArray(raceable)) {
        return Bluebird.race(raceable);
    } else {
        return racePromiseRecord(raceable);
    }
}
