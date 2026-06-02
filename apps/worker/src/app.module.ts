/**
 * Root application module for `apps/worker`.
 *
 * Layer: app/root. Registers the logger synchronously via `BymaxLoggerModule.forRoot`
 * (in contrast to `apps/api`'s `forRootAsync`) to demonstrate the synchronous
 * registration path. The `otel` block uses `snake_case` field names to contrast with
 * `apps/api`'s camelCase output — see OVERVIEW.md §14 "Field-format contrast".
 *
 * @module
 */
import { Module } from '@nestjs/common'
import { BymaxLoggerModule } from '@bymax-one/nest-logger'

import { validateEnv } from './config/env.schema.js'
import { HealthModule } from './health/health.module.js'
import { TasksModule } from './tasks/tasks.module.js'

// Validate at module-load time so a misconfigured deploy fails at startup, not at first request.
const workerEnv = validateEnv(process.env)

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: {
        name: workerEnv.OTEL_SERVICE_NAME,
        version: workerEnv.RELEASE_SHA,
      },
      level: workerEnv.LOG_LEVEL,
      isGlobal: true,
      otel: {
        // Explicit for documentation; default is already true.
        shouldAutoInjectTraceContext: true,
        // snake_case contrasts with apps/api's camelCase (OVERVIEW.md §14).
        fieldFormat: 'snake_case',
        // Explicit per-field override demonstration (Feature Matrix row 45b).
        traceIdField: 'trace_id',
      },
    }),
    HealthModule,
    TasksModule,
  ],
})
export class AppModule {}
