/**
 * @fileoverview useLogStream — SSE live tail over a bounded, rAF-flushed buffer.
 *
 * Opens an `EventSource` against the same-origin proxy (`/api/logs/stream`, which
 * injects the RBAC headers an EventSource cannot set). Incoming events are
 * coalesced and flushed on `requestAnimationFrame` into a bounded ring buffer
 * (10k lines, drop-oldest) so a high-rate stream never freezes the tab. The
 * browser handles auto-reconnect + `Last-Event-ID` resume; keep-alive `ping`
 * events (empty `data`) are ignored. The stream auto-stops after a long idle.
 *
 * @module lib/use-event-source
 */

'use client'

import { useEffect, useRef, useState } from 'react'

import { encodeLogQuery } from './api-client'
import { coerceLevel, streamEntrySchema, type StreamEntry } from './schemas'
import type { LogQuery, LogRow } from './types'

/** Ring-buffer capacity — newest 10k lines, oldest dropped. */
const BUFFER_CAPACITY = 10_000

/** Auto-stop the stream after this long with no data message (idle guardrail). */
const IDLE_STOP_MS = 5 * 60_000

/** Idle-check tick interval (ms). */
const IDLE_CHECK_MS = 30_000

/**
 * Bounded FIFO buffer that drops the oldest items past its capacity.
 *
 * @typeParam T - The buffered item type.
 */
class RingBuffer<T> {
  private buf: T[] = []

  /**
   * @param capacity - Maximum retained items.
   */
  constructor(private readonly capacity: number) {}

  /**
   * Append items, evicting the oldest to stay within capacity.
   *
   * @param items - Items to append.
   */
  pushMany(items: T[]): void {
    this.buf.push(...items)
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity)
    }
  }

  /**
   * A defensive copy of the current contents (oldest→newest).
   *
   * @returns The buffered items.
   */
  snapshot(): T[] {
    return [...this.buf]
  }

  /** Empty the buffer. */
  clear(): void {
    this.buf = []
  }
}

/** Map a raw SSE entry to a {@link LogRow}. */
function toRow(entry: StreamEntry): LogRow {
  return {
    id: entry.id,
    time: typeof entry.time === 'number' ? new Date(entry.time).toISOString() : entry.time,
    level: coerceLevel(entry.level),
    logKey: entry.logKey,
    message: entry.message,
    service: entry.service,
    tenantId: entry.tenantId ?? null,
    requestId: entry.requestId ?? null,
    traceId: entry.traceId ?? null,
    spanId: entry.spanId ?? null,
    ...(entry.cursor !== undefined ? { cursor: entry.cursor } : {}),
    payload: entry,
  }
}

/** The live tail result. */
export interface LogStream {
  /** Buffered live rows, oldest→newest. */
  rows: LogRow[]
  /** Empty the buffer (the "Clear" control). */
  clear: () => void
  /** Whether the EventSource is currently open. */
  connected: boolean
  /** True after a terminal connection failure (the browser will not reconnect). */
  failed: boolean
}

/**
 * Subscribe to the SSE live tail for a filter.
 *
 * @param filter - The active filter (sent to the proxy as query params).
 * @param enabled - Whether to open the stream (gate this on a relative range).
 * @returns The live {@link LogStream}.
 */
export function useLogStream(filter: LogQuery, enabled: boolean): LogStream {
  // Lazy-init so a fresh RingBuffer is not constructed on every render.
  const bufferRef = useRef<RingBuffer<LogRow> | null>(null)
  const buffer = (bufferRef.current ??= new RingBuffer<LogRow>(BUFFER_CAPACITY))
  // Pending batch + rAF handle live in refs so `clear()` can drop a queued flush
  // (otherwise an in-flight rAF would re-add just-cleared rows).
  const pendingRef = useRef<LogRow[]>([])
  const rafRef = useRef(0)
  const [rows, setRows] = useState<LogRow[]>([])
  const [connected, setConnected] = useState(false)
  const [failed, setFailed] = useState(false)

  const role = filter.role ?? 'admin'
  const url = `/api/logs/stream?${encodeLogQuery(filter)}&role=${role}`

  useEffect(() => {
    if (!enabled) {
      setConnected(false)
      setFailed(false)
      return
    }
    setFailed(false)
    const source = new EventSource(url)
    let lastDataAt = Date.now()

    source.onopen = () => {
      setConnected(true)
      setFailed(false)
    }
    source.onerror = () => {
      setConnected(false)
      // A CLOSED state is terminal (no auto-reconnect): e.g. proxy 502 or RBAC denial.
      // CONNECTING means the browser is retrying transparently — not a failure.
      if (source.readyState === EventSource.CLOSED) setFailed(true)
    }
    source.onmessage = (event: MessageEvent<string>) => {
      if (!event.data) return // keep-alive ping — ignore
      let entry: StreamEntry
      try {
        const parsed = streamEntrySchema.safeParse(JSON.parse(event.data))
        if (!parsed.success) return // skip a malformed frame rather than tearing down the stream
        entry = parsed.data
      } catch {
        return
      }
      pendingRef.current.push(toRow(entry))
      lastDataAt = Date.now()
      rafRef.current ||= requestAnimationFrame(() => {
        buffer.pushMany(pendingRef.current.splice(0))
        rafRef.current = 0
        setRows(buffer.snapshot())
      })
    }

    // Idle guardrail: stop the stream after a long quiet period.
    const idleTimer = setInterval(() => {
      if (Date.now() - lastDataAt > IDLE_STOP_MS) {
        source.close()
        setConnected(false)
        clearInterval(idleTimer)
      }
    }, IDLE_CHECK_MS)

    return () => {
      source.close()
      clearInterval(idleTimer)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [enabled, url, buffer])

  const clear = (): void => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingRef.current = []
    buffer.clear()
    setRows([])
  }

  return { rows, clear, connected, failed }
}
