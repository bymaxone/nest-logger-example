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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals'
import type { PinoLoggerService } from '@bymax-one/nest-logger'

import { DownstreamService } from './downstream.service.js'

// ─── Logger mock factory ────────────────────────────────────────────────────
//
// The branch-level suite below constructs DownstreamService directly (the
// @InjectLogger/@LogContext decorators are metadata only — DI is not required),
// so each fetch outcome can be driven deterministically. Only the methods the
// service actually calls are stubbed: info() for the lifecycle logs and
// warnStructured() for the fail-soft degraded log.
function buildLoggerMock(): PinoLoggerService {
  return {
    info: jest.fn(),
    warnStructured: jest.fn(),
    setContext: jest.fn(),
  } as unknown as PinoLoggerService
}

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

// ─── Branch-level suite (direct construction, mocked logger + fetch) ──────────

describe('DownstreamService — fail-soft branches (unit)', () => {
  let logger: PinoLoggerService
  let service: DownstreamService
  let fetchSpy: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    logger = buildLoggerMock()
    service = new DownstreamService(logger)
    // propagation.inject must not throw even without an active span (it simply
    // injects no traceparent), so a real propagator setup is unnecessary here.
    fetchSpy = jest.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    jest.clearAllMocks()
  })

  /**
   * The constructor activates the recorded context label by calling
   * `setContext('DownstreamService')`. Protects the contract that the class
   * decorator's label is wired through `setContext` at construction time.
   */
  it('constructor calls logger.setContext with the class context name', () => {
    expect(logger.setContext).toHaveBeenCalledWith('DownstreamService')
  })

  /**
   * `dispatchAuto` happy path: a 2xx worker response returns `{ ok: true }` and
   * emits the START then SUCCESS lifecycle logs (the `res.ok === true` branch and
   * the non-degraded return). No degraded warn is emitted.
   */
  it('dispatchAuto returns { ok: true } and logs START + SUCCESS on a 2xx response', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }) as never)

    const result = await service.dispatchAuto()

    expect(result).toEqual({ ok: true })
    expect(logger.info).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_START',
      'Calling worker (auto-instrumented path)',
    )
    expect(logger.info).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_SUCCESS',
      'Worker accepted dispatch (auto path)',
    )
    expect(logger.warnStructured).not.toHaveBeenCalled()
  })

  /**
   * `dispatchAuto` non-2xx path: a non-ok response throws `Worker returned <status>`
   * internally (the `!res.ok` branch), is caught, and degrades to `{ ok: false }`
   * with the Error-message reason recorded in the structured warn meta.
   */
  it('dispatchAuto degrades to { ok: false } and logs the status reason on a non-2xx response', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 503 }) as never)

    const result = await service.dispatchAuto()

    expect(result).toEqual({ ok: false })
    expect(logger.warnStructured).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_DEGRADED',
      'Worker unreachable (auto path)',
      undefined,
      expect.objectContaining({
        workerUrl: 'http://localhost:3002',
        reason: 'Worker returned 503',
      }),
    )
  })

  /**
   * `dispatchAuto` non-Error rejection: when `fetch` rejects with a non-Error value
   * the catch must coerce it via `String(error)` (the `: String(error)` branch) so
   * the reason is always a string and no throw escapes.
   */
  it('dispatchAuto coerces a non-Error rejection via String(error)', async () => {
    fetchSpy.mockRejectedValue('boom-string' as never)

    const result = await service.dispatchAuto()

    expect(result).toEqual({ ok: false })
    expect(logger.warnStructured).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_DEGRADED',
      'Worker unreachable (auto path)',
      undefined,
      expect.objectContaining({ reason: 'boom-string' }),
    )
  })

  /**
   * `dispatchManual` happy path: a 2xx worker response returns `{ ok: true }`,
   * emits the MANUAL then SUCCESS logs, and never degrades.
   */
  it('dispatchManual returns { ok: true } and logs MANUAL + SUCCESS on a 2xx response', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }) as never)

    const result = await service.dispatchManual()

    expect(result).toEqual({ ok: true })
    expect(logger.info).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_MANUAL',
      'Calling worker (manual propagation.inject)',
    )
    expect(logger.info).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_SUCCESS',
      'Worker accepted dispatch (manual path)',
    )
    expect(logger.warnStructured).not.toHaveBeenCalled()
  })

  /**
   * `dispatchManual` non-2xx path: the `!res.ok` branch throws `Worker returned
   * <status>`, is caught, and degrades to `{ ok: false }` with the manual-path
   * degraded warn.
   */
  it('dispatchManual degrades to { ok: false } and logs the status reason on a non-2xx response', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }) as never)

    const result = await service.dispatchManual()

    expect(result).toEqual({ ok: false })
    expect(logger.warnStructured).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_DEGRADED',
      'Worker unreachable (manual path)',
      undefined,
      expect.objectContaining({
        workerUrl: 'http://localhost:3002',
        reason: 'Worker returned 500',
      }),
    )
  })

  /**
   * `dispatchManual` network-failure path: a rejected `fetch` (worker unreachable)
   * is caught and degraded to `{ ok: false }` with the Error message as the reason.
   */
  it('dispatchManual degrades to { ok: false } when fetch rejects', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED') as never)

    const result = await service.dispatchManual()

    expect(result).toEqual({ ok: false })
    expect(logger.warnStructured).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_DEGRADED',
      'Worker unreachable (manual path)',
      undefined,
      expect.objectContaining({ reason: 'ECONNREFUSED' }),
    )
  })

  /**
   * `dispatchManual` non-Error rejection: a rejected `fetch` with a non-Error value
   * exercises the manual catch's `: String(error)` branch so the reason is always a
   * string and no throw escapes.
   */
  it('dispatchManual coerces a non-Error rejection via String(error)', async () => {
    fetchSpy.mockRejectedValue(42 as never)

    const result = await service.dispatchManual()

    expect(result).toEqual({ ok: false })
    expect(logger.warnStructured).toHaveBeenCalledWith(
      'DOWNSTREAM_DISPATCH_DEGRADED',
      'Worker unreachable (manual path)',
      undefined,
      expect.objectContaining({ reason: '42' }),
    )
  })

  /**
   * `dispatch` aggregates both paths in parallel and maps each sub-result's `ok`
   * onto the `{ auto, manual }` flags. With both fetches succeeding both flags are
   * `true` — protects the Promise.all fan-out and the flag-mapping shape.
   */
  it('dispatch returns { auto: true, manual: true } when both paths succeed', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }) as never)

    const result = await service.dispatch()

    expect(result).toEqual({ auto: true, manual: true })
  })

  /**
   * `dispatch` mixed outcome: each path degrades independently. The first fetch
   * (auto) rejects and the second (manual) succeeds, so the flags map separately
   * to `{ auto: false, manual: true }`.
   */
  it('dispatch maps each path independently to { auto: false, manual: true }', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('auto down') as never)
      .mockResolvedValueOnce(new Response(null, { status: 200 }) as never)

    const result = await service.dispatch()

    expect(result).toEqual({ auto: false, manual: true })
  })

  it('dispatchAuto calls fetch with the correct URL, POST method, content-type header, and mode=auto body', async () => {
    /**
     * Scenario: dispatchAuto happy path.
     * Rule: the exact URL (`/tasks/process` on the default worker), the HTTP
     * method `POST`, the `content-type: application/json` header, and the JSON
     * body `{"mode":"auto"}` must all be passed to `fetch` — kills the eight
     * StringLiteral and ObjectLiteral mutations in the fetch init object.
     */
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }) as never)

    await service.dispatchAuto()

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3002/tasks/process')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ mode: 'auto' }))
  })

  it('dispatchManual calls fetch with the correct URL, POST method, and mode=manual body', async () => {
    /**
     * Scenario: dispatchManual happy path.
     * Rule: the URL must use the same `/tasks/process` endpoint, method must be
     * `POST`, and the body must serialize `{ mode: 'manual' }` — kills the
     * StringLiteral mutations on the path and mode value.
     */
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }) as never)

    await service.dispatchManual()

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3002/tasks/process')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ mode: 'manual' }))
  })

  it('dispatchManual initial headers object contains content-type application/json — kills ObjectLiteral {} and StringLiteral mutants', async () => {
    /**
     * Scenario: dispatchManual happy path — inspect the headers passed to fetch.
     * Rule: the headers object built on L87 must contain `'content-type':
     * 'application/json'` BEFORE `propagation.inject` runs — kills the
     * ObjectLiteral mutant that replaces `{ 'content-type': 'application/json' }`
     * with `{}` and the StringLiteral mutant that replaces `'application/json'`
     * with `''`.  The existing test verifies URL/method/body but not the
     * content-type header in the manual path.
     */
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }) as never)

    await service.dispatchManual()

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
  })
})
