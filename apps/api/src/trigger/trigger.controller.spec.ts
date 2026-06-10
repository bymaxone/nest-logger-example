/**
 * Unit tests for `TriggerController`.
 *
 * Covers the Playground trigger hooks:
 *   - `level` parses the body with `triggerLevelSchema` and delegates to `fireLevel`.
 *   - `status` resolves the requested HTTP code: 2xx is set on the passthrough response
 *     and returned; any non-2xx (or invalid/out-of-range code, which collapses to 400)
 *     throws an `HttpException` so the library interceptor logs the matching key.
 *   - `fault` delegates to `requestFault`.
 *   - `burst` parses the body with `triggerBurstSchema` and delegates to `burst`.
 *
 * The service is a plain mock; the controller is constructed directly without DI.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { HttpException } from '@nestjs/common'
import type { Response } from 'express'

import { TriggerController } from './trigger.controller.js'
import type { TriggerService } from './trigger.service.js'

/** Build a `TriggerController` backed by a mock `TriggerService`. */
function buildController(): {
  controller: TriggerController
  service: {
    fireLevel: ReturnType<typeof jest.fn>
    requestFault: ReturnType<typeof jest.fn>
    burst: ReturnType<typeof jest.fn>
  }
} {
  const service = {
    fireLevel: jest.fn(),
    requestFault: jest.fn(),
    burst: jest.fn(),
  }
  const controller = new TriggerController(service as unknown as TriggerService)
  return { controller, service }
}

/** Minimal Express `Response` double capturing the status set via passthrough. */
function buildRes(): { res: Response; statusSpy: ReturnType<typeof jest.fn> } {
  const statusSpy = jest.fn()
  const res = { status: statusSpy } as unknown as Response
  return { res, statusSpy }
}

describe('TriggerController.level', () => {
  let ctx: ReturnType<typeof buildController>

  beforeEach(() => {
    ctx = buildController()
  })

  it('parses the body and delegates to fireLevel, returning its result', () => {
    /**
     * Scenario: a valid `{ level, count }` body.
     * Contract: the controller must validate via `triggerLevelSchema.parse` and forward
     * the parsed DTO to `fireLevel`, returning that service result verbatim.
     */
    ctx.service.fireLevel.mockReturnValue({ fired: 5 })

    const result = ctx.controller.level({ level: 'warn', count: 5 })

    expect(result).toEqual({ fired: 5 })
    expect(ctx.service.fireLevel).toHaveBeenCalledWith({ level: 'warn', count: 5 })
  })

  it('applies the schema default of count=1 when count is omitted', () => {
    /**
     * Scenario: a body with only `level`.
     * Contract: `triggerLevelSchema` supplies `count: 1` by default, so the service must
     * receive the defaulted DTO — proving the controller parses rather than passes raw.
     */
    ctx.service.fireLevel.mockReturnValue({ fired: 1 })

    ctx.controller.level({ level: 'info' })

    expect(ctx.service.fireLevel).toHaveBeenCalledWith({ level: 'info', count: 1 })
  })

  it('throws when the body fails schema validation', () => {
    /**
     * Scenario: an invalid `level` value.
     * Contract: `triggerLevelSchema.parse` must reject the body so the service is never
     * invoked, surfacing a validation error to the request pipeline.
     */
    expect(() => ctx.controller.level({ level: 'fatal' })).toThrow()
    expect(ctx.service.fireLevel).not.toHaveBeenCalled()
  })

  it('accepts all three valid level values: info, warn, error', () => {
    /**
     * Scenario: each of the three supported levels is submitted.
     * Contract: `triggerLevelSchema` must accept `'info'`, `'warn'`, and `'error'`
     * without throwing — kills StringLiteral mutations that change `'error'` to an
     * unrecognised variant (the existing tests only pass `'info'` and `'warn'`).
     */
    for (const level of ['info', 'warn', 'error'] as const) {
      ctx.service.fireLevel.mockReturnValue({ fired: 1 })
      expect(() => ctx.controller.level({ level, count: 1 })).not.toThrow()
    }
  })

  it('rejects a count below the minimum (0)', () => {
    /**
     * Scenario: count=0, below the `min(1)` constraint.
     * Contract: `triggerLevelSchema.parse` must throw for count=0 — kills the
     * NumericLiteral mutation that changes `min(1)` to `min(0)`.
     */
    expect(() => ctx.controller.level({ level: 'info', count: 0 })).toThrow()
    expect(ctx.service.fireLevel).not.toHaveBeenCalled()
  })

  it('rejects a count above the maximum (101)', () => {
    /**
     * Scenario: count=101, above the `max(100)` constraint.
     * Contract: `triggerLevelSchema.parse` must throw for count=101 — kills the
     * NumericLiteral mutation that changes `max(100)` to `max(101)`.
     */
    expect(() => ctx.controller.level({ level: 'info', count: 101 })).toThrow()
    expect(ctx.service.fireLevel).not.toHaveBeenCalled()
  })
})

describe('TriggerController.status', () => {
  let ctx: ReturnType<typeof buildController>

  beforeEach(() => {
    ctx = buildController()
  })

  it('sets the 2xx status on the passthrough response and returns it', () => {
    /**
     * Scenario: code "204" — a 2xx success.
     * Contract: the 2xx branch must call `res.status(code)` (passthrough so interceptors
     * still run) and return `{ status: code }` without throwing.
     */
    const { res, statusSpy } = buildRes()

    const result = ctx.controller.status('204', res)

    expect(result).toEqual({ status: 204 })
    expect(statusSpy).toHaveBeenCalledWith(204)
  })

  it('throws HttpException for a non-2xx code (client error)', () => {
    /**
     * Scenario: code "404" — a 4xx client error.
     * Contract: non-2xx codes must throw an `HttpException` carrying that status so the
     * library interceptor logs `HTTP_REQUEST_CLIENT_ERROR`; the response status is untouched.
     */
    const { res, statusSpy } = buildRes()

    let thrown: unknown
    try {
      ctx.controller.status('404', res)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(HttpException)
    expect((thrown as HttpException).getStatus()).toBe(404)
    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('throws HttpException for a 5xx code (server error)', () => {
    /**
     * Scenario: code "503" — a 5xx server error.
     * Contract: 5xx codes are non-2xx and must also throw an `HttpException` with that
     * exact status, exercising the upper end of the valid range.
     */
    const { res } = buildRes()

    expect(() => ctx.controller.status('503', res)).toThrow(HttpException)
    try {
      ctx.controller.status('503', res)
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(503)
    }
  })

  it('collapses a non-numeric code to 400 and throws', () => {
    /**
     * Scenario: code "abc" — `Number.parseInt` yields `NaN`, failing `Number.isFinite`.
     * Contract: the guard must fall back to 400 (not 2xx) and throw an `HttpException`
     * with status 400, covering the `Number.isFinite(parsed) === false` branch.
     */
    const { res, statusSpy } = buildRes()

    try {
      ctx.controller.status('abc', res)
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(400)
    }
    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('collapses an out-of-range (too-low) code to 400 and throws', () => {
    /**
     * Scenario: code "100" — finite but below the 200 lower bound.
     * Contract: the `parsed >= 200` clause fails, so the code collapses to 400 and the
     * method throws an `HttpException(400)`, covering the lower-bound branch.
     */
    const { res } = buildRes()

    try {
      ctx.controller.status('100', res)
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(400)
    }
  })

  it('accepts code 200 — the lower boundary of the valid 2xx range', () => {
    /**
     * Scenario: code "200" — the exact lower boundary.
     * Rule: the guard uses `parsed >= 200` (not `>`). With the `parsed > 200` mutant,
     * 200 collapses to the fallback 400 and the method throws instead of returning
     * `{ status: 200 }`. Similarly, the `httpStatus > 200` mutant on the 2xx branch
     * check is killed: `200 > 200` is false, so the mutant would throw instead of return.
     */
    const { res, statusSpy } = buildRes()
    const result = ctx.controller.status('200', res)
    expect(result).toEqual({ status: 200 })
    expect(statusSpy).toHaveBeenCalledWith(200)
  })

  it('accepts code 599 — the upper boundary of the valid range — as a non-2xx exception', () => {
    /**
     * Scenario: code "599" — the exact upper boundary.
     * Rule: the guard uses `parsed <= 599` (not `<`). With the `parsed < 599` mutant,
     * 599 collapses to the fallback 400 and throws 400 instead of 599. Asserting the
     * exception status is exactly 599 kills that mutant.
     */
    const { res, statusSpy } = buildRes()
    let thrown: unknown
    try {
      ctx.controller.status('599', res)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(HttpException)
    expect((thrown as HttpException).getStatus()).toBe(599)
    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('treats code 300 as non-2xx and throws — not a 2xx passthrough', () => {
    /**
     * Scenario: code "300" — one above the 2xx upper bound.
     * Rule: the 2xx branch condition is `httpStatus < 300` (not `<=`). With the
     * `httpStatus <= 300` mutant, 300 would enter the passthrough branch and return
     * `{ status: 300 }` silently. Asserting it throws kills that mutant.
     * Also kills the `ConditionalExpression: true` mutant that replaces the entire
     * `httpStatus >= 200 && httpStatus < 300` condition with `true`.
     */
    const { res, statusSpy } = buildRes()
    let thrown: unknown
    try {
      ctx.controller.status('300', res)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(HttpException)
    expect((thrown as HttpException).getStatus()).toBe(300)
    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('HttpException response body contains the status field (kills ObjectLiteral {} mutant)', () => {
    /**
     * Scenario: any non-2xx code produces an HttpException.
     * Rule: the constructor is called with `{ status: httpStatus }` as the first
     * argument. The ObjectLiteral mutant replaces this with `{}`, making
     * `exception.getResponse()` return `{}` instead of `{ status: 503 }`.
     * Asserting the exact response body shape kills that mutant.
     */
    const { res } = buildRes()
    let thrown: unknown
    try {
      ctx.controller.status('503', res)
    } catch (err) {
      thrown = err
    }
    expect((thrown as HttpException).getResponse()).toEqual({ status: 503 })
  })

  it('collapses an out-of-range (too-high) code to 400 and throws', () => {
    /**
     * Scenario: code "600" — finite but above the 599 upper bound.
     * Contract: the `parsed <= 599` clause fails, so the code collapses to 400 and the
     * method throws an `HttpException(400)`, covering the upper-bound branch.
     */
    const { res } = buildRes()

    try {
      ctx.controller.status('600', res)
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(400)
    }
  })
})

describe('TriggerController.fault', () => {
  it('delegates to requestFault and returns its result', () => {
    /**
     * Scenario: the Loki-destination fault hook is invoked.
     * Contract: the controller must forward to `requestFault` and return its constant
     * `{ requested: true }` response unchanged.
     */
    const { controller, service } = buildController()
    service.requestFault.mockReturnValue({ requested: true })

    const result = controller.fault()

    expect(result).toEqual({ requested: true })
    expect(service.requestFault).toHaveBeenCalledTimes(1)
  })
})

describe('TriggerController.burst', () => {
  it('parses the body and delegates the validated count to burst', () => {
    /**
     * Scenario: a valid `{ count }` burst body.
     * Contract: the controller must validate via `triggerBurstSchema.parse` and forward
     * only the `count` field to `burst`, returning the service result verbatim.
     */
    const { controller, service } = buildController()
    service.burst.mockReturnValue({ fired: 250 })

    const result = controller.burst({ count: 250 })

    expect(result).toEqual({ fired: 250 })
    expect(service.burst).toHaveBeenCalledWith(250)
  })

  it('throws when the burst count exceeds the cap', () => {
    /**
     * Scenario: count 501 — above the schema's max of 500.
     * Contract: `triggerBurstSchema.parse` must reject so the service is never called,
     * enforcing the ≤500 burst cap at the boundary.
     */
    const { controller, service } = buildController()

    expect(() => controller.burst({ count: 501 })).toThrow()
    expect(service.burst).not.toHaveBeenCalled()
  })

  it('rejects a burst count below the minimum (0)', () => {
    /**
     * Scenario: count=0, below `min(1)` for the burst schema.
     * Contract: `triggerBurstSchema.parse` must reject count=0 — kills the
     * NumericLiteral mutation that changes `min(1)` to `min(0)`.
     */
    const { controller, service } = buildController()

    expect(() => controller.burst({ count: 0 })).toThrow()
    expect(service.burst).not.toHaveBeenCalled()
  })

  it('accepts count=500 — the exact burst cap boundary', () => {
    /**
     * Scenario: count=500, the maximum allowed burst count.
     * Contract: `triggerBurstSchema` must accept the maximum value — confirms the
     * upper boundary is 500, not 499. Kills an off-by-one mutation on `max(500)`.
     */
    const { controller, service } = buildController()
    service.burst.mockReturnValue({ fired: 500 })

    expect(() => controller.burst({ count: 500 })).not.toThrow()
    expect(service.burst).toHaveBeenCalledWith(500)
  })
})
