import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/.next',
      '**/coverage',
      '**/node_modules',
      '**/*.d.ts',
      // Stryker mutation-testing artefacts.
      '**/.stryker-tmp',
      '**/reports',
      // Prisma CLI config — loaded by the Prisma CLI runtime, not by the app's
      // TypeScript compiler. Excluded from project-service type checking for the
      // same reason eslint.config.mjs is: it is a build-tool config file.
      '**/prisma.config.ts',
    ],
  },
  js.configs.recommended,
  {
    // Plain JavaScript files (config scripts, ESM/CJS helpers) need Node globals
    // declared explicitly. They are intentionally NOT type-checked: the
    // type-aware ruleset below is scoped to TypeScript files only, so the
    // TypeScript project service never has to resolve a non-TS file.
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // TypeScript sources get the full type-checked ruleset via the project
    // service. Test files are scoped to app tsconfig.test.json blocks below.
    files: ['**/*.{ts,tsx,mts,cts}'],
    ignores: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['apps/api/**/*.spec.ts', 'apps/api/test/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        project: ['./apps/api/tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/worker/**/*.spec.ts', 'apps/worker/test/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        project: ['./apps/worker/tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Relax unsafe-type and explicit-any rules in tests: Jest/Vitest globals and
    // mock objects are unresolvable at the ESLint level without full type
    // augmentation, producing false-positive errors.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      // Test assertions on parsed JSON use `!` and String() on `unknown` values; these
      // are intentional and safe in the context of test fixtures.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  prettier,
)
