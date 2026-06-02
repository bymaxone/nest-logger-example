/**
 * Cross-service trace correlation.
 *
 * Proves that one dispatched request produces log lines from BOTH `apps/api` and
 * `apps/worker` that share a single `traceId` — the automated stand-in for
 * "interleaved api + worker logs joined on one traceId in Grafana Explore".
 *
 * Architecture:
 *   - Both services run in-process as separate NestJS test apps (no child process
 *     or Docker required).
 *   - A shared minimal NodeSDK is started so both apps use a real tracer. The api side
 *     starts a span via `startActiveSpan` and injects `traceparent` via
 *     `propagation.inject`; the worker side extracts and activates the span context via
 *     `runWithExtractedContext` before logging.
 *   - Both services share the same process-level ALS so the extracted context on the
 *     worker side is the SAME span the api started.
 *
 * Tests in this file:
 *   - api camelCase `traceId` equals worker snake_case `trace_id` — one trace spans the hop.
 *   - Lines for that traceId span both services — they are correlatable by a single value.
 */
import type { INestApplication } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, PinoLoggerService } from '@bymax-one/nest-logger'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { context, propagation, trace } from '@opentelemetry/api'
import { jest } from '@jest/globals'

import { AppModule as WorkerAppModule } from '../../worker/src/app.module.js'
import { TasksService } from '../../worker/src/tasks/tasks.service.js'
import { runWithExtractedContext } from '../../worker/src/tasks/trace-extract.util.js'

// ─── Api minimal test module ──────────────────────────────────────────────────

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'api-cross-e2e', version: 'test' },
      isPretty: false,
      level: 'info',
      isGlobal: true,
      shouldUseAsNestLogger: false,
      otel: { shouldAutoInjectTraceContext: true, fieldFormat: 'camelCase' },
    }),
  ],
})
class ApiModule {}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseLines(writes: string[]): Record<string, unknown>[] {
  return writes
    .map((w) => {
      try {
        return JSON.parse(w) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .filter((l): l is Record<string, unknown> => l !== null)
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Cross-service trace correlation (e2e)', () => {
  let apiApp: INestApplication
  let workerApp: INestApplication
  let sdk: NodeSDK
  let ctxManager: AsyncLocalStorageContextManager

  beforeAll(async () => {
    ctxManager = new AsyncLocalStorageContextManager()
    ctxManager.enable()
    context.setGlobalContextManager(ctxManager)
    propagation.setGlobalPropagator(new W3CTraceContextPropagator())

    const exporter = new InMemorySpanExporter()
    sdk = new NodeSDK({
      traceExporter: exporter,
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })
    sdk.start()

    const apiRef = await Test.createTestingModule({ imports: [ApiModule] }).compile()
    apiApp = apiRef.createNestApplication()
    await apiApp.init()

    const workerRef = await Test.createTestingModule({ imports: [WorkerAppModule] }).compile()
    workerApp = workerRef.createNestApplication()
    await workerApp.init()
  })

  afterAll(async () => {
    await apiApp.close()
    await workerApp.close()
    await sdk.shutdown()
    ctxManager.disable()
  })

  // ─── api traceId equals worker trace_id — correlatable across services ──────

  /**
   * AC1: The api's camelCase `traceId` equals the worker's snake_case `trace_id` —
   *      one trace spans the api→worker hop.
   * AC2: Lines for that traceId include at least one api line + one worker line
   *      (correlatable across services by a single value).
   */
  it('api traceId equals worker trace_id — one trace spans the api→worker hop', () => {
    const apiLogger = apiApp.get(PinoLoggerService)
    const tasksService = workerApp.get(TasksService)

    const apiWrites: string[] = []
    const workerWrites: string[] = []

    let apiTraceId = ''

    // Start an api-side span, log from api, then inject the traceparent for the worker.
    trace.getTracer('cross-service-test').startActiveSpan('cross-test-span', (span) => {
      apiTraceId = span.spanContext().traceId
      try {
        const apiSpy = jest.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
          apiWrites.push(String(c))
          return true
        })
        apiLogger.info('DOWNSTREAM_DISPATCH_START', 'api cross-service test log')
        apiSpy.mockRestore()

        // Inject the current span context into a carrier (simulates propagation.inject in the service).
        const headers: Record<string, string> = {}
        propagation.inject(context.active(), headers)

        // Worker extracts the traceparent and logs inside the same trace.
        const workerSpy = jest.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
          workerWrites.push(String(c))
          return true
        })
        runWithExtractedContext(headers, () => {
          tasksService.process()
        })
        workerSpy.mockRestore()
      } finally {
        span.end()
      }
    })

    const apiLines = parseLines(apiWrites).filter((l) => typeof l['traceId'] === 'string')
    const workerLines = parseLines(workerWrites).filter((l) => typeof l['trace_id'] === 'string')

    // AC1: api and worker share the same underlying trace value.
    expect(apiLines.length).toBeGreaterThan(0)
    expect(workerLines.length).toBeGreaterThan(0)

    const apiTrace = apiLines[0]!['traceId'] as string
    const workerTrace = workerLines[0]!['trace_id'] as string

    expect(apiTrace).toBe(apiTraceId) // api line carries the span's traceId
    expect(workerTrace).toBe(apiTraceId) // worker line carries the SAME traceId (extracted from traceparent)
    expect(workerTrace).toBe(apiTrace) // camelCase ↔ snake_case, one value

    // AC2: correlatable across services — both services' lines present for this traceId.
    const allLinesForTrace = [
      ...apiLines.filter((l) => l['traceId'] === apiTraceId),
      ...workerLines.filter((l) => l['trace_id'] === apiTraceId),
    ]
    expect(allLinesForTrace.length).toBeGreaterThanOrEqual(2)
  })
})
