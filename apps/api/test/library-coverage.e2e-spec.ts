/**
 * Library-coverage end-to-end gate.
 *
 * Closes the runtime-demonstration gaps the structured suites leave open, asserting
 * the BEHAVIOUR (not just the config) of:
 *   - `logger.fatal()` (level 60 — the library's required-not-optional differentiator)
 *     and `logger.verbose()` (mapped to Pino `trace`) reaching a sink;
 *   - the HTTP interceptor's SERVER_ERROR (5xx) and REDIRECT (3xx) branches, plus the
 *     exception filter's UNHANDLED (5xx) branch;
 *   - `http.excludePaths` actually SUPPRESSING `HTTP_REQUEST_*` at runtime;
 *   - request-id GENERATION when the header is absent, wired via the library's
 *     `applyRequestIdMiddleware()` helper, exposed on the `X-Request-Id` response header
 *     and propagated into every log line via the ALS scope.
 *
 * Technique mirrors `demo-domain.e2e-spec.ts`: `jest.spyOn(process.stdout, 'write')`
 * captures the pino NDJSON for one request, then assertions inspect the captured output.
 */
import type { INestApplication, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { Controller, Get, Module, Res } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  applyRequestIdMiddleware,
  BymaxLoggerModule,
  HttpExceptionFilter,
} from '@bymax-one/nest-logger'
import { jest } from '@jest/globals'
import type { Response } from 'express'
import request from 'supertest'

import { TriggerModule } from '../src/trigger/trigger.module.js'

/** Inline probe controller: an excluded health route and a non-throwing 3xx redirect. */
@Controller()
class ProbeController {
  /** Excluded by `http.excludePaths` — used to prove the interceptor emits nothing. */
  @Get('health')
  health(): { ok: boolean } {
    return { ok: true }
  }

  /** Non-throwing 3xx so the interceptor logs `HTTP_REQUEST_REDIRECT` (not via the error path). */
  @Get('redirect')
  redirect(@Res({ passthrough: true }) res: Response): { redirected: boolean } {
    res.status(302)
    return { redirected: true }
  }
}

/**
 * Test module exercising the full HTTP logging surface: `level: 'trace'` so `verbose`
 * (Pino trace) and `fatal` are emitted; `shouldGenerateRequestId: true` + the
 * `applyRequestIdMiddleware()` helper so a header-less request gets a minted id;
 * `excludePaths` excludes `/health`; the catch-all filter is registered to exercise
 * the UNHANDLED branch.
 */
@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'api-libcov-e2e', version: 'test' },
      isPretty: false, // force NDJSON so the stdout spy captures parseable JSON
      level: 'trace', // low enough to emit verbose (trace) and fatal lines
      isGlobal: true,
      shouldUseAsNestLogger: false,
      http: {
        isEnabled: true,
        shouldCaptureExceptions: false, // filter registered manually below
        shouldGenerateRequestId: true,
        tenantIdHeader: 'x-tenant-id',
        excludePaths: [/^\/health$/],
      },
    }),
    TriggerModule,
  ],
  controllers: [ProbeController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
class LibCoverageModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Demonstrate the library's one-liner middleware helper (vs. consumer.apply(...)).
    applyRequestIdMiddleware(consumer)
  }
}

/** Capture every `stdout.write` during `fn` and return the joined output. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = []
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    chunks.push(String(data))
    return true
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return chunks.join('')
}

describe('Library coverage (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [LibCoverageModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('emits a fatal log (level 60) through a sink when level "fatal" is fired', async () => {
    /**
     * Scenario: POST /trigger/level {level:'fatal'}.
     * Contract: the library's required-not-optional `fatal()` produces a line at the
     * `fatal` level carrying the fatal message — proving level 60 is natively supported
     * and reaches a destination, not merely that the method exists.
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer())
        .post('/trigger/level')
        .send({ level: 'fatal', count: 1 })
        .expect(201)
    })

    expect(out).toContain('Triggered fatal log')
    expect(out).toMatch(/"level":"fatal"/)
  })

  it('emits a verbose log (Pino trace) when level "verbose" is fired', async () => {
    /**
     * Scenario: POST /trigger/level {level:'verbose'}.
     * Contract: `verbose()` maps to Pino `trace`; with `level: 'trace'` the line is
     * emitted carrying the verbose message at the `trace` level.
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer())
        .post('/trigger/level')
        .send({ level: 'verbose', count: 1 })
        .expect(201)
    })

    expect(out).toContain('Triggered verbose log')
    expect(out).toMatch(/"level":"trace"/)
  })

  it('logs SERVER_ERROR (interceptor) and UNHANDLED (filter) for a 5xx', async () => {
    /**
     * Scenario: GET /trigger/status/503 — a thrown 5xx HttpException.
     * Contract: the interceptor's 5xx branch emits `HTTP_REQUEST_SERVER_ERROR` (error
     * level) and the catch-all `HttpExceptionFilter` emits `HTTP_EXCEPTION_UNHANDLED` —
     * the previously-untested error half of HTTP logging.
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer()).get('/trigger/status/503').expect(503)
    })

    expect(out).toContain('HTTP_REQUEST_SERVER_ERROR')
    expect(out).toContain('HTTP_EXCEPTION_UNHANDLED')
  })

  it('logs REDIRECT for a non-throwing 3xx response', async () => {
    /**
     * Scenario: GET /redirect returns 302 without throwing.
     * Contract: the interceptor's non-throwing completion path logs
     * `HTTP_REQUEST_REDIRECT` for a 3xx (distinct from the 2xx SUCCESS branch).
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer()).get('/redirect').expect(302)
    })

    expect(out).toContain('HTTP_REQUEST_REDIRECT')
  })

  it('suppresses HTTP_REQUEST_* logging for an excluded path', async () => {
    /**
     * Scenario: GET /health, which matches `excludePaths: [/^\/health$/]`.
     * Contract: the interceptor bypasses the request entirely — NO `HTTP_REQUEST_*`
     * entry is emitted — proving excludePaths suppresses at runtime, not just in config.
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer()).get('/health').expect(200)
    })

    expect(out).not.toContain('HTTP_REQUEST_')
  })

  it('does emit HTTP_REQUEST_* for a NON-excluded path (control)', async () => {
    /**
     * Scenario: GET /redirect, which is NOT excluded.
     * Contract: a non-excluded path DOES emit `HTTP_REQUEST_START`, proving the
     * suppression above is path-specific rather than logging being globally off.
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer()).get('/redirect').expect(302)
    })

    expect(out).toContain('HTTP_REQUEST_START')
  })

  it('generates a request id when the header is absent and propagates it everywhere', async () => {
    /**
     * Scenario: POST /trigger/level with NO `x-request-id` header.
     * Contract: `applyRequestIdMiddleware()` mints a correlation id, exposes it on the
     * `X-Request-Id` response header, AND injects it (via the ALS scope) into the log
     * lines — asserted as a keyed `"requestId":"<minted>"` field, not a loose substring.
     */
    let mintedId: string | undefined
    const out = await captureStdout(async () => {
      const res = await request(app.getHttpServer())
        .post('/trigger/level')
        .send({ level: 'info', count: 1 })
        .expect(201)
      mintedId = res.headers['x-request-id']
    })

    expect(mintedId).toMatch(/[0-9a-f-]{8,}/i)
    expect(out).toContain(`"requestId":"${mintedId}"`)
  })
})
