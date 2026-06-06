/**
 * Unit tests for the worker {@link HealthController}.
 *
 * Covers the single readiness endpoint.
 */
import { describe, expect, it } from '@jest/globals'

import { HealthController } from './health.controller.js'

describe('HealthController', () => {
  it('returns { status: "ok" } for the readiness probe', () => {
    // Orchestrators mark the worker live only on this exact shape — it must not drift.
    expect(new HealthController().check()).toEqual({ status: 'ok' })
  })
})
