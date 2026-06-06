/**
 * Logs SSE live-tail end-to-end verification (`GET /logs/stream`).
 *
 * Boots a minimal NestJS module wiring the real `LogsSseController` and
 * `LogEventBus` (plus the `LogsService` codec the bus depends on). `PrismaService`
 * is mocked so the replay path needs no database, and no Loki dependency is pulled
 * in. The test opens the SSE stream over HTTP, publishes one NDJSON line through
 * the in-process `LogEventBus`, and asserts the live frame is delivered.
 *
 * What this proves:
 *   - A fresh connection (no `Last-Event-ID`) skips replay and still receives live
 *     entries the moment they are published.
 *   - `LogEventBus.publish(line)` parses the NDJSON line, enriches it, emits it on
 *     the `'log'` event, and the controller's `live$` maps it to an SSE `data:` frame
 *     carrying the original `logKey` / `requestId`.
 *
 * Technique: supertest is driven with `.buffer(false)` + a custom `.parse` so the
 * raw chunked response is read incrementally. The request is always aborted in a
 * `finally` block and the suite waits for settle, so the open stream never hangs the
 * test runner. Timeouts are generous but strictly bounded.
 */
import type { INestApplication } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
// In Jest ESM mode, `jest` must be explicitly imported from '@jest/globals'.
import { jest } from '@jest/globals'
import request from 'supertest'

import { PrismaService } from '../src/prisma/prisma.service.js'
import { LogsService } from '../src/logs/logs.service.js'
import { LogEventBus } from '../src/logs/log-event.bus.js'
import { LogsSseController } from '../src/logs/logs.sse.controller.js'

/** Max time to wait for the live SSE frame before failing the assertion. */
const FRAME_TIMEOUT_MS = 5_000

/** Resolve after `ms` milliseconds without blocking the event loop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Shape of the Prisma double — the replay path is never hit, so a no-op suffices. */
interface PrismaMock {
  applicationLog: {
    findMany: jest.Mock<(args: unknown) => Promise<unknown[]>>
  }
}

// Stand-in PrismaService provider so the token is resolvable inside this isolated
// module (the real one lives in the global PrismaModule, not imported here). The
// concrete mock is injected at compile time via `.overrideProvider(...).useValue(...)`.
const PRISMA_PLACEHOLDER = { provide: PrismaService, useValue: {} }

// Minimal test module: the SSE controller and the in-process event bus only. No
// Loki client / ConfigService is wired, so the boot stays hermetic and DB-free.
@Module({
  controllers: [LogsSseController],
  providers: [PRISMA_PLACEHOLDER, LogsService, LogEventBus],
})
class LogsSseTestModule {}

describe('Logs SSE live-tail (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaMock

  beforeAll(async () => {
    prisma = {
      applicationLog: {
        // Replay is only consulted when a Last-Event-ID header is present; the live
        // test never sends one, so this default is never reached — but it keeps the
        // provider total and DB-free.
        findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      },
    }

    const moduleRef = await Test.createTestingModule({
      imports: [LogsSseTestModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  // ─── GET /logs/stream — live fan-out ────────────────────────────────────────

  it('GET /logs/stream delivers a live data: frame for an entry published on the bus', async () => {
    /**
     * Scenario: open the stream (as admin so no tenant restriction filters the
     * entry), wait for the subscription to attach, then publish one NDJSON line via
     * `LogEventBus.publish`. Contract: a single `data:` SSE frame arrives within the
     * bounded timeout and its JSON payload carries the published `logKey` and
     * `requestId` — proving the publish → emit → live$ → SSE pipeline end to end.
     */
    const server = app.getHttpServer()
    let received = ''

    // Drive supertest in streaming mode: do not buffer, accumulate raw chunks.
    const req = request(server)
      .get('/logs/stream')
      // Admin role → empty RBAC restriction, so the live filter does not drop the entry.
      .set('x-role', 'admin')
      .buffer(false)
      // Treat any HTTP status (including the aborted stream) as non-failing so the
      // forced abort never throws an assertion error out of supertest.
      .ok(() => true)
      .parse((res, callback) => {
        res.on('data', (chunk: Buffer) => {
          received += chunk.toString('utf8')
        })
        res.on('end', () => callback(null, received))
        // Aborting an open SSE stream surfaces as ECONNRESET on the response; swallow
        // it so it is not re-emitted as an unhandled error event by superagent.
        res.on('error', () => callback(null, received))
      })

    // Absorb the abort-driven error event on BOTH the request and the eventual
    // response: forcing `abort()` on an open SSE stream emits 'error' (ECONNRESET)
    // on the superagent Response instance, which would otherwise crash the process
    // as an unhandled 'error' event after the test resolves.
    req.on('error', () => undefined)
    req.on('response', (res: { on: (event: string, cb: () => void) => void }) => {
      res.on('error', () => undefined)
    })

    // Fire the request without awaiting — it stays open until aborted.
    const pending = req.then(
      () => undefined,
      () => undefined,
    )

    const isoTime = new Date('2024-06-01T12:00:00.000Z').toISOString()
    const line = JSON.stringify({
      level: 30,
      logKey: 'TRIGGER_LEVEL_INFO',
      requestId: 'r_sse_1',
      time: isoTime,
    })

    try {
      // Republish on each poll tick until the frame is observed: a fresh SSE
      // subscription may not have attached to the bus when the first publish fires
      // (EventEmitter does not buffer past emits), so re-emitting guarantees at least
      // one delivery once the subscription is live — without coupling to bus internals.
      const bus = app.get(LogEventBus)
      const deadline = Date.now() + FRAME_TIMEOUT_MS
      while (!received.includes('TRIGGER_LEVEL_INFO') && Date.now() < deadline) {
        bus.publish(line)
        await delay(25)
      }
    } finally {
      // Always abort so the open stream cannot hang the runner, then await settle.
      req.abort()
      await pending
    }

    expect(received).toContain('data:')
    expect(received).toContain('TRIGGER_LEVEL_INFO')
    expect(received).toContain('r_sse_1')
  })
})
