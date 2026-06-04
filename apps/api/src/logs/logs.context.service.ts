/**
 * Context service — surrounding log lines for the Explorer detail drawer.
 *
 * Layer: logs/context. Fetches N lines strictly before and N lines strictly after
 * an anchor row identified by `requestId` or `traceId`, using a keyset window
 * so the ordering is stable under concurrent inserts.
 *
 * The anchor row is resolved first (most-recent match for the correlation id), then
 * two keyset-windowed queries retrieve the before/after slices. The before slice is
 * re-sorted ascending so the drawer reads top→bottom.
 *
 * See `docs/DASHBOARD.md` §6 (detail drawer Context tab) for the shape.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import type { ApplicationLog } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service.js'
import type { ContextQueryDto } from './dto/context-query.dto.js'

/** Response from `GET /logs/context`. */
export interface ContextResult {
  before: ApplicationLog[]
  match: ApplicationLog | null
  after: ApplicationLog[]
}

/**
 * Fetch surrounding log lines for a given anchor correlation id.
 */
@Injectable()
export class LogsContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the correlation id filter for the anchor row lookup.
   *
   * @param q - Validated context query.
   * @returns A Prisma `where` clause fragment for the correlation field.
   */
  private correlationWhere(q: ContextQueryDto): { requestId?: string; traceId?: string } {
    if (q.requestId !== undefined) return { requestId: q.requestId }
    if (q.traceId !== undefined) return { traceId: q.traceId }
    return {}
  }

  /**
   * Fetch `before` + `match` + `after` surrounding log lines.
   *
   * @param q - Validated context query.
   * @returns `{ before, match, after }` ordered chronologically (oldest→newest).
   */
  async query(q: ContextQueryDto): Promise<ContextResult> {
    const correlation = this.correlationWhere(q)

    let anchor: ApplicationLog | null = null

    if (q.anchorTime !== undefined && q.anchorId !== undefined) {
      anchor = await this.prisma.applicationLog.findFirst({
        where: { ...correlation, time: new Date(q.anchorTime), id: q.anchorId },
      })
    }

    if (anchor === null) {
      // Resolve the most-recent matching row as the anchor.
      anchor = await this.prisma.applicationLog.findFirst({
        where: correlation,
        orderBy: [{ time: 'desc' }, { id: 'desc' }],
      })
    }

    if (anchor === null) return { before: [], match: null, after: [] }

    const anchorTime = anchor.time
    const anchorId = anchor.id

    // Rows strictly older than the anchor (correct tuple keyset).
    const beforeRaw = await this.prisma.applicationLog.findMany({
      where: {
        ...correlation,
        OR: [{ time: { lt: anchorTime } }, { time: anchorTime, id: { lt: anchorId } }],
      },
      orderBy: [{ time: 'desc' }, { id: 'desc' }],
      take: q.before,
    })

    // Rows strictly newer than the anchor (correct tuple keyset).
    const after = await this.prisma.applicationLog.findMany({
      where: {
        ...correlation,
        OR: [{ time: { gt: anchorTime } }, { time: anchorTime, id: { gt: anchorId } }],
      },
      orderBy: [{ time: 'asc' }, { id: 'asc' }],
      take: q.after,
    })

    // Re-sort before ascending so the drawer reads oldest→newest.
    const before = beforeRaw.reverse()

    return { before, match: anchor, after }
  }
}
