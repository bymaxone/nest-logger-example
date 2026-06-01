/**
 * Global Prisma module for `apps/api`.
 *
 * Layer: app/prisma. Declares `PrismaService` as a global provider so every feature
 * module can inject it without re-importing this module. `BymaxLoggerModule.forRootAsync`
 * also injects it via `inject: [ConfigService, PrismaService]`.
 *
 * @module
 */
import { Global, Module } from '@nestjs/common'

import { PrismaService } from './prisma.service.js'

/** Provides and exports `PrismaService` globally across the application. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
