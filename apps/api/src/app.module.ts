/**
 * Root application module for `apps/api`.
 *
 * Layer: app/root. Wires global config validation, the logger (with its HTTP
 * interceptor + exception filter), the request-id middleware (ALS scope), and
 * the health routes. Feature modules are added as the application grows.
 *
 * The `PrismaService` is currently a placeholder stub. When database support is
 * added, replace `new PrismaService()` with an injected instance and add
 * `PrismaService` to the `inject` array of `BymaxLoggerModule.forRootAsync`.
 */
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { BymaxLoggerModule, HttpExceptionFilter, RequestIdMiddleware } from '@bymax-one/nest-logger'

import { validateEnv } from './config/env.schema.js'
import { HealthModule } from './health/health.module.js'
import { LoggerModule } from './logger/logger.module.js'
import { buildLoggerOptions } from './logger/logger.config.js'
import { PrismaService } from './prisma/prisma.service.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    BymaxLoggerModule.forRootAsync({
      imports: [ConfigModule],
      // TODO: add PrismaService to inject + pass the real instance to buildLoggerOptions
      //   once database client integration is available.
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildLoggerOptions(config, new PrismaService()),
    }),
    HealthModule,
    LoggerModule,
  ],
  providers: [
    // HttpLoggingInterceptor is auto-wired by BymaxLoggerModule.forRootAsync when
    // http.isEnabled is true (via asyncHttpInterceptorProvider in the library). The
    // HttpExceptionFilter is intentionally NOT auto-wired from async config to avoid
    // interfering with consumer filters — register it once here as a global filter.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  /**
   * Apply the request-id middleware to every route, opening the per-request ALS scope.
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
