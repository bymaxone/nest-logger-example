/**
 * Durable Postgres `warn`+ log destination — batched `createMany` via Prisma.
 *
 * Receives the already-serialized, already-redacted JSON line from the library pipeline.
 * Each line is parsed behind a guard (malformed or oversized entries are reported to stderr
 * and skipped, never thrown) and mapped to the `ApplicationLog` columns. The full parsed
 * (already-redacted) entry is stored in `payload` so **no raw PII reaches Postgres**.
 * Fail-soft throughout: a DB error in `createMany` writes `LOGGER_DESTINATION_WRITE_FAILED`
 * to stderr and swallows.
 *
 * Flushes are serialized via a promise chain so concurrent timer and batchSize-triggered
 * flushes never race each other on the database connection.
 *
 * @module
 */
import type { Prisma } from '@prisma/client'
import type { ILogDestination, LogLevel } from '@bymax-one/nest-logger'

/**
 * Minimal Prisma client surface used by this destination.
 * Accepting a narrow interface (rather than the full `PrismaService`) keeps the
 * destination decoupled and makes test mocking type-safe without casts.
 */
export interface ApplicationLogClient {
  readonly applicationLog: {
    createMany(args: {
      data: Prisma.ApplicationLogCreateManyInput[]
      skipDuplicates?: boolean
    }): Promise<{ count: number }>
  }
}

/** Options for the durable Postgres log tier. */
export interface PrismaLogDestinationOptions {
  readonly minLevel?: LogLevel
  readonly batchSize?: number
  readonly flushIntervalMs?: number
}

/** A single parsed, already-redacted log entry (the JSON line the library hands us). */
interface ParsedLogEntry {
  time?: string | number
  level?: string
  logKey?: string
  msg?: string
  message?: string
  service?: string
  requestId?: string
  traceId?: string
  [key: string]: unknown
}

/** Maximum serialized line length accepted by `toRow()`. 2× the library's `maxEntrySizeBytes` (64 KiB). */
const MAX_LINE_BYTES = 131_072

/**
 * Persists `warn`+ entries to Postgres in batches.
 *
 * The payload is parsed behind a guard (a malformed or oversized line is skipped +
 * reported to stderr, never thrown) and stored verbatim (already redacted) so no raw
 * PII reaches the database.
 *
 * @example
 * ```typescript
 * new PrismaLogDestination(prisma, { minLevel: 'warn', batchSize: 50, flushIntervalMs: 2_000 })
 * ```
 */
export class PrismaLogDestination implements ILogDestination {
  readonly name = 'prisma-log'
  readonly minLevel: LogLevel

  private buffer: string[] = []
  private flushTimer?: NodeJS.Timeout
  // Serializes concurrent flush calls — prevents overlapping DB writes and ensures
  // onShutdown() can await all in-flight work before the final drain.
  private flushChain: Promise<void> = Promise.resolve()

  constructor(
    private readonly prisma: ApplicationLogClient,
    private readonly opts: PrismaLogDestinationOptions = {},
  ) {
    this.minLevel = opts.minLevel ?? 'warn'
  }

  /**
   * Start the periodic flush timer.
   *
   * @returns void
   */
  onInit(): void {
    this.flushTimer = setInterval(() => this.scheduleFlush(), this.opts.flushIntervalMs ?? 2_000)
  }

  /**
   * Enqueue the already-serialized log line. Never mutates `payload` — shared string.
   * Schedules an early flush when the batch size threshold is reached.
   *
   * @param payload - Serialized JSON log line (with trailing newline).
   */
  write(payload: string): void {
    this.buffer.push(payload) // never mutate — shared string
    if (this.buffer.length >= (this.opts.batchSize ?? 50)) this.scheduleFlush()
  }

  /**
   * Clear the flush timer, await all in-flight flushes, then drain any remaining buffer.
   *
   * @returns A promise that resolves once all batches have been persisted (or failed softly).
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
   * Parse buffered lines and bulk-insert into `ApplicationLog`. No-op when buffer is empty.
   *
   * @returns A promise that resolves once the batch is inserted (or fails softly).
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const lines = this.buffer.splice(0)
    const data = lines
      .map((line) => this.toRow(line))
      .filter((row): row is NonNullable<typeof row> => row !== null)
    if (data.length === 0) return
    try {
      await this.prisma.applicationLog.createMany({ data, skipDuplicates: true })
    } catch {
      process.stderr.write(
        '{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"prisma-log"}\n',
      )
    }
  }

  /**
   * Parse one line behind a guard. Oversized or malformed entries are reported to stderr and dropped.
   *
   * @param line - Serialized JSON log line.
   * @returns A mapped `ApplicationLog` row, or `null` when the line is invalid.
   */
  private toRow(line: string): Prisma.ApplicationLogCreateManyInput | null {
    // Guard against oversized lines — the library enforces maxEntrySizeBytes, but a defensive
    // check here prevents unbounded JSONB rows if that contract ever drifts.
    if (line.length > MAX_LINE_BYTES) {
      process.stderr.write(
        '{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"prisma-log","reason":"oversized"}\n',
      )
      return null
    }
    let entry: ParsedLogEntry
    try {
      entry = JSON.parse(line) as ParsedLogEntry
    } catch {
      process.stderr.write(
        '{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"prisma-log","reason":"parse"}\n',
      )
      return null
    }
    // Guard against NaN — an invalid date would corrupt the BRIN index on `time`.
    const parsedTime = entry.time != null ? new Date(entry.time) : new Date()
    const time = isNaN(parsedTime.getTime()) ? new Date() : parsedTime

    return {
      time,
      level: entry.level ?? 'info',
      logKey: entry.logKey ?? 'UNKNOWN',
      message: entry.message ?? entry.msg ?? '',
      service: entry.service ?? process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-api',
      requestId: entry.requestId ?? null,
      traceId: entry.traceId ?? null,
      // ParsedLogEntry's index signature uses `unknown` values; cast to InputJsonValue
      // at the JSON boundary (the data was JSON.parse'd so every value is serializable).
      payload: entry as Prisma.InputJsonValue,
    }
  }
}
