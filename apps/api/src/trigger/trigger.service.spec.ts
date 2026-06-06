/**
 * Unit tests for `TriggerService`.
 *
 * Covers the Trigger Center backend that fires logs on demand:
 *   - `fireLevel` dispatches to `info` / `warnStructured` / `errorStructured` per level
 *     and repeats `count` times, returning `{ fired: count }`.
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

/** Build a `TriggerService` with a logger mock exposing the methods the unit calls. */
function buildService(): {
  service: TriggerService
  logger: {
    info: ReturnType<typeof jest.fn>
    warnStructured: ReturnType<typeof jest.fn>
    errorStructured: ReturnType<typeof jest.fn>
  }
} {
  const logger = {
    info: jest.fn(),
    warnStructured: jest.fn(),
    errorStructured: jest.fn(),
  }
  const service = new TriggerService(logger as unknown as PinoLoggerService)
  return { service, logger }
}

describe('TriggerService.fireLevel', () => {
  let ctx: ReturnType<typeof buildService>

  beforeEach(() => {
    ctx = buildService()
  })

  it('fires info logs for level "info" and returns the count', () => {
    /**
     * Scenario: level "info" with count 3.
     * Contract: each iteration must call `logger.info` with the `TRIGGER_LEVEL_FIRED`
     * key (never `warnStructured` / `errorStructured`), and the return value reports
     * exactly `count` lines fired.
     */
    const dto: TriggerLevelDto = { level: 'info', count: 3 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 3 })
    expect(ctx.logger.info).toHaveBeenCalledTimes(3)
    expect(ctx.logger.warnStructured).not.toHaveBeenCalled()
    expect(ctx.logger.errorStructured).not.toHaveBeenCalled()
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
     * Contract: the warn branch must route through `warnStructured` with the
     * `TRIGGER_LEVEL_FIRED` key and the running index meta, never `info`/`errorStructured`.
     */
    const dto: TriggerLevelDto = { level: 'warn', count: 2 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 2 })
    expect(ctx.logger.warnStructured).toHaveBeenCalledTimes(2)
    expect(ctx.logger.info).not.toHaveBeenCalled()
    expect(ctx.logger.errorStructured).not.toHaveBeenCalled()
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
     * Scenario: level "error" with count 1 — this is the `else` fall-through branch.
     * Contract: the error branch must call `errorStructured` with the
     * `TRIGGER_LEVEL_FIRED` key and a real `Error` instance carrying the expected message.
     */
    const dto: TriggerLevelDto = { level: 'error', count: 1 }

    const result = ctx.service.fireLevel(dto)

    expect(result).toEqual({ fired: 1 })
    expect(ctx.logger.errorStructured).toHaveBeenCalledTimes(1)
    expect(ctx.logger.info).not.toHaveBeenCalled()
    expect(ctx.logger.warnStructured).not.toHaveBeenCalled()

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
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.errorStructured).not.toHaveBeenCalled()
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
    expect(logger.warnStructured).not.toHaveBeenCalled()
    expect(logger.errorStructured).not.toHaveBeenCalled()
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
