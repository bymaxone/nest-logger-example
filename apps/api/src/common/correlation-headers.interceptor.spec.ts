/**
 * Unit tests for `CorrelationHeadersInterceptor`.
 *
 * Proves the interceptor echoes the active correlation ids onto the HTTP
 * response as `X-Request-Id` / `X-Trace-Id` and that every guard branch is
 * honoured:
 *   - `requestId` is written only when it is a non-empty string.
 *   - `traceId` prefers the active OpenTelemetry span's traceId, falling back to
 *     the ALS store's traceId when no span is sampled (all-zero or absent).
 *   - All-zero / empty trace ids are never written (they carry no correlation).
 *   - The downstream handler stream is always returned untouched.
 *
 * The unit is constructed directly with a mocked `LogContextService`; the active
 * span is controlled via `jest.spyOn(trace, 'getActiveSpan')`.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { trace } from '@opentelemetry/api'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import type { LogContextService } from '@bymax-one/nest-logger'
import { type Observable, of } from 'rxjs'

import { CorrelationHeadersInterceptor } from './correlation-headers.interceptor.js'

/** Minimal Express `Response` double recording `setHeader` calls. */
function makeResponse(): { setHeader: ReturnType<typeof jest.fn> } {
  return { setHeader: jest.fn() }
}

/**
 * Build an `ExecutionContext` whose `switchToHttp().getResponse()` yields `res`.
 *
 * @param res - The response double the interceptor should write headers onto.
 */
function makeContext(res: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ExecutionContext
}

/** A `CallHandler` whose `handle()` returns a known observable so identity can be asserted. */
function makeHandler(): { handler: CallHandler<string>; stream: Observable<string> } {
  const stream = of('downstream-result')
  return { handler: { handle: () => stream } as CallHandler<string>, stream }
}

/**
 * Build a `LogContextService` mock whose `getStore()` returns `store`.
 *
 * @param store - The ALS store value (or `undefined` for no active scope).
 */
function makeLogContext(store: unknown): LogContextService {
  return { getStore: jest.fn(() => store) } as unknown as LogContextService
}

/** A valid (non-zero) W3C trace id used across the span-based scenarios. */
const VALID_TRACE_ID = 'a1b2c3d4e5f6071829304a5b6c7d8e9f'

/**
 * Stub the active span returned by `@opentelemetry/api`.
 *
 * @param traceId - The traceId the span's context should expose, or `undefined`
 *   to simulate no active span.
 */
function stubActiveSpan(traceId: string | undefined): void {
  if (traceId === undefined) {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined)
    return
  }
  jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
    spanContext: () => ({ traceId }),
  } as unknown as ReturnType<typeof trace.getActiveSpan>)
}

describe('CorrelationHeadersInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('writes both X-Request-Id (from store) and X-Trace-Id (from active span)', () => {
    /**
     * Happy path: a non-empty `requestId` in the ALS store and a sampled span
     * with a valid traceId must produce both headers, the span's traceId winning
     * over the store fallback.
     */
    stubActiveSpan(VALID_TRACE_ID)
    const res = makeResponse()
    const interceptor = new CorrelationHeadersInterceptor(
      makeLogContext({ requestId: 'req-123', traceId: 'store-trace-should-be-ignored' }),
    )
    const { handler } = makeHandler()

    interceptor.intercept(makeContext(res), handler)

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'req-123')
    expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', VALID_TRACE_ID)
  })

  it('returns the downstream handler stream untouched', () => {
    /**
     * Contract: the interceptor is header-only — it must return exactly the
     * observable produced by `next.handle()` without wrapping or replacing it.
     */
    stubActiveSpan(VALID_TRACE_ID)
    const interceptor = new CorrelationHeadersInterceptor(makeLogContext({ requestId: 'req-1' }))
    const { handler, stream } = makeHandler()

    const result = interceptor.intercept(makeContext(makeResponse()), handler)

    expect(result).toBe(stream)
  })

  it('falls back to the store traceId when no span is active', () => {
    /**
     * When `getActiveSpan()` returns `undefined`, the interceptor must read the
     * distributed traceId from the ALS store instead so correlation survives
     * unsampled requests.
     */
    stubActiveSpan(undefined)
    const res = makeResponse()
    const interceptor = new CorrelationHeadersInterceptor(
      makeLogContext({ requestId: 'req-9', traceId: VALID_TRACE_ID }),
    )

    interceptor.intercept(makeContext(res), makeHandler().handler)

    expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', VALID_TRACE_ID)
  })

  it('falls back to the store traceId when the span traceId is all zeros', () => {
    /**
     * An all-zero span traceId is OpenTelemetry's "no sampled span" sentinel; the
     * interceptor must discard it and use the store's traceId instead.
     */
    stubActiveSpan('00000000000000000000000000000000')
    const res = makeResponse()
    const interceptor = new CorrelationHeadersInterceptor(
      makeLogContext({ requestId: 'req-9', traceId: VALID_TRACE_ID }),
    )

    interceptor.intercept(makeContext(res), makeHandler().handler)

    expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', VALID_TRACE_ID)
  })

  it('omits X-Request-Id when the store requestId is an empty string', () => {
    /**
     * Guard branch: an empty-string `requestId` carries no correlation and must
     * not be written as a header.
     */
    stubActiveSpan(undefined)
    const res = makeResponse()
    const interceptor = new CorrelationHeadersInterceptor(makeLogContext({ requestId: '' }))

    interceptor.intercept(makeContext(res), makeHandler().handler)

    expect(res.setHeader).not.toHaveBeenCalledWith('X-Request-Id', expect.anything())
  })

  it('omits X-Request-Id when the store has no requestId', () => {
    /**
     * Guard branch: a `requestId` of a non-string type (here `undefined`) fails
     * the `typeof === 'string'` check and is skipped.
     */
    stubActiveSpan(undefined)
    const res = makeResponse()
    const interceptor = new CorrelationHeadersInterceptor(makeLogContext({}))

    interceptor.intercept(makeContext(res), makeHandler().handler)

    expect(res.setHeader).not.toHaveBeenCalledWith('X-Request-Id', expect.anything())
  })

  it('omits X-Request-Id and X-Trace-Id when there is no active store at all', () => {
    /**
     * When `getStore()` returns `undefined` (no request scope) and no span is
     * active, neither correlation header is written.
     */
    stubActiveSpan(undefined)
    const res = makeResponse()
    const interceptor = new CorrelationHeadersInterceptor(makeLogContext(undefined))

    interceptor.intercept(makeContext(res), makeHandler().handler)

    expect(res.setHeader).not.toHaveBeenCalled()
  })

  it('omits X-Trace-Id when neither span nor store provides a valid traceId', () => {
    /**
     * Guard branch: with no span and a store whose `traceId` is an empty string,
     * the resolved traceId fails the non-empty / non-zero check and no
     * `X-Trace-Id` header is written.
     */
    stubActiveSpan(undefined)
    const res = makeResponse()
    const interceptor = new CorrelationHeadersInterceptor(
      makeLogContext({ requestId: 'req-1', traceId: '' }),
    )

    interceptor.intercept(makeContext(res), makeHandler().handler)

    expect(res.setHeader).not.toHaveBeenCalledWith('X-Trace-Id', expect.anything())
  })

  it('omits X-Trace-Id when the store traceId is all zeros (final guard)', () => {
    /**
     * Guard branch: the fallback traceId from the store can itself be an all-zero
     * sentinel; the final `INVALID_TRACE_ID` test in the header guard must reject
     * it so no zeroed `X-Trace-Id` is emitted.
     */
    stubActiveSpan(undefined)
    const res = makeResponse()
    const interceptor = new CorrelationHeadersInterceptor(
      makeLogContext({ requestId: 'req-1', traceId: '00000000000000000000000000000000' }),
    )

    interceptor.intercept(makeContext(res), makeHandler().handler)

    expect(res.setHeader).not.toHaveBeenCalledWith('X-Trace-Id', expect.anything())
  })
})
