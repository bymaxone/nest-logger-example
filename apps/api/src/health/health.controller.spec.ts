/**
 * Unit tests for `HealthController`.
 *
 * Covers both root routes: the liveness probe returns a constant `ok` payload, and
 * the metrics placeholder returns the floored process uptime. Constructed directly
 * (no logger/DI), matching how the unauthenticated health surface is wired.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { HealthController } from './health.controller.js'

describe('HealthController', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns a constant ok payload from the liveness probe', () => {
    /**
     * The `/health` route must answer with `{ status: 'ok' }` and no dependencies so
     * the probe responds even before the logger wiring exists.
     */
    const controller = new HealthController()

    expect(controller.health()).toEqual({ status: 'ok' })
  })

  it('returns the floored process uptime in whole seconds from metrics', () => {
    /**
     * The `/metrics` placeholder must report `Math.floor(process.uptime())`; the
     * fractional uptime is truncated so the response is a whole-second integer.
     */
    const controller = new HealthController()
    jest.spyOn(process, 'uptime').mockReturnValue(42.987)

    expect(controller.metrics()).toEqual({ uptimeSeconds: 42 })
  })
})
