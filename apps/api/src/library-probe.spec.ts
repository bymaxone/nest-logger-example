/**
 * Unit tests for the library export-surface probe.
 *
 * Verifies the runtime-value exports that prove both `@bymax-one/nest-logger`
 * subpaths (`.` server API + `/shared` isomorphic API) resolve through the local
 * link: the server module name, the well-formed-key boolean, the decorator metadata
 * key, the pretty-dev destination name, the injection-token labels, and the aggregate
 * `probe` constant. These are the only executable lines in the module; the rest is
 * type-only glue erased at runtime.
 */
import { describe, expect, it } from '@jest/globals'

import {
  contextMetadataKey,
  injectionTokenLabels,
  isWellFormedKey,
  prettyDestinationName,
  probe,
  serverModuleName,
} from './library-probe.js'

/** The expected string labels of the three exported DI-token symbols, in probe order. */
const EXPECTED_TOKEN_LABELS = [
  'Symbol(BYMAX_LOGGER_DESTINATIONS)',
  'Symbol(BYMAX_LOGGER_PINO_INSTANCE)',
  'Symbol(BYMAX_LOGGER_LOG_CONTEXT)',
]

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

  it('exposes the @LogContext decorator metadata key from the `.` subpath', () => {
    /**
     * `LOG_CONTEXT_METADATA_KEY` is the library's reflector metadata key; re-exporting
     * it proves the value resolved and pins its exact, stable string identity.
     */
    expect(contextMetadataKey).toBe('bymax_logger:log_context')
  })

  it('exposes the pretty-dev destination class name from the `.` subpath', () => {
    /**
     * Reading `PrettyDevDestination.name` proves the destination class value import
     * resolved to the expected named class.
     */
    expect(prettyDestinationName).toBe('PrettyDevDestination')
  })

  it('labels the three injection-token symbols from the `.` subpath', () => {
    /**
     * The destinations / pino-instance / log-context DI tokens are unique symbols;
     * their `toString()` labels prove the advanced DI surface resolved, in probe order.
     */
    expect(injectionTokenLabels).toEqual(EXPECTED_TOKEN_LABELS)
  })

  it('aggregates every subpath proof in the frozen `probe` constant', () => {
    /**
     * The `probe` object collects each subpath proof; it must carry the module name,
     * sample level + reserved key, the well-formed-key flag, the metadata key, the
     * pretty destination name, and the token labels so one import asserts the surface.
     */
    expect(probe).toEqual({
      serverModuleName: 'BymaxLoggerModule',
      sampleLevel: 'info',
      sampleReservedKey: 'HTTP_REQUEST_COMPLETED',
      isWellFormedKey: true,
      contextMetadataKey: 'bymax_logger:log_context',
      prettyDestinationName: 'PrettyDevDestination',
      injectionTokenLabels: EXPECTED_TOKEN_LABELS,
    })
  })
})
