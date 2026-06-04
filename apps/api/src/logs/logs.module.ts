/**
 * Logs read-API module.
 *
 * Layer: logs. Provides and exports every service and controller that composes
 * the `logs/` read-API: the dual query compiler, aggregation, facets, context,
 * export, SSE live tail, and the Loki proxy. `PrismaService` is injected from
 * the global `PrismaModule` — no explicit import needed.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { LogEventBus } from './log-event.bus.js'
import { LokiClient } from './loki.client.js'
import { LokiProxyController } from './loki-proxy.controller.js'
import { LogsAggregateService } from './logs.aggregate.service.js'
import { LogsContextService } from './logs.context.service.js'
import { LogsController } from './logs.controller.js'
import { LogsExportService } from './logs.export.service.js'
import { LogsFacetsService } from './logs.facets.service.js'
import { LogsService } from './logs.service.js'
import { LogsSseController } from './logs.sse.controller.js'

/**
 * Feature module wiring all `GET /logs*` endpoints and their backing services.
 *
 * 🎓 Scoped demo of **log observability read-API**. In a real deployment, aggregate
 * queries would likely live in a dedicated analytics replica and SSE would be
 * backed by a persistent event bus (Redis Streams, Kafka).
 */
@Module({
  controllers: [LogsController, LogsSseController, LokiProxyController],
  providers: [
    LogsService,
    LogsAggregateService,
    LogsFacetsService,
    LogsContextService,
    LogsExportService,
    LogEventBus,
    LokiClient,
  ],
  exports: [LogsService, LogEventBus],
})
export class LogsModule {}
