'use strict'

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '../',
  testRegex: '\\.e2e-spec\\.ts$',
  // rootDir is the package root, so without this the run would also collect the
  // spec copies inside Stryker's sandbox (.stryker-tmp), where relative imports
  // that escape the package (e.g. ../../worker) do not resolve. Setting the
  // option replaces Jest's default, so /node_modules/ must be restated.
  testPathIgnorePatterns: ['/node_modules/', '/\\.stryker-tmp/'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.test.json',
        ignoreCoverageForAllDecorators: true,
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  // Increase timeout for e2e tests (NestJS module bootstrap + slow endpoints).
  testTimeout: 30000,
}
