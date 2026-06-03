/**
 * Audit trail service — records state-changing actions to `AuditEvent`.
 *
 * Layer: governance. Every sensitive or state-changing action (export, rule
 * create/edit/mute, role/tenant switch, retention change) must call `record()`
 * so the action is persisted to the `audit_events` table.
 *
 * 🎓 Scoped demo of **audit trail**. In production, the audit table would be
 * append-only, replicated to a separate schema, and retained indefinitely.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service.js'

/** Input for recording an auditable action. */
export interface AuditRecordInput {
  actor: string
  action: string
  target: string
  tenantId?: string | undefined
}

/**
 * Records auditable actions to the `audit_events` table.
 *
 * Fail-soft: a DB write failure is reported to stderr and swallowed so that an
 * audit-write error never prevents the primary action from completing.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist an auditable action.
   *
   * @param input - Actor, action, target, and optional tenantId.
   * @returns A promise that resolves once the row is written (or fails softly).
   */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actor: input.actor,
          action: input.action,
          target: input.target,
          tenantId: input.tenantId ?? null,
        },
      })
    } catch {
      process.stderr.write(
        JSON.stringify({ level: 'warn', logKey: 'AUDIT_WRITE_FAILED', input }) + '\n',
      )
    }
  }
}
