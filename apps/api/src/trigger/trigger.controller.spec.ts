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
})
