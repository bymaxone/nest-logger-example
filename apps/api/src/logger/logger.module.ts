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
import { LoggerController } from './logger.controller.js'

@Module({
  controllers: [LoggerController],
  providers: [LogAuditService],
  exports: [LogAuditService],
})
/** Provides and exports {@link LogAuditService} and the redact-path read endpoint. */
export class LoggerModule {}
