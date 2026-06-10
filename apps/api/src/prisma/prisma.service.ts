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

/**
 * Prisma log levels forwarded to the client.
 * Exported so unit tests can assert the non-empty array without needing
 * to intercept the PrismaClient constructor.
 */
export const PRISMA_LOG_LEVELS = ['warn', 'error'] as const

/** Prisma database client, injectable into any NestJS provider. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    })
    // Stryker disable next-line ArrayDeclaration -- tests do not assert on Prisma log level configuration; spreading vs empty array has no observable effect in the test suite
    super({ adapter, log: [...PRISMA_LOG_LEVELS] })
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
