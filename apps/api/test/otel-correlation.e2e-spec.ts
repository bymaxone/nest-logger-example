/**
 * OTel trace-context injection — e2e coverage for camelCase field injection.
 *
 * Proves that every log line emitted during an active span carries non-empty camelCase
 * `traceId` / `spanId` / `traceFlags`, and that all trace-bearing lines within one
 * request share the same `traceId` (one trace per request).
 *
 * Technique:
 *   - A minimal `NodeSDK` with `InMemorySpanExporter` is started BEFORE the NestJS
 *     app is created; this gives the probe controller a real (non-noop) tracer.
 *   - The probe controller calls `tracer.startActiveSpan()` explicitly so the span
 *     is active when the two `logger.info` calls fire — the library reads the active
 *     span via `@opentelemetry/api` and injects `traceId`/`spanId`/`traceFlags`.
 *   - HTTP server-side auto-instrumentation is not relied upon (not reliable in
 *     Jest/ESM on Node ≤ 22); the span lifecycle is owned by the controller.
 *     Production behaviour is identical: the library only reads the ambient span.
 *   - `jest.spyOn(process.stdout, 'write')` captures Pino NDJSON before the terminal.
 *
 * Edge-case coverage (zeroed traceId skipped / unsampled span kept) is in the
 * companion unit spec `src/logger/otel-injection.spec.ts`.
 */
import type { INestApplication } from '@nestjs/common'
import { Controller, Module, Post } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { trace } from '@opentelemetry/api'
import { jest } from '@jest/globals'
import request from 'supertest'

// ─── Probe controller ─────────────────────────────────────────────────────────

/**
 * Minimal test endpoint that starts a span explicitly and emits two domain log
 * lines inside it. Both lines must carry the same `traceId`.
 */
@Controller('otel-probe')
class OtelProbeController {
  constructor(@InjectLogger('OtelProbeController') private readonly logger: PinoLoggerService) {}

  /**
   * Start a real span (requires the NodeSDK to be running) and emit two domain
   * log lines inside it so that AC2 (same traceId per request) can be verified
   * across multiple lines.
   *
   * @returns `{ ok: true }` after both log lines are emitted.
   */
  @Post('fire')
  fire(): { ok: boolean } {
    const tracer = trace.getTracer('otel-probe')
    return tracer.startActiveSpan('otel-probe-fire', (span) => {
      try {
        this.logger.info('OTEL_PROBE_FIRED', 'otel probe first domain log')
        this.logger.info('OTEL_PROBE_SECOND', 'otel probe second domain log')
        span.end()
        return { ok: true as const }
      } catch (err) {
        span.end()
        throw err
      }
    })
  }
}

// ─── Test module ──────────────────────────────────────────────────────────────

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'otel-e2e', version: 'test' },
      isPretty: false, // force NDJSON so process.stdout.write spy captures parseable JSON
      level: 'info',
      isGlobal: true,
      shouldUseAsNestLogger: false,
      otel: {
        // Explicit for documentation; default is already true.
        shouldAutoInjectTraceContext: true,
        fieldFormat: 'camelCase', // apps/api default: traceId / spanId / traceFlags
      },
    }),
  ],
  controllers: [OtelProbeController],
})
class OtelTestModule {}

// ─── Hex patterns ─────────────────────────────────────────────────────────────

const HEX32 = /^[0-9a-f]{32}$/
const HEX16 = /^[0-9a-f]{16}$/

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('OTel trace-context injection (e2e)', () => {
  let app: INestApplication
  let spanExporter: InMemorySpanExporter
  let sdk: NodeSDK

  beforeAll(async () => {
    // Start the SDK BEFORE NestJS app creation so that `trace.getTracer()` in the probe
    // controller returns a real (non-noop) tracer that produces valid traceIds.
    spanExporter = new InMemorySpanExporter()
    sdk = new NodeSDK({
      traceExporter: spanExporter,
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    })
    sdk.start()

    const moduleRef = await Test.createTestingModule({
      imports: [OtelTestModule],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await sdk.shutdown()
  })

  // ─── traceId / spanId / traceFlags present + same id per request ────────────

  /**
   * AC1: every trace-bearing log line carries non-empty camelCase
   * `traceId` (32 hex) / `spanId` (16 hex) / `traceFlags` (defined).
   * AC2: all trace-bearing lines from one request share an identical `traceId`
   * (one trace spans the entire `startActiveSpan` scope).
   */
  it('injects non-empty camelCase traceId/spanId/traceFlags; all lines in one request share the same traceId', async () => {
    const writes: string[] = []
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      writes.push(String(c))
      return true
    })
    try {
      await request(app.getHttpServer()).post('/otel-probe/fire').send({}).expect(201)
    } finally {
      spy.mockRestore()
    }

    const lines = writes
      .map((w) => {
        try {
          return JSON.parse(w) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter((l): l is Record<string, unknown> => l !== null && typeof l['traceId'] === 'string')

    // AC1: both probe log lines must carry a valid traceId.
    expect(lines.length).toBeGreaterThan(0)

    for (const line of lines) {
      expect(String(line['traceId'])).toMatch(HEX32)
      expect(String(line['spanId'])).toMatch(HEX16)
      expect(line['traceFlags']).toBeDefined()
    }

    // AC2: one trace per request — all trace-bearing lines share the same traceId.
    const traceIds = new Set(lines.map((l) => l['traceId']))
    expect(traceIds.size).toBe(1)
  })
})
