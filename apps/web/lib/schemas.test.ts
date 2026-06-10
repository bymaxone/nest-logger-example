/**
 * @fileoverview Tests for the runtime Zod schemas in {@link module:lib/schemas}.
 *
 * Validates the happy path for every exported schema plus the edge branches:
 * `coerceLevel` falling back to `info`, `looseObject` preserving unknown keys,
 * nullable/nullish/optional acceptance, the `streamEntry` union `time`, and the
 * coerced/bounded `streamQuery` limit (accept + reject).
 *
 * @module lib/schemas.test
 */
import { describe, expect, it } from 'vitest'

import {
  aggregateRowSchemas,
  coerceLevel,
  contextResultSchema,
  facetsResultSchema,
  logLevelSchema,
  logPageSchema,
  streamEntrySchema,
  streamQuerySchema,
} from './schemas'

/** A minimal valid log row used across page/context fixtures. */
const baseRow = {
  id: 'r1',
  time: '2026-06-04T00:00:00.000Z',
  level: 'info',
  logKey: 'HTTP_REQUEST',
  message: 'ok',
  service: 'gateway',
}

describe('logLevelSchema', () => {
  /** A canonical level string parses to itself. */
  it('accepts a known level', () => {
    expect(logLevelSchema.parse('error')).toBe('error')
  })

  /** An unknown level is rejected by the strict enum. */
  it('rejects an unknown level', () => {
    expect(logLevelSchema.safeParse('verbose').success).toBe(false)
  })

  /**
   * Every entry in the six-value enum must be accepted. Iterating all levels
   * and asserting `success` kills the StringLiteral→"" mutations that replace
   * any individual level name ('fatal', 'info', 'debug', 'trace') with an empty
   * string, causing safeParse to return false for that level.
   */
  it('accepts all six log levels', () => {
    for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const) {
      expect(logLevelSchema.safeParse(level).success).toBe(true)
    }
  })
})

describe('coerceLevel', () => {
  /** A recognized level passes straight through. */
  it('returns the level unchanged when valid', () => {
    expect(coerceLevel('warn')).toBe('warn')
  })

  /** An unrecognized level falls back to `info` via the `.catch`. */
  it('falls back to info for an unknown level', () => {
    expect(coerceLevel('nonsense')).toBe('info')
  })
})

describe('logPageSchema', () => {
  /** A well-formed page envelope (with a cursor) validates and keeps extra keys. */
  it('accepts a page with a cursor and preserves unknown row keys', () => {
    const parsed = logPageSchema.parse({
      data: [{ ...baseRow, extra: 42 }],
      nextCursor: 'cur1',
      hasMore: true,
    })
    expect(parsed.data[0]).toMatchObject({ id: 'r1', extra: 42 })
    expect(parsed.nextCursor).toBe('cur1')
  })

  /** A null cursor (end of pages) is allowed. */
  it('accepts a null cursor', () => {
    const parsed = logPageSchema.parse({ data: [], nextCursor: null, hasMore: false })
    expect(parsed.nextCursor).toBeNull()
  })

  /** A row missing a required field is rejected. */
  it('rejects a row missing a required field', () => {
    expect(
      logPageSchema.safeParse({ data: [{ id: 'r1' }], nextCursor: null, hasMore: false }).success,
    ).toBe(false)
  })
})

describe('facetsResultSchema', () => {
  /** A field → value-count map validates. */
  it('accepts a facet map of value counts', () => {
    const parsed = facetsResultSchema.parse({
      level: [{ value: 'error', count: 3 }],
      service: [],
    })
    expect(parsed.level![0]).toEqual({ value: 'error', count: 3 })
  })

  /** A non-numeric count is rejected. */
  it('rejects a non-numeric count', () => {
    expect(facetsResultSchema.safeParse({ level: [{ value: 'error', count: 'x' }] }).success).toBe(
      false,
    )
  })
})

describe('contextResultSchema', () => {
  /** A surrounding-lines envelope with a matched row validates. */
  it('accepts before/match/after with a matched row', () => {
    const parsed = contextResultSchema.parse({
      before: [baseRow],
      match: baseRow,
      after: [baseRow],
    })
    expect(parsed.match).toMatchObject({ id: 'r1' })
  })

  /** A null match (no exact hit) is allowed. */
  it('accepts a null match', () => {
    const parsed = contextResultSchema.parse({ before: [], match: null, after: [] })
    expect(parsed.match).toBeNull()
  })
})

describe('aggregateRowSchemas', () => {
  /** The volume metric rows validate (loose: unknown keys allowed). */
  it('accepts volume rows', () => {
    const parsed = aggregateRowSchemas.volume.parse([{ bucket: 'b', level: 'error', n: 2, x: 1 }])
    expect(parsed[0]).toMatchObject({ bucket: 'b', n: 2 })
  })

  /** The errorRate metric accepts a null rate (no traffic in the bucket). */
  it('accepts an errorRate row with a null rate', () => {
    const parsed = aggregateRowSchemas.errorRate.parse([{ bucket: 'b', errorRate: null }])
    expect(parsed[0]!.errorRate).toBeNull()
  })

  /** The latency metric accepts nullable percentiles. */
  it('accepts latency rows with nullable percentiles', () => {
    const parsed = aggregateRowSchemas.latency.parse([{ bucket: 'b', p50: 1, p95: null, p99: 3 }])
    expect(parsed[0]).toMatchObject({ p50: 1, p95: null, p99: 3 })
  })

  /** The statusMix metric requires numeric class counts. */
  it('accepts statusMix rows with class counts', () => {
    const parsed = aggregateRowSchemas.statusMix.parse([
      { bucket: 'b', s2xx: 1, s3xx: 0, s4xx: 2, s5xx: 3 },
    ])
    expect(parsed[0]).toMatchObject({ s2xx: 1, s5xx: 3 })
  })

  /** A malformed statusMix row (missing a class) is rejected. */
  it('rejects a statusMix row missing a class count', () => {
    expect(
      aggregateRowSchemas.statusMix.safeParse([{ bucket: 'b', s2xx: 1, s3xx: 0, s4xx: 2 }]).success,
    ).toBe(false)
  })
})

describe('streamEntrySchema', () => {
  /** A frame with a string `time` and all optional fields present validates. */
  it('accepts a frame with a string time and full optionals', () => {
    const parsed = streamEntrySchema.parse({
      ...baseRow,
      time: '2026-06-04T00:00:00.000Z',
      tenantId: 'acme',
      requestId: 'req_1',
      traceId: 'trace_1',
      spanId: 'span_1',
      cursor: 'c1',
    })
    expect(parsed.tenantId).toBe('acme')
    expect(parsed.cursor).toBe('c1')
  })

  /** A frame with a numeric `time` (the union's other arm) validates. */
  it('accepts a frame with a numeric time', () => {
    const parsed = streamEntrySchema.parse({ ...baseRow, time: 1_717_459_200_000 })
    expect(parsed.time).toBe(1_717_459_200_000)
  })

  /** `nullish` optionals may be explicitly null. */
  it('accepts null nullish optionals', () => {
    const parsed = streamEntrySchema.parse({ ...baseRow, time: 'now', tenantId: null })
    expect(parsed.tenantId).toBeNull()
  })

  /** A frame missing a required field is rejected. */
  it('rejects a frame missing a required field', () => {
    expect(streamEntrySchema.safeParse({ id: 'x', time: 'now' }).success).toBe(false)
  })
})

describe('streamQuerySchema', () => {
  /** A fully specified query (enums + coerced numeric limit) validates. */
  it('accepts known enums and coerces a numeric limit', () => {
    const parsed = streamQuerySchema.parse({ source: 'loki', role: 'admin', limit: '50' })
    expect(parsed.limit).toBe(50)
    expect(parsed.source).toBe('loki')
  })

  /** Unknown pass-through params are preserved (loose object). */
  it('preserves unknown pass-through params', () => {
    const parsed = streamQuerySchema.parse({ logKey: 'HTTP_REQUEST', from: 'x' })
    expect(parsed).toMatchObject({ logKey: 'HTTP_REQUEST', from: 'x' })
  })

  /** A limit above the bound is rejected. */
  it('rejects a limit over the maximum', () => {
    expect(streamQuerySchema.safeParse({ limit: '5000' }).success).toBe(false)
  })

  /** An invalid enum value (bad source) is rejected. */
  it('rejects an unknown source', () => {
    expect(streamQuerySchema.safeParse({ source: 'elastic' }).success).toBe(false)
  })

  /**
   * The minimum limit is 1: a value of exactly 1 must be accepted.
   * This pins the `min(1)` bound so a mutation to `min(0)` is caught.
   */
  it('accepts the minimum limit value of 1', () => {
    const parsed = streamQuerySchema.parse({ limit: '1' })
    expect(parsed.limit).toBe(1)
  })

  /**
   * The maximum limit is 1000: a value of exactly 1000 must be accepted.
   * This pins the `max(1000)` bound so a mutation to `max(999)` is caught.
   */
  it('accepts the maximum limit value of 1000', () => {
    const parsed = streamQuerySchema.parse({ limit: '1000' })
    expect(parsed.limit).toBe(1000)
  })

  /**
   * A limit of 0 is below the minimum and must be rejected.
   * This pins the lower boundary of `min(1)`.
   */
  it('rejects a limit of 0 (below minimum)', () => {
    expect(streamQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
  })

  /**
   * A limit of 1001 is above the maximum and must be rejected.
   * This pins the upper boundary of `max(1000)`.
   */
  it('rejects a limit of 1001 (above maximum)', () => {
    expect(streamQuerySchema.safeParse({ limit: '1001' }).success).toBe(false)
  })

  /** The role enum accepts all three documented values. */
  it('accepts all three role values', () => {
    for (const role of ['viewer', 'operator', 'admin']) {
      const parsed = streamQuerySchema.parse({ role })
      expect(parsed.role).toBe(role)
    }
  })

  /** An invalid role value is rejected. */
  it('rejects an unknown role value', () => {
    expect(streamQuerySchema.safeParse({ role: 'superadmin' }).success).toBe(false)
  })
})

describe('logLevelSchema — all six values', () => {
  /** Each of the six log levels is accepted by the strict enum. */
  it('accepts all six log levels', () => {
    for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace']) {
      expect(logLevelSchema.parse(level)).toBe(level)
    }
  })
})

describe('coerceLevel — all six values pass through', () => {
  /** Each known level passes through unchanged. */
  it('returns each known level unchanged', () => {
    for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace']) {
      expect(coerceLevel(level)).toBe(level)
    }
  })
})

describe('streamEntrySchema — optional cursor', () => {
  /** A frame with no cursor field must parse successfully with cursor=undefined. */
  it('accepts a frame with no cursor field', () => {
    const parsed = streamEntrySchema.parse({
      id: 'e1',
      time: '2026-06-04T00:00:00.000Z',
      level: 'info',
      logKey: 'HTTP_REQUEST',
      message: 'ok',
      service: 'api',
    })
    expect(parsed.cursor).toBeUndefined()
  })
})

describe('streamQuerySchema — source enum completeness', () => {
  /**
   * Both source values must be accepted. This kills the StringLiteral mutation
   * that replaces `'postgres'` with `''`, making the source enum `['', 'loki']`
   * and therefore rejecting the literal `'postgres'`.
   */
  it('accepts postgres as a valid source value', () => {
    const parsed = streamQuerySchema.parse({ source: 'postgres' })
    expect(parsed.source).toBe('postgres')
  })

  /** `loki` is accepted alongside `postgres` (covers the second enum value). */
  it('accepts loki as a valid source value', () => {
    const parsed = streamQuerySchema.parse({ source: 'loki' })
    expect(parsed.source).toBe('loki')
  })
})
