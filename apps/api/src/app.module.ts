/**
 * Root application module for `apps/api`.
 *
 * Layer: app/root. Wires global config validation, the Prisma database client, the
 * logger (with its HTTP interceptor + exception filter), the request-id middleware
 * (ALS scope), and the health routes. Feature modules are added as the application grows.
 */
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { BymaxLoggerModule, HttpExceptionFilter, RequestIdMiddleware } from '@bymax-one/nest-logger'

import { validateEnv } from './config/env.schema.js'
import { HealthModule } from './health/health.module.js'
import { LoggerModule } from './logger/logger.module.js'
import { buildLoggerOptions } from './logger/logger.config.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { PrismaService } from './prisma/prisma.service.js' // needed in forRootAsync inject array

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    BymaxLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) =>
        buildLoggerOptions(config, prisma),
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
