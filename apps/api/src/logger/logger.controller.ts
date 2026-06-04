/**
 * `GET /logger/redact-paths` — the active redaction paths.
 *
 * Layer: app/logger. Surfaces `LogAuditService.listEffectiveRedactPaths()` (the
 * library's 97 defaults + any app-configured extensions) so the dashboard's
 * redaction-at-source panel can prove which fields are scrubbed in-process,
 * before the line ever leaves the service. Read-only; no sensitive data.
 *
 * @module
 */
import { Controller, ForbiddenException, Get, Headers } from '@nestjs/common'

import { buildRbacContext } from '../governance/rbac.context.js'
import { LogAuditService } from './log-audit.service.js'

/** Exposes the effective redact-path list for the governance UI. */
@Controller('logger')
export class LoggerController {
  /**
   * @param audit - Reads the resolved logger options (active redact paths).
   */
  constructor(private readonly audit: LogAuditService) {}

  /**
   * List every active redact path (defaults + app extensions).
   *
   * Only operators and admins may read the redact-path list; viewers are denied.
   *
   * @param headers - Request headers for RBAC context.
   * @returns The effective redact-path strings.
   * @throws {ForbiddenException} When a viewer attempts to read the redact paths.
   */
  @Get('redact-paths')
  redactPaths(@Headers() headers: Record<string, string>): string[] {
    const ctx = buildRbacContext(headers)
    if (ctx.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot access the redact-path list')
    }
    return [...this.audit.listEffectiveRedactPaths()]
  }
}
