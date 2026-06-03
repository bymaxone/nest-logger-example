/**
 * Governance module — saved views, audit trail, RBAC, and retention.
 *
 * Layer: governance. Wires the `GovernanceModule` feature:
 *
 *   - `ViewsController` — `GET/POST /views`.
 *   - `AuditController` — `GET /audit`.
 *   - `MaintenanceController` — `GET/PATCH /maintenance/retention`.
 *   - `RetentionSweepService` — daily cron (`@nestjs/schedule`).
 *   - `AuditService` — shared audit write helper (exported for cross-module use).
 *
 * 🎓 Scoped demo of **query-based RBAC + audit + tiered retention**. In production,
 * RBAC would be wired to your IdP and retention to a proper data-lifecycle system.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { AuditController } from './audit.controller.js'
import { AuditService } from './audit.service.js'
import { MaintenanceController } from './maintenance.controller.js'
import { RetentionSweepService } from './retention.sweep.service.js'
import { ViewsController } from './views.controller.js'

/**
 * Feature module for governance: retention, audit trail, RBAC, and saved views.
 */
@Module({
  controllers: [ViewsController, AuditController, MaintenanceController],
  providers: [AuditService, RetentionSweepService],
  exports: [AuditService],
})
export class GovernanceModule {}
