/**
 * @fileoverview Local query compiler for the Explorer's teaching toggles.
 *
 * Mirrors the `apps/api` `LogsService` dual compiler (`DASHBOARD.md` §12) so the
 * Explorer can render the *generated* SQL `WHERE` and LogQL beside the form —
 * making the dual-backend tangible. This is a display-only mirror; the API
 * remains the source of truth that actually executes the query.
 *
 * @module lib/query-compile
 */

import type { LogLevel } from '@bymax-one/nest-logger/shared'

import type { LogQuery } from './types'

/** Pino numeric rank per level (higher = more severe), mirroring the API. */
const LEVEL_RANK: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
}

/** Levels at or above the given minimum, highest first. */
function levelsAtOrAbove(min: LogLevel): LogLevel[] {
  return (Object.keys(LEVEL_RANK) as LogLevel[])
    .filter((l) => LEVEL_RANK[l] >= LEVEL_RANK[min])
    .sort((a, b) => LEVEL_RANK[b] - LEVEL_RANK[a])
}

/** Escape a value for safe LogQL string interpolation (mirrors the API). */
function escapeLogQL(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Escape a value for the display-only SQL string (double single quotes). */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Compile a {@link LogQuery} to a readable Postgres `WHERE` clause.
 *
 * @param q - The active filter.
 * @returns A `WHERE …` string mirroring the Prisma where the API builds.
 */
export function toSqlWhere(q: LogQuery): string {
  const clauses: string[] = ['time BETWEEN $from AND $to']
  if (q.level !== undefined) {
    clauses.push(
      typeof q.level === 'string'
        ? `level = '${q.level}'`
        : `level IN (${levelsAtOrAbove(q.level.gte)
            .map((l) => `'${l}'`)
            .join(', ')})`,
    )
  }
  if (q.logKey !== undefined) {
    clauses.push(
      q.logKey.endsWith('_*')
        ? `"logKey" LIKE '${escapeSql(q.logKey.slice(0, -1))}%'`
        : `"logKey" = '${escapeSql(q.logKey)}'`,
    )
  }
  if (q.service !== undefined) clauses.push(`service = '${escapeSql(q.service)}'`)
  if (q.tenantId !== undefined) clauses.push(`"tenantId" = '${escapeSql(q.tenantId)}'`)
  if (q.traceId !== undefined) clauses.push(`"traceId" = '${escapeSql(q.traceId)}'`)
  if (q.requestId !== undefined) clauses.push(`"requestId" = '${escapeSql(q.requestId)}'`)
  if (q.q !== undefined) clauses.push(`message ILIKE '%${escapeSql(q.q)}%'`)
  return `WHERE ${clauses.join('\n  AND ')}`
}

/**
 * Compile a {@link LogQuery} to a LogQL selector + pipeline (mirrors the API).
 *
 * @param q - The active filter.
 * @returns A LogQL query string.
 */
export function toLogQL(q: LogQuery): string {
  const serviceName = q.service ?? 'api'
  const labels = [`service="${escapeLogQL(serviceName)}"`]
  const pipeline: string[] = ['| json', '| __error__=""']
  if (q.level !== undefined) {
    pipeline.push(
      typeof q.level === 'string'
        ? `| level="${escapeLogQL(q.level)}"`
        : `| level=~"${levelsAtOrAbove(q.level.gte).join('|')}"`,
    )
  }
  if (q.logKey !== undefined) {
    pipeline.push(
      q.logKey.endsWith('_*')
        ? `| logKey=~"${escapeLogQL(q.logKey.slice(0, -1))}.*"`
        : `| logKey="${escapeLogQL(q.logKey)}"`,
    )
  }
  if (q.tenantId !== undefined) pipeline.push(`| tenantId="${escapeLogQL(q.tenantId)}"`)
  if (q.traceId !== undefined) pipeline.push(`| traceId="${escapeLogQL(q.traceId)}"`)
  if (q.requestId !== undefined) pipeline.push(`| requestId="${escapeLogQL(q.requestId)}"`)
  const lineFilter = q.q !== undefined ? ` |= "${escapeLogQL(q.q)}"` : ''
  return `{${labels.join(',')}}${lineFilter} ${pipeline.join(' ')}`.trim()
}
