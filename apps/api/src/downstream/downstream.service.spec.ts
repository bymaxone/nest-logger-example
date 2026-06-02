/**
 * DownstreamService — manual `propagation.inject` header-shape unit coverage.
 *
 * Proves the manual `propagation.inject` path builds a valid W3C `traceparent`
 * header matching `^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$` whose trace-id
 * segment equals the active span's `traceId`.
 *
 * Technique:
 *   - `BasicTracerProvider` + `W3CTraceContextPropagator` registered without the
 *     full NodeSDK so `propagation.inject` produces real W3C headers in tests.
 *   - `fetch` is mocked so the test never needs the worker running.
 */
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule } from '@bymax-one/nest-logger'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { context, propagation, trace } from '@opentelemetry/api'
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'

import { DownstreamService } from './downstream.service.js'

// ─── Hex patterns ─────────────────────────────────────────────────────────────

const W3C_TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/
const HEX32 = /^[0-9a-f]{32}$/

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('DownstreamService — manual propagation.inject (unit)', () => {
  let moduleRef: TestingModule
  let service: DownstreamService
  let tracerProvider: BasicTracerProvider
  let ctxManager: AsyncLocalStorageContextManager

  beforeAll(async () => {
    // Register a real ALS context manager, W3C propagator, and BasicTracerProvider
    // so that propagation.inject and startActiveSpan work without the full NodeSDK.
    ctxManager = new AsyncLocalStorageContextManager()
    ctxManager.enable()
    context.setGlobalContextManager(ctxManager)
    propagation.setGlobalPropagator(new W3CTraceContextPropagator())

    const exporter = new InMemorySpanExporter()
    tracerProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })
    trace.setGlobalTracerProvider(tracerProvider)

    moduleRef = await Test.createTestingModule({
      imports: [
        BymaxLoggerModule.forRoot({
          service: { name: 'downstream-spec', version: 'test' },
          isPretty: false,
          level: 'info',
          isGlobal: true,
          shouldUseAsNestLogger: false,
        }),
      ],
      providers: [DownstreamService],
    }).compile()

    service = moduleRef.get(DownstreamService)
  })

  afterAll(async () => {
    await moduleRef.close()
    await tracerProvider.shutdown()
    ctxManager.disable()
  })

  /**
   * `propagation.inject(context.active(), headers)` on the manual path must produce
   * a `traceparent` that matches `00-<32hex>-<16hex>-<2hex>` and whose trace-id
   * segment equals the active span's `traceId`. `fetch` is mocked — worker not required.
   */
  it('dispatchManual injects a valid W3C traceparent carrying the active span traceId', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))

    let activeTraceId = ''

    await trace.getTracer('downstream-spec').startActiveSpan('test-span', async (span) => {
      activeTraceId = span.spanContext().traceId
      try {
        await service.dispatchManual()
      } finally {
        span.end()
      }
    })

    // Inspect the headers the service passed to fetch.
    const callInit = fetchSpy.mock.calls[0]?.[1]
    const callHeaders = callInit?.headers as Record<string, string> | undefined
    expect(callHeaders).toBeDefined()
    expect(callHeaders!['traceparent']).toMatch(W3C_TRACEPARENT)

    // The trace-id segment (bytes 4–35, 1-based: chars [3..35)) must equal the active span's traceId.
    const injectedTraceId = callHeaders!['traceparent']!.slice(3, 35)
    expect(injectedTraceId).toMatch(HEX32)
    expect(injectedTraceId).toBe(activeTraceId)

    fetchSpy.mockRestore()
  })

  /**
   * `dispatchAuto` is fail-soft: when `fetch` rejects (worker unreachable) the service
   * must return `{ ok: false }` without throwing.
   */
  it('dispatchAuto returns { ok: false } when the worker is unreachable', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await service.dispatchAuto()
    expect(result).toEqual({ ok: false })

    fetchSpy.mockRestore()
  })
})
