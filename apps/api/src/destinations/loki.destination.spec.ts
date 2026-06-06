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
})
