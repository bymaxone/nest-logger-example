/**
 * `GET/POST/PATCH /alerts/rules` — alert rule CRUD.
 *
 * Layer: alerts. Manages `AlertRule` records (expression + threshold + forDuration).
 * Write operations require operator or admin role; reads are accessible to all.
 *
 * @module
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { z } from 'zod'

import { PrismaService } from '../prisma/prisma.service.js'
import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { AuditService } from '../governance/audit.service.js'
import { buildRbacContext } from '../governance/rbac.context.js'

/** Request body for `POST /alerts/rules` — the full alert-rule definition (expression, threshold, severity, channels). */
export const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  expr: z.string().min(1).max(1024),
  threshold: z.number().int().min(0),
  forDuration: z.string().regex(/^\d+[smh]$/, 'must be like 5m, 1h, 30s'),
  severity: z.enum(['critical', 'warning']),
  channels: z.array(z.string()).default([]),
})

/** Request body for `PATCH /alerts/rules` — a partial rule plus the optional enabled flag. */
export const updateRuleSchema = createRuleSchema.partial().extend({
  isEnabled: z.boolean().optional(),
})

/**
 * Alert rules CRUD controller.
 *
 * Viewers can list rules; operators and admins can create or update.
 * Every write action is recorded by `AuditService`.
 */
@Controller('alerts/rules')
export class AlertsRulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * List all alert rules.
   *
   * @returns Array of `AlertRule` rows.
   */
  @Get()
  async list(): Promise<unknown[]> {
    return this.prisma.alertRule.findMany({ orderBy: { createdAt: 'desc' } })
  }

  /**
   * Create a new alert rule.
   *
   * @param headers - Request headers for RBAC context.
   * @param body - Rule specification.
   * @returns The created `AlertRule` row.
   * @throws {ForbiddenException} When a viewer attempts to create a rule.
   */
  @Post()
  async create(
    @Headers() headers: Record<string, string>,
    @Body(new ZodValidationPipe(createRuleSchema)) body: z.infer<typeof createRuleSchema>,
  ): Promise<unknown> {
    const ctx = buildRbacContext(headers)
    if (ctx.role === 'viewer') throw new ForbiddenException('Viewers cannot create alert rules')

    const rule = await this.prisma.alertRule.create({ data: body })
    await this.audit.record({
      actor: ctx.actor,
      action: 'rule.created',
      target: `AlertRule:${rule.id}`,
      ...(ctx.tenantId !== undefined ? { tenantId: ctx.tenantId } : {}),
    })
    return rule
  }

  /**
   * Update an existing alert rule (partial update).
   *
   * @param id - The `AlertRule` id.
   * @param headers - Request headers for RBAC context.
   * @param body - Fields to update.
   * @returns The updated `AlertRule`.
   * @throws {ForbiddenException} When a viewer attempts to update a rule.
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Headers() headers: Record<string, string>,
    @Body(new ZodValidationPipe(updateRuleSchema)) body: z.infer<typeof updateRuleSchema>,
  ): Promise<unknown> {
    const ctx = buildRbacContext(headers)
    if (ctx.role === 'viewer') throw new ForbiddenException('Viewers cannot update alert rules')

    // Filter undefined values from partial update to avoid exactOptionalPropertyTypes conflict.
    const updateData = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined),
    ) as Parameters<typeof this.prisma.alertRule.update>[0]['data']
    const rule = await this.prisma.alertRule.update({ where: { id }, data: updateData })
    await this.audit.record({
      actor: ctx.actor,
      action: 'rule.updated',
      target: `AlertRule:${id}`,
      ...(ctx.tenantId !== undefined ? { tenantId: ctx.tenantId } : {}),
    })
    return rule
  }
}
