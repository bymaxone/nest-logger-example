/**
 * Root application module for `apps/api`.
 *
 * Layer: app/root. Wires global config validation, the Prisma database client, the
 * logger (with its HTTP interceptor + exception filter), the request-id middleware
 * (ALS scope), the Zod validation filter, the health routes, all six demo-domain
 * feature modules, and the Phase 10 read-API modules (`LogsModule`, `GovernanceModule`,
 * `AlertsModule`). `ScheduleModule.forRoot()` registers the cron scheduler for
 * `AlertsEvaluatorService` and `RetentionSweepService`.
 *
 * @module
 */
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { BymaxLoggerModule, HttpExceptionFilter, RequestIdMiddleware } from '@bymax-one/nest-logger'

import { ScheduleModule } from '@nestjs/schedule'

import { AdminModule } from './admin/admin.module.js'
import { AlertsModule } from './alerts/alerts.module.js'
import { ZodValidationFilter } from './common/zod-validation.filter.js'
import { validateEnv } from './config/env.schema.js'
import { DownstreamModule } from './downstream/downstream.module.js'
import { GovernanceModule } from './governance/governance.module.js'
import { HealthModule } from './health/health.module.js'
import { buildLoggerOptions } from './logger/logger.config.js'
import { LoggerModule } from './logger/logger.module.js'
import { LogsModule } from './logs/logs.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { PaymentsModule } from './payments/payments.module.js'
import { PiiDemoModule } from './pii-demo/pii-demo.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { PrismaService } from './prisma/prisma.service.js'
import { TriggerModule } from './trigger/trigger.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    PrismaModule,
    BymaxLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) =>
        buildLoggerOptions(config, prisma),
    }),
    HealthModule,
    LoggerModule,
    // Demo Domain
    OrdersModule,
    PaymentsModule,
    PiiDemoModule,
    DownstreamModule,
    TriggerModule,
    AdminModule,
    // Logs read-API
    LogsModule,
    // Governance: saved views, audit trail, RBAC, retention
    GovernanceModule,
    // Alerts: rules, channels, incidents, cron evaluation
    AlertsModule,
  ],
  providers: [
    // HttpLoggingInterceptor is auto-wired by BymaxLoggerModule.forRootAsync when
    // http.isEnabled is true (via asyncHttpInterceptorProvider in the library). The
    // HttpExceptionFilter is intentionally NOT auto-wired from async config to avoid
    // interfering with consumer filters — register it once here as a global filter.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // ZodValidationFilter catches unhandled ZodError from schema.parse(body) in controllers
    // and maps it to a 400 Bad Request with a DOMAIN_VALIDATION_FAILED structured log.
    { provide: APP_FILTER, useClass: ZodValidationFilter },
  ],
})
export class AppModule implements NestModule {
  /**
   * Register the request-id middleware on every route, which opens the per-request ALS
   * scope on each incoming request.
   *
   * @param consumer - The NestJS middleware consumer used to register middleware.
   */
  configure(consumer: MiddlewareConsumer): void {
    // Opens the ALS scope (requestId / tenantId) per request. Alternatives NOT used here:
    // set `http.shouldGenerateRequestId: true` in the module options, or call the exported
    // `applyRequestIdMiddleware()` helper. We wire the middleware explicitly, hence
    // `shouldGenerateRequestId: false` in logger.config.ts.
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
