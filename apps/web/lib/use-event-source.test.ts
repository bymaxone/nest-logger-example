/**
 * @fileoverview Unit tests for {@link useLogStream} — the SSE live-tail hook.
 *
 * Drives a fake `EventSource` (open / message / error / close) and a controllable
 * `requestAnimationFrame` queue so every branch is exercised deterministically:
 * the disabled gate, the open/error connection states (terminal CLOSED vs
 * transparent CONNECTING retry), keep-alive and malformed frames, the rAF-flushed
 * ring buffer, the idle auto-stop, `clear()`, and effect cleanup. Fake timers
 * drive the idle interval; the global `EventSource` and `rAF` are stubbed.
 *
 * @module lib/use-event-source.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import type { LogQuery } from './types'

/**
 * Minimal `EventSource` test double exposing the handler slots the hook assigns
 * plus a mutable `readyState`, so a test can emit open/message/error and inspect
 * `close()`. The latest instance is captured for the active test to drive.
 */
class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static last: FakeEventSource | null = null

  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  readyState = FakeEventSource.CONNECTING
  closeCount = 0

  constructor(public readonly url: string) {
    FakeEventSource.last = this
  }

  close(): void {
    this.closeCount += 1
    this.readyState = FakeEventSource.CLOSED
  }

  /** Emit a frame as the browser's `onmessage` would (data already a string). */
  emit(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

/** The current instance under test (set on each `new EventSource`). */
function source(): FakeEventSource {
  if (!FakeEventSource.last) throw new Error('no EventSource constructed')
  return FakeEventSource.last
}

/** Pending rAF callbacks keyed by handle, drained explicitly per test. */
const rafQueue = new Map<number, FrameRequestCallback>()
let rafSeq = 0

/** Run every queued rAF callback (mimics a frame tick). */
function flushRaf(): void {
  const callbacks = [...rafQueue.entries()]
  rafQueue.clear()
  for (const [, cb] of callbacks) cb(performance.now())
}

/** A minimal valid filter; `source` is the only required LogQuery field. */
const filter: LogQuery = { source: 'postgres', role: 'admin' }

/** Serialize a valid SSE frame the schema accepts. */
function frame(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'e1',
    time: '2026-06-05T00:00:00.000Z',
    level: 'info',
    logKey: 'HTTP_REQUEST_SUCCESS',
    message: 'ok',
    service: 'api',
    ...overrides,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.last = null
  rafQueue.clear()
  rafSeq = 0
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    rafSeq += 1
    rafQueue.set(rafSeq, cb)
    return rafSeq
  })
  vi.stubGlobal('cancelAnimationFrame', (handle: number): void => {
    rafQueue.delete(handle)
  })
})

afterEach(() => {
  cleanup()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Imported after the stubs so the hook binds the fake EventSource/rAF.
const { useLogStream } = await import('./use-event-source')

describe('useLogStream', () => {
  /** When disabled the hook opens no stream and reports a disconnected state. */
  it('opens no EventSource while disabled', () => {
    const { result } = renderHook(() => useLogStream(filter, false))
    expect(FakeEventSource.last).toBeNull()
    expect(result.current.connected).toBe(false)
    expect(result.current.failed).toBe(false)
  })

  /** Enabling opens the stream and `onopen` flips `connected` true. */
  it('connects and marks connected on open', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    expect(source().url).toContain('/api/logs/stream?')
    expect(source().url).toContain('role=admin')
    act(() => source().onopen?.())
    expect(result.current.connected).toBe(true)
    expect(result.current.failed).toBe(false)
  })

  /** A CLOSED error state is terminal — `failed` flips true, `connected` false. */
  it('marks failed on a terminal CLOSED error', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => {
      source().readyState = FakeEventSource.CLOSED
      source().onerror?.()
    })
    expect(result.current.connected).toBe(false)
    expect(result.current.failed).toBe(true)
  })

  /** A CONNECTING error is a transparent retry — not a failure. */
  it('does not fail while the browser is reconnecting (CONNECTING)', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => {
      source().readyState = FakeEventSource.CONNECTING
      source().onerror?.()
    })
    expect(result.current.connected).toBe(false)
    expect(result.current.failed).toBe(false)
  })

  /** A valid frame is buffered and surfaced as a row after the rAF flush. */
  it('buffers a valid frame and flushes it on the next animation frame', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit(frame()))
    // Before the frame tick the row is still pending.
    expect(result.current.rows).toHaveLength(0)
    act(() => flushRaf())
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0]?.id).toBe('e1')
    expect(result.current.rows[0]?.level).toBe('info')
  })

  /** A numeric `time` is converted to an ISO string; `cursor` is carried through. */
  it('coerces a numeric time to ISO and preserves the cursor', () => {
    const millis = Date.parse('2026-06-05T12:00:00.000Z')
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit(frame({ time: millis, cursor: 'cur_42' })))
    act(() => flushRaf())
    const row = result.current.rows[0]
    expect(row?.time).toBe('2026-06-05T12:00:00.000Z')
    expect(row?.cursor).toBe('cur_42')
  })

  /** An unknown level coerces to `info` and nullish correlation ids become null. */
  it('coerces an unknown level to info and nulls absent correlation ids', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit(frame({ level: 'mystery' })))
    act(() => flushRaf())
    const row = result.current.rows[0]
    expect(row?.level).toBe('info')
    expect(row?.tenantId).toBeNull()
    expect(row?.requestId).toBeNull()
    expect(row?.traceId).toBeNull()
    expect(row?.spanId).toBeNull()
    expect(row?.cursor).toBeUndefined()
  })

  /** A keep-alive ping (empty data) is ignored — no row, no rAF scheduled. */
  it('ignores a keep-alive ping with empty data', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit(''))
    expect(rafQueue.size).toBe(0)
    act(() => flushRaf())
    expect(result.current.rows).toHaveLength(0)
  })

  /** A schema-invalid frame is skipped without tearing down the stream. */
  it('skips a frame that fails schema validation', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit(JSON.stringify({ id: 'e1', message: 'missing fields' })))
    expect(rafQueue.size).toBe(0)
    act(() => flushRaf())
    expect(result.current.rows).toHaveLength(0)
  })

  /** Non-JSON data is caught and dropped (the parse-throw branch). */
  it('drops a non-JSON frame via the catch branch', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit('{not json'))
    expect(rafQueue.size).toBe(0)
    act(() => flushRaf())
    expect(result.current.rows).toHaveLength(0)
  })

  /** Two frames arriving before a flush coalesce into a single rAF batch. */
  it('coalesces multiple frames into one animation-frame flush', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => {
      source().emit(frame({ id: 'a' }))
      source().emit(frame({ id: 'b' }))
    })
    // A single rAF handle is scheduled for the whole batch.
    expect(rafQueue.size).toBe(1)
    act(() => flushRaf())
    expect(result.current.rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  /**
   * Beyond the 10k ring-buffer capacity the oldest rows are evicted so a
   * high-rate stream never grows unbounded (drop-oldest splice branch).
   */
  it('evicts the oldest rows past the ring-buffer capacity', () => {
    const total = 10_001
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => {
      for (let i = 0; i < total; i += 1) source().emit(frame({ id: `e${i}` }))
    })
    act(() => flushRaf())
    // Capped at capacity; the very first row was dropped, the newest is retained.
    expect(result.current.rows).toHaveLength(10_000)
    expect(result.current.rows[0]?.id).toBe('e1')
    expect(result.current.rows.at(-1)?.id).toBe('e10000')
  })

  /** After a long quiet period the idle guardrail closes the stream. */
  it('auto-stops the stream after the idle window elapses', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().onopen?.())
    expect(result.current.connected).toBe(true)
    // Advance past the 5-minute idle threshold so the next idle tick closes it.
    act(() => {
      vi.advanceTimersByTime(6 * 60_000)
    })
    expect(source().closeCount).toBeGreaterThan(0)
    expect(result.current.connected).toBe(false)
  })

  /** An idle tick within the window leaves the stream open (the else path). */
  it('keeps the stream open while data is recent', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().onopen?.())
    // One 30s tick — well under the 5-minute idle threshold.
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(source().closeCount).toBe(0)
    expect(result.current.connected).toBe(true)
  })

  /** `clear()` empties the buffer and cancels a pending flush so it cannot re-add rows. */
  it('clear() drops buffered rows and a queued flush', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit(frame({ id: 'x' })))
    act(() => flushRaf())
    expect(result.current.rows).toHaveLength(1)
    // Queue another flush, then clear before it runs — the queued rAF is cancelled.
    act(() => source().emit(frame({ id: 'y' })))
    expect(rafQueue.size).toBe(1)
    act(() => result.current.clear())
    expect(result.current.rows).toHaveLength(0)
    expect(rafQueue.size).toBe(0)
    // Flushing now is a no-op because the pending batch was dropped.
    act(() => flushRaf())
    expect(result.current.rows).toHaveLength(0)
  })

  /** `clear()` with no pending flush still empties the buffer (no-rAF branch). */
  it('clear() works when no flush is pending', () => {
    const { result } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit(frame({ id: 'z' })))
    act(() => flushRaf())
    expect(result.current.rows).toHaveLength(1)
    expect(rafQueue.size).toBe(0)
    act(() => result.current.clear())
    expect(result.current.rows).toHaveLength(0)
  })

  /** Unmount cancels a pending rAF and closes the source (cleanup, pending branch). */
  it('cleans up a pending flush and closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useLogStream(filter, true))
    act(() => source().emit(frame()))
    expect(rafQueue.size).toBe(1)
    const opened = source()
    unmount()
    expect(opened.closeCount).toBeGreaterThan(0)
    expect(rafQueue.size).toBe(0)
  })

  /** Unmount with no pending flush still closes the source (cleanup, no-rAF branch). */
  it('closes the stream on unmount when no flush is pending', () => {
    const { unmount } = renderHook(() => useLogStream(filter, true))
    const opened = source()
    expect(rafQueue.size).toBe(0)
    unmount()
    expect(opened.closeCount).toBeGreaterThan(0)
  })

  /** Toggling enabled off after opening resets the connection flags. */
  it('resets state when re-rendered disabled after being enabled', () => {
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => useLogStream(filter, on), {
      initialProps: { on: true },
    })
    act(() => source().onopen?.())
    expect(result.current.connected).toBe(true)
    const opened = source()
    rerender({ on: false })
    expect(opened.closeCount).toBeGreaterThan(0)
    expect(result.current.connected).toBe(false)
    expect(result.current.failed).toBe(false)
  })

  /** A filter change opens a new stream and clears rows from the prior filter. */
  it('reopens the stream and drops stale rows when the filter url changes', () => {
    const { result, rerender } = renderHook(({ q }: { q: LogQuery }) => useLogStream(q, true), {
      initialProps: { q: filter },
    })
    act(() => source().emit(frame({ id: 'old' })))
    act(() => flushRaf())
    expect(result.current.rows).toHaveLength(1)
    const firstSource = source()
    rerender({ q: { ...filter, logKey: 'PAYMENT_*' } })
    // A new EventSource is constructed; the previous one is closed and rows reset.
    expect(firstSource.closeCount).toBeGreaterThan(0)
    expect(source()).not.toBe(firstSource)
    expect(result.current.rows).toHaveLength(0)
  })

  /** A filter with no role defaults to `viewer` in the stream URL. */
  it('defaults the role to viewer when the filter omits it', () => {
    const noRole: LogQuery = { source: 'postgres' }
    renderHook(() => useLogStream(noRole, true))
    expect(source().url).toContain('role=viewer')
  })
})
