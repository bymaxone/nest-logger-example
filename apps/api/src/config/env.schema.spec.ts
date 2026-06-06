/**
 * Unit tests for the `apps/api` environment schema.
 *
 * Covers the happy-path parse (defaults applied), the `validateEnv` aggregation +
 * throw on invalid input, and EVERY production `superRefine` guard branch:
 *   - the dev/test early return (guards skipped);
 *   - the OTLP-left-at-dev-default rejection;
 *   - each non-loopback URL guard (LOKI_URL / WORKER_URL / DATABASE_URL), both the
 *     loopback-detected and the real-host-accepted directions;
 *   - the WEB_ORIGIN https guard, both the non-https rejection and https acceptance;
 *   - the WEB_ORIGIN parse-failure catch (silently deferred to `z.url()`);
 *   - the `isLoopbackUrl` malformed-URL catch path.
 *
 * Refinement failures are asserted via `safeParse(...).success === false` plus the
 * offending issue path, so each branch is exercised deterministically.
 */
import { describe, expect, it } from '@jest/globals'

import { DEV_OTLP_TRACE_ENDPOINT, envSchema, validateEnv } from './env.schema.js'

/** Minimal production env with every guarded URL pointing at a real host. */
function validProdEnv(): Record<string, unknown> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db.internal:5432/app',
    OTLP_TRACE_ENDPOINT: 'https://collector.internal:4318/v1/traces',
    LOKI_URL: 'https://loki.internal/loki/api/v1/push',
    LOKI_QUERY_URL: 'https://loki.internal',
    WORKER_URL: 'https://worker.internal',
    WEB_ORIGIN: 'https://dashboard.internal',
  }
}

/** Collect the offending issue paths from a failed `safeParse`. */
function failedPaths(env: Record<string, unknown>): string[] {
  const result = envSchema.safeParse(env)
  expect(result.success).toBe(false)
  if (result.success) throw new Error('expected parse failure')
  return result.error.issues.map((i) => i.path.join('.'))
}

describe('envSchema', () => {
  it('parses a minimal development env and applies every default', () => {
    /**
     * In development only `DATABASE_URL` is required; every other variable must fall
     * back to its declared default so a bare local env boots without extra config.
     */
    const parsed = validateEnv({ DATABASE_URL: 'postgresql://localhost:5432/app' })

    expect(parsed).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'nest-logger-example-api',
      RELEASE_SHA: 'dev',
      OTLP_TRACE_ENDPOINT: DEV_OTLP_TRACE_ENDPOINT,
      OTEL_FIELD_FORMAT: 'camelCase',
      LOKI_URL: 'http://localhost:3100/loki/api/v1/push',
      LOG_DB_MIN_LEVEL: 'warn',
      WORKER_URL: 'http://localhost:3002',
      WEB_ORIGIN: 'http://localhost:3003',
      LOG_EXTRA_REDACT_PATHS: '',
    })
  })

  it('skips every production guard for a non-production NODE_ENV', () => {
    /**
     * The `env.NODE_ENV !== 'production'` early return must let localhost defaults
     * pass in development — loopback URLs and the OTLP dev default are all valid here.
     */
    const result = envSchema.safeParse({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/app',
    })

    expect(result.success).toBe(true)
  })

  it('accepts a fully real-host production env', () => {
    /**
     * With every guarded URL on a real host, an https WEB_ORIGIN, and an explicit
     * OTLP endpoint, all production refinements must pass (false-direction of each
     * guard branch).
     */
    const result = envSchema.safeParse(validProdEnv())

    expect(result.success).toBe(true)
  })

  it('rejects the localhost OTLP dev default in production', () => {
    /**
     * Leaving `OTLP_TRACE_ENDPOINT` at the localhost dev default in production would
     * black-hole every span, so the guard must flag that exact path.
     */
    const env = { ...validProdEnv(), OTLP_TRACE_ENDPOINT: DEV_OTLP_TRACE_ENDPOINT }

    expect(failedPaths(env)).toContain('OTLP_TRACE_ENDPOINT')
  })

  it('rejects a loopback LOKI_URL in production', () => {
    /**
     * A loopback Loki push URL in production points at a non-existent local sink;
     * the non-loopback guard must flag LOKI_URL.
     */
    const env = { ...validProdEnv(), LOKI_URL: 'http://localhost:3100/loki/api/v1/push' }

    expect(failedPaths(env)).toContain('LOKI_URL')
  })

  it('rejects a loopback WORKER_URL in production', () => {
    /**
     * A loopback worker hop in production would connect to an unintended local
     * service; the guard must flag WORKER_URL.
     */
    const env = { ...validProdEnv(), WORKER_URL: 'http://127.0.0.1:3002' }

    expect(failedPaths(env)).toContain('WORKER_URL')
  })

  it('rejects a loopback DATABASE_URL in production', () => {
    /**
     * A loopback database URL in production almost always means a misconfigured
     * deploy; the guard must flag DATABASE_URL.
     */
    const env = { ...validProdEnv(), DATABASE_URL: 'postgresql://::1:5432/app' }

    expect(failedPaths(env)).toContain('DATABASE_URL')
  })

  it('rejects a non-https WEB_ORIGIN in production', () => {
    /**
     * The CORS allow-list must use https in production; an http origin must be
     * flagged so dashboard↔API traffic is never served insecurely.
     */
    const env = { ...validProdEnv(), WEB_ORIGIN: 'http://dashboard.internal' }

    expect(failedPaths(env)).toContain('WEB_ORIGIN')
  })

  it('defers a malformed WEB_ORIGIN to z.url() without crashing the https guard', () => {
    /**
     * A WEB_ORIGIN that fails `new URL(...)` must be caught inside the https guard
     * (its own try/catch) and reported by `z.url()` instead — the issue path is
     * WEB_ORIGIN and no exception escapes the refinement.
     */
    const env = { ...validProdEnv(), WEB_ORIGIN: 'not-a-url' }

    expect(failedPaths(env)).toContain('WEB_ORIGIN')
  })

  it('treats a malformed guarded URL as non-loopback (isLoopbackUrl catch)', () => {
    /**
     * When a guarded URL is malformed, `isLoopbackUrl` must swallow the `new URL`
     * throw and return false, leaving the malformed-URL report to `z.url()` — so the
     * failure path is the field itself, never an uncaught loopback-check error.
     */
    const env = { ...validProdEnv(), WORKER_URL: 'http://[invalid' }

    expect(failedPaths(env)).toContain('WORKER_URL')
  })
})

describe('validateEnv', () => {
  it('returns the fully-defaulted env on a valid config', () => {
    /**
     * The boot entrypoint must return the parsed, defaulted shape so the rest of the
     * app reads typed config values.
     */
    const parsed = validateEnv(validProdEnv())

    expect(parsed.NODE_ENV).toBe('production')
    expect(parsed.PORT).toBe(3001)
  })

  it('throws an aggregated message listing every offending key', () => {
    /**
     * On invalid input `validateEnv` must throw a single error whose message
     * aggregates each offending path and reason so a misconfigured deploy fails fast
     * with a readable summary.
     */
    expect(() => validateEnv({ DATABASE_URL: 'not-a-url', PORT: 'abc' })).toThrow(
      /Invalid environment variables:/,
    )
  })

  it('labels a root-level issue as (root) in the aggregated message', () => {
    /**
     * When an issue has no path (e.g. a non-object payload that fails the object
     * shape), the `issue.path.join('.') || '(root)'` fallback must surface `(root)`
     * rather than an empty key.
     */
    expect(() => validateEnv(null as unknown as Record<string, unknown>)).toThrow(/\(root\)/)
  })
})
