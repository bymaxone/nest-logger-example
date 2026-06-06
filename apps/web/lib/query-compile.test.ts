/**
 * @fileoverview Unit tests for the display-only dual query compiler in
 * `lib/query-compile` ({@link toSqlWhere} + {@link toLogQL}).
 *
 * Both compilers are driven across every branch: the minimal query (only the time
 * window), exact vs at-or-above level, exact vs `_*` wildcard logKey, each optional
 * scalar field present and absent, the free-text contains filter, the LogQL default
 * service fallback, and the SQL/LogQL escaping of quotes and backslashes.
 *
 * @module lib/query-compile.test
 */
import { describe, expect, it } from 'vitest'

import type { LogQuery } from './types'
import { toLogQL, toSqlWhere } from './query-compile'

/** A query carrying only the mandatory source — every optional field absent. */
const BASE: LogQuery = { source: 'postgres' }

describe('toSqlWhere', () => {
  it(/* With no filters the WHERE is just the time-window clause — every optional
       `if` branch is false. */
  'emits only the time-window clause for a bare query', () => {
    expect(toSqlWhere(BASE)).toBe('WHERE time BETWEEN $from AND $to')
  })

  it(/* A string level compiles to an exact equality — the `typeof === 'string'`
       branch of the level clause. */
  'compiles an exact level to an equality clause', () => {
    expect(toSqlWhere({ ...BASE, level: 'error' })).toContain("level = 'error'")
  })

  it(/* A `{ gte }` level compiles to an IN list of every level at or above it,
       ordered highest-rank first — the comparison branch of the level clause. */
  'compiles an at-or-above level to an ordered IN list', () => {
    const sql = toSqlWhere({ ...BASE, level: { gte: 'warn' } })
    expect(sql).toContain("level IN ('fatal', 'error', 'warn')")
  })

  it(/* A `PREFIX_*` logKey compiles to a LIKE with the trailing `*` stripped and a
       `%` appended — the wildcard branch. */
  'compiles a wildcard logKey to a LIKE clause', () => {
    const sql = toSqlWhere({ ...BASE, logKey: 'AUTH_*' })
    expect(sql).toContain('"logKey" LIKE \'AUTH_%\'')
  })

  it(/* An exact logKey compiles to an equality — the non-wildcard branch. */
  'compiles an exact logKey to an equality clause', () => {
    const sql = toSqlWhere({ ...BASE, logKey: 'AUTH_LOGIN' })
    expect(sql).toContain('"logKey" = \'AUTH_LOGIN\'')
  })

  it(/* Every remaining scalar plus the free-text contains compiles to its own
       clause — covers each optional `if` true branch together. */
  'compiles service, tenant, trace, request, and free-text clauses', () => {
    const sql = toSqlWhere({
      ...BASE,
      service: 'api',
      tenantId: 't1',
      traceId: 'tr1',
      requestId: 'rq1',
      q: 'boom',
    })
    expect(sql).toContain("service = 'api'")
    expect(sql).toContain('"tenantId" = \'t1\'')
    expect(sql).toContain('"traceId" = \'tr1\'')
    expect(sql).toContain('"requestId" = \'rq1\'')
    expect(sql).toContain("message ILIKE '%boom%'")
  })

  it(/* Single quotes in a value are doubled so the display SQL stays well-formed —
       exercises `escapeSql`. */
  'escapes single quotes by doubling them', () => {
    const sql = toSqlWhere({ ...BASE, service: "o'brien" })
    expect(sql).toContain("service = 'o''brien'")
  })
})

describe('toLogQL', () => {
  it(/* With no service the selector falls back to `service="api"` and only the base
       pipeline stages render — the `?? 'api'` default and all-false branches. */
  'defaults the service label and emits the base pipeline', () => {
    const ql = toLogQL(BASE)
    expect(ql).toContain('{service="api"}')
    expect(ql).toContain('| json')
    expect(ql).toContain('| __error__=""')
  })

  it(/* A provided service replaces the default in the stream selector. */
  'uses the provided service in the selector', () => {
    expect(toLogQL({ ...BASE, service: 'worker' })).toContain('{service="worker"}')
  })

  it(/* A string level compiles to an exact label match. */
  'compiles an exact level to a label match', () => {
    expect(toLogQL({ ...BASE, level: 'error' })).toContain('| level="error"')
  })

  it(/* A `{ gte }` level compiles to a regex alternation of every level at or above
       it — the comparison branch. */
  'compiles an at-or-above level to a regex alternation', () => {
    expect(toLogQL({ ...BASE, level: { gte: 'warn' } })).toContain('| level=~"fatal|error|warn"')
  })

  it(/* A `PREFIX_*` logKey compiles to a regex match with the `*` replaced by `.*`. */
  'compiles a wildcard logKey to a regex match', () => {
    expect(toLogQL({ ...BASE, logKey: 'AUTH_*' })).toContain('| logKey=~"AUTH_.*"')
  })

  it(/* An exact logKey compiles to an exact label match. */
  'compiles an exact logKey to a label match', () => {
    expect(toLogQL({ ...BASE, logKey: 'AUTH_LOGIN' })).toContain('| logKey="AUTH_LOGIN"')
  })

  it(/* Tenant, trace, and request each add their own pipeline stage. */
  'compiles tenant, trace, and request stages', () => {
    const ql = toLogQL({ ...BASE, tenantId: 't1', traceId: 'tr1', requestId: 'rq1' })
    expect(ql).toContain('| tenantId="t1"')
    expect(ql).toContain('| traceId="tr1"')
    expect(ql).toContain('| requestId="rq1"')
  })

  it(/* Free text compiles to a line filter inserted before the pipeline — the
       non-empty `lineFilter` branch. */
  'compiles free text to a line filter', () => {
    expect(toLogQL({ ...BASE, q: 'boom' })).toContain('|= "boom"')
  })

  it(/* Backslashes and double quotes in a value are escaped for safe LogQL string
       interpolation — exercises `escapeLogQL`. */
  'escapes backslashes and double quotes', () => {
    const ql = toLogQL({ ...BASE, q: 'a\\b"c' })
    expect(ql).toContain('|= "a\\\\b\\"c"')
  })
})
