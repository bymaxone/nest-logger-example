/**
 * Unit tests for `LogsService` — dual query compiler and cursor codec.
 *
 * Covers: Prisma `where` shapes, LogQL strings, cursor round-trip, and
 * `StaleCursorError` on a malformed cursor.
 */
import { describe, expect, it } from '@jest/globals'

import { LogsService, StaleCursorError } from './logs.service.js'

const svc = new LogsService()

describe('LogsService.buildPrismaWhere', () => {
  it('single level produces an equality filter', () => {
    /** A string-level maps to `where.level = "error"`. */
    const where = svc.buildPrismaWhere({ level: 'error', source: 'postgres', limit: 100 })
    expect(where.level).toBe('error')
  })

  it('level>=warn produces an IN filter with all levels at or above warn', () => {
    /** `{ gte: "warn" }` maps to `where.level = { in: ["fatal","error","warn"] }`. */
    const where = svc.buildPrismaWhere({ level: { gte: 'warn' }, source: 'postgres', limit: 100 })
    expect(where.level).toEqual({ in: expect.arrayContaining(['fatal', 'error', 'warn']) })
    const levels = (where.level as { in: string[] }).in
    expect(levels).not.toContain('info')
    expect(levels).not.toContain('debug')
    expect(levels).not.toContain('trace')
  })

  it('exact logKey produces an equality filter', () => {
    /** An exact key maps to `where.logKey = "PAYMENT_REFUND_FAILED"`. */
    const where = svc.buildPrismaWhere({
      logKey: 'PAYMENT_REFUND_FAILED',
      source: 'postgres',
      limit: 100,
    })
    expect(where.logKey).toBe('PAYMENT_REFUND_FAILED')
  })

  it('wildcard logKey produces a startsWith filter', () => {
    /** `PAYMENT_*` maps to `where.logKey = { startsWith: "PAYMENT_" }`. */
    const where = svc.buildPrismaWhere({ logKey: 'PAYMENT_*', source: 'postgres', limit: 100 })
    expect(where.logKey).toEqual({ startsWith: 'PAYMENT_' })
  })

  it('free-text q produces a case-insensitive contains filter', () => {
    /** `q` maps to `where.message = { contains: "refund", mode: "insensitive" }`. */
    const where = svc.buildPrismaWhere({ q: 'refund', source: 'postgres', limit: 100 })
    expect(where.message).toEqual({ contains: 'refund', mode: 'insensitive' })
  })

  it('restriction.tenantId overrides query tenantId', () => {
    /** The restriction wins — RBAC cannot be widened by the incoming query. */
    const where = svc.buildPrismaWhere(
      { tenantId: 'attacker', source: 'postgres', limit: 100 },
      { tenantId: 'acme' },
    )
    expect(where.tenantId).toBe('acme')
  })

  it('restriction.tenantId is applied even when query tenantId is absent', () => {
    /** A restriction without a query tenantId is still enforced. */
    const where = svc.buildPrismaWhere({ source: 'postgres', limit: 100 }, { tenantId: 'globex' })
    expect(where.tenantId).toBe('globex')
  })
})

describe('LogsService.buildLogQL', () => {
  it('produces a basic selector with the service label', () => {
    /** Without filters, the LogQL includes the service selector and pipeline. */
    const logql = svc.buildLogQL({ source: 'postgres', limit: 100 })
    expect(logql).toContain('{service="api"}')
    expect(logql).toContain('| json')
    expect(logql).toContain('| __error__=""')
  })

  it('single level produces a level equality pipeline step', () => {
    /** A string-level maps to `| level="error"`. */
    const logql = svc.buildLogQL({ level: 'error', source: 'postgres', limit: 100 })
    expect(logql).toContain('| level="error"')
  })

  it('level>=warn produces a regex pipeline step with all levels at or above warn', () => {
    /** `{ gte: "warn" }` maps to `| level=~"fatal|error|warn"`. */
    const logql = svc.buildLogQL({ level: { gte: 'warn' }, source: 'postgres', limit: 100 })
    expect(logql).toMatch(/\| level=~"[^"]*fatal[^"]*"/)
    expect(logql).toMatch(/\| level=~"[^"]*error[^"]*"/)
    expect(logql).toMatch(/\| level=~"[^"]*warn[^"]*"/)
  })

  it('wildcard logKey produces a regex pipeline step', () => {
    /** `PAYMENT_*` maps to `| logKey=~"PAYMENT_.*"`. */
    const logql = svc.buildLogQL({ logKey: 'PAYMENT_*', source: 'postgres', limit: 100 })
    expect(logql).toContain('| logKey=~"PAYMENT_.*"')
  })

  it('exact logKey produces an equality pipeline step', () => {
    /** An exact key maps to `| logKey="PAYMENT_REFUND_FAILED"`. */
    const logql = svc.buildLogQL({
      logKey: 'PAYMENT_REFUND_FAILED',
      source: 'postgres',
      limit: 100,
    })
    expect(logql).toContain('| logKey="PAYMENT_REFUND_FAILED"')
  })

  it('free-text q produces a line filter', () => {
    /** `q` maps to `|= "refund"`. */
    const logql = svc.buildLogQL({ q: 'refund', source: 'postgres', limit: 100 })
    expect(logql).toContain('|= "refund"')
  })

  it('restriction.tenantId is injected into the LogQL pipeline', () => {
    /** The restriction tenantId appears as `| tenantId="acme"`. */
    const logql = svc.buildLogQL({ source: 'postgres', limit: 100 }, { tenantId: 'acme' })
    expect(logql).toContain('| tenantId="acme"')
  })
})

describe('LogsService cursor codec', () => {
  it('encodes and decodes a cursor round-trip', () => {
    /** `encodeCursor` then `decodeCursor` must recover the same time and id. */
    const time = new Date('2024-06-01T12:00:00.000Z')
    const id = 'clxxx123abc'
    const encoded = svc.encodeCursor({ time, id })
    const decoded = svc.decodeCursor(encoded)
    expect(decoded.time.toISOString()).toBe(time.toISOString())
    expect(decoded.id).toBe(id)
  })

  it('throws StaleCursorError for a garbage string', () => {
    /** A non-base64 string must throw `StaleCursorError`, not a raw Error. */
    expect(() => svc.decodeCursor('!!!')).toThrow(StaleCursorError)
  })

  it('throws StaleCursorError for a valid base64 but wrong JSON structure', () => {
    /** Valid base64 with an invalid JSON payload must throw `StaleCursorError`. */
    const bad = Buffer.from('{"x":1}').toString('base64url')
    expect(() => svc.decodeCursor(bad)).toThrow(StaleCursorError)
  })
})
