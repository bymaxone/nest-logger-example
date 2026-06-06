/**
 * Unit tests for `PrismaService`.
 *
 * Covers the lifecycle contract that bridges Prisma to the NestJS app:
 *   - the constructor wires the `PrismaPg` adapter from `DATABASE_URL` (via
 *     `ConfigService.getOrThrow`);
 *   - `onModuleInit` connects the pool;
 *   - `onApplicationShutdown` disconnects it.
 *
 * `$connect` / `$disconnect` are inherited from `PrismaClient`; they are stubbed on
 * the instance so no real database connection is opened during the unit run.
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { ConfigService } from '@nestjs/config'

import { PrismaService } from './prisma.service.js'

/**
 * Build a `ConfigService` test double whose `getOrThrow` returns the supplied
 * connection string for `DATABASE_URL`.
 */
function buildConfig(url: string): { config: ConfigService; getOrThrow: jest.Mock } {
  const getOrThrow = jest.fn((key: unknown) => {
    if (key === 'DATABASE_URL') return url
    throw new Error(`unexpected key: ${String(key)}`)
  })
  return { config: { getOrThrow } as unknown as ConfigService, getOrThrow }
}

describe('PrismaService', () => {
  it('reads DATABASE_URL through ConfigService.getOrThrow to wire the adapter', () => {
    /**
     * The constructor must source the connection string from
     * `ConfigService.getOrThrow('DATABASE_URL')` so a missing URL fails fast at boot
     * rather than producing a silently misconfigured client.
     */
    const { config, getOrThrow } = buildConfig('postgresql://user:pass@db.internal:5432/app')

    const service = new PrismaService(config)

    expect(service.constructor.name).toBe('PrismaService')
    expect(getOrThrow).toHaveBeenCalledWith('DATABASE_URL')
  })

  it('connects the pool on onModuleInit', async () => {
    /**
     * `onModuleInit` is the NestJS hook that must open the connection; it has to
     * delegate to the inherited `$connect`.
     */
    const { config } = buildConfig('postgresql://user:pass@db.internal:5432/app')
    const service = new PrismaService(config)
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined as never)

    await service.onModuleInit()

    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('disconnects the pool on onApplicationShutdown', async () => {
    /**
     * `onApplicationShutdown` runs during `app.close()`; it must release the pool by
     * delegating to the inherited `$disconnect` so the process exits cleanly.
     */
    const { config } = buildConfig('postgresql://user:pass@db.internal:5432/app')
    const service = new PrismaService(config)
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined as never)

    await service.onApplicationShutdown()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
