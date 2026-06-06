/**
 * Unit tests for the library subpath probe.
 *
 * Verifies the runtime-value exports that prove both `@bymax-one/nest-logger`
 * subpaths (`.` server API + `/shared` isomorphic API) resolve through the local
 * link: the server module name, the well-formed-key boolean, and the aggregate
 * `probe` constant. These are the only executable lines in the module; the rest is
 * type-only glue erased at runtime.
 */
import { describe, expect, it } from '@jest/globals'

import { isWellFormedKey, probe, serverModuleName } from './library-probe.js'

describe('library-probe', () => {
  it('exposes the server module name from the `.` subpath', () => {
    /**
     * Reading `BymaxLoggerModule.name` must resolve the server-only value import;
     * the export should equal the module class name to prove the `.` subpath loaded.
     */
    expect(serverModuleName).toBe('BymaxLoggerModule')
  })

  it('reports the sample key as well-formed via the `/shared` regex', () => {
    /**
     * Invoking `LOG_KEYS_CONVENTION_REGEX.test('ORDER_CREATE_SUCCESS')` proves the
     * isomorphic value import resolved; the canonical sample key must be valid.
     */
    expect(isWellFormedKey).toBe(true)
  })

  it('aggregates both subpath proofs in the frozen `probe` constant', () => {
    /**
     * The `probe` object collects each subpath proof; it must carry the resolved
     * module name, the sample level, and the well-formed-key flag so a single import
     * asserts the whole resolution surface.
     */
    expect(probe).toEqual({
      serverModuleName: 'BymaxLoggerModule',
      sampleLevel: 'info',
      isWellFormedKey: true,
    })
  })
})
