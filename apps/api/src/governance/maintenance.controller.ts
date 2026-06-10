/**
 * `GET/PATCH /maintenance/retention` — retention TTL config.
 *
 * Layer: governance. Exposes the current retention window and the next-sweep
 * schedule. The `PATCH` endpoint is restricted to Admin role.
 *
 * 🎓 Scoped demo of **tiered retention**. In production, retention changes would
 * be applied via a migration or a Loki compactor config update.
 *
 * @module
 */
import { Body, Controller, ForbiddenException, Get, Headers, Patch } from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { AuditService } from './audit.service.js'
import { buildRbacContext, isAdmin } from './rbac.context.js'
import { RetentionSweepService } from './retention.sweep.service.js'

export const updateRetentionSchema = z.object({
  retentionDays: z.number().int().min(1).max(365),
})

/**
 * Maintenance retention endpoints.
 *
 * Viewers and operators can read status; only admins may update.
 */
@Controller('maintenance/retention')
export class MaintenanceController {
  constructor(
    private readonly sweep: RetentionSweepService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Get current retention configuration and pending-deletion count (operator+ only).
   *
   * @param headers - Request headers for RBAC context.
   * @returns The retention status for the maintenance panel.
   * @throws {ForbiddenException} When a viewer attempts to read retention status.
   */
  @Get()
  async getStatus(@Headers() headers: Record<string, string>): Promise<unknown> {
    const ctx = buildRbacContext(headers)
    if (ctx.role === 'viewer')
      throw new ForbiddenException('Viewers cannot access maintenance settings')
    return this.sweep.getStatus()
  }

  /**
   * Update the retention window (Admin only).
   *
   * Writes an audit event recording the change.
   *
   * @param headers - Request headers for RBAC context.
   * @param body - New `retentionDays` value.
   * @returns Updated retention status.
   * @throws {ForbiddenException} When the caller is not an admin.
   */
  @Patch()
  async updateRetention(
    @Headers() headers: Record<string, string>,
    @Body(new ZodValidationPipe(updateRetentionSchema)) body: z.infer<typeof updateRetentionSchema>,
  ): Promise<unknown> {
    const ctx = buildRbacContext(headers)
    if (!isAdmin(ctx.role)) {
      throw new ForbiddenException('Only admins can update the retention window')
    }
    const days = this.sweep.setRetentionDays(body.retentionDays)
    await this.audit.record({
      actor: ctx.actor,
      action: 'retention.changed',
      target: `retentionDays=${days}`,
      ...(ctx.tenantId !== undefined ? { tenantId: ctx.tenantId } : {}),
    })
    return this.sweep.getStatus()
  }
}
