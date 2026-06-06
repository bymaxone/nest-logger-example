/**
 * Unit tests for `AdminService`.
 *
 * Covers the runtime log-level change path that uses the raw-Pino escape hatch:
 *   - reads the previous level from the raw logger,
 *   - mutates the raw logger's `level` to the requested value,
 *   - emits the `ADMIN_LOG_LEVEL_CHANGED` structured log with the old → new transition,
 *   - returns `{ previous, current }`.
 *
 * The logger is mocked as a plain object exposing `getRawLogger()` and `info()`, so the
 * service is constructed directly without the Nest DI container.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { PinoLoggerService } from '@bymax-one/nest-logger'

import { AdminService } from './admin.service.js'
import type { LogLevelDto } from './dto/log-level.dto.js'

/**
 * Builds an `AdminService` wired to a mock logger whose raw logger starts at the
 * given level. Returns the service plus the spies needed to assert on side effects.
 */
function buildService(initialLevel: string): {
  service: AdminService
  raw: { level: string }
  infoSpy: ReturnType<typeof jest.fn>
  getRawLoggerSpy: ReturnType<typeof jest.fn>
} {
  const raw = { level: initialLevel }
  const getRawLoggerSpy = jest.fn(() => raw)
  const infoSpy = jest.fn()
  const logger = {
    getRawLogger: getRawLoggerSpy,
    info: infoSpy,
  } as unknown as PinoLoggerService
  const service = new AdminService(logger)
  return { service, raw, infoSpy, getRawLoggerSpy }
}

describe('AdminService.setLogLevel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * Happy path: changing from `info` to `debug` must mutate the raw logger's `level`
   * to the new value and return the previous and current levels — this is the contract
   * the controller relies on to report the transition to the caller.
   */
  it('mutates the raw logger level and returns previous/current', () => {
    const { service, raw } = buildService('info')

    const dto: LogLevelDto = { level: 'debug' }
    const result = service.setLogLevel(dto)

    expect(raw.level).toBe('debug')
    expect(result).toEqual({ previous: 'info', current: 'debug' })
  })

  /**
   * The transition must be recorded as a structured `ADMIN_LOG_LEVEL_CHANGED` log with
   * the old and new levels in the meta object — this is the audit trail proving the
   * escape hatch was exercised, and it must carry `undefined` as the userId argument.
   */
  it('emits the ADMIN_LOG_LEVEL_CHANGED structured log with old → new levels', () => {
    const { service, infoSpy } = buildService('warn')

    service.setLogLevel({ level: 'trace' })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).toHaveBeenCalledWith(
      'ADMIN_LOG_LEVEL_CHANGED',
      'Runtime log level changed',
      undefined,
      { previous: 'warn', current: 'trace' },
    )
  })

  /**
   * `getRawLogger()` is the only sanctioned escape-hatch call here; the service must
   * read the raw logger exactly once to capture the previous level and apply the new one.
   */
  it('reads the raw logger exactly once via getRawLogger()', () => {
    const { service, getRawLoggerSpy } = buildService('error')

    service.setLogLevel({ level: 'fatal' })

    expect(getRawLoggerSpy).toHaveBeenCalledTimes(1)
  })

  /**
   * When the requested level equals the current level the service still performs the
   * assignment and reports identical previous/current values — there is no early-return
   * branch, so the no-op case must round-trip cleanly.
   */
  it('handles a same-level request by reporting identical previous/current', () => {
    const { service, raw, infoSpy } = buildService('info')

    const result = service.setLogLevel({ level: 'info' })

    expect(raw.level).toBe('info')
    expect(result).toEqual({ previous: 'info', current: 'info' })
    expect(infoSpy).toHaveBeenCalledWith(
      'ADMIN_LOG_LEVEL_CHANGED',
      'Runtime log level changed',
      undefined,
      { previous: 'info', current: 'info' },
    )
  })
})
