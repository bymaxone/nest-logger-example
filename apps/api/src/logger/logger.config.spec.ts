/**
 * Unit coverage for `buildLoggerOptions` (the app's logger-options factory).
 *
 * Proves the env-to-options mapping is faithful and that EVERY branch is exercised:
 *   - `isProd` toggles `isPretty` (inverse) and gates the dev-only
 *     `RollingFileDestination` (present outside prod, absent in prod).
 *   - `LOG_EXTRA_REDACT_PATHS` is split on commas, each entry trimmed, and empties
 *     dropped — `"a, b ,"` → `['a', 'b']`; an absent var → `[]`.
 *   - `RELEASE_SHA` / `LOG_LEVEL` / `LOG_DB_MIN_LEVEL` fall back to
 *     `'dev'` / `'info'` / `'warn'` when unset.
 *   - `OTEL_FIELD_FORMAT` maps `'snake_case'` → `'snake_case'`, anything else → `'camelCase'`.
 *   - `OTEL_SERVICE_NAME` and `LOKI_URL` are read via `getOrThrow`.
 *
 * The factory is called with a `ConfigService`-shaped stub (`get`/`getOrThrow`) and
 * bare stubs for `PrismaService` / `LogEventBus` (the destination constructors only
 * store these references — no methods are invoked at construction time).
 */
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it } from '@jest/globals'

import type { PrismaService } from '../prisma/prisma.service.js'
import type { LogEventBus } from '../logs/log-event.bus.js'
import { LokiDestination } from '../destinations/loki.destination.js'
import { PrismaLogDestination } from '../destinations/prisma-log.destination.js'
import { EventBusLogDestination } from '../destinations/event-bus.destination.js'
import { RollingFileDestination } from '../destinations/rolling-file.destination.js'
import { buildLoggerOptions } from './logger.config.js'

/**
 * Build a `ConfigService`-shaped stub backed by a plain key→value map.
 *
 * `get(key)` returns the mapped value (or `undefined`); `getOrThrow(key)` throws
 * when the key is missing, mirroring the real NestJS `ConfigService` contract.
 *
 * @param values - Map of env keys to their resolved values.
 * @returns A stub typed as `ConfigService`.
 */
function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const v = values[key]
      if (v === undefined) throw new Error(`Missing required config: ${key}`)
      return v
    },
  } as unknown as ConfigService
}

const prisma = {} as unknown as PrismaService
const bus = {} as unknown as LogEventBus

/** The minimum env keys `getOrThrow` requires so the factory does not throw. */
const REQUIRED = {
  OTEL_SERVICE_NAME: 'svc',
  LOKI_URL: 'http://loki:3100/loki/api/v1/push',
} as const

describe('buildLoggerOptions', () => {
  // ─── development branch ──────────────────────────────────────────────────────

  /**
   * Scenario: `NODE_ENV=development` with every optional var supplied.
   * Contract: outside production `isPretty` is `true` and the dev-only
   * `RollingFileDestination` IS appended; supplied `RELEASE_SHA` / `LOG_LEVEL` /
   * `LOG_DB_MIN_LEVEL` / `OTEL_SERVICE_NAME` flow through verbatim.
   */
  it('produces the development shape with all optional vars supplied', () => {
    const config = makeConfig({
      ...REQUIRED,
      NODE_ENV: 'development',
      RELEASE_SHA: 'abc123',
      LOG_LEVEL: 'debug',
      LOG_DB_MIN_LEVEL: 'error',
      LOG_EXTRA_REDACT_PATHS: 'a.b',
      OTEL_FIELD_FORMAT: 'snake_case',
    })

    const opts = buildLoggerOptions(config, prisma, bus)

    expect(opts.isPretty).toBe(true)
    expect(opts.service).toEqual({ name: 'svc', version: 'abc123' })
    expect(opts.level).toBe('debug')
    expect(opts.otel?.fieldFormat).toBe('snake_case')

    // Four destinations in dev: Loki, Prisma, EventBus, RollingFile (the last is dev-only).
    expect(opts.destinations).toHaveLength(4)
    expect(opts.destinations?.[0]).toBeInstanceOf(LokiDestination)
    expect(opts.destinations?.[1]).toBeInstanceOf(PrismaLogDestination)
    expect(opts.destinations?.[2]).toBeInstanceOf(EventBusLogDestination)
    expect(opts.destinations?.[3]).toBeInstanceOf(RollingFileDestination)
  })

  // ─── production branch ───────────────────────────────────────────────────────

  /**
   * Scenario: `NODE_ENV=production` with all optional vars omitted.
   * Contract: in production `isPretty` is `false`, the `RollingFileDestination` is
   * OMITTED (3 destinations), and every `?? ` fallback fires —
   * `RELEASE_SHA`→`'dev'`, `LOG_LEVEL`→`'info'`, `LOG_DB_MIN_LEVEL`→`'warn'`,
   * `LOG_EXTRA_REDACT_PATHS`→`[]`. `OTEL_FIELD_FORMAT` unset → `'camelCase'`.
   */
  it('produces the production shape with all optional vars omitted (fallbacks fire)', () => {
    const config = makeConfig({
      ...REQUIRED,
      NODE_ENV: 'production',
    })

    const opts = buildLoggerOptions(config, prisma, bus)

    expect(opts.isPretty).toBe(false)
    expect(opts.service).toEqual({ name: 'svc', version: 'dev' })
    expect(opts.level).toBe('info')
    expect(opts.redactPaths).toEqual([])
    // Unset OTEL_FIELD_FORMAT → the `=== 'snake_case'` test is false → camelCase.
    expect(opts.otel?.fieldFormat).toBe('camelCase')

    // Three destinations in prod — RollingFile is dropped.
    expect(opts.destinations).toHaveLength(3)
    expect(opts.destinations?.[0]).toBeInstanceOf(LokiDestination)
    expect(opts.destinations?.[1]).toBeInstanceOf(PrismaLogDestination)
    expect(opts.destinations?.[2]).toBeInstanceOf(EventBusLogDestination)
    expect(opts.destinations?.some((d) => d instanceof RollingFileDestination)).toBe(false)
  })

  // ─── redact-path parsing ──────────────────────────────────────────────────────

  /**
   * Scenario: `LOG_EXTRA_REDACT_PATHS="a, b ,"`.
   * Contract: the value is split on commas, each entry trimmed, and empty entries
   * (the trailing comma) dropped — yielding `['a', 'b']`.
   */
  it('splits, trims, and drops empty entries from LOG_EXTRA_REDACT_PATHS', () => {
    const config = makeConfig({
      ...REQUIRED,
      NODE_ENV: 'development',
      LOG_EXTRA_REDACT_PATHS: 'a, b ,',
    })

    const opts = buildLoggerOptions(config, prisma, bus)
    expect(opts.redactPaths).toEqual(['a', 'b'])
  })

  // ─── OTEL_FIELD_FORMAT non-snake_case branch ──────────────────────────────────

  /**
   * Scenario: `OTEL_FIELD_FORMAT` set to a value other than `'snake_case'`.
   * Contract: any non-`'snake_case'` value falls through the ternary to `'camelCase'`
   * — the explicit `'camelCase'` literal is the default, not snake_case.
   */
  it('maps a non-snake_case OTEL_FIELD_FORMAT to camelCase', () => {
    const config = makeConfig({
      ...REQUIRED,
      NODE_ENV: 'development',
      OTEL_FIELD_FORMAT: 'camelCase',
    })

    const opts = buildLoggerOptions(config, prisma, bus)
    expect(opts.otel?.fieldFormat).toBe('camelCase')
  })

  // ─── upstreamError serializer ─────────────────────────────────────────────────

  /**
   * Scenario: invoke the `upstreamError` serializer with an error-shaped input.
   * Contract: it narrows the `unknown` input and projects only `{ status, code }`,
   * stripping everything else (message, stack) so logged upstream errors stay compact.
   */
  it('upstreamError serializer projects only status and code', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)

    const serializer = opts.serializers?.['upstreamError']
    expect(serializer).toBeDefined()
    expect(serializer!({ status: 502, code: 'EUPSTREAM', message: 'boom', stack: 'x' })).toEqual({
      status: 502,
      code: 'EUPSTREAM',
    })
  })

  // ─── timestamp factory ────────────────────────────────────────────────────────

  /**
   * Scenario: invoke the `timestamp` thunk.
   * Contract: it returns ONLY the ISO-8601 value (no `,"time":"..."` wrapper), which
   * the library wraps itself — a full fragment here would double-wrap into invalid JSON.
   */
  it('timestamp returns a bare ISO-8601 string', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)

    const ts = opts.timestamp?.()
    expect(typeof ts).toBe('string')
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  // ─── getOrThrow propagation ───────────────────────────────────────────────────

  /**
   * Scenario: required `OTEL_SERVICE_NAME` is missing.
   * Contract: the factory reads it via `getOrThrow`, so a missing value surfaces as a
   * thrown error rather than an `undefined` service name.
   */
  it('throws when a getOrThrow-required var (OTEL_SERVICE_NAME) is missing', () => {
    const config = makeConfig({ LOKI_URL: REQUIRED.LOKI_URL, NODE_ENV: 'development' })
    expect(() => buildLoggerOptions(config, prisma, bus)).toThrow(/OTEL_SERVICE_NAME/)
  })

  // ─── static boolean and string constants ─────────────────────────────────────

  /**
   * isGlobal, shouldUseAsNestLogger, redactCensor, and maxEntrySizeBytes are
   * compile-time constants. A mutation to any of these literals (true/false/string/
   * number) would not be caught by the existing tests — assert each value directly.
   */
  it('sets isGlobal, shouldUseAsNestLogger, redactCensor, and maxEntrySizeBytes to their declared constants', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)

    expect(opts.isGlobal).toBe(true)
    expect(opts.shouldUseAsNestLogger).toBe(true)
    expect(opts.redactCensor).toBe('[REDACTED]')
    expect(opts.maxEntrySizeBytes).toBe(65_536)
  })

  // ─── http block ───────────────────────────────────────────────────────────────

  /**
   * The http options object must have the exact boolean flags, tenant header, and
   * exclude-path regexes declared in the source. Mutations to isEnabled/
   * shouldCaptureExceptions/shouldGenerateRequestId/tenantIdHeader would not be
   * caught by the existing tests that only inspect destinations.
   */
  it('sets http isEnabled, shouldCaptureExceptions, shouldGenerateRequestId, and tenantIdHeader', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)

    expect(opts.http?.isEnabled).toBe(true)
    expect(opts.http?.shouldCaptureExceptions).toBe(true)
    expect(opts.http?.shouldGenerateRequestId).toBe(false)
    expect(opts.http?.tenantIdHeader).toBe('x-tenant-id')
  })

  /**
   * excludePaths must be an array of exactly three regexes with the correct
   * pattern sources. Mutations to the array literal or any regex pattern would
   * not be caught without asserting the sources explicitly.
   */
  it('sets http.excludePaths to the three anchored path regexes', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)

    const excl = opts.http?.excludePaths
    expect(excl).toHaveLength(3)
    expect((excl as RegExp[])[0]!.source).toBe('^\\/health$')
    expect((excl as RegExp[])[1]!.source).toBe('^\\/metrics$')
    expect((excl as RegExp[])[2]!.source).toBe('^\\/logs\\/stream$')
  })

  // ─── otel block ───────────────────────────────────────────────────────────────

  /**
   * otel.shouldAutoInjectTraceContext must be true. A true→false mutation would
   * silently disable OTLP trace-context injection without breaking any existing test.
   */
  it('sets otel.shouldAutoInjectTraceContext to true', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)

    expect(opts.otel?.shouldAutoInjectTraceContext).toBe(true)
  })

  // ─── EventBusLogDestination minLevel ─────────────────────────────────────────

  /**
   * EventBusLogDestination must be wired with minLevel 'info' so the live-tail
   * mirrors the full-fidelity Loki tier. A mutation to the 'info' literal would
   * silently change the fan-out threshold without failing any instanceof check.
   */
  it('creates EventBusLogDestination with minLevel info', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)

    const dest = opts.destinations?.[2]
    expect(dest).toBeInstanceOf(EventBusLogDestination)
    expect((dest as EventBusLogDestination).minLevel).toBe('info')
  })

  // ─── PrismaLogDestination options wiring ─────────────────────────────────────

  /**
   * LOG_DB_MIN_LEVEL must be threaded through as the minLevel option on
   * PrismaLogDestination. A mutation that replaces the entire options object with {}
   * would cause the constructor to default to 'warn' regardless of what LOG_DB_MIN_LEVEL
   * is set to; asserting the non-default value 'error' catches that mutation.
   */
  it('threads LOG_DB_MIN_LEVEL through to PrismaLogDestination minLevel', () => {
    const config = makeConfig({
      ...REQUIRED,
      NODE_ENV: 'development',
      LOG_DB_MIN_LEVEL: 'error',
    })
    const opts = buildLoggerOptions(config, prisma, bus)
    const dest = opts.destinations?.[1] as PrismaLogDestination
    expect(dest).toBeInstanceOf(PrismaLogDestination)
    expect(dest.minLevel).toBe('error')
  })

  /**
   * When LOG_DB_MIN_LEVEL is absent, the `?? 'warn'` fallback in buildLoggerOptions
   * must supply 'warn' as the minLevel. A mutation that blanks the 'warn' string
   * produces an empty-string minLevel, which this assertion catches.
   */
  it('PrismaLogDestination minLevel falls back to warn when LOG_DB_MIN_LEVEL is absent', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)
    const dest = opts.destinations?.[1] as PrismaLogDestination
    expect(dest.minLevel).toBe('warn')
  })

  // ─── EventBusLogDestination options object ────────────────────────────────────

  /**
   * The options object { minLevel: 'info' } must be passed to the EventBusLogDestination
   * constructor. EventBusLogDestination stores opts as a private field; accessing it via
   * cast confirms the literal was passed rather than the constructor's own '{}' default
   * (both produce the same minLevel, so the minLevel check alone is insufficient).
   */
  it('passes { minLevel: info } as the explicit options object to EventBusLogDestination', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)
    const dest = opts.destinations?.[2]
    expect(dest).toBeInstanceOf(EventBusLogDestination)
    // EventBusLogDestination stores opts as a private field (TypeScript private,
    // accessible at runtime); check the raw property to verify the options object
    // was actually threaded through rather than defaulted from {}.
    expect((dest as unknown as Record<string, unknown>)['opts']).toEqual({ minLevel: 'info' })
  })

  // ─── RollingFileDestination options ───────────────────────────────────────────

  /**
   * The RollingFileDestination must receive the exact file path, rotation frequency,
   * and size limit. Mutations that blank any of those string literals ('logs/app.log',
   * 'daily', '50m') leave the destination with an empty option; these assertions catch
   * each individually.
   */
  it('creates RollingFileDestination with the exact file, frequency, and size options', () => {
    const config = makeConfig({ ...REQUIRED, NODE_ENV: 'development' })
    const opts = buildLoggerOptions(config, prisma, bus)
    const dest = opts.destinations?.[3]
    expect(dest).toBeInstanceOf(RollingFileDestination)
    const destOpts = (dest as unknown as Record<string, unknown>)['opts'] as Record<string, unknown>
    expect(destOpts.file).toBe('logs/app.log')
    expect(destOpts.frequency).toBe('daily')
    expect(destOpts.size).toBe('50m')
  })
})
