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
        [resolvedKey]: resolvedValue,
        ...withNullifiedValues
    };
}

export async function racePromise() {
    // @todo
}
