/**
 * Loki batched HTTP push destination — the reference `ILogDestination` implementation.
 *
 * Demonstrates every lifecycle hook: `onInit()` starts a flush timer, `write()` enqueues
 * the unmodified serialized line and flushes early when the batch fills, `onShutdown()`
 * clears the timer and awaits a final flush. Fail-soft: a failed push writes
 * `LOGGER_DESTINATION_WRITE_FAILED` to `process.stderr` and NEVER throws, NEVER logs
 * through the logger (that would loop).
 *
 * @module
 */
import type { ILogDestination, LogLevel } from '@bymax-one/nest-logger'

/** Options for the Loki push destination. */
export interface LokiDestinationOptions {
  readonly url: string
  readonly batchSize?: number
  readonly flushIntervalMs?: number
  /**
   * Maximum serialized POST body in bytes before the batch is dropped with a
   * `LOGGER_DESTINATION_WRITE_FAILED` warning. Prevents Loki 4xx on oversized payloads.
   * Defaults to 1.5 MiB — well below Loki's default 4 MiB ingest limit.
   */
  readonly maxBodyBytes?: number
}

/**
 * Buffers serialized log lines and pushes them to Loki's push API in batches.
 *
 * Fail-soft: a failed push is reported to stderr and never throws — log delivery
 * MUST NOT crash the app. Never writes through the logger (that would loop).
 *
 * Flushes are serialized via a promise chain so concurrent timer and batchSize-triggered
 * flushes never race each other on the network.
 *
 * @example
 * ```typescript
 * new LokiDestination({ url: 'http://localhost:3100/loki/api/v1/push' })
 * ```
 */
export class LokiDestination implements ILogDestination {
  readonly name = 'loki'
  readonly minLevel: LogLevel = 'info'

  private buffer: string[] = []
  private flushTimer?: NodeJS.Timeout
  // Serializes concurrent flush calls — prevents overlapping network requests and ensures
  // onShutdown() can await all in-flight work before the final drain.
  private flushChain: Promise<void> = Promise.resolve()

  constructor(private readonly opts: LokiDestinationOptions) {}

  /**
   * Start the periodic flush timer.
   *
   * @returns void
   */
  onInit(): void {
    this.flushTimer = setInterval(() => this.scheduleFlush(), this.opts.flushIntervalMs ?? 5_000)
  }

  /**
   * Enqueue the already-serialized log line. Never mutates `payload` — every destination
   * shares the same string. Schedules an early flush when the batch size threshold is reached.
   *
   * @param payload - Serialized JSON log line (with trailing newline).
   */
  write(payload: string): void {
    // Never mutate `payload` — every destination shares the same string.
    this.buffer.push(payload)
    if (this.buffer.length >= (this.opts.batchSize ?? 100)) this.scheduleFlush()
  }

  /**
   * Clear the flush timer, await all in-flight flushes, then drain any remaining buffer.
   *
   * @returns A promise that resolves once all batches have been sent (or failed softly).
   */
  async onShutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer)
    // Await any in-flight flush from the chain before starting the final drain.
    await this.flushChain
    await this.flush()
  }

  /**
   * Chain a flush onto the serializing promise so concurrent callers never race.
   *
   * @returns void
   */
  private scheduleFlush(): void {
    this.flushChain = this.flushChain.then(() => this.flush())
  }

  /**
   * Push the current buffer to Loki. No-op when the buffer is empty.
   * Fail-soft: network failures and oversized batches are reported to stderr; never thrown.
   *
   * @returns A promise that resolves once the batch is sent or fails softly.
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const batch = this.buffer.splice(0)
    const nowMs = Date.now()
    const body = JSON.stringify({
      streams: [
        {
          stream: { service: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-api' },
          // Loki requires NANOSECOND timestamps encoded as a STRING.
          // Adding the batch index i ensures unique timestamps within the same millisecond —
          // Loki deduplicates entries with identical {stream, timestamp, value} tuples.
          values: batch.map((line, i) => [
            String(BigInt(nowMs) * 1_000_000n + BigInt(i)),
            line.trim(),
          ]),
        },
      ],
    })
    // Drop oversized batches before sending — Loki rejects them with 4xx anyway.
    const maxBodyBytes = this.opts.maxBodyBytes ?? 1_500_000 // 1.5 MiB default
    if (body.length > maxBodyBytes) {
      process.stderr.write(
        '{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"loki","reason":"batch-too-large"}\n',
      )
      return
    }
    // 10-second hard deadline — a hung Loki endpoint must not block the event loop.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(this.opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Loki responded ${res.status}`)
    } catch {
      // Fail soft — report to stderr, NOT the logger (writing to the logger here loops).
      process.stderr.write(
        '{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"loki"}\n',
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
