# Destinations

A **destination** is any object implementing `ILogDestination`. The library owns JSON serialization,
contextual-field injection, redaction, and the size guard; a destination just takes the finished payload
string and puts it somewhere — stdout, an HTTP backend, a database, a file. This page shows the contract, a
full custom destination, the gotchas that bite people, and the built-ins this repo ships.

---

## The contract

```typescript
interface ILogDestination {
  readonly name: string // identifier used in error logs and registry lookups
  readonly minLevel?: LogLevel // entries below this are filtered out (undefined = accept everything)
  write(payload: string): void | Promise<void> // already-serialized JSON, newline-terminated, UTF-8
  onInit?(): void | Promise<void> // module init: open connections, start flush timers
  onShutdown?(): void | Promise<void> // onApplicationShutdown: flush + close (reverse order)
}
```

That is the whole surface. `write()` may be synchronous (`process.stdout`), buffer-and-flush (HTTP batching),
or return a `Promise` for async I/O. `onInit()` / `onShutdown()` are optional lifecycle hooks driven by the
library's destination registry.

---

## A custom destination, end to end

The canonical example is `LokiDestination`: buffer entries, flush them to Loki on a timer or when a batch
fills, and fail soft if the network is down.

```typescript
// apps/api/src/destinations/loki.destination.ts
import type { ILogDestination, LogLevel } from '@bymax-one/nest-logger'

export class LokiDestination implements ILogDestination {
  readonly name = 'loki'
  readonly minLevel: LogLevel = 'info'

  private buffer: string[] = []
  private flushTimer?: NodeJS.Timeout

  constructor(
    private readonly opts: { url: string; batchSize?: number; flushIntervalMs?: number },
  ) {}

  onInit(): void {
    // start a periodic flush so a low-traffic service still ships its buffer
    this.flushTimer = setInterval(() => void this.flush(), this.opts.flushIntervalMs ?? 5_000)
  }

  write(payload: string): void {
    this.buffer.push(payload)
    if (this.buffer.length >= (this.opts.batchSize ?? 100)) void this.flush()
  }

  async onShutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer)
    await this.flush() // final drain before the process exits
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const batch = this.buffer.splice(0)
    const body = JSON.stringify({
      streams: [
        {
          stream: { service: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example' },
          // Loki wants NANOSECOND timestamps encoded as JSON STRINGS; the line is the raw entry.
          values: batch.map((line) => [String(BigInt(Date.now()) * 1_000_000n), line.trim()]),
        },
      ],
    })
    try {
      await fetch(this.opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    } catch {
      // Fail soft — log delivery MUST NOT crash the app. Report to stderr, NEVER back to the logger.
      process.stderr.write(
        `{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"loki"}\n`,
      )
    }
  }
}
```

### Wire it

Destinations are registered in the `destinations[]` array in `logger.config.ts`:

```typescript
// apps/api/src/logger/logger.config.ts
destinations: [
  new LokiDestination({
    url: config.getOrThrow<string>('LOKI_URL'),
    batchSize: 50,
    flushIntervalMs: 3_000,
  }),
  new PrismaLogDestination(prisma, {
    minLevel: config.get('LOG_DB_MIN_LEVEL') ?? 'warn', // durable tier; Loki keeps info+
    batchSize: 50,
    flushIntervalMs: 2_000,
  }),
  ...(isProd
    ? []
    : [new RollingFileDestination({ file: 'logs/app.log', frequency: 'daily', size: '50m' })]),
]
```

`DefaultStdoutDestination` is always on; `PrettyDevDestination` is added automatically when `isPretty` is true
(dev). You only list the _extra_ sinks here.

---

## Gotchas

These are the failure modes the example tests for — read them before writing a destination.

- **Set the parent level yourself.** `pino.multistream` does **not** compute a parent level from your
  destinations. The library sets the Pino logger `level` to the **lowest** of all destination `minLevel`s and
  `LOG_LEVEL`; otherwise a `minLevel: 'debug'` / `'trace'` destination silently receives nothing (Pino's
  default level is `info`). Each stream then re-filters by its own `minLevel`.
- **Loki push path + timestamp format.** Push to `/loki/api/v1/push` (not `/push`), and each `values`
  timestamp must be the **nanosecond** Unix epoch as a **JSON string** —
  `String(BigInt(Date.now()) * 1_000_000n)`. A numeric value is rejected.
- **`pino-roll` needs async `onInit()`.** `RollingFileDestination` opens its rotating stream asynchronously; it
  cannot be constructed inline in a synchronous `forRoot()` without the lifecycle hook awaiting init. The
  library handles this through `onInit()`.
- **Never mutate the payload.** Every destination receives the **same** payload string. Treat it as immutable —
  copy before transforming.
- **Never log from inside `write()`.** A logger call inside `write()` re-enters the pipeline and loops. Write
  failures go to `process.stderr` as `LOGGER_DESTINATION_WRITE_FAILED`; init failures as
  `LOGGER_DESTINATION_INIT_FAILED` (and that destination is dropped while the rest keep running).
- **Worker-thread transports don't inherit ALS.** If you move a destination into a Pino `transport`
  worker thread, it does **not** see `AsyncLocalStorage`. It doesn't matter here, because the mixin runs on the
  main thread before fan-out — the contextual fields are already on the entry.

---

## Built-in & shipped destinations

| Destination                | `minLevel` | Strategy                                         | Demonstrates                                           |
| -------------------------- | ---------- | ------------------------------------------------ | ------------------------------------------------------ |
| `DefaultStdoutDestination` | (all)      | sync `process.stdout.write` (library built-in)   | the always-on base JSON stream                         |
| `PrettyDevDestination`     | (all)      | `pino-pretty` (library built-in, dev only)       | human-readable colorized output                        |
| `LokiDestination`          | `info`     | buffer → `POST /loki/api/v1/push` on timer/batch | HTTP batching, ns-timestamps, fail-soft, lifecycle     |
| `PrismaLogDestination`     | `warn`     | buffer → `prisma.applicationLog.createMany`      | DB persistence, `minLevel` filtering, the durable tier |
| `RollingFileDestination`   | (all)      | `pino-roll`, async `onInit`, daily/size rotation | async lifecycle, file rotation                         |

`DefaultStdoutDestination` and `PrettyDevDestination` are exported by `@bymax-one/nest-logger`; the other three
live under `apps/api/src/destinations/` as worked examples of the contract.

---

## See also

- **[ENVIRONMENT.md](./ENVIRONMENT.md)** — the `LOKI_URL` / `LOG_DB_MIN_LEVEL` values these destinations read.
- **[REDACTION.md](./REDACTION.md)** — why the payload a destination receives is already PII-safe.
- **[DATABASE.md](./DATABASE.md)** — what `PrismaLogDestination` writes and how to query it.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — tuning `batchSize` / `flushIntervalMs` and the shutdown drain.
