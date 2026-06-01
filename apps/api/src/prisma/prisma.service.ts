/**
 * Injectable Prisma database client for `apps/api`.
 *
 * Layer: app/prisma. Extends `PrismaClient` using the `PrismaPg` driver adapter so the
 * connection URL is kept out of the schema file (Prisma 7). Connects in `onModuleInit`;
 * disconnects in `onApplicationShutdown` so the connection pool is released cleanly
 * when `app.close()` runs the NestJS lifecycle.
 *
 * @module
 */
import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

/** Prisma database client, injectable into any NestJS provider. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    })
    super({ adapter, log: ['warn', 'error'] })
  }

  /**
   * Connect to the database when the module initialises.
   *
   * @returns A promise that resolves once the connection is established.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  /**
   * Disconnect from the database when the application shuts down.
   *
   * Called by `app.close()` via the NestJS `OnApplicationShutdown` lifecycle so the
   * connection pool is released cleanly before the process exits.
   *
   * @returns A promise that resolves once the connection pool is torn down.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect()
  }
}
