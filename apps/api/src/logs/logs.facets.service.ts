/**
 * Facets service — distinct values with counts for the Explorer facet rail.
 *
 * Layer: logs/facets. Runs one `groupBy` query per requested field, using the
 * same `buildPrismaWhere` compiled filter + time window. Group-by is restricted
 * to bounded-dimension fields only to prevent high-cardinality queries.
 *
 * See `docs/DASHBOARD.md` §6 for the facet rail layout.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import type { ApplicationLog } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import { FACET_FIELDS_ALLOW_LIST, type FacetsQueryDto } from './dto/facets-query.dto.js'

/** Top-N limit for high-cardinality dimensions (logKey, tenantId). */
const TOP_N = 50

/** One facet value with its count within the current filter + time window. */
export interface FacetValue {
  value: string
  count: number
}

/** Map of field name → sorted facet value list. */
export type FacetsResult = Partial<Record<(typeof FACET_FIELDS_ALLOW_LIST)[number], FacetValue[]>>

/** Column mapping from DTO field name to the Prisma model field name. */
const FIELD_COLUMN = {
  level: 'level',
  service: 'service',
  logKey: 'logKey',
  tenantId: 'tenantId',
} as const satisfies Record<(typeof FACET_FIELDS_ALLOW_LIST)[number], keyof ApplicationLog>

/**
 * Compute distinct values with counts for each requested bounded-dimension field.
 *
 * Reuses `LogsService.buildPrismaWhere` so the facet counts always reflect the
 * current filter + time window + RBAC restriction.
 */
@Injectable()
export class LogsFacetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  /**
   * Compute facets for the requested fields.
   *
   * @param q - Validated facets query (fields list + base filters).
   * @returns A partial map of field → `{ value, count }[]` sorted by count desc.
   */
  async query(q: FacetsQueryDto): Promise<FacetsResult> {
    const where = this.logs.buildPrismaWhere(q)
    const result: FacetsResult = {}

    await Promise.all(
      q.fields.map(async (field) => {
        const column = FIELD_COLUMN[field]
        const rows = await this.prisma.applicationLog.groupBy({
          by: [column] as [typeof column],
          where,
          _count: { _all: true },
          orderBy: { _count: { [column]: 'desc' } },
          take: TOP_N,
        })
        result[field] = rows
          .filter((r) => r[column] !== null)
          .map((r) => ({
            value: String(r[column]),
            count: r._count._all,
          }))
      }),
    )

    return result
  }
}
