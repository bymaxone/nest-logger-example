/**
 * Unit tests for `PrismaService`.
 *
 * Covers the lifecycle contract that bridges Prisma to the NestJS app:
 *   - the constructor wires the `PrismaPg` adapter from `DATABASE_URL` (via
 *     `ConfigService.getOrThrow`);
 *   - `onModuleInit` connects the pool;
 *   - `onApplicationShutdown` disconnects it;
 *   - `PRISMA_LOG_LEVELS` exports the non-empty log configuration array.
 *
 * `$connect` / `$disconnect` are inherited from `PrismaClient`; they are stubbed on
 * the instance so no real database connection is opened during the unit run.
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { ConfigService } from '@nestjs/config'

import { PrismaService, PRISMA_LOG_LEVELS } from './prisma.service.js'

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

  it('calls getOrThrow exactly once and only for DATABASE_URL', () => {
    /**
     * Scenario: constructor wires the adapter.
     * Rule: `getOrThrow` must be called exactly once with the key `'DATABASE_URL'`
     * — kills the StringLiteral mutation that changes the key string and confirms no
     * extra env reads happen during construction.
     */
    const { config, getOrThrow } = buildConfig('postgresql://user:pass@db.internal:5432/app')

    new PrismaService(config)

    expect(getOrThrow).toHaveBeenCalledTimes(1)
    expect(getOrThrow).toHaveBeenCalledWith('DATABASE_URL')
  })
})

describe('PRISMA_LOG_LEVELS — log configuration', () => {
  it('contains warn and error — kills ArrayDeclaration [] mutant on log option', () => {
    /**
     * Scenario: `super({ adapter, log: [...PRISMA_LOG_LEVELS] })` in the constructor.
     * Rule: `PRISMA_LOG_LEVELS` must be the non-empty array `['warn', 'error']` —
     * kills the ArrayDeclaration mutant that replaces `['warn', 'error']` with `[]`,
     * which would silently disable all Prisma warn/error log forwarding.
     */
    expect(PRISMA_LOG_LEVELS).toContain('warn')
    expect(PRISMA_LOG_LEVELS).toContain('error')
    expect(PRISMA_LOG_LEVELS).not.toHaveLength(0)
  })

  it('equals exactly [warn, error] — confirms no extra or missing entries', () => {
    /**
     * Scenario: inspect the exported constant directly.
     * Rule: the array must equal `['warn', 'error']` in exact order — confirms
     * the array has exactly the two documented log levels, no more, no less.
     */
    expect(PRISMA_LOG_LEVELS).toEqual(['warn', 'error'])
  })
})
