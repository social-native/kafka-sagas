module.exports = {
    roots: ['<rootDir>/src/__tests__'],
    transform: {
        '^.+\\.ts$': 'ts-jest'
    },
    automock: false,
    moduleFileExtensions: ['ts', 'js', 'json'],
    modulePaths: ['<rootDir>/src'],
    testRegex: '(/__tests__/.*|(\\.|/))test.ts?$',
    verbose: false
};
