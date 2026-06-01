/**
 * Local mirror of the `audit-log-keys.mjs` CI gate.
 *
 * Asserts every demo-domain application log key:
 *   1. Matches the `MODULE_ACTION_RESULT` convention regex.
 *   2. Does not collide with any library-reserved key.
 *
 * If either assertion fails, the owning module's log key is wrong — fix it there,
 * not here.
 */
import { LOG_KEYS_CONVENTION_REGEX, RESERVED_LOG_KEYS } from '@bymax-one/nest-logger/shared'

import { APP_LOG_KEYS } from './app-log-keys.js'

describe('APP_LOG_KEYS', () => {
  // Each key must follow MODULE_ACTION_RESULT (≥2 uppercase segments separated by _).
  it.each(APP_LOG_KEYS)('%s matches the convention regex', (key) => {
    expect(LOG_KEYS_CONVENTION_REGEX.test(key)).toBe(true)
  })

  // No app key may shadow a library-reserved key — prevents log aggregation collisions.
  it('reuses no RESERVED_LOG_KEYS value', () => {
    const reserved = new Set<string>(Object.values(RESERVED_LOG_KEYS))
    for (const key of APP_LOG_KEYS) {
      expect(reserved.has(key)).toBe(false)
    }
  })
})
