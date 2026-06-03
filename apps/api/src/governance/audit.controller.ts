/**
 * `GET /audit` — read-only audit trail.
 *
 * Layer: governance. Returns `AuditEvent` rows in reverse-chronological order.
 * Read-only — there are no write endpoints for audit events (they are created
 * exclusively by `AuditService.record`).
 *
 * @module
 */
import { Controller, ForbiddenException, Get, Headers, Query } from '@nestjs/common'
import { z } from 'zod'

import { PrismaService } from '../prisma/prisma.service.js'
import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { buildRbacContext } from './rbac.context.js'

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  actor: z.string().optional(),
  action: z.string().optional(),
})

/**
 * Audit trail read endpoint.
 *
 * Only operators and admins may read the audit trail; viewers are denied.
 */
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List recent audit events.
   *
   * @param headers - Request headers for RBAC context.
   * @param query - Optional filters: actor, action, limit.
   * @returns Array of `AuditEvent` rows, newest first.
   * @throws {ForbiddenException} When a viewer attempts to read the audit trail.
   */
  @Get()
  async list(
    @Headers() headers: Record<string, string>,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ): Promise<unknown[]> {
    const ctx = buildRbacContext(headers)
    if (ctx.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot access the audit trail')
    }
    const where: Record<string, string> = {}
    if (query.actor !== undefined) where['actor'] = query.actor
    if (query.action !== undefined) where['action'] = query.action
    return this.prisma.auditEvent.findMany({
      where,
      orderBy: { at: 'desc' },
      take: query.limit,
    })
  }
}
