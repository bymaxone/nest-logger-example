/**
 * Unit tests for `logQuerySchema` and `logKeySchema`.
 *
 * Covers: valid full query, invalid `logKey`, wildcard `logKey`, `level>=warn` object,
 * out-of-range `limit`, and a malformed ISO date.
 */
import { describe, expect, it } from '@jest/globals'

import { logKeySchema, logQuerySchema } from './log-query.dto.js'

describe('logKeySchema', () => {
  it('accepts a valid convention key', () => {
    /** Valid two-word convention key must parse without error. */
    expect(logKeySchema.safeParse('USER_CREATED').success).toBe(true)
  })

  it('accepts a four-word convention key', () => {
    /** Four-word keys (e.g. HTTP_REQUEST_CLIENT_ERROR) are legal. */
    expect(logKeySchema.safeParse('HTTP_REQUEST_CLIENT_ERROR').success).toBe(true)
  })

  it('accepts a PREFIX_* wildcard', () => {
    /** A trailing `_*` wildcard is valid for prefix matching. */
    expect(logKeySchema.safeParse('PAYMENT_*').success).toBe(true)
  })

  it('rejects a lowercase key', () => {
    /** Lowercase keys violate the MODULE_ACTION_RESULT convention. */
    expect(logKeySchema.safeParse('user_created').success).toBe(false)
  })

  it('rejects a single-word key', () => {
    /** The convention requires at least two uppercase-separated words. */
    expect(logKeySchema.safeParse('LOGIN').success).toBe(false)
  })

  it('rejects an empty string', () => {
    /** Empty strings are not valid log keys. */
    expect(logKeySchema.safeParse('').success).toBe(false)
  })
})

describe('logQuerySchema', () => {
  it('parses a valid full query with all optional fields', () => {
    /** A fully-populated query with every field must parse successfully. */
    const result = logQuerySchema.safeParse({
      level: 'error',
      logKey: 'PAYMENT_REFUND_FAILED',
      service: 'api',
      tenantId: 'acme',
      traceId: 'abc123',
      requestId: 'req-1',
      q: 'gateway declined',
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-01T01:00:00Z',
      source: 'postgres',
      cursor: 'dGVzdA==',
      limit: '50',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.level).toBe('error')
      expect(result.data.limit).toBe(50)
      expect(result.data.source).toBe('postgres')
    }
  })

  it('applies defaults: source=postgres, limit=100', () => {
    /** When optional fields are absent, defaults are applied by the schema. */
    const result = logQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.source).toBe('postgres')
      expect(result.data.limit).toBe(100)
    }
  })

  it('accepts level as a { gte } object', () => {
    /** `level>=warn` is expressed as `{ gte: "warn" }` in the DTO. */
    const result = logQuerySchema.safeParse({ level: { gte: 'warn' } })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.level).toEqual({ gte: 'warn' })
    }
  })

  it('rejects an invalid logKey', () => {
    /** A lowercase logKey violates the convention and must be rejected. */
    const result = logQuerySchema.safeParse({ logKey: 'bad_key' })
    expect(result.success).toBe(false)
  })

  it('accepts a wildcard logKey', () => {
    /** A PREFIX_* wildcard is valid in the query DTO. */
    const result = logQuerySchema.safeParse({ logKey: 'PAYMENT_*' })
    expect(result.success).toBe(true)
  })

  it('rejects limit=0', () => {
    /** Zero is below the minimum of 1. */
    const result = logQuerySchema.safeParse({ limit: '0' })
    expect(result.success).toBe(false)
  })

  it('rejects limit=5000', () => {
    /** 5000 exceeds the maximum of 1000. */
    const result = logQuerySchema.safeParse({ limit: '5000' })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed ISO date for `from`', () => {
    /** A non-ISO date string must fail datetime validation. */
    const result = logQuerySchema.safeParse({ from: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed ISO date for `to`', () => {
    /** A plain date (no time) without timezone must fail strict datetime validation. */
    const result = logQuerySchema.safeParse({ to: '2024-01-01' })
    expect(result.success).toBe(false)
  })

  it('rejects an over-long free-text `q`', () => {
    /** Free-text `q` is length-capped (defense-in-depth); an oversized value is rejected. */
    const result = logQuerySchema.safeParse({ q: 'x'.repeat(2000) })
    expect(result.success).toBe(false)
  })

  it('rejects an over-long `traceId`', () => {
    /** Correlation-id filters are length-capped so an unbounded value cannot be sent. */
    const result = logQuerySchema.safeParse({ traceId: 'a'.repeat(200) })
    expect(result.success).toBe(false)
  })
})
