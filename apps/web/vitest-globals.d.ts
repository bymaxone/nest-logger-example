/**
 * @fileoverview Global type augmentations for the Vitest test environment.
 *
 * Importing `@testing-library/jest-dom/vitest` here registers the jest-dom
 * matcher types (`toBeInTheDocument`, `toBeDisabled`, etc.) on Vitest's
 * `Assertion<T>` interface for every file in the project, without requiring
 * each test file to carry its own import.
 *
 * The runtime registration still lives in `vitest.setup.ts`; this file is
 * type-only and is picked up by the TypeScript Language Server via the
 * `**\/*.ts` glob in `tsconfig.json`.
 */
import '@testing-library/jest-dom/vitest'
