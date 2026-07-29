/**
 * Library-internals coverage gate — the advanced DI / context / serializer surface.
 *
 * Asserts the RUNTIME behaviour of capabilities the structured suites only reference as
 * symbols in `library-probe.ts`:
 *   - `LogContextService.run()` / `set()` / `get()` — manual ALS scope control and
 *     mid-request enrichment (vs. only `getStore()` being used elsewhere);
 *   - `@Inject(LOGGER_DESTINATIONS_TOKEN)` / `@Inject(LOGGER_PINO_INSTANCE_TOKEN)` — the
 *     advanced DI tokens used to introspect the active sinks and the raw Pino instance;
 *   - a custom `serializers.upstreamError` actually transforming a real log entry flowing
 *     through Pino into a sink (projecting only `{ status, code }`, dropping other fields).
 *
 * Technique mirrors the other e2e specs: capture `process.stdout.write` for one request.
 */
import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { Controller, Get, Inject, Injectable, Module, Post } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  applyRequestIdMiddleware,
  BymaxLoggerModule,
  InjectLogger,
  type ILogDestination,
  LOGGER_DESTINATIONS_TOKEN,
  LOGGER_PINO_INSTANCE_TOKEN,
  LogContextService,
  PinoLoggerService,
} from '@bymax-one/nest-logger'
import { jest } from '@jest/globals'
import type { Logger as PinoLogger } from 'pino'
import request from 'supertest'

/** Demonstrates manual ALS scope control via `LogContextService.run/set/get`. */
@Controller('ctx')
class CtxController {
  constructor(
    private readonly ctx: LogContextService,
    @InjectLogger(CtxController.name) private readonly logger: PinoLoggerService,
  ) {}

  /** Enrich the middleware-opened scope with `userId`, read it back, and log it. */
  @Post('enrich')
  enrich(): { readBack: string | undefined } {
    this.ctx.set('userId', 'u-42')
    const readBack = this.ctx.get<string>('userId')
    this.logger.info('PROBE_CTX_DONE', 'context enriched', undefined, { readBack })
    return { readBack }
  }

  /** Open a fresh scope with `run()` so the log inside inherits its correlation fields. */
  @Post('run')
  runScope(): { ok: boolean } {
    this.ctx.run({ requestId: 'r-run', tenantId: 't-run' }, () => {
      this.logger.info('PROBE_RUN_DONE', 'inside run scope', undefined, {})
    })
    return { ok: true }
  }
}

/** Introspects the active destinations + raw Pino instance via the advanced DI tokens. */
@Injectable()
class DestinationsProbe {
  constructor(
    @Inject(LOGGER_DESTINATIONS_TOKEN) private readonly destinations: readonly ILogDestination[],
    @Inject(LOGGER_PINO_INSTANCE_TOKEN) private readonly pino: PinoLogger,
  ) {}

  /** Names of every active destination (e.g. `stdout-json`). */
  names(): string[] {
    return this.destinations.map((d) => d.name)
  }

  /** Whether the injected raw Pino instance is usable. */
  hasPino(): boolean {
    return typeof this.pino.info === 'function'
  }
}

@Controller('diagnostics')
class DiagnosticsController {
  constructor(private readonly probe: DestinationsProbe) {}

  /** Report the active sink names and that the raw Pino instance resolved. */
  @Get('destinations')
  destinations(): { names: string[]; hasPino: boolean } {
    return { names: this.probe.names(), hasPino: this.probe.hasPino() }
  }
}

/** Demonstrates a custom `upstreamError` serializer projecting an error to `{ status, code }`. */
@Controller('serializer')
class SerializerController {
  constructor(
    @InjectLogger(SerializerController.name) private readonly logger: PinoLoggerService,
  ) {}

  /** Log an `upstreamError` field carrying extra keys the serializer must drop. */
  @Post('emit')
  emit(): { ok: boolean } {
    this.logger.warnStructured('PROBE_SER_DONE', 'upstream failed', undefined, {
      upstreamError: { status: 502, code: 'EUPSTREAM', secret: 'should-be-dropped' },
    })
    return { ok: true }
  }
}

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'api-internals-e2e', version: 'test' },
      isPretty: false,
      level: 'info',
      isGlobal: true,
      shouldUseAsNestLogger: false,
      // Project an upstream error to only its safe fields — the custom serializer under test.
      serializers: {
        upstreamError: (e) => {
          const err = e as { status?: number; code?: string }
          return { status: err.status, code: err.code }
        },
      },
    }),
  ],
  controllers: [CtxController, DiagnosticsController, SerializerController],
  providers: [DestinationsProbe],
})
class InternalsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Open the ALS scope per request so LogContextService.set() has a scope to write to.
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

describe('Library internals (e2e)', () => {
  let app: Awaited<ReturnType<typeof bootApp>>

  async function bootApp() {
    const moduleRef = await Test.createTestingModule({ imports: [InternalsModule] }).compile()
    const created = moduleRef.createNestApplication()
    await created.init()
    return created
  }

  beforeAll(async () => {
    app = await bootApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('enriches the active scope with LogContextService.set/get and injects it into logs', async () => {
    /**
     * Scenario: POST /ctx/enrich inside the middleware-opened ALS scope.
     * Contract: `set('userId','u-42')` writes to the active scope and `get('userId')` reads
     * the same value back (returned in the response AND carried into a log field) — proving
     * the consumer-facing set/get APIs (not just getStore()) work end to end within a scope.
     */
    let body: { readBack?: string } = {}
    const out = await captureStdout(async () => {
      const res = await request(app.getHttpServer()).post('/ctx/enrich').expect(201)
      body = res.body
    })

    expect(body.readBack).toBe('u-42')
    expect(out).toContain('"readBack":"u-42"')
  })

  it('runs a fresh scope with LogContextService.run() and propagates its fields', async () => {
    /**
     * Scenario: POST /ctx/run wraps a log in `run({ requestId:'r-run', tenantId:'t-run' })`.
     * Contract: the log emitted inside the callback inherits the scope's correlation fields,
     * proving manual scope creation via run().
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer()).post('/ctx/run').expect(201)
    })

    expect(out).toContain('PROBE_RUN_DONE')
    expect(out).toContain('"requestId":"r-run"')
    expect(out).toContain('"tenantId":"t-run"')
  })

  it('resolves the active destinations and raw Pino instance via the DI tokens', async () => {
    /**
     * Scenario: GET /diagnostics/destinations reads `LOGGER_DESTINATIONS_TOKEN` and
     * `LOGGER_PINO_INSTANCE_TOKEN` through a real injected provider.
     * Contract: the default stdout sink (`stdout-json`) is present in the active set and the
     * raw Pino instance is usable — proving the advanced DI tokens are injectable, not just
     * resolvable symbols.
     */
    const res = await request(app.getHttpServer()).get('/diagnostics/destinations').expect(200)

    expect(res.body.names).toContain('stdout-json')
    expect(res.body.hasPino).toBe(true)
  })

  it('applies the custom upstreamError serializer, projecting only status/code', async () => {
    /**
     * Scenario: POST /serializer/emit logs an `upstreamError` with an extra `secret` field.
     * Contract: the custom serializer transforms the real entry flowing through Pino,
     * keeping `status`/`code` and DROPPING `secret` — proving custom serializers run on the
     * live log path (not just as a unit-tested pure function).
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer()).post('/serializer/emit').expect(201)
    })

    expect(out).toContain('"status":502')
    expect(out).toContain('"code":"EUPSTREAM"')
    expect(out).not.toContain('should-be-dropped')
  })
})
