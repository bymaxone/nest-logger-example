/**
 * `GET/POST /alerts/channels` + `POST /alerts/channels/:id/test` — channel CRUD.
 *
 * Layer: alerts. Manages notification channels and provides a test-fire action.
 *
 * @module
 */
import { Body, Controller, ForbiddenException, Get, Headers, Param, Post } from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { AuditService } from '../governance/audit.service.js'
import { buildRbacContext, isAdmin } from '../governance/rbac.context.js'
import { ChannelRouterService, type ChannelType } from './channel-router.service.js'

export const createChannelSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['slack', 'webhook', 'email-mock'] satisfies ChannelType[]),
  name: z.string().min(1).max(200),
  endpoint: z.string().min(1),
  severities: z.array(z.enum(['critical', 'warning'])).min(1),
})

/**
 * Alert channels controller.
 *
 * Reading channels is open; creating channels requires admin role.
 * Test-firing is available to operators and admins.
 */
@Controller('alerts/channels')
export class AlertsChannelsController {
  constructor(
    private readonly router: ChannelRouterService,
    private readonly audit: AuditService,
  ) {}

  /**
   * List all registered notification channels (operator+ only).
   *
   * @param headers - Request headers for RBAC context.
   * @returns Array of channel records.
   * @throws {ForbiddenException} When a viewer requests the channel list.
   */
  @Get()
  list(@Headers() headers: Record<string, string>): unknown[] {
    const ctx = buildRbacContext(headers)
    if (ctx.role === 'viewer')
      throw new ForbiddenException('Viewers cannot list notification channels')
    return this.router.listChannels()
  }

  /**
   * Register a new notification channel (Admin only).
   *
   * @param headers - Request headers for RBAC context.
   * @param body - Channel specification.
   * @returns The registered channel.
   * @throws {ForbiddenException} When the caller is not an admin.
   */
  @Post()
  async create(
    @Headers() headers: Record<string, string>,
    @Body(new ZodValidationPipe(createChannelSchema)) body: z.infer<typeof createChannelSchema>,
  ): Promise<unknown> {
    const ctx = buildRbacContext(headers)
    if (!isAdmin(ctx.role)) throw new ForbiddenException('Only admins can add channels')
    this.router.addChannel(body)
    await this.audit.record({
      actor: ctx.actor,
      action: 'channel.created',
      target: `Channel:${body.id}`,
      ...(ctx.tenantId !== undefined ? { tenantId: ctx.tenantId } : {}),
    })
    return { ok: true, channel: body }
  }

  /**
   * Test-fire a channel to verify it is configured correctly.
   *
   * @param id - The channel id to test.
   * @param headers - Request headers for RBAC context.
   * @returns Success flag.
   * @throws {ForbiddenException} When a viewer attempts to fire.
   */
  @Post(':id/test')
  testFire(@Param('id') id: string, @Headers() headers: Record<string, string>): { ok: boolean } {
    const ctx = buildRbacContext(headers)
    if (ctx.role === 'viewer') throw new ForbiddenException('Viewers cannot test-fire channels')
    const ok = this.router.testFire(id)
    return { ok }
  }
}
