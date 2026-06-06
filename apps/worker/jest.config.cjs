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
        // Unit specs construct classes directly (no Nest DI container), so the
        // `design:*` reflection metadata is unnecessary here. Compiling without
        // `emitDecoratorMetadata` (see tsconfig.spec.json) prevents the unreachable
        // `__metadata("design:paramtypes", …)` phantom branches; the e2e project
        // keeps it on (its tests boot the real DI container).
        tsconfig: '<rootDir>/../tsconfig.spec.json',
        ignoreCoverageForAllDecorators: true,
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Coverage scope: executable source minus non-executable glue (framework
  // modules, the bootstrap entrypoints, declaration files), so the 100% gate is
  // meaningful rather than gamed.
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!main.ts',
    '!instrumentation.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
  coverageReporters: ['text', 'text-summary', 'json-summary'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
}
