/**
 * Unit tests for `TriggerService`.
 *
 * Covers the Trigger Center backend that fires logs on demand:
 *   - `fireLevel` dispatches across BOTH logger surfaces — structured key-first
 *     (`info` / `warnStructured` / `errorStructured`) and NestJS-style variadic
 *     (`fatal` / `verbose` / `debug`) — and repeats `count` times, returning
 *     `{ fired: count }`.
 *   - `requestFault` emits the labelled `TRIGGER_FAULT_REQUESTED` warning.
 *   - `burst` fires `count` `TRIGGER_BURST_TICK` info lines and returns `{ fired: count }`.
 *
 * The logger is a plain object of `jest.fn()`s; the service is constructed directly
 * (the `@InjectLogger` decorator is only metadata, so DI is bypassed).
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { PinoLoggerService } from '@bymax-one/nest-logger'

import type { TriggerLevelDto } from './dto/trigger.dto.js'
import { TriggerService } from './trigger.service.js'

/** The logger methods the unit dispatches across, all mocked. */
interface LoggerMock {
  info: ReturnType<typeof jest.fn>
  warnStructured: ReturnType<typeof jest.fn>
  errorStructured: ReturnType<typeof jest.fn>
  fatal: ReturnType<typeof jest.fn>
  verbose: ReturnType<typeof jest.fn>
  debug: ReturnType<typeof jest.fn>
}

/** Build a `TriggerService` with a logger mock exposing every method the unit calls. */
function buildService(): { service: TriggerService; logger: LoggerMock } {
  const logger: LoggerMock = {
    info: jest.fn(),
    warnStructured: jest.fn(),
    errorStructured: jest.fn(),
    fatal: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  }
  const service = new TriggerService(logger as unknown as PinoLoggerService)
  return { service, logger }
}

/** Assert every logger method EXCEPT `except` was left untouched (kills fall-through mutants). */
function expectOnly(logger: LoggerMock, except: keyof LoggerMock): void {
  for (const name of Object.keys(logger) as (keyof LoggerMock)[]) {
    if (name !== except) expect(logger[name]).not.toHaveBeenCalled()
  }
}

describe('TriggerService.fireLevel', () => {
  let ctx: ReturnType<typeof buildService>

  beforeEach(() => {
    ctx = buildService()
  })

  it('fires info logs for level "info" and returns the count', () => {
    /**
     * Scenario: level "info" with count 3.
     * Contract: each iteration calls `logger.info` with the `TRIGGER_LEVEL_FIRED` key
     * (and nothing else), and the return value reports exactly `count` lines fired.
     */
    const dto: TriggerLevelDto = { level: 'info', count: 3 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 3 })
    expect(ctx.logger.info).toHaveBeenCalledTimes(3)
    expectOnly(ctx.logger, 'info')
    expect(ctx.logger.info).toHaveBeenNthCalledWith(
      1,
      'TRIGGER_LEVEL_FIRED',
      'Triggered info log',
      undefined,
      { i: 0 },
    )
    expect(ctx.logger.info).toHaveBeenNthCalledWith(
      3,
      'TRIGGER_LEVEL_FIRED',
      'Triggered info log',
      undefined,
      { i: 2 },
    )
  })

  it('fires warn logs for level "warn" via warnStructured', () => {
    /**
     * Scenario: level "warn" with count 2.
     * Contract: the warn branch routes through `warnStructured` with the
     * `TRIGGER_LEVEL_FIRED` key and the running index meta, and nothing else fires.
     */
    const dto: TriggerLevelDto = { level: 'warn', count: 2 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 2 })
    expect(ctx.logger.warnStructured).toHaveBeenCalledTimes(2)
    expectOnly(ctx.logger, 'warnStructured')
    expect(ctx.logger.warnStructured).toHaveBeenNthCalledWith(
      1,
      'TRIGGER_LEVEL_FIRED',
      'Triggered warn log',
      undefined,
      { i: 0 },
    )
    expect(ctx.logger.warnStructured).toHaveBeenNthCalledWith(
      2,
      'TRIGGER_LEVEL_FIRED',
      'Triggered warn log',
      undefined,
      { i: 1 },
    )
  })

  it('fires error logs for level "error" via errorStructured with an Error payload', () => {
    /**
     * Scenario: level "error" with count 1.
     * Contract: the error branch calls `errorStructured` with the `TRIGGER_LEVEL_FIRED`
     * key and a real `Error` instance carrying the expected message; nothing else fires.
     */
    const dto: TriggerLevelDto = { level: 'error', count: 1 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 1 })
    expect(ctx.logger.errorStructured).toHaveBeenCalledTimes(1)
    expectOnly(ctx.logger, 'errorStructured')

    const call = ctx.logger.errorStructured.mock.calls[0] as [
      string,
      Error,
      undefined,
      { i: number },
    ]
    expect(call[0]).toBe('TRIGGER_LEVEL_FIRED')
    expect(call[1]).toBeInstanceOf(Error)
    expect((call[1] as Error).message).toBe('Triggered error log')
    expect(call[2]).toBeUndefined()
    expect(call[3]).toEqual({ i: 0 })
  })

  it('fires fatal logs for level "fatal" via the variadic fatal() (level 60)', () => {
    /**
     * Scenario: level "fatal" with count 2.
     * Contract: `fatal` has no key-first variant, so the branch uses the NestJS-style
     * variadic `logger.fatal(message)` — the library's required-not-optional level-60
     * method. Exactly `count` calls fire, each with the fatal message, and nothing else.
     */
    const dto: TriggerLevelDto = { level: 'fatal', count: 2 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 2 })
    expect(ctx.logger.fatal).toHaveBeenCalledTimes(2)
    expectOnly(ctx.logger, 'fatal')
    expect(ctx.logger.fatal).toHaveBeenNthCalledWith(1, 'Triggered fatal log')
    expect(ctx.logger.fatal).toHaveBeenNthCalledWith(2, 'Triggered fatal log')
  })

  it('fires verbose logs for level "verbose" via the variadic verbose() (Pino trace)', () => {
    /**
     * Scenario: level "verbose" with count 1.
     * Contract: the verbose branch uses `logger.verbose(message)` (mapped to Pino
     * `trace`); exactly one call fires with the verbose message and nothing else.
     */
    const dto: TriggerLevelDto = { level: 'verbose', count: 1 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 1 })
    expect(ctx.logger.verbose).toHaveBeenCalledTimes(1)
    expectOnly(ctx.logger, 'verbose')
    expect(ctx.logger.verbose).toHaveBeenCalledWith('Triggered verbose log')
  })

  it('fires debug logs for level "debug" via the variadic debug() — the default branch', () => {
    /**
     * Scenario: level "debug" with count 1 — the switch `default` fall-through.
     * Contract: the debug branch uses `logger.debug(message)`; exactly one call fires
     * with the debug message and nothing else, proving the default arm dispatches debug.
     */
    const dto: TriggerLevelDto = { level: 'debug', count: 1 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 1 })
    expect(ctx.logger.debug).toHaveBeenCalledTimes(1)
    expectOnly(ctx.logger, 'debug')
    expect(ctx.logger.debug).toHaveBeenCalledWith('Triggered debug log')
  })

  it('does not log when count is 0 and still returns the count', () => {
    /**
     * Scenario: count 0 — the loop body never runs.
     * Contract: no log method is called, yet the method still reports `{ fired: 0 }`,
     * proving the return value mirrors the requested count independent of the loop.
     */
    const dto = { level: 'info', count: 0 } as unknown as TriggerLevelDto

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 0 })
    expect(ctx.logger.info).not.toHaveBeenCalled()
    expect(ctx.logger.warnStructured).not.toHaveBeenCalled()
    expect(ctx.logger.errorStructured).not.toHaveBeenCalled()
    expect(ctx.logger.fatal).not.toHaveBeenCalled()
    expect(ctx.logger.verbose).not.toHaveBeenCalled()
    expect(ctx.logger.debug).not.toHaveBeenCalled()
  })
})

describe('TriggerService.requestFault', () => {
  it('emits the TRIGGER_FAULT_REQUESTED warning and returns { requested: true }', () => {
    /**
     * Scenario: the Loki-destination fault hook is invoked.
     * Contract: a single `warnStructured` carrying the `TRIGGER_FAULT_REQUESTED` key and
     * `{ destination: 'loki' }` meta must fire, and the constant response is returned.
     */
    const { service, logger } = buildService()

    const result = service.requestFault()

    expect(result).toEqual({ requested: true })
    expect(logger.warnStructured).toHaveBeenCalledTimes(1)
    expect(logger.warnStructured).toHaveBeenCalledWith(
      'TRIGGER_FAULT_REQUESTED',
      'Destination fault requested',
      undefined,
      { destination: 'loki' },
    )
    expectOnly(logger, 'warnStructured')
  })
})

describe('TriggerService.burst', () => {
  it('fires count TRIGGER_BURST_TICK info lines and returns the count', () => {
    /**
     * Scenario: a 4-line burst for the live-tail load demo.
     * Contract: every emitted line must be an `info` log with the `TRIGGER_BURST_TICK`
     * key and a running index, and the return value reports exactly `count` lines.
     */
    const { service, logger } = buildService()

    const result = service.burst(4)

    expect(result).toEqual({ fired: 4 })
    expect(logger.info).toHaveBeenCalledTimes(4)
    expect(logger.info).toHaveBeenNthCalledWith(1, 'TRIGGER_BURST_TICK', 'Burst tick', undefined, {
      i: 0,
    })
    expect(logger.info).toHaveBeenNthCalledWith(4, 'TRIGGER_BURST_TICK', 'Burst tick', undefined, {
      i: 3,
    })
    expectOnly(logger, 'info')
  })

  it('fires nothing for a zero-length burst but still returns { fired: 0 }', () => {
    /**
     * Scenario: count 0 — the burst loop never iterates.
     * Contract: no `info` call is made, yet the method reports `{ fired: 0 }`,
     * proving the return mirrors the requested count rather than the loop body.
     */
    const { service, logger } = buildService()

    const result = service.burst(0)

    expect(result).toEqual({ fired: 0 })
    expect(logger.info).not.toHaveBeenCalled()
  })
})
