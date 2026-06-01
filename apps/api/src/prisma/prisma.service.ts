/**
 * Prisma database client placeholder for `apps/api`.
 *
 * Layer: app/prisma. Placeholder pending real database client integration.
 * Exists so `buildLoggerOptions` in `logger/logger.config.ts` can declare its
 * `prisma` parameter — needed when database log destinations are configured —
 * without a missing-type error. Replace with the real `PrismaClient`-extending
 * service once database support is added.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'

// TODO: replace with the real PrismaClient-extending service when database support is added.
@Injectable()
export class PrismaService {}
