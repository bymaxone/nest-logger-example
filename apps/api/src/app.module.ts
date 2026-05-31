/**
 * Root application module (Phase-3 skeleton).
 *
 * Layer: app/root. Wires only global config validation + the health routes so
 * `/health` boots and a span reaches Tempo. The full
 * `BymaxLoggerModule.forRootAsync({ ... })` wiring and the `RequestIdMiddleware`
 * `configure()` hook land in Phase 4 (see `docs/OVERVIEW.md` §9) — intentionally
 * absent here so the skeleton boots without the logger options factory.
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { validateEnv } from './config/env.schema.js'
import { HealthModule } from './health/health.module.js'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), HealthModule],
})
export class AppModule {}
