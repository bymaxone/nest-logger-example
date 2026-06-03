/**
 * `GET/PATCH /incidents` — incident lifecycle management.
 *
 * Layer: alerts. Implements the PagerDuty-style incident lifecycle:
 * `Triggered → Acknowledged → Snoozed → Resolved`. Every transition is appended
 * to the immutable `timeline` JSON array. A `deepLink` field points to the
 * Explorer pre-filtered to the incident's `logKey` + time window.
 *
 * 🎓 Scoped demo of **incident management**. In production, use PagerDuty or
 * Alertmanager; here the lifecycle is stored in the Prisma `Incident` table.
 *
 * @module
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common'
import { z } from 'zod'

import { PrismaService } from '../prisma/prisma.service.js'
import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { AuditService } from '../governance/audit.service.js'
import { buildRbacContext } from '../governance/rbac.context.js'

const transitionSchema = z.object({
  action: z.enum(['acknowledge', 'snooze', 'resolve']),
  /** Snooze duration — required when `action=snooze`. */
  snoozeDuration: z.enum(['1h', '4h', '8h', '24h']).optional(),
})

/** Snooze duration to millisecond map. */
const SNOOZE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
}

/**
 * Incident management controller.
 *
 * All roles can list incidents; operators and admins can transition state.
 */
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * List incidents.
   *
   * Admin callers receive all incidents. Non-admin callers receive an empty array because
   * the `Incident` and `AlertRule` models carry no `tenantId` column — there is no safe
   * data-layer predicate to scope incidents to a tenant. A future schema migration that
   * adds `tenantId` to `AlertRule` will unlock scoped listing for operators/viewers.
   *
   * 🎓 Scoped demo limitation: tenant isolation for incident listing requires the schema
   * to carry a `tenantId` on `AlertRule`. Until then, only admins can list incidents.
   *
   * @param headers - Request headers for RBAC context.
   * @returns Array of `Incident` rows with their rule, or `[]` for non-admin callers.
   */
  @Get()
  async list(@Headers() headers: Record<string, string>): Promise<unknown[]> {
    const ctx = buildRbacContext(headers)
    // Non-admin: Incident/AlertRule carry no tenantId column, so there is no safe predicate
    // to scope results to a tenant. Return empty rather than leaking cross-tenant data.
    if (ctx.role !== 'admin') {
      return []
    }
    const incidents = await this.prisma.incident.findMany({
      include: { rule: true },
      orderBy: { openedAt: 'desc' },
    })
    return incidents.map((i) => ({
      ...i,
      deepLink: `/explorer?logKey=${encodeURIComponent(i.logKey ?? '')}&from=${encodeURIComponent(i.openedAt.toISOString())}`,
    }))
  }

  /**
   * Transition an incident through its lifecycle.
   *
   * Appends the transition to the immutable `timeline` array. Snooze sets a
   * `resolvedAt` date in the future (the sweep checks it to auto-clear snoozes
   * in a real system; here it's illustrative).
   *
   * @param id - The `Incident` id.
   * @param headers - Request headers for RBAC context.
   * @param body - Action and optional snooze duration.
   * @returns The updated incident.
   * @throws {NotFoundException} When the incident id does not exist.
   */
  @Patch(':id')
  async transition(
    @Param('id') id: string,
    @Headers() headers: Record<string, string>,
    @Body(new ZodValidationPipe(transitionSchema)) body: z.infer<typeof transitionSchema>,
  ): Promise<unknown> {
    const ctx = buildRbacContext(headers)

    // Non-admin with no tenantId must not mutate incidents.
    if (ctx.role !== 'admin' && ctx.tenantId === undefined) {
      throw new ForbiddenException('x-tenant-id header is required to modify incidents')
    }

    const incident = await this.prisma.incident.findUnique({ where: { id } })
    if (incident === null) throw new NotFoundException(`Incident ${id} not found`)

    const timeline = [...(Array.isArray(incident.timeline) ? incident.timeline : [])]
    const at = new Date().toISOString()
    timeline.push({ actor: ctx.actor, action: body.action, at })

    let status: string
    let resolvedAt: Date | null = null

    switch (body.action) {
      case 'acknowledge':
        status = 'acknowledged'
        break
      case 'snooze': {
        status = 'snoozed'
        const ms = SNOOZE_MS[body.snoozeDuration ?? '1h'] ?? SNOOZE_MS['1h']!
        resolvedAt = new Date(Date.now() + ms)
        break
      }
      case 'resolve':
        status = 'resolved'
        resolvedAt = new Date()
        break
    }

    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        status,
        resolvedAt,
        timeline,
      },
    })

    await this.audit.record({
      actor: ctx.actor,
      action: `incident.${body.action}`,
      target: `Incident:${id}`,
      ...(ctx.tenantId !== undefined ? { tenantId: ctx.tenantId } : {}),
    })

    return {
      ...updated,
      deepLink: `/explorer?logKey=${updated.logKey ?? ''}&from=${updated.openedAt.toISOString()}`,
    }
  }
}
