/**
 * Worker bootstrap + snake_case OTel field format.
 *
 * Proves:
 *   - `apps/worker` boots cleanly and `GET /health` returns 200.
 *   - A log line emitted inside an active span carries `trace_id` / `span_id` /
 *     `trace_flags` (snake_case) — NOT the camelCase names used by `apps/api`.
 *
 * Technique:
 *   - A minimal NodeSDK is started in `beforeAll` to make `trace.getTracer()` return
 *     a real tracer. `TasksService` logs inside a manually-started span.
 *   - `jest.spyOn(process.stdout, 'write')` captures the Pino NDJSON output.
 */
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { trace } from '@opentelemetry/api'
import { jest } from '@jest/globals'
import request from 'supertest'

import { AppModule } from '../src/app.module.js'
import { TasksService } from '../src/tasks/tasks.service.js'

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Worker — bootstrap and snake_case OTel fields (e2e)', () => {
  let app: INestApplication
  let sdk: NodeSDK
  let spanExporter: InMemorySpanExporter

  beforeAll(async () => {
    spanExporter = new InMemorySpanExporter()
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
  })

  // ─── Health check ─────────────────────────────────────────────────────────

  /**
   * The worker must boot cleanly and respond to the standard readiness probe.
   */
  it('GET /health returns 200 { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  // ─── snake_case trace fields ──────────────────────────────────────────────

  /**
   * A log line emitted inside an active span must carry snake_case trace fields
   * (`trace_id` / `span_id` / `trace_flags`) and must NOT carry the camelCase
   * variants (`traceId` etc.) — the field-format contrast with `apps/api`.
   */
  it('emits snake_case trace_id/span_id/trace_flags (not camelCase) when a span is active', () => {
    const tasksService = app.get(TasksService)
    const writes: string[] = []
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      writes.push(String(c))
      return true
    })
    try {
      trace.getTracer('worker-test').startActiveSpan('worker-probe', (span) => {
        try {
          tasksService.process()
        } finally {
          span.end()
        }
      })
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
      .filter((l): l is Record<string, unknown> => l !== null && typeof l['trace_id'] === 'string')

    expect(lines.length).toBeGreaterThan(0)

    for (const line of lines) {
      // snake_case names must be present.
      expect(String(line['trace_id'])).toMatch(/^[0-9a-f]{32}$/)
      expect(String(line['span_id'])).toMatch(/^[0-9a-f]{16}$/)
      expect(line['trace_flags']).toBeDefined()
      // camelCase names must NOT be present (field-format contrast).
      expect(line).not.toHaveProperty('traceId')
    }
  })
})
