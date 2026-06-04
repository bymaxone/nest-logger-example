/**
 * `GET /logs` — paged log query with keyset cursor pagination.
 *
 * Layer: logs/controller. Serves the Explorer table data source. Pagination is
 * keyset on `(time DESC, id DESC)` — never OFFSET — for constant-time, stable
 * results under concurrent inserts (~17× faster at depth per `DASHBOARD.md` §13).
 *
 * Every handler resolves an RBAC restriction from request headers (`x-role`,
 * `x-tenant-id`) and injects it into `LogsService.buildPrismaWhere()` / `buildLogQL()`
 * so tenantId scoping cannot be bypassed by query params.
 *
 * @module
 */
import {
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  Headers,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common'
import type { Response } from 'express'
import type { ApplicationLog } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service.js'
import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { buildRbacContext, canExport, toRestriction } from '../governance/rbac.context.js'
import { logQuerySchema, type LogQueryDto } from './dto/log-query.dto.js'
import { aggregateQuerySchema, type AggregateQueryDto } from './dto/aggregate-query.dto.js'
import { exportQuerySchema, type ExportQueryDto } from './dto/export-query.dto.js'
import { facetsQuerySchema, type FacetsQueryDto } from './dto/facets-query.dto.js'
import { contextQuerySchema, type ContextQueryDto } from './dto/context-query.dto.js'
import { StaleCursorError, LogsService } from './logs.service.js'
import { LogsAggregateService } from './logs.aggregate.service.js'
import { LogsFacetsService } from './logs.facets.service.js'
import { LogsContextService } from './logs.context.service.js'
import { LogsExportService } from './logs.export.service.js'

/** Response shape for a paged log query. */
export interface LogsPageResponse {
  data: ApplicationLog[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * `GET /logs` and related read endpoints.
 *
 * All handlers share the `LogQueryDto` filter compiled by `LogsService` into
 * the correct backend query (Prisma `where` or LogQL string). RBAC restriction
 * is resolved from headers and threaded into every query.
 */
@Controller('logs')
export class LogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
    private readonly aggregate: LogsAggregateService,
    private readonly facets: LogsFacetsService,
    private readonly ctx: LogsContextService,
    private readonly exporter: LogsExportService,
  ) {}

  /**
   * Paged log query — newest-first, keyset cursor.
   *
   * Applies the Prisma keyset predicate `(time, id) < (cursorTime, cursorId)` so
   * pagination is constant-time and stable. A stale cursor returns HTTP 410.
   * RBAC restriction is resolved from `x-role` / `x-tenant-id` headers.
   *
   * @param headers - Request headers for RBAC context resolution.
   * @param q - Validated filter and pagination params.
   * @returns Page of `ApplicationLog` rows plus a `nextCursor` and `hasMore` flag.
   * @throws {GoneException} HTTP 410 when the cursor is stale or malformed.
   * @throws {BadRequestException} HTTP 400 when query params fail Zod validation.
   */
  @Get()
  async list(
    @Headers() headers: Record<string, string>,
    @Query(new ZodValidationPipe(logQuerySchema)) q: LogQueryDto,
  ): Promise<LogsPageResponse> {
    const restriction = toRestriction(buildRbacContext(headers))
    const where = this.logs.buildPrismaWhere(q, restriction)

    if (q.cursor !== undefined) {
      let cursorData: { time: Date; id: string }
      try {
        cursorData = this.logs.decodeCursor(q.cursor)
      } catch (err) {
        if (err instanceof StaleCursorError) {
          throw new GoneException('cursor is stale; restart pagination from the top')
        }
        throw err
      }
      // Correct tuple keyset: (time < cursorTime) OR (time = cursorTime AND id < cursorId)
      const cursorClause = {
        OR: [
          { time: { lt: cursorData.time } },
          { time: cursorData.time, id: { lt: cursorData.id } },
        ],
      }
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), cursorClause]
    }

    const rows = await this.prisma.applicationLog.findMany({
      where,
      orderBy: [{ time: 'desc' }, { id: 'desc' }],
      take: q.limit,
    })

    const last = rows.at(-1)
    const hasMore = rows.length === q.limit
    const nextCursor =
      hasMore && last !== undefined
        ? this.logs.encodeCursor({ time: last.time, id: last.id })
        : null

    return { data: rows, nextCursor, hasMore }
  }

  /**
   * Time-bucketed aggregations for chart panels.
   *
   * @param headers - Request headers for RBAC context resolution.
   * @param q - Validated aggregate query (metric, groupBy, bucket, plus base filters).
   * @returns Time-series rows specific to the requested metric.
   * @throws {BadRequestException} HTTP 400 when params fail validation.
   */
  @Get('aggregate')
  async aggregateLogs(
    @Headers() headers: Record<string, string>,
    @Query(new ZodValidationPipe(aggregateQuerySchema)) q: AggregateQueryDto,
  ) {
    const restriction = toRestriction(buildRbacContext(headers))
    return this.aggregate.query({ ...q, ...restriction })
  }

  /**
   * Distinct values with counts for the Explorer facet rail.
   *
   * @param headers - Request headers for RBAC context resolution.
   * @param q - Validated facet query (fields list plus base filters).
   * @returns Object of `{ field: { value, count }[] }` sorted by count descending.
   * @throws {BadRequestException} HTTP 400 when params fail validation.
   */
  @Get('facets')
  async getFacets(
    @Headers() headers: Record<string, string>,
    @Query(new ZodValidationPipe(facetsQuerySchema)) q: FacetsQueryDto,
  ) {
    const restriction = toRestriction(buildRbacContext(headers))
    return this.facets.query({ ...q, tenantId: restriction.tenantId ?? q.tenantId })
  }

  /**
   * Surrounding log lines for the Explorer detail drawer Context tab.
   *
   * @param headers - Request headers for RBAC context resolution.
   * @param q - Validated context query (requestId or traceId, before/after counts).
   * @returns `{ before, match, after }` ordered chronologically.
   * @throws {BadRequestException} HTTP 400 when params fail validation.
   */
  @Get('context')
  async getContext(
    @Headers() headers: Record<string, string>,
    @Query(new ZodValidationPipe(contextQuerySchema)) q: ContextQueryDto,
  ) {
    const restriction = toRestriction(buildRbacContext(headers))
    return this.ctx.query({ ...q, tenantId: restriction.tenantId ?? q.tenantId })
  }

  /**
   * Streaming JSON/CSV export of the current filtered result set.
   *
   * Capped at 100,000 rows. Sets `X-Export-Truncated: true` header when the cap
   * is hit. Uses keyset paging internally — never buffers 100k rows in memory.
   * Viewers are denied export; operators and admins may export.
   *
   * @param headers - Request headers for RBAC context resolution.
   * @param q - Validated export query (format plus base filters).
   * @param res - Express response for streaming and header manipulation.
   * @returns A streamable file attachment.
   * @throws {ForbiddenException} HTTP 403 when the caller is a viewer.
   */
  @Get('export')
  async exportLogs(
    @Headers() headers: Record<string, string>,
    @Query(new ZodValidationPipe(exportQuerySchema)) q: ExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const ctx = buildRbacContext(headers)
    if (!canExport(ctx.role)) {
      throw new ForbiddenException('Viewers cannot export log data')
    }
    const restriction = toRestriction(ctx)
    return this.exporter.stream({ ...q, tenantId: restriction.tenantId ?? q.tenantId }, res)
  }
}
