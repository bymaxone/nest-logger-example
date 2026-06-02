/**
 * Shared dev-default constants and env readers without Zod dependencies.
 *
 * Kept separate from {@link ./env.schema.ts} so runtime services can import typed
 * helpers without pulling the Zod schema graph into ESLint/tsc for simple lookups.
 */

/** Development default for the worker base URL (mirrors the Zod schema default). */
export const DEV_WORKER_URL = 'http://localhost:3002'

/**
 * Resolve `WORKER_URL` from a raw env record, defaulting to {@link DEV_WORKER_URL}.
 *
 * @param env - Raw environment (defaults to `process.env`).
 * @returns Worker base URL string.
 */
export function resolveWorkerUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.WORKER_URL ?? DEV_WORKER_URL
}
