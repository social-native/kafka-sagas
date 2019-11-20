import Bluebird from 'bluebird';

export function allPromise(promises: Array<Promise<any>> | Record<string, Promise<any>>) {
    if (Array.isArray(promises)) {
        return Bluebird.all(promises);
    } else if (
        // tslint:disable-next-line: triple-equals
        promises != null &&
        typeof promises === 'object'
    ) {
        return Bluebird.props(promises);
    }

    throw new Error(`allPromise cannot handle the type provided: ${promises}`);
}
