/**
 * Fail-soft proof: bad `LOKI_URL` → `LOGGER_DESTINATION_WRITE_FAILED`, app continues serving.
 *
 * Proves the end-to-end fail-soft contract: when `LokiDestination` is pointed at an
 * unreachable host, a flush failure writes `LOGGER_DESTINATION_WRITE_FAILED` with
 * `"destination":"loki"` to `process.stderr` — NEVER through the logger (no recursion),
 * NEVER thrown — and the app continues serving every subsequent request.
 *
 * Technique:
 *   - `LokiDestination` is configured with `url: 'http://127.0.0.1:1/...'` (port 1:
 *     connection-refused on all platforms) and `batchSize: 1` so each log line
 *     triggers an immediate flush attempt.
 *   - `jest.spyOn(process.stderr, 'write')` captures the fail-soft signal.
 *   - `POST /trigger/fault/loki` fires a `TRIGGER_FAULT_REQUESTED` warn log → the
 *     Loki destination receives it → flushes → fails → writes to stderr.
 *   - A follow-up `GET /health` proves the app is still serving.
 *
 * Reference: `OVERVIEW.md` §11 (fail-soft rules), §12 (LokiDestination contract),
 * §15 Journey 8.
 */
import type { INestApplication, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, RequestIdMiddleware } from '@bymax-one/nest-logger'
import { jest } from '@jest/globals'
import request from 'supertest'

import { LokiDestination } from '../src/destinations/loki.destination.js'
import { HealthModule } from '../src/health/health.module.js'
import { TriggerModule } from '../src/trigger/trigger.module.js'

// Port 1 is reserved and always connection-refused — reliably unreachable on all platforms.
const BAD_LOKI_URL = 'http://127.0.0.1:1/loki/api/v1/push'
// Allow the async flush chain (fetch → catch → stderr.write) to settle before asserting.
const FLUSH_SETTLE_MS = 100

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'fail-soft-e2e', version: 'test' },
      level: 'info',
      isPretty: false,
      isGlobal: true,
      destinations: [
        new LokiDestination({
          url: BAD_LOKI_URL,
          // batchSize: 1 triggers an immediate flush for every log line received.
          batchSize: 1,
          // Large timer so the interval never fires mid-test and interferes.
          flushIntervalMs: 60_000,
        }),
      ],
    }),
    HealthModule,
    TriggerModule,
  ],
})
class FailSoftTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}

describe('Destination fail-soft — bad Loki URL', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FailSoftTestModule],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it(/*
   * When the Loki push endpoint is unreachable, a flush failure MUST emit
   * LOGGER_DESTINATION_WRITE_FAILED to process.stderr — never to the logger
   * (that would create an infinite logging loop). The app must keep serving.
   */
  'emits LOGGER_DESTINATION_WRITE_FAILED to stderr on a bad Loki URL and keeps serving', async () => {
    const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      // Trigger a warn log via the Playground fault hook — the LokiDestination receives
      // it, flushes immediately (batchSize: 1), and the fetch to port 1 fails.
      await request(app.getHttpServer()).post('/trigger/fault/loki').expect(201)

      await new Promise<void>((r) => setTimeout(r, FLUSH_SETTLE_MS))

      const stderr = errSpy.mock.calls.map((c) => String(c[0])).join('')
      expect(stderr).toContain('"logKey":"LOGGER_DESTINATION_WRITE_FAILED"')
      expect(stderr).toContain('"destination":"loki"')
    } finally {
      errSpy.mockRestore()
    }

    // The failure must NOT crash the process — a subsequent request still succeeds.
    await request(app.getHttpServer()).get('/health').expect(200)
  })
})
