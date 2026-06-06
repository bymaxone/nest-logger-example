/**
 * Local mirror of the log-key convention gate for `apps/worker`.
 *
 * Asserts every {@link WORKER_LOG_KEYS} value follows the `MODULE_ACTION_RESULT`
 * convention and collides with no library-reserved key. If either fails, the
 * owning module's log key is wrong — fix it there, not here.
 */
import { LOG_KEYS_CONVENTION_REGEX, RESERVED_LOG_KEYS } from '@bymax-one/nest-logger/shared'
import { describe, expect, it } from '@jest/globals'

import { WORKER_LOG_KEYS } from './worker-log-keys.js'

describe('WORKER_LOG_KEYS', () => {
  // Each worker key must follow MODULE_ACTION_RESULT so aggregation/grouping stays consistent.
  it.each(WORKER_LOG_KEYS)('%s matches the MODULE_ACTION_RESULT convention', (key) => {
    expect(LOG_KEYS_CONVENTION_REGEX.test(key)).toBe(true)
  })

  it('reuses no RESERVED_LOG_KEYS value', () => {
    // A worker key shadowing a library-reserved key would corrupt log aggregation — forbid it.
    const reserved = new Set<string>(Object.values(RESERVED_LOG_KEYS))
    for (const key of WORKER_LOG_KEYS) {
      expect(reserved.has(key)).toBe(false)
    }
  })
})
