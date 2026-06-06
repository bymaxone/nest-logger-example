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
        // `emitDecoratorMetadata` (see tsconfig.spec.json) prevents ts/TypeScript
        // from emitting the `__metadata("design:paramtypes", …)` paramtype guards,
        // whose `: Object` fallback arms are unreachable phantom branches that
        // `ignoreCoverageForAllDecorators` alone does not suppress. The e2e project
        // keeps `emitDecoratorMetadata` on (its tests boot the real DI container).
        tsconfig: '<rootDir>/../tsconfig.spec.json',
        // Suppresses the coverage false-positive for the `__decorate(...)` wrappers.
        ignoreCoverageForAllDecorators: true,
      },
    ],
  },
  // Strip .js extension from relative imports so ts-jest resolves .ts source files.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Coverage scope: every executable source file, minus non-executable glue
  // (framework modules, the bootstrap entrypoints, declaration files, and DTOs
  // whose validation is proven behaviorally by the e2e suites). The exclusions
  // keep the 100% gate meaningful rather than gamed.
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!main.ts',
    '!instrumentation.ts',
    '!**/*.dto.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
  coverageReporters: ['text', 'text-summary', 'json-summary'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
}
