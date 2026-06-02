/**
 * Rolling-file destination using `pino-roll` — demonstrates the async `onInit()` lifecycle.
 *
 * `pino-roll` resolves the destination stream asynchronously, so the stream MUST be opened
 * in `onInit()` (not the constructor). `write()` guards against a not-yet-open or failed
 * stream. `onShutdown()` ends the stream and awaits drain so buffered bytes hit disk before
 * exit. Fail-soft on init: a failed open reports `LOGGER_DESTINATION_INIT_FAILED` to stderr.
 *
 * This is an example-only dependency — `pino-roll` is NOT a peer of `@bymax-one/nest-logger`.
 *
 * @module
 */
import { once } from 'node:events'
import type { Writable } from 'node:stream'

import type { ILogDestination, LogLevel } from '@bymax-one/nest-logger'

import { openPinoRollStream } from './pino-roll.build.js'

/** Options for the rolling-file destination (daily and/or size-based rotation). */
export interface RollingFileDestinationOptions {
  readonly file: string
  readonly frequency?: 'daily' | number
  readonly size?: string
}

/**
 * Writes log lines to a rotating file via `pino-roll`.
 *
 * Demonstrates the ASYNC `onInit()` lifecycle hook — the stream is opened asynchronously
 * and cannot be built inline in a sync `forRoot()`. Fail-soft on init and write.
 *
 * @example
 * ```typescript
 * new RollingFileDestination({ file: 'logs/app.log', frequency: 'daily', size: '50m' })
 * ```
 */
export class RollingFileDestination implements ILogDestination {
  readonly name = 'rolling-file'
  // No minLevel filter — receives every level so the file is a complete local record.
  // In production this destination is omitted from destinations[] entirely (dev-only).
  readonly minLevel: LogLevel = 'trace'

  private stream?: Writable

  constructor(private readonly opts: RollingFileDestinationOptions) {}

  /**
   * Open the rolling-file stream asynchronously. A failed open is reported to stderr;
   * the library removes this destination on init failure.
   *
   * @returns A promise that resolves once the stream is open (or fails softly).
   */
  async onInit(): Promise<void> {
    try {
      // pino-roll resolves the destination stream asynchronously — hence async onInit.
      this.stream = await openPinoRollStream({
        file: this.opts.file,
        frequency: this.opts.frequency ?? 'daily',
        size: this.opts.size ?? '50m',
        mkdir: true,
      })
    } catch {
      // Fail soft — report to stderr; the library drops this destination on init failure.
      process.stderr.write(
        '{"level":"warn","logKey":"LOGGER_DESTINATION_INIT_FAILED","destination":"rolling-file"}\n',
      )
    }
  }

  /**
   * Write the already-serialized log line to the open stream.
   * Guards against a missing stream (failed init) and never mutates `payload`.
   *
   * @param payload - Serialized JSON log line (with trailing newline).
   */
  write(payload: string): void {
    // Guard: stream may be undefined if onInit failed. Never mutate `payload`.
    // stream.write() returns false on backpressure; we deliberately ignore it —
    // for a log destination, memory pressure is preferable to blocking the application.
    this.stream?.write(payload)
  }

  /**
   * End the stream and await drain so buffered bytes hit disk before process exit.
   *
   * @returns A promise that resolves once the stream has flushed.
   */
  async onShutdown(): Promise<void> {
    if (!this.stream) return
    const stream = this.stream
    stream.end()
    // Race 'finish' against 'error' so a disk-full / permission error on final flush
    // does not hang the shutdown indefinitely.
    await Promise.race([
      once(stream, 'finish'),
      new Promise<void>((_, reject) => stream.once('error', reject)),
    ]).catch((err: unknown) => {
      process.stderr.write(
        `{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"rolling-file","reason":${JSON.stringify(String(err))}}\n`,
      )
    })
  }
}
