/**
 * Logger feature module for `apps/api`.
 *
 * Layer: app/logger. Wraps `LogAuditService` so it can be provided and exported
 * independently. `BymaxLoggerModule` is registered globally (`isGlobal: true`), so
 * `LOGGER_OPTIONS_TOKEN` is available to any provider in the DI graph — including
 * `LogAuditService` here without needing to re-import `BymaxLoggerModule`.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { LogAuditService } from './log-audit.service.js'

@Module({
  providers: [LogAuditService],
  exports: [LogAuditService],
})
/** Provides and exports {@link LogAuditService} for injection in feature modules. */
export class LoggerModule {}
