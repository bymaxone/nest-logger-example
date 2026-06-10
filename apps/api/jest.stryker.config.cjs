'use strict'

/**
 * Jest config used ONLY by Stryker's @stryker-mutator/jest-runner.
 * It re-runs the unit suite once per mutant, so:
 *  - coverage is disabled (a mutated line would falsely fail the 100% gate),
 *  - e2e specs are excluded (supertest is flaky under Stryker instrumentation).
 *
 * Uses .cjs to match the project's established jest-config pattern (jest.config.cjs,
 * jest-e2e.config.cjs) — Jest 30 requires ts-node to parse .ts config files, which
 * is not installed in this workspace.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.spec.json',
        ignoreCoverageForAllDecorators: true,
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  collectCoverage: false,
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/.stryker-tmp/'],
}
