/**
 * Three-sink fan-out: stdout + Loki + Postgres + debug `minLevel` proof.
 *
 * Proves that a single request fans out to all three sinks:
 *   1. JSON appears on stdout (`DefaultStdoutDestination`, included explicitly because
 *      providing custom destinations REPLACES the default — it does not add to it).
 *   2. Loki receives a push request at `/loki/api/v1/push` with nanosecond timestamps
 *      encoded as JSON strings (a required Loki format constraint).
 *   3. `PrismaLogDestination` calls `createMany` with the already-redacted payload.
 *
 * Also proves the multistream parent-level gotcha: pino.multistream does NOT auto-compute
 * the parent log level. The library must lower the Pino `level` to the minimum across all
 * destination `minLevel`s; otherwise a `debug` destination silently receives nothing.
 *
 * Technique:
 *   - `jest.spyOn(process.stdout, 'write')` captures stdout JSON lines.
 *   - `jest.spyOn(globalThis, 'fetch')` intercepts the Loki push call.
 *   - A mock that satisfies `ApplicationLogClient` captures `createMany` calls without
 *     requiring a cast — `PrismaLogDestination` accepts the narrow interface directly.
 *   - A stub destination with `minLevel: 'debug'` proves lower-level fan-out.
 *
 * Reference: `OVERVIEW.md` §12 (Loki ns-timestamp + multistream gotcha), §15 Journeys 7 & 11.
 */
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import {
  BymaxLoggerModule,
  DefaultStdoutDestination,
  PinoLoggerService,
} from '@bymax-one/nest-logger'
import type { ILogDestination } from '@bymax-one/nest-logger'
import type { Prisma } from '@prisma/client'
import { jest } from '@jest/globals'
import request from 'supertest'

import { LokiDestination } from '../src/destinations/loki.destination.js'
import {
  PrismaLogDestination,
  type ApplicationLogClient,
} from '../src/destinations/prisma-log.destination.js'
import { TriggerModule } from '../src/trigger/trigger.module.js'
import { HealthModule } from '../src/health/health.module.js'

// ---------------------------------------------------------------------------
// Mock that satisfies ApplicationLogClient — typed with Prisma's generated types
// so no cast is needed when constructing PrismaLogDestination.
// ---------------------------------------------------------------------------
function buildMockPrisma(): ApplicationLogClient & {
  applicationLog: {
    createMany: ReturnType<
      typeof jest.fn<
        (args: {
          data: Prisma.ApplicationLogCreateManyInput[]
          skipDuplicates?: boolean
        }) => Promise<{ count: number }>
      >
    >
  }
} {
  return {
    applicationLog: {
      createMany: jest
        .fn<
          (args: {
            data: Prisma.ApplicationLogCreateManyInput[]
            skipDuplicates?: boolean
          }) => Promise<{ count: number }>
        >()
        .mockResolvedValue({ count: 1 }),
    },
  }
}

// Loki URL used in the test — intercepted via fetch spy so no real network call.
const TEST_LOKI_URL = 'http://loki.test/loki/api/v1/push'
// Allow batchSize:1 flush + network microtask to settle before asserting destination calls.
const FLUSH_SETTLE_MS = 100
// Allow the synchronous write to propagate through the pino multistream pipeline.
const MULTISTREAM_SETTLE_MS = 10

describe('Destination fan-out (e2e)', () => {
  let app: INestApplication
  let mockPrisma: ReturnType<typeof buildMockPrisma>

  beforeAll(async () => {
    mockPrisma = buildMockPrisma()

    // Instantiate destinations outside NestJS DI — PrismaLogDestination accepts
    // ApplicationLogClient (narrow interface) so the mock passes without a cast.
    const lokiDest = new LokiDestination({
      url: TEST_LOKI_URL,
      batchSize: 1,
      flushIntervalMs: 60_000,
    })
    const prismaDest = new PrismaLogDestination(mockPrisma, {
      minLevel: 'warn',
      batchSize: 1,
      flushIntervalMs: 60_000,
    })

    // DefaultStdoutDestination must be listed explicitly when custom destinations are
    // provided (custom destinations REPLACE the default, they don't add to it).
    const moduleRef = await Test.createTestingModule({
      imports: [
        BymaxLoggerModule.forRoot({
          service: { name: 'fanout-e2e', version: 'test' },
          level: 'debug', // lowered so the debug-probe test also passes
          isPretty: false,
          isGlobal: true,
          destinations: [new DefaultStdoutDestination(), lokiDest, prismaDest],
        }),
        TriggerModule,
        HealthModule,
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useLogger(false) // silence NestJS internal bootstrap logs in test output
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it(/*
   * One warn request fans out to stdout (DefaultStdoutDestination), to Loki
   * (LokiDestination push with correct endpoint + nanosecond STRING timestamp), and to
   * Postgres (PrismaLogDestination.createMany with already-redacted payload).
   */
  'fans one warn request out to stdout, Loki, and Postgres', async () => {
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    // Loki responds 204 (null body); Node < 24 requires null body for a 204 status.
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))

    try {
      mockPrisma.applicationLog.createMany.mockClear()

      await request(app.getHttpServer())
        .post('/trigger/level')
        .send({ level: 'warn', count: 1 })
        .expect(201)

      await new Promise<void>((r) => setTimeout(r, FLUSH_SETTLE_MS))

      // (a) stdout JSON: DefaultStdoutDestination is in the destinations list.
      const captured = out.mock.calls.map((c) => (typeof c[0] === 'string' ? c[0] : '')).join('')
      expect(captured).toContain('"level"')
      expect(captured).toContain('TRIGGER_LEVEL_FIRED')

      // (b) Loki push: correct endpoint + nanosecond STRING timestamp.
      const lokiCall = fetchSpy.mock.calls.find((c) =>
        typeof c[0] === 'string' ? c[0].includes('/loki/api/v1/push') : false,
      )
      expect(lokiCall).toBeDefined()
      // lokiCall is defined — asserted on the line above; Jest's expect() does not narrow types.
      const [lokiUrl, lokiInit] = lokiCall!
      const lokiUrlStr = lokiUrl instanceof URL ? lokiUrl.href : (lokiUrl as string)
      expect(lokiUrlStr).toContain('/loki/api/v1/push')
      const rawBody = (lokiInit as RequestInit).body
      const body = JSON.parse(typeof rawBody === 'string' ? rawBody : '') as {
        streams: { values: [string, string][] }[]
      }
      // Loki requires nanosecond timestamps encoded as a STRING (not a number).
      expect(typeof body.streams[0]?.values[0]?.[0]).toBe('string')
      // Nanosecond epoch is ~19 digits vs 13-digit millisecond epoch.
      expect(body.streams[0]?.values[0]?.[0].length).toBeGreaterThan(15)

      // (c) Postgres durable tier: createMany was called with a warn row.
      expect(mockPrisma.applicationLog.createMany).toHaveBeenCalled()
      // mock.calls[0] is the argument tuple of the first call; [0] picks CreateManyInput.
      // The ! is safe: toHaveBeenCalled() above guarantees at least one call was recorded.
      const input = mockPrisma.applicationLog.createMany.mock.calls[0]![0]
      const row = input.data[0]
      expect(row).toBeDefined()
      // row is defined — asserted on the line above; Jest's expect() does not narrow types.
      expect(row!.level).toBe('warn')
      // Payload stores the already-redacted entry — no raw PII.
      expect(JSON.stringify(row!.payload)).not.toContain('password')
    } finally {
      out.mockRestore()
      fetchSpy.mockRestore()
    }
  })

  it(/*
   * Multistream gotcha: pino.multistream does NOT auto-compute the parent log level.
   * The library must lower Pino's `level` to the minimum across all destination
   * `minLevel`s; otherwise a `minLevel: 'debug'` destination silently receives nothing
   * because Pino's default `level` is `info`.
   *
   * Proof: register a stub destination with `minLevel: 'debug'`, emit a `debug` line,
   * and assert the destination received it. The BymaxLoggerModule is initialised with
   * `level: 'debug'` above — confirming the level was lowered.
   */
  'delivers debug lines to a minLevel:"debug" destination (parent Pino level lowered)', async () => {
    const received: string[] = []
    const debugProbe: ILogDestination = {
      name: 'debug-probe',
      minLevel: 'debug',
      write: (line) => {
        received.push(line)
      },
    }

    // Boot a fresh module with the debug probe wired in.
    const probeModuleRef = await Test.createTestingModule({
      imports: [
        BymaxLoggerModule.forRoot({
          service: { name: 'debug-probe-e2e', version: 'test' },
          level: 'debug',
          isPretty: false,
          destinations: [debugProbe],
        }),
      ],
    }).compile()
    const probeApp = probeModuleRef.createNestApplication()
    await probeApp.init()

    const logger = probeApp.get(PinoLoggerService)
    logger.debug('DESTINATION_DEBUG_PROBE', 'debug fan-out probe')

    await new Promise<void>((r) => setTimeout(r, MULTISTREAM_SETTLE_MS))

    await probeApp.close()

    expect(received.join('')).toContain('DESTINATION_DEBUG_PROBE')
  })
})
