/**
 * `GET/POST /views` — Saved views CRUD.
 *
 * Layer: governance. Named filter sets that can be promoted to alert rules
 * in one click (the Datadog "save view → monitor" pattern). The stored `query`
 * JSON is re-validated before use — never trusted blindly.
 *
 * @module
 */
import { Body, Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common'
import { z } from 'zod'

import { PrismaService } from '../prisma/prisma.service.js'
import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { buildRbacContext, NO_TENANT_SENTINEL } from './rbac.context.js'
import { logQuerySchema } from '../logs/dto/log-query.dto.js'

const createViewSchema = z.object({
  name: z.string().min(1).max(100),
  query: logQuerySchema,
})

/**
 * Saved views endpoints.
 *
 * Viewers can read; operators and admins can create. The stored `query` field is
 * validated against `logQuerySchema` on both write and read.
 */
@Controller('views')
export class ViewsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all saved views.
   *
   * @param headers - Request headers for RBAC context.
   * @returns Array of `SavedView` rows.
   */
  @Get()
  async list(@Headers() headers: Record<string, string>): Promise<unknown[]> {
    const ctx = buildRbacContext(headers)
    // Non-admin with no tenantId gets the sentinel that matches zero rows (security: no cross-tenant leak).
    const where =
      ctx.role === 'admin'
        ? {}
        : ctx.tenantId !== undefined
          ? { tenantId: ctx.tenantId }
          : { tenantId: NO_TENANT_SENTINEL }
    return this.prisma.savedView.findMany({ where, orderBy: { createdAt: 'desc' } })
  }

  /**
   * Create a new saved view.
   *
   * @param headers - Request headers for RBAC context.
   * @param body - View name and compiled `LogQuery` filter.
   * @returns The created `SavedView` row.
   * @throws {ForbiddenException} When a viewer attempts to create a view.
   */
  @Post()
  async create(
    @Headers() headers: Record<string, string>,
    @Body(new ZodValidationPipe(createViewSchema)) body: z.infer<typeof createViewSchema>,
  ): Promise<unknown> {
    const ctx = buildRbacContext(headers)
    if (ctx.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot create saved views')
    }
    return this.prisma.savedView.create({
      data: {
        name: body.name,
        query: body.query,
        tenantId: ctx.tenantId ?? null,
        createdBy: ctx.actor,
      },
    })
  }
}
