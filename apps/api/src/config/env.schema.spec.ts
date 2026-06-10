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

  // ─── exact constant and default values ───────────────────────────────────────

  /**
   * DEV_OTLP_TRACE_ENDPOINT must equal the exact localhost OTLP endpoint string
   * so the production guard (identity check against the dev default) fires when the
   * value is left unchanged in a production deploy.
   */
  it('DEV_OTLP_TRACE_ENDPOINT equals the localhost OTLP endpoint literal', () => {
    expect(DEV_OTLP_TRACE_ENDPOINT).toBe('http://localhost:4318/v1/traces')
  })

  /**
   * LOKI_QUERY_URL has its own default not covered by the shared toMatchObject
   * snapshot — assert it directly so a mutation to that string is caught.
   */
  it('applies the correct LOKI_QUERY_URL default in development', () => {
    const parsed = validateEnv({ DATABASE_URL: 'postgresql://localhost:5432/app' })
    expect(parsed.LOKI_QUERY_URL).toBe('http://localhost:3100')
  })

  // ─── enum value coverage ──────────────────────────────────────────────────────

  /**
   * NODE_ENV must accept 'test' as a valid enum member. A mutation that blanks the
   * 'test' string in the enum definition would make this parse fail.
   */
  it('accepts test as a valid NODE_ENV enum value', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/app',
      NODE_ENV: 'test',
    })
    expect(result.success).toBe(true)
  })

  /**
   * Every LOG_LEVEL enum member must be accepted by the schema. A mutation that
   * blanks any of these strings makes the corresponding value invalid; this
   * exercises each member that is not already covered by the default assertion.
   */
  it('accepts every declared LOG_LEVEL enum value', () => {
    const levels = ['fatal', 'error', 'warn', 'debug', 'trace'] as const
    for (const level of levels) {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/app',
        LOG_LEVEL: level,
      })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.LOG_LEVEL).toBe(level)
    }
  })

  /**
   * OTEL_FIELD_FORMAT must accept 'snake_case' as a valid enum member. A mutation
   * that blanks 'snake_case' in the enum definition would make this parse fail.
   */
  it('accepts snake_case as a valid OTEL_FIELD_FORMAT enum value', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/app',
      OTEL_FIELD_FORMAT: 'snake_case',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.OTEL_FIELD_FORMAT).toBe('snake_case')
  })

  /**
   * Every LOG_DB_MIN_LEVEL enum member (beyond the 'warn' default already asserted)
   * must be accepted. A mutation blanking any member string would break this.
   */
  it('accepts every declared LOG_DB_MIN_LEVEL enum value', () => {
    const levels = ['fatal', 'error', 'info', 'debug', 'trace'] as const
    for (const level of levels) {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/app',
        LOG_DB_MIN_LEVEL: level,
      })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.LOG_DB_MIN_LEVEL).toBe(level)
    }
  })

  // ─── isLoopbackUrl catch-path returns false ───────────────────────────────────

  /**
   * When isLoopbackUrl cannot parse a URL it must return false, not true. A
   * false→true mutation would add a spurious custom loopback-guard issue alongside
   * the z.url() format issue. Assert that no custom issue appears for the field.
   */
  it('does not raise a custom loopback issue when the guarded URL is malformed', () => {
    const result = envSchema.safeParse({ ...validProdEnv(), WORKER_URL: 'http://[invalid' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse failure')
    const workerIssues = result.error.issues.filter((i) => i.path[0] === 'WORKER_URL')
    expect(workerIssues.every((i) => i.code !== 'custom')).toBe(true)
  })

  // ─── min(1) string field rejections ──────────────────────────────────────────

  /**
   * `OTEL_SERVICE_NAME` is `z.string().min(1)` — an empty string must be rejected.
   * A min(1)→max(1) mutation would still accept empty strings and only reject longer
   * ones; this test forces the schema to reject '' so that mutation is caught.
   */
  it('rejects an empty OTEL_SERVICE_NAME (min-1 constraint)', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/app',
      OTEL_SERVICE_NAME: '',
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse failure')
    expect(result.error.issues.some((i) => i.path[0] === 'OTEL_SERVICE_NAME')).toBe(true)
  })

  /**
   * `RELEASE_SHA` is `z.string().min(1)` — an empty string must be rejected.
   * Same rationale as the OTEL_SERVICE_NAME test above.
   */
  it('rejects an empty RELEASE_SHA (min-1 constraint)', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/app',
      RELEASE_SHA: '',
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse failure')
    expect(result.error.issues.some((i) => i.path[0] === 'RELEASE_SHA')).toBe(true)
  })

  // ─── IPv6 loopback detection ──────────────────────────────────────────────────

  /**
   * The WHATWG URL API serializes IPv6 loopback with brackets
   * (`new URL('http://[::1]/').hostname === '[::1]'`), so LOOPBACK_HOSTS stores
   * `'[::1]'`. A properly-formed IPv6 loopback URL must be rejected in production.
   */
  it('rejects an IPv6 loopback ([::1]) LOKI_URL in production', () => {
    const env = { ...validProdEnv(), LOKI_URL: 'http://[::1]:3100/loki/api/v1/push' }
    expect(failedPaths(env)).toContain('LOKI_URL')
  })

  // ─── exact superRefine error messages ────────────────────────────────────────

  /**
   * The OTLP guard adds a custom issue with a specific message. Asserting the exact
   * text means a mutation that blanks the message string causes the assertion to fail.
   */
  it('OTLP dev-default rejection carries the exact guard message', () => {
    const env = { ...validProdEnv(), OTLP_TRACE_ENDPOINT: DEV_OTLP_TRACE_ENDPOINT }
    const result = envSchema.safeParse(env)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse failure')
    const issue = result.error.issues.find((i) => i.path[0] === 'OTLP_TRACE_ENDPOINT')
    expect(issue?.message).toBe(
      'must be set explicitly in production (not the localhost dev default)',
    )
  })

  /**
   * The loopback guard adds a custom issue with a specific message. Asserting the
   * exact text kills any mutation that blanks the message string.
   */
  it('loopback URL rejection carries the exact guard message', () => {
    const env = { ...validProdEnv(), LOKI_URL: 'http://localhost:3100/loki/api/v1/push' }
    const result = envSchema.safeParse(env)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse failure')
    const issue = result.error.issues.find((i) => i.path[0] === 'LOKI_URL')
    expect(issue?.message).toBe('must not point to localhost in production')
  })

  /**
   * The https guard adds a custom issue with a specific message. Asserting the exact
   * text kills any mutation that blanks the message string.
   */
  it('non-https WEB_ORIGIN rejection carries the exact guard message', () => {
    const env = { ...validProdEnv(), WEB_ORIGIN: 'http://dashboard.internal' }
    const result = envSchema.safeParse(env)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse failure')
    const issue = result.error.issues.find((i) => i.path[0] === 'WEB_ORIGIN')
    expect(issue?.message).toBe('must use https:// in production')
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

  // ─── error-message format ─────────────────────────────────────────────────────

  /**
   * Each failing field must be formatted as `  - KEY: message` (two-space indent, dash,
   * space, key, colon+space, message). A mutation that removes the `  - ` prefix or the
   * `: ` separator would drop these characters and fail this assertion.
   */
  it('formats each failing field as "  - KEY: message" in the thrown error', () => {
    let message = ''
    try {
      validateEnv({ DATABASE_URL: 'not-a-url' })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/\n {2}- DATABASE_URL:/)
  })

  /**
   * Multiple failing fields must be separated by newlines so the full error is
   * scannable at a glance. A mutation that replaces the `'\n'` join separator with
   * an empty string collapses all issues onto one line, breaking this assertion.
   */
  it('separates multiple failing fields with newlines', () => {
    let message = ''
    try {
      validateEnv({ DATABASE_URL: 'not-a-url', PORT: 'abc' })
    } catch (err) {
      message = (err as Error).message
    }
    // header line + at least two issue lines
    expect(message.split('\n').length).toBeGreaterThanOrEqual(3)
  })
})
