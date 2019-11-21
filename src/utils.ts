export function isFunction(functionToCheck: any): functionToCheck is (...args: any[]) => any {
    return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

