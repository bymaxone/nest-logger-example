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
    // service. Scoping (not global application) is what keeps `pnpm lint`
    // green on a config-only tree and mirrors the nest-auth-example template.
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Relax unsafe-type and explicit-any rules in tests: Jest/Vitest globals and
    // mock objects are unresolvable at the ESLint level without full type
    // augmentation, producing false-positive no-unsafe-* / no-explicit-any errors.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  prettier,
)
