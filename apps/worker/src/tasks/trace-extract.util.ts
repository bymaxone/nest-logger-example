/**
 * Manual W3C trace-context extraction utility.
 *
 * Demonstrates the manual propagation path for non-auto-instrumented entry points
 * (e.g. queue consumers, WebSocket handlers, custom fetch wrappers).
 *
 * For HTTP endpoints, `@opentelemetry/instrumentation-http` extracts the inbound
 * `traceparent` header automatically with zero manual code. This utility is
 * the explicit fallback for callers that are not auto-instrumented.
 *
 * @module
 */
import { context, propagation } from '@opentelemetry/api'

/**
 * Run `fn` inside the trace context carried by a W3C `traceparent` carrier object.
 *
 * `propagation.extract` reads the registered `TextMapPropagator` (the W3C
 * `TraceContextPropagator` registered by the SDK) to decode the carrier's
 * `traceparent` (and optional `tracestate`) header into a new context value.
 * `context.with` then propagates that context through `fn` via AsyncLocalStorage.
 *
 * @param carrier - An object whose string values include at least a `traceparent` key.
 * @param fn - Callback to execute inside the extracted trace context.
 * @returns The value returned by `fn`.
 */
export function runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T {
  const ctx = propagation.extract(context.active(), carrier)
  return context.with(ctx, fn)
}
