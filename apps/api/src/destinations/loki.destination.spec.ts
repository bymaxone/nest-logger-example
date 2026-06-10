/**
 * Unit tests for `LokiDestination` — the reference batched HTTP push `ILogDestination`.
 *
 * Covers the full lifecycle and fail-soft contract: `onInit()` starts a periodic flush
 * timer; `write()` enqueues the unmodified line and triggers an early flush when the batch
 * fills; `flush()` POSTs the batch to Loki with nanosecond-epoch STRING timestamps; oversized
 * bodies are dropped with `LOGGER_DESTINATION_WRITE_FAILED`; network failures and non-2xx
 * responses fail soft to `process.stderr` and NEVER throw / NEVER touch the logger; and
 * `onShutdown()` clears the timer, awaits in-flight flushes, and drains the final buffer.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { LokiDestination } from './loki.destination.js'

/** Build a fetch mock that resolves to a Response-like object with the given `ok`/`status`. */
function okFetch(): jest.Mock {
  return jest.fn(async () => ({ ok: true, status: 200 }) as unknown as Response)
}

describe('LokiDestination', () => {
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>

  beforeEach(() => {
    jest.useFakeTimers()
    // Silence and observe fail-soft stderr writes.
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as never)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
    delete process.env.OTEL_SERVICE_NAME
    // Reset the global fetch so each test installs its own.
    delete (globalThis as { fetch?: unknown }).fetch
  })

  it('exposes the destination name and a default minLevel of info', () => {
    /** The `name`/`minLevel` are part of the `ILogDestination` contract used by the router. */
    const dest = new LokiDestination({ url: 'http://loki/push' })
    expect(dest.name).toBe('loki')
    expect(dest.minLevel).toBe('info')
  })

  it('onInit() starts a periodic flush timer that flushes the buffer', async () => {
    /** The interval timer must drain a non-empty buffer on each tick (default 5s). */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push' })
    dest.onInit()
    dest.write('{"level":"info","msg":"a"}\n')

    // Advance past the default 5s interval to fire one tick.
    jest.advanceTimersByTime(5_000)
    // Let the chained flush promise settle.
    await jest.runOnlyPendingTimersAsync()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses a custom flushIntervalMs when provided', async () => {
    /** A configured interval overrides the 5s default for the periodic flush. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', flushIntervalMs: 1_000 })
    dest.onInit()
    dest.write('{"level":"info","msg":"a"}\n')

    jest.advanceTimersByTime(1_000)
    await jest.runOnlyPendingTimersAsync()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('write() enqueues without flushing while under the batch-size threshold', () => {
    /** A single write below `batchSize` must NOT trigger an early network flush. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 2 })
    dest.write('{"level":"info","msg":"a"}\n')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('write() flushes early once the batch-size threshold is reached', async () => {
    /** Reaching `batchSize` schedules an immediate flush so batches do not grow unbounded. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 2 })
    dest.write('{"level":"info","msg":"a"}\n')
    dest.write('{"level":"info","msg":"b"}\n')

    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('encodes nanosecond-epoch STRING timestamps that are unique within a millisecond', async () => {
    /**
     * Loki requires nanosecond timestamps as strings; the per-line index `i` is added so two
     * lines in the same millisecond get distinct values (Loki dedups identical tuples).
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    jest.setSystemTime(new Date(1_700_000_000_000)) // fixed ms epoch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 2 })
    dest.write('  {"msg":"a"}  \n')
    dest.write('{"msg":"b"}\n')
    await jest.runOnlyPendingTimersAsync()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    const values = body.streams[0].values as Array<[string, string]>
    expect(values).toHaveLength(2)
    // Base = 1_700_000_000_000 * 1e6 ; second line is +1ns.
    expect(values[0][0]).toBe('1700000000000000000')
    expect(values[1][0]).toBe('1700000000000000001')
    // Both timestamps are strings.
    expect(typeof values[0][0]).toBe('string')
    // The line value is the trimmed log line.
    expect(values[0][1]).toBe('{"msg":"a"}')
    expect(values[1][1]).toBe('{"msg":"b"}')
  })

  it('labels the stream with OTEL_SERVICE_NAME when set', async () => {
    /** The stream `service` label comes from `OTEL_SERVICE_NAME` env when present. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    process.env.OTEL_SERVICE_NAME = 'my-svc'
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')
    await jest.runOnlyPendingTimersAsync()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.streams[0].stream.service).toBe('my-svc')
  })

  it('falls back to the default service label when OTEL_SERVICE_NAME is unset', async () => {
    /** Without the env var the stream label defaults to the example app name. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    delete process.env.OTEL_SERVICE_NAME
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')
    await jest.runOnlyPendingTimersAsync()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.streams[0].stream.service).toBe('nest-logger-example-api')
  })

  it('POSTs to the configured URL with JSON content-type and an abort signal', async () => {
    /** The push request shape (method/headers/url/signal) is part of the Loki contract. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')
    await jest.runOnlyPendingTimersAsync()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://loki/push')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('drops an oversized batch with a batch-too-large fail-soft warning', async () => {
    /** Bodies above `maxBodyBytes` are dropped to stderr (Loki rejects them with 4xx anyway). */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({
      url: 'http://loki/push',
      batchSize: 1,
      maxBodyBytes: 10, // tiny cap to force the oversized branch
    })
    dest.write('{"msg":"this line easily exceeds ten bytes"}\n')
    await jest.runOnlyPendingTimersAsync()

    // No network call was made; the batch was dropped.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const written = String(stderrSpy.mock.calls[0][0])
    expect(written).toContain('LOGGER_DESTINATION_WRITE_FAILED')
    expect(written).toContain('batch-too-large')
  })

  it('fails soft to stderr when Loki responds with a non-2xx status', async () => {
    /** A non-ok response must be swallowed and reported to stderr, never thrown. */
    const fetchMock = jest.fn(async () => ({ ok: false, status: 503 }) as unknown as Response)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')

    await expect(jest.runOnlyPendingTimersAsync()).resolves.toBeUndefined()
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(String(stderrSpy.mock.calls[0][0])).toContain('LOGGER_DESTINATION_WRITE_FAILED')
  })

  it('fails soft to stderr when fetch rejects (network error)', async () => {
    /** A rejected fetch (network/abort) must be caught and reported, never propagated. */
    const fetchMock = jest.fn(async () => {
      throw new Error('network down')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')

    await expect(jest.runOnlyPendingTimersAsync()).resolves.toBeUndefined()
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(String(stderrSpy.mock.calls[0][0])).toContain('LOGGER_DESTINATION_WRITE_FAILED')
  })

  it('onShutdown() clears the timer, awaits in-flight work, and drains the final buffer', async () => {
    /** Shutdown must stop the interval and flush whatever remains so no lines are lost. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push' })
    dest.onInit()
    dest.write('{"msg":"pending"}\n')

    await dest.onShutdown()

    // The remaining buffered line was drained by the final flush.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Advancing the clock after shutdown must not fire any further flush (timer cleared).
    fetchMock.mockClear()
    jest.advanceTimersByTime(60_000)
    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('onShutdown() is a no-op flush when nothing was ever buffered and no timer was started', async () => {
    /** Shutting down a never-initialised destination with an empty buffer must not call fetch. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push' })
    await dest.onShutdown()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flush() is a no-op when the buffer is empty', async () => {
    /** An interval tick on an empty buffer must short-circuit before building any request. */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', flushIntervalMs: 1_000 })
    dest.onInit()
    // No writes — the tick hits the empty-buffer guard.
    jest.advanceTimersByTime(1_000)
    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts a hung request after the 10s deadline and fails soft', async () => {
    /**
     * The 10s `setTimeout(() => controller.abort())` guard must fire when Loki hangs,
     * aborting the in-flight fetch; the resulting rejection is caught and reported to
     * stderr, never thrown. Exercises the abort-timer callback branch.
     */
    // fetch resolves only when its abort signal fires — modelling a hung endpoint.
    const fetchMock = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')

    // Let the flush start and the request go in-flight.
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Fire the 10s abort deadline — the controller aborts, fetch rejects, catch reports.
    jest.advanceTimersByTime(10_000)
    await jest.runOnlyPendingTimersAsync()

    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(String(stderrSpy.mock.calls[0][0])).toContain('LOGGER_DESTINATION_WRITE_FAILED')
  })

  // ─── Additional mutation-killing tests ────────────────────────────────────

  it('does NOT flush after batchSize-1 writes even when async chain settles', async () => {
    /**
     * Covering the `>=` condition in `write()`: with exactly batchSize-1 entries in
     * the buffer the condition is false so `scheduleFlush` must NOT be called. Using
     * `runOnlyPendingTimersAsync` ensures any async chain that was accidentally
     * scheduled has time to run — a "condition always true" mutation would call fetch
     * here and fail this assertion.
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 3 })
    dest.write('{"msg":"a"}\n')
    dest.write('{"msg":"b"}\n') // 2 writes, batchSize-1 = 2, no flush yet
    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flushes exactly once when the buffer reaches exactly batchSize entries', async () => {
    /**
     * With exactly `batchSize` writes the `>=` condition becomes true and ONE early
     * flush is scheduled. A "condition always false" mutation suppresses the flush
     * (fetch not called); a mutation of `>=` to `>` delays the flush by one write.
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 3 })
    dest.write('{"msg":"a"}\n')
    dest.write('{"msg":"b"}\n')
    dest.write('{"msg":"c"}\n') // exactly batchSize=3 → flush
    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT drop a batch whose body length is well below maxBodyBytes', async () => {
    /**
     * The guard is `body.length > maxBodyBytes` (strict greater-than). When the
     * batch is well under the cap the condition must be false — fetch IS called and
     * stderr is NOT written. If `>` is mutated to `>=` AND the body exactly equals
     * maxBodyBytes the batch would be wrongly dropped; here the cap is large enough
     * that the condition is unambiguously false.
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    // maxBodyBytes: 10_000 — the serialized body for one short line is far below that.
    const dest = new LokiDestination({
      url: 'http://loki/push',
      batchSize: 1,
      maxBodyBytes: 10_000,
    })
    dest.write('{"msg":"a"}\n')
    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('drops a batch whose body length exceeds maxBodyBytes by exactly one byte', async () => {
    /**
     * `body.length > maxBodyBytes` means maxBodyBytes+1 MUST be dropped. If the
     * operator is mutated to `>=`, a body of exactly maxBodyBytes would also be
     * dropped, causing the previous test to fail. This test validates the strict-gt
     * side — any body strictly larger than the cap is dropped.
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    // maxBodyBytes: 10 forces drop because the JSON-serialised body for even one
    // short log line exceeds 10 bytes.
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1, maxBodyBytes: 10 })
    dest.write('{"msg":"x"}\n')
    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(String(stderrSpy.mock.calls[0][0])).toContain('batch-too-large')
  })

  it('does not write to stderr on a successful flush (ok response)', async () => {
    /**
     * When `res.ok` is true the `if (!res.ok)` condition must be false and no error
     * is thrown into the catch block. A "condition always true" mutation would throw
     * on every response, causing the catch to write to stderr — caught here because
     * `stderrSpy` must NOT be called on a 200 response.
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')
    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('passes flushIntervalMs=0 as-is to setInterval, not falling back to 5_000 (guards ??)', () => {
    /**
     * `this.opts.flushIntervalMs ?? 5_000` — with `??`, a value of 0 is NOT nullish
     * so it must be used directly. A mutation of `??` to `||` would treat 0 as falsy
     * and fall back to 5_000 instead. We spy on `setInterval` and assert the interval
     * duration is exactly 0 (not 5_000) when `flushIntervalMs: 0` is configured.
     */
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval')
    const dest = new LokiDestination({ url: 'http://loki/push', flushIntervalMs: 0 })
    dest.onInit()
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 0)
    setIntervalSpy.mockRestore()
    void dest
  })

  it('clears the abort timer in the finally block after a successful fetch', async () => {
    /**
     * The `finally { clearTimeout(timer) }` block must run even on success, so the
     * abort timer does not fire after the request completes. If the finally block
     * body is removed by a BlockStatement mutation, the timer remains active and
     * would trigger a spurious abort on the NEXT request. We test this by observing
     * no additional stderr writes after advancing 10 s post-flush.
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')
    await jest.runOnlyPendingTimersAsync()
    // Request completed — now advance 10 s to fire any stale abort timer.
    jest.advanceTimersByTime(10_000)
    await jest.runOnlyPendingTimersAsync()
    // No abort-triggered stderr write.
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('clears the interval timer in onShutdown even when no onInit was called', async () => {
    /**
     * `if (this.flushTimer) clearInterval(this.flushTimer)` — with no `onInit`,
     * `flushTimer` is `undefined` (falsy), so the branch must NOT call
     * `clearInterval(undefined)`. We observe no throw and no side-effects. If the
     * condition is mutated to always `true`, `clearInterval(undefined)` would be
     * called — which is a no-op in Node but the timer state would be wrong.
     * The test verifies via a `clearInterval` spy that it's NOT called when
     * `flushTimer` is undefined.
     */
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval')
    const dest = new LokiDestination({ url: 'http://loki/push' })
    await dest.onShutdown()
    expect(clearIntervalSpy).not.toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  // ─── Further mutation-killing tests ───────────────────────────────────────

  it('uses 5_000 ms as the default flush interval when flushIntervalMs is not provided', () => {
    /**
     * `this.opts.flushIntervalMs ?? 5_000` — a mutation of `??` to `&&` would compute
     * `undefined && 5_000 = undefined`, passing `undefined` to `setInterval` instead of
     * 5_000. The existing `flushIntervalMs: 0` test guards the non-nullish zero path;
     * this test guards the nullish (default) path by asserting the exact interval value.
     */
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval')
    const dest = new LokiDestination({ url: 'http://loki/push' }) // no flushIntervalMs
    dest.onInit()
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5_000)
    setIntervalSpy.mockRestore()
    void dest
  })

  it('does not flush a single write well below batchSize even after promise microtasks settle', async () => {
    /**
     * `if (this.buffer.length >= batchSize)` — a ConditionalExpression mutation to
     * `true` would call `scheduleFlush()` on every write, triggering a network request
     * after just 1 write even with a large batchSize. Awaiting a microtask tick here
     * (via `Promise.resolve()`) drains the flushChain promise before the assertion, so
     * any accidentally-scheduled flush has time to call fetch — killing that mutant.
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 50 })
    dest.write('{"msg":"a"}\n') // 1 write, far below batchSize=50
    // Drain the microtask queue so any chained flush promise has time to resolve.
    await Promise.resolve()
    await jest.runOnlyPendingTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('onShutdown calls clearInterval to stop the periodic timer when one was started', async () => {
    /**
     * `if (this.flushTimer) clearInterval(this.flushTimer)` — a ConditionalExpression
     * mutation to `false` skips clearInterval even when a timer was started, leaving the
     * interval running after shutdown. This test asserts that clearInterval IS called
     * exactly once when `onInit()` set the timer, distinguishing it from the no-init case.
     */
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval')
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push' })
    dest.onInit() // sets flushTimer
    await dest.onShutdown()
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    clearIntervalSpy.mockRestore()
  })

  it('does NOT drop a batch whose serialized body length exactly equals maxBodyBytes', async () => {
    /**
     * The guard is `body.length > maxBodyBytes` (strict greater-than). A `> → >=`
     * EqualityOperator mutation would drop a batch whose length exactly equals the cap,
     * causing data loss for batches at the boundary. This test constructs a scenario where
     * body.length === maxBodyBytes and asserts that fetch IS called (batch is sent).
     *
     * Body for a single-character write with a 1-char nanosecond timestamp:
     *   {"streams":[{"stream":{"service":"x"},"values":[["0","a"]]}]}
     * Adjust maxBodyBytes to that exact computed length.
     */
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    jest.setSystemTime(new Date(0)) // nowMs = 0  →  nanosecond timestamp = '0'
    process.env.OTEL_SERVICE_NAME = 'x' // shortest service label for compact body

    // Compute the exact body length produced for a single 'a' write.
    const expectedBody = JSON.stringify({
      streams: [
        {
          stream: { service: 'x' },
          values: [['0', 'a']],
        },
      ],
    })
    const exactLength = expectedBody.length

    const dest = new LokiDestination({
      url: 'http://loki/push',
      batchSize: 1,
      maxBodyBytes: exactLength,
    })
    dest.write('a\n')
    await jest.runOnlyPendingTimersAsync()

    // Strict `>`: body.length === maxBodyBytes → condition false → batch IS sent.
    // `>=` mutation: condition true → batch dropped → fetchMock not called.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('clearTimeout is called in the finally block after a successful fetch', async () => {
    /**
     * `finally { clearTimeout(timer) }` — a BlockStatement mutation removes this call,
     * leaving the 10 s abort timer active after the request completes. While a stale
     * abort signal on a completed request is a no-op, a lingering timer leaks resources
     * and could interfere with subsequent requests. This test spies on clearTimeout and
     * asserts it is invoked exactly once per flush, proving the finally block runs.
     */
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout')
    const fetchMock = okFetch()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const dest = new LokiDestination({ url: 'http://loki/push', batchSize: 1 })
    dest.write('{"msg":"a"}\n')
    await jest.runOnlyPendingTimersAsync()

    // One flush → one setTimeout for the abort deadline → one clearTimeout in finally.
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
    clearTimeoutSpy.mockRestore()
  })
})
