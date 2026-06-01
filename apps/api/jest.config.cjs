'use strict'

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/../tsconfig.test.json',
        // Suppresses the coverage false-positive for decorator metadata branches.
        ignoreCoverageForAllDecorators: true,
      },
    ],
  },
  // Strip .js extension from relative imports so ts-jest resolves .ts source files.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.{ts,js}'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
}
