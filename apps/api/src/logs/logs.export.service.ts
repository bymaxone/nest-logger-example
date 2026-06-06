/**
 * Streaming JSON/CSV export service.
 *
 * Layer: logs/export. Pages through `application_logs` via the keyset cursor codec
 * so the full result set is never buffered in memory. Hard-capped at 100,000 rows
 * (Datadog's cap); when the cap is hit, `X-Export-Truncated: true` is set on the
 * response so the client knows to communicate a truncation warning.
 *
 * CSV columns are fixed and RFC-4180-quoted: `time, level, logKey, service,
 * requestId, traceId, tenantId, msg`.
 *
 * Export is an audited action: callers should record an `AuditEvent` row after
 * calling `stream()` (the audit write is wired by the calling controller).
 *
 * See `docs/DASHBOARD.md` §10 for the export specification.
 *
 * @module
 */
import { Injectable, StreamableFile } from '@nestjs/common'
import { Readable } from 'node:stream'
import type { Response } from 'express'
import type { ApplicationLog } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import type { ExportQueryDto } from './dto/export-query.dto.js'

/** Maximum rows per export (Datadog's cap). */
const MAX_EXPORT_ROWS = 100_000

/** Internal page size for keyset streaming. */
const PAGE_SIZE = 1_000

/** CSV column order per `DASHBOARD.md` §10. */
const CSV_COLUMNS = [
  'time',
  'level',
  'logKey',
  'service',
  'requestId',
  'traceId',
  'tenantId',
  'msg',
] as const

/**
 * Leading characters that make Excel / Google Sheets evaluate a cell as a formula.
 * A text cell starting with one of these is prefixed with `'` so it renders as literal text.
 */
const CSV_FORMULA_TRIGGER = /^[=+\-@\t\r]/

/**
 * Serialize a value into a safe CSV cell: RFC-4180 quoting + formula-injection defense.
 *
 * Wraps the value in double-quotes when it contains a comma, double-quote, carriage return,
 * or newline (inner double-quotes are doubled). A *text* cell beginning with `=`, `+`, `-`,
 * `@`, TAB, or CR is prefixed with a single quote so a spreadsheet treats it as literal text
 * rather than a formula (CSV injection — a logged `message` can carry attacker-controlled
 * content). Numbers, dates, and booleans are emitted verbatim so legitimate values (e.g. a
 * negative number) are never corrupted.
 *
 * @param v - Any value; `null`/`undefined` become empty string.
 * @returns A safe CSV cell string.
 */
export function csvCell(v: unknown): string {
  let s: string
  let isText = false
  if (v == null) {
    s = ''
  } else if (typeof v === 'string') {
    s = v
    isText = true
  } else if (v instanceof Date) {
    s = v.toISOString()
  } else if (typeof v === 'number' || typeof v === 'boolean') {
    s = String(v)
  } else {
    s = JSON.stringify(v)
    isText = true
  }
  if (isText && CSV_FORMULA_TRIGGER.test(s)) {
    s = `'${s}`
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Map an `ApplicationLog` row to a CSV line (no trailing newline). */
function rowToCsv(row: ApplicationLog): string {
  return [
    csvCell(row.time.toISOString()),
    csvCell(row.level),
    csvCell(row.logKey),
    csvCell(row.service),
    csvCell(row.requestId),
    csvCell(row.traceId),
    csvCell(row.tenantId),
    csvCell(row.message),
  ].join(',')
}

/**
 * Streaming export service.
 *
 * Exposes a `stream()` method that sets the response headers and returns a
 * `StreamableFile` wrapping a Node.js `Readable` that yields data page-by-page.
 */
@Injectable()
export class LogsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  /**
   * Stream the filtered result set as JSON or CSV.
   *
   * Pre-counts total matching rows before streaming begins so the `X-Export-Truncated`
   * header can be set synchronously — HTTP headers are committed on the first body write
   * and cannot be set inside an async generator. The time window is pinned once via
   * a single `buildPrismaWhere` call to prevent drift across pages.
   *
   * @param q - Validated export query DTO.
   * @param res - Express response for setting headers synchronously.
   * @returns A `StreamableFile` wrapping the streaming response.
   */
  async stream(q: ExportQueryDto, res: Response): Promise<StreamableFile> {
    const isCsv = q.format === 'csv'
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const ext = isCsv ? 'csv' : 'json'
    const filename = `logs-export-${timestamp}.${ext}`

    // Build the where clause once so the time window is stable across all pages.
    const baseWhere = this.logs.buildPrismaWhere(q)

    // Pre-count to detect truncation before the stream starts — the only moment when
    // response headers can still be set (they are committed on the first body write).
    const totalCount = await this.prisma.applicationLog.count({ where: baseWhere })
    const willTruncate = totalCount > MAX_EXPORT_ROWS

    res.setHeader('Content-Type', isCsv ? 'text/csv' : 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    if (willTruncate) res.setHeader('X-Export-Truncated', 'true')

    const readable = Readable.from(this.generateRows(baseWhere, isCsv))
    return new StreamableFile(readable)
  }

  /**
   * Async generator that yields chunks of the export data.
   *
   * Pages through the result set via keyset cursor. The `baseWhere` is derived once
   * by the caller so the time window does not drift between pages.
   *
   * @param baseWhere - Pre-computed Prisma `where` clause (stable time window).
   * @param isCsv - Whether to emit CSV chunks.
   */
  private async *generateRows(
    baseWhere: import('@prisma/client').Prisma.ApplicationLogWhereInput,
    isCsv: boolean,
  ): AsyncGenerator<string> {
    if (isCsv) {
      yield CSV_COLUMNS.join(',') + '\n'
    } else {
      yield '[\n'
    }

    let cursor: { time: Date; id: string } | undefined
    let emitted = 0
    let isFirst = true

    while (emitted < MAX_EXPORT_ROWS) {
      const where = { ...baseWhere }
      if (cursor !== undefined) {
        const cursorClause = {
          OR: [{ time: { lt: cursor.time } }, { time: cursor.time, id: { lt: cursor.id } }],
        }
        where.AND = [...(Array.isArray(where.AND) ? where.AND : []), cursorClause]
      }

      const batch = await this.prisma.applicationLog.findMany({
        where,
        orderBy: [{ time: 'desc' }, { id: 'desc' }],
        take: Math.min(PAGE_SIZE, MAX_EXPORT_ROWS - emitted),
      })

      if (batch.length === 0) break

      for (const row of batch) {
        if (isCsv) {
          yield rowToCsv(row) + '\n'
        } else {
          yield (isFirst ? '' : ',\n') + JSON.stringify(row)
          isFirst = false
        }
        emitted++
        if (emitted >= MAX_EXPORT_ROWS) break
      }

      if (emitted >= MAX_EXPORT_ROWS) break

      const last = batch.at(-1)
      if (last === undefined || batch.length < PAGE_SIZE) break
      cursor = { time: last.time, id: last.id }
    }

    if (!isCsv) {
      yield '\n]'
    }
  }
}
