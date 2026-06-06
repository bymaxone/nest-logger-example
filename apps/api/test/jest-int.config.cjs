'use strict'

/**
 * Integration-tier Jest config — runs ONLY the opt-in `*.int-spec.ts` suites
 * (Testcontainers-backed). Kept separate from the unit and e2e projects so the
 * hermetic default runs never spin a container. Invoked by `pnpm test:int`.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '../',
  testRegex: '\\.int-spec\\.ts$',
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
  // Container cold-start (Loki) plus async indexing needs generous headroom.
  testTimeout: 180000,
}
