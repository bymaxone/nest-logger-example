/**
 * Unit tests for the worker environment schema.
 *
 * Covers default application, the production OTLP-loopback guard (both arms), the
 * fail-fast formatted error, and the `(root)` label for a non-object input.
 */
import { describe, expect, it } from '@jest/globals'

import { DEV_OTLP_TRACE_ENDPOINT, validateEnv } from './env.schema.js'

describe('validateEnv', () => {
  it('applies documented defaults for an empty environment', () => {
    // With nothing set, every field must fall back to its documented default.
    const env = validateEnv({})
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3002)
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.OTEL_SERVICE_NAME).toBe('nest-logger-example-worker')
    expect(env.RELEASE_SHA).toBe('dev')
    expect(env.OTLP_TRACE_ENDPOINT).toBe(DEV_OTLP_TRACE_ENDPOINT)
  })

  it('throws a formatted error on an invalid enum value', () => {
    // An out-of-range NODE_ENV must fail fast with the field named in the message.
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment variables/)
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })

  it('rejects the localhost OTLP default in production (guard true arm)', () => {
    // Production must not silently ship traces to the dev localhost endpoint.
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(
      /must be set explicitly in production/,
    )
  })

  it('accepts an explicit OTLP endpoint in production (guard false arm)', () => {
    // A real endpoint satisfies the production guard, so parsing succeeds.
    const env = validateEnv({
      NODE_ENV: 'production',
      OTLP_TRACE_ENDPOINT: 'http://otel-collector:4318/v1/traces',
    })
    expect(env.NODE_ENV).toBe('production')
    expect(env.OTLP_TRACE_ENDPOINT).toBe('http://otel-collector:4318/v1/traces')
  })

  it('labels a root-level (non-object) validation error as (root)', () => {
    // A non-object input yields an issue with an empty path, formatted as "(root)".
    expect(() => validateEnv(123 as unknown as Record<string, unknown>)).toThrow(/\(root\)/)
  })
})
