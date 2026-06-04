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
 * Validates a `logKey` against the library convention (`MODULE_ACTION_RESULT`),
 * accepting a trailing `PREFIX_*` wildcard (the Explorer's prefix search).
 *
 * A wildcard like `PAYMENT_*` is probed by replacing the `*` with a dummy
 * uppercase token so the convention regex can validate the prefix shape. Resets
 * the regex `lastIndex` defensively in case the exported pattern carries the
 * global flag.
 *
 * @param key - The candidate log key (e.g. `ORDER_CREATE_SUCCESS` or `PAYMENT_*`).
 * @returns `true` when the key matches the convention (or is a valid wildcard).
 */
export function isValidLogKey(key: string): boolean {
  // Probe a `PREFIX_*` wildcard as `PREFIX_XX` so the convention regex (which
  // requires every segment to be 2+ chars) can validate the prefix shape. A
  // single-char suffix would spuriously fail a two-segment key like `PAYMENT_*`.
  const probe = key.endsWith('*') ? `${key.slice(0, -1)}XX` : key
  LOG_KEYS_CONVENTION_REGEX.lastIndex = 0
  return LOG_KEYS_CONVENTION_REGEX.test(probe)
}
