/**
 * `runWithExtractedContext` unit coverage.
 *
 * Proves that `runWithExtractedContext` correctly activates the trace context
 * carried in a W3C `traceparent` carrier object, so code running inside the
 * callback sees the caller's `traceId` as the active span context.
 */
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { context, propagation, trace } from '@opentelemetry/api'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'

import { runWithExtractedContext } from './trace-extract.util.js'

describe('runWithExtractedContext', () => {
  let ctxManager: AsyncLocalStorageContextManager

  beforeAll(() => {
    // Register the ALS context manager + W3C propagator so that
    // `propagation.extract` and `context.with` work without the full SDK.
    ctxManager = new AsyncLocalStorageContextManager()
    ctxManager.enable()
    context.setGlobalContextManager(ctxManager)
    propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  })

  afterAll(() => {
    ctxManager.disable()
  })

  /**
   * Decodes a valid `traceparent` header and activates its context so the
   * callback can read the extracted `traceId` via the active span.
   */
  it('activates the trace context from a W3C traceparent carrier', () => {
    const traceId = 'a1b2c3d4e5f6071829304a5b6c7d8e9f'
    const spanId = '00f067aa0ba902b7'
    const carrier: Record<string, string> = {
      traceparent: `00-${traceId}-${spanId}-01`,
    }

    let extractedTraceId: string | undefined

    runWithExtractedContext(carrier, () => {
      const activeContext = context.active()
      const span = trace.getSpan(activeContext)
      extractedTraceId = span?.spanContext().traceId
    })

    // The active span context inside the callback must match the carrier's trace-id.
    expect(extractedTraceId).toBe(traceId)
  })

  /**
   * A carrier with no `traceparent` extracts an empty (root) context; the callback
   * runs normally and `trace.getSpan(context.active())` returns `undefined`.
   */
  it('runs the callback normally when the carrier has no traceparent', () => {
    const carrier: Record<string, string> = {}
    let ran = false

    runWithExtractedContext(carrier, () => {
      ran = true
    })

    expect(ran).toBe(true)
  })
})
