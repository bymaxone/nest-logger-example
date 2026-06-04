/**
 * @fileoverview Browser-safe log key utilities — imports only from the
 * isomorphic `@bymax-one/nest-logger/shared` subpath. Never import from the
 * server `.` root here; it pulls in Pino/Nest/Node built-ins and breaks the
 * client bundle.
 *
 * @module lib/log-keys
 */

// Isomorphic subpath ONLY — never import "@bymax-one/nest-logger" (the server `.` root) in the browser.
import { LOG_KEYS_CONVENTION_REGEX, type LogEntry } from '@bymax-one/nest-logger/shared'

export { LOG_KEYS_CONVENTION_REGEX }
export type { LogEntry }

/**
 * Validates a `logKey` against the library convention (`MODULE_ACTION_RESULT`).
 *
 * Used by the Explorer query bar to flag a typo'd key inline. Resets the regex
 * `lastIndex` defensively in case the exported pattern carries the global flag.
 *
 * @param key - The candidate log key (e.g. `ORDER_CREATE_SUCCESS`).
 * @returns `true` when the key matches the convention.
 */
export function isValidLogKey(key: string): boolean {
  LOG_KEYS_CONVENTION_REGEX.lastIndex = 0
  return LOG_KEYS_CONVENTION_REGEX.test(key)
}
