/**
 * OTel trace-field injection — edge-case unit coverage.
 *
 * Proves two edge cases the e2e test cannot exercise in isolation:
 *   - Zeroed/no-op traceId (no active span) → `traceId`/`spanId`/`traceFlags` must
 *     NOT appear on the log line (the library skips them rather than writing zeros).
 *   - Unsampled span (`traceFlags: TraceFlags.NONE` → `'00'`) → the fields MUST still
 *     appear — correlation must not depend on the sampling decision.
 *
 * Technique:
 *   - No NodeSDK is required. The `@opentelemetry/api` context API works independently
 *     of the SDK: `context.with(trace.setSpan(ctx, span), fn)` places a
 *     `NonRecordingSpan` (via `trace.wrapSpanContext`) in the ALS context so the
 *     library's `getActiveSpan()` call sees it inside `fn`.
 *   - For the no-op case no span is in context — `getActiveSpan()` returns `undefined`.
 *   - `jest.spyOn(process.stdout, 'write')` captures the NDJSON before the terminal.
 */
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, PinoLoggerService } from '@bymax-one/nest-logger'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { context, trace, TraceFlags } from '@opentelemetry/api'
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Capture `process.stdout.write` calls during an async operation and return each
 * raw chunk as a string.
 *
 * @param fn - Async operation whose stdout output should be captured.
 * @returns Array of raw chunks written to stdout during `fn`.
 */
async function captureStdout(fn: () => Promise<void>): Promise<string[]> {
  const chunks: string[] = []
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
    chunks.push(String(c))
    return true
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return chunks
}

/**
 * Parse all captured chunks as JSON and return successful parses.
 *
 * @param chunks - Raw stdout chunks from {@link captureStdout}.
 * @returns Array of parsed objects; unparseable chunks are silently dropped.
 */
function parseLines(chunks: string[]): Record<string, unknown>[] {
  return chunks
    .map((c) => {
      try {
        return JSON.parse(c) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .filter((l): l is Record<string, unknown> => l !== null)
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('OTel trace-field injection — edge cases (unit)', () => {
  let moduleRef: TestingModule
  let logger: PinoLoggerService
  let ctxManager: AsyncLocalStorageContextManager

  beforeAll(async () => {
    // Register a real ALS-based context manager so that `context.with(ctx, fn)` actually
    // propagates the context. Without the SDK, the default noop context manager makes
    // `context.with()` a no-op — the span set in context would not be visible to the logger.
    ctxManager = new AsyncLocalStorageContextManager()
    ctxManager.enable()
    context.setGlobalContextManager(ctxManager)

    moduleRef = await Test.createTestingModule({
      imports: [
        BymaxLoggerModule.forRoot({
          service: { name: 'otel-spec', version: 'test' },
          isPretty: false,
          level: 'info',
          isGlobal: true,
          shouldUseAsNestLogger: false,
          otel: {
            shouldAutoInjectTraceContext: true,
            fieldFormat: 'camelCase',
          },
        }),
      ],
    }).compile()

    logger = moduleRef.get(PinoLoggerService)
  })

  afterAll(async () => {
    await moduleRef.close()
    ctxManager.disable()
  })

  // ─── Zeroed traceId → no trace fields emitted ────────────────────────────

  /**
   * When no span is active (no SDK running, no span in context), `getActiveSpan()`
   * returns `undefined`. The library MUST skip all three trace fields rather than
   * writing all-zero placeholder values.
   */
  it('omits traceId/spanId/traceFlags when no span is active (zeroed/no-op context)', async () => {
    const chunks = await captureStdout(() => {
      logger.info('OTEL_NOOP_VERIFIED', 'no active span — trace fields must be absent')
      return Promise.resolve()
    })

    const line = parseLines(chunks).find((l) => l['logKey'] === 'OTEL_NOOP_VERIFIED')
    expect(line).toBeDefined()
    expect(line).not.toHaveProperty('traceId')
    expect(line).not.toHaveProperty('spanId')
    expect(line).not.toHaveProperty('traceFlags')
  })

  // ─── Unsampled span → trace fields still emitted ─────────────────────────

  /**
   * `trace.wrapSpanContext` creates a `NonRecordingSpan` (valid for propagation) with
   * `traceFlags: TraceFlags.NONE` (0 = unsampled). `context.with(ctx, fn)` sets it as
   * the active span inside `fn` via ALS; the library reads it via `getActiveSpan()`.
   *
   * The library MUST emit `traceId` / `spanId` / `traceFlags` ('00') for unsampled
   * spans — gating on `traceFlags` would silently drop correlation on every
   * unsampled request (OVERVIEW.md §14 "No-op spans are skipped … unsampled spans
   * still carry valid context and are kept").
   */
  it('emits traceId/spanId/traceFlags even when the span is unsampled (traceFlags: NONE → "00")', async () => {
    const traceId = 'a1b2c3d4e5f6071829304a5b6c7d8e9f'
    const spanId = '00f067aa0ba902b7'

    const unsampledSpan = trace.wrapSpanContext({
      traceId,
      spanId,
      traceFlags: TraceFlags.NONE, // 0 = unsampled; library must still emit the fields
      isRemote: false,
    })
    const ctx = trace.setSpan(context.active(), unsampledSpan)

    const chunks = await captureStdout(() => {
      context.with(ctx, () => {
        logger.info('OTEL_UNSAMPLED_VERIFIED', 'unsampled span — trace fields must still appear')
      })
      return Promise.resolve()
    })

    const line = parseLines(chunks).find((l) => l['logKey'] === 'OTEL_UNSAMPLED_VERIFIED')
    expect(line).toBeDefined()
    expect(String(line!['traceId'])).toMatch(/^[0-9a-f]{32}$/)
    expect(String(line!['spanId'])).toMatch(/^[0-9a-f]{16}$/)
    // traceFlags.NONE (0) is serialised as the 2-hex W3C string '00'.
    expect(line!['traceFlags']).toBe('00')
  })
})
