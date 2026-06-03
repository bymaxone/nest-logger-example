/**
 * Alerts module — alert rules, channels, incidents, and cron evaluation.
 *
 * Layer: alerts. Wires:
 *
 *   - `AlertsRulesController` — `GET/POST/PATCH /alerts/rules`.
 *   - `AlertsChannelsController` — `GET/POST /alerts/channels` + test-fire.
 *   - `IncidentsController` — `GET/PATCH /incidents`.
 *   - `AlertsEvaluatorService` — `@Cron` evaluation (requires `ScheduleModule`).
 *   - `ChannelRouterService` — severity-based channel routing.
 *
 * Imports `LogsModule` to inject `LogsService` into the evaluator.
 *
 * 🎓 Scoped demo of **log-based alerting + on-call**. In production, use the
 * Loki ruler → Alertmanager → PagerDuty/Slack pipeline.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { GovernanceModule } from '../governance/governance.module.js'
import { LogsModule } from '../logs/logs.module.js'
import { AlertsChannelsController } from './alerts.channels.controller.js'
import { AlertsEvaluatorService } from './alerts.evaluator.service.js'
import { AlertsRulesController } from './alerts.rules.controller.js'
import { ChannelRouterService } from './channel-router.service.js'
import { IncidentsController } from './incidents.controller.js'

/**
 * Feature module for log-based alerting and incident management.
 */
@Module({
  imports: [LogsModule, GovernanceModule],
  controllers: [AlertsRulesController, AlertsChannelsController, IncidentsController],
  providers: [AlertsEvaluatorService, ChannelRouterService],
})
export class AlertsModule {}
