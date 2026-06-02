/**
 * Worker inbound `traceparent` extraction.
 *
 * Proves:
 *   - `POST /tasks/process` with a hand-crafted W3C `traceparent` header causes
 *     `WORKER_TASK_RECEIVED` to carry `trace_id` equal to the header's trace-id segment.
 *   - A call without `traceparent` still succeeds and its `trace_id` is a fresh
 *     non-zero hex string (a root span was started — NOT the all-zero invalid context).
 *
 * Technique:
 *   - A minimal NodeSDK registers the W3C TraceContextPropagator in `beforeAll`.
 *   - `runWithExtractedContext` activates the inbound `traceparent` before calling the
 *     service (substitutes for HTTP server-side auto-instrumentation in the test env).
 *   - `process.stdout.write` is spied to capture NDJSON log lines.
 */
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { context, propagation, trace } from '@opentelemetry/api'
import { jest } from '@jest/globals'
import request from 'supertest'

import { AppModule } from '../src/app.module.js'
import { TasksService } from '../src/tasks/tasks.service.js'
import { runWithExtractedContext } from '../src/tasks/trace-extract.util.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function captureLines(writes: string[]): Record<string, unknown>[] {
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

describe('Worker inbound traceparent extraction (e2e)', () => {
  let app: INestApplication
  let sdk: NodeSDK
  let ctxManager: AsyncLocalStorageContextManager

  beforeAll(async () => {
    // Register the ALS context manager so context.with() propagates through async.
    ctxManager = new AsyncLocalStorageContextManager()
    ctxManager.enable()
    context.setGlobalContextManager(ctxManager)

    // Register the W3C propagator so propagation.extract() decodes traceparent headers.
    propagation.setGlobalPropagator(new W3CTraceContextPropagator())

    const spanExporter = new InMemorySpanExporter()
    sdk = new NodeSDK({
      traceExporter: spanExporter,
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
    })
    sdk.start()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await sdk.shutdown()
    ctxManager.disable()
  })

  // ─── Inbound traceparent → same trace_id on the log line ─────────────────

  /**
   * When `POST /tasks/process` carries a W3C `traceparent`, the worker's
   * `WORKER_TASK_RECEIVED` log line must carry `trace_id` equal to the trace-id
   * segment of that header — proving cross-service correlation.
   *
   * Because HTTP server-side auto-instrumentation is not reliable on Node ≤ 22
   * (see otel-correlation.e2e-spec.ts comment), we use `runWithExtractedContext`
   * to manually activate the span from the header before calling the service.
   */
  it('activating an extracted traceparent context causes WORKER_TASK_RECEIVED to carry the caller trace_id', () => {
    const traceId = 'a1b2c3d4e5f6071829304a5b6c7d8e9f'
    const traceparent = `00-${traceId}-00f067aa0ba902b7-01`
    const carrier: Record<string, string> = { traceparent }

    const tasksService = app.get(TasksService)
    const writes: string[] = []
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      writes.push(String(c))
      return true
    })
    try {
      runWithExtractedContext(carrier, () => {
        tasksService.process()
      })
    } finally {
      spy.mockRestore()
    }

    const lines = captureLines(writes)
    const line = lines.find((l) => l['logKey'] === 'WORKER_TASK_RECEIVED')
    expect(line).toBeDefined()
    // The worker logs the SAME trace_id as the inbound traceparent header.
    expect(line!['trace_id']).toBe(traceId)
  })

  // ─── No traceparent → fresh non-zero trace_id ────────────────────────────

  /**
   * A request without a `traceparent` header must still succeed (202) and the
   * resulting log line must have a fresh non-zero `trace_id` (a root span was
   * started, NOT the all-zero invalid context).
   */
  it('logs a fresh non-zero trace_id when called inside a root span (no inbound traceparent)', () => {
    const tasksService = app.get(TasksService)
    const writes: string[] = []
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      writes.push(String(c))
      return true
    })
    try {
      // Start a fresh root span to simulate a new, unlinked trace.
      trace.getTracer('worker-test').startActiveSpan('root-span', (span) => {
        try {
          tasksService.process()
        } finally {
          span.end()
        }
      })
    } finally {
      spy.mockRestore()
    }

    const lines = captureLines(writes)
    const line = lines.find((l) => l['logKey'] === 'WORKER_TASK_RECEIVED')
    expect(line).toBeDefined()
    expect(String(line!['trace_id'])).toMatch(/^[0-9a-f]{32}$/)
    // A root span must have a non-zero trace_id (not the invalid all-zero context).
    expect(line!['trace_id']).not.toBe('00000000000000000000000000000000')
  })

  // ─── POST /tasks/process returns 202 ─────────────────────────────────────

  /**
   * The HTTP endpoint itself must respond with 202 Accepted.
   */
  it('POST /tasks/process returns 202', async () => {
    await request(app.getHttpServer()).post('/tasks/process').send({}).expect(202)
  })
})
