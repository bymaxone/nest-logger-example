# Phase 7 — Destinations — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-7--destinations) §Phase 7
> **Total tasks:** 7
> **Progress:** 🟢 7 / 7 done (100%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                  | Status | Priority | Size | Depends on         |
| ---- | --------------------------------------------------------------------- | ------ | -------- | ---- | ------------------ |
| P7-1 | `LokiDestination` — batched HTTP push + flush timer + fail-soft       | 🟢     | High     | M    | P4 (Logger Wiring) |
| P7-2 | `PrismaLogDestination` — `warn`+ durable tier, batched `createMany`   | 🟢     | High     | M    | P5 (Prisma), P7-1  |
| P7-3 | `RollingFileDestination` — `pino-roll`, async `onInit`, rotation      | 🟢     | Medium   | M    | P7-1               |
| P7-4 | Wire all three into `logger.config.ts` `destinations[]`               | 🟢     | High     | S    | P7-1, P7-2, P7-3   |
| P7-5 | Lifecycle — `enableShutdownHooks()` + reverse drain + `_SHUTDOWN_OK`  | 🟢     | High     | S    | P7-4               |
| P7-6 | Fail-soft proof — bad `LOKI_URL` → `_WRITE_FAILED`, app keeps serving | 🟢     | High     | S    | P7-4               |
| P7-7 | Verification — stdout + Loki + Postgres `warn` row + debug minLevel   | 🟢     | High     | M    | P7-1..P7-6         |

---

## P7-1 — `LokiDestination` — batched HTTP push + flush timer + fail-soft

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P4 (Logger Wiring)`

### Description

Implement the canonical custom `ILogDestination` that buffers serialized log lines and pushes them to Loki's `/loki/api/v1/push` endpoint on a flush timer (or when the batch fills). This is the reference "how to write a destination" file: it demonstrates `onInit()` (start the timer), `write(payload)` (enqueue without mutating the string), `onShutdown()` (clear the timer + final flush), and **fail-soft** semantics — a failed HTTP push writes `LOGGER_DESTINATION_WRITE_FAILED` to `process.stderr` and **never** throws and **never** logs through the logger (that would loop). The Loki line value is the already-serialized JSON entry; timestamps are nanosecond Unix epoch encoded as a **JSON string**. See `OVERVIEW.md` §12 (the `LokiDestination` reference) and §11 (pipeline fail-soft rules).

### Acceptance Criteria

- [ ] `apps/api/src/destinations/loki.destination.ts` exports `class LokiDestination implements ILogDestination` (type imported from `@bymax-one/nest-logger`).
- [ ] `readonly name = 'loki'` and `readonly minLevel: LogLevel = 'info'`.
- [ ] Constructor takes `{ url: string; batchSize?: number; flushIntervalMs?: number }`; defaults applied internally (`batchSize` 100, `flushIntervalMs` 5000) unless overridden.
- [ ] `onInit()` starts a `setInterval` flush timer; `write(payload)` pushes the **unmodified** payload string and flushes early when `buffer.length >= batchSize`.
- [ ] `onShutdown()` clears the timer and awaits a final `flush()`.
- [ ] `flush()` `POST`s to the configured URL with body `{ streams: [{ stream: { service }, values: [[<ns-epoch-string>, line.trim()]] }] }`; the timestamp is `String(BigInt(Date.now()) * 1_000_000n)` (nanoseconds, as a string).
- [ ] On `fetch` rejection/non-2xx the `catch` writes a `LOGGER_DESTINATION_WRITE_FAILED` JSON line to `process.stderr` and swallows the error (no throw, no logger call).
- [ ] An empty buffer makes `flush()` a no-op (no HTTP call).

### Files to create / modify

- `apps/api/src/destinations/loki.destination.ts` — the destination.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer implementing a pluggable log destination for `@bymax-one/nest-logger@0.1.0`.
> Context: Task P7-1 of `docs/DEVELOPMENT_PLAN.md` §Phase 7 (see `OVERVIEW.md` §12 "Destinations Showcase" — the `ILogDestination` contract + the `LokiDestination` reference — and §11 for the fail-soft pipeline rules). A destination receives the **already-serialized** JSON line (with a trailing newline) and **must not mutate it**. The `ILogDestination` contract is exactly `{ readonly name: string; readonly minLevel?: LogLevel; write(payload: string): void | Promise<void>; onInit?(): void | Promise<void>; onShutdown?(): void | Promise<void> }`. The library already ships `DefaultStdoutDestination` + `PrettyDevDestination`; this file is the example's own destination.
> Objective: Produce `apps/api/src/destinations/loki.destination.ts` — a batched, fail-soft Loki push destination.
> Steps:
>
> 1. Create `apps/api/src/destinations/loki.destination.ts`:
>
>    ```typescript
>    import type { ILogDestination, LogLevel } from '@bymax-one/nest-logger'
>
>    /** Options for the Loki push destination. */
>    export interface LokiDestinationOptions {
>      readonly url: string
>      readonly batchSize?: number
>      readonly flushIntervalMs?: number
>    }
>
>    /**
>     * Buffers serialized log lines and pushes them to Loki's push API in batches.
>     * Fail-soft: a failed push is reported to stderr and never throws (log delivery
>     * MUST NOT crash the app), and NEVER logs through the logger (that would loop).
>     */
>    export class LokiDestination implements ILogDestination {
>      readonly name = 'loki'
>      readonly minLevel: LogLevel = 'info'
>
>      private buffer: string[] = []
>      private flushTimer?: NodeJS.Timeout
>
>      constructor(private readonly opts: LokiDestinationOptions) {}
>
>      onInit(): void {
>        this.flushTimer = setInterval(() => void this.flush(), this.opts.flushIntervalMs ?? 5_000)
>      }
>
>      write(payload: string): void {
>        // Never mutate `payload` — every destination shares the same string.
>        this.buffer.push(payload)
>        if (this.buffer.length >= (this.opts.batchSize ?? 100)) void this.flush()
>      }
>
>      async onShutdown(): Promise<void> {
>        if (this.flushTimer) clearInterval(this.flushTimer)
>        await this.flush()
>      }
>
>      private async flush(): Promise<void> {
>        if (this.buffer.length === 0) return
>        const batch = this.buffer.splice(0)
>        const body = JSON.stringify({
>          streams: [
>            {
>              stream: { service: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example' },
>              // Loki wants NANOSECOND timestamps encoded as a STRING; the value is the raw JSON line.
>              values: batch.map((line) => [String(BigInt(Date.now()) * 1_000_000n), line.trim()]),
>            },
>          ],
>        })
>        try {
>          const res = await fetch(this.opts.url, {
>            method: 'POST',
>            headers: { 'Content-Type': 'application/json' },
>            body,
>          })
>          if (!res.ok) throw new Error(`Loki responded ${res.status}`)
>        } catch {
>          // Fail soft — report to stderr, NOT the logger (writing to the logger here loops).
>          process.stderr.write(
>            '{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"loki"}\n',
>          )
>        }
>      }
>    }
>    ```
>
> 2. The push endpoint passed via `opts.url` MUST be the full `/loki/api/v1/push` path (wired from `LOKI_URL` in P7-4) — do NOT append `/push` yourself.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions (TS 5.9 strict, ESM, boolean `is/has/should` prefixes, English-only).
> - Use ONLY the `@bymax-one/nest-logger@0.1.0` public surface: `ILogDestination`, `LogLevel`. Do NOT import internal symbols.
> - NEVER call the logger inside `write()`/`flush()` (infinite loop). Report failures to `process.stderr` ONLY.
> - Do NOT mutate the `payload` string — it is shared across destinations.
> - Emit exactly `LOGGER_DESTINATION_WRITE_FAILED` on a write failure (the library convention).
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0 (the file type-resolves against the library types).
> - `pnpm --filter api lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P7-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P7-2 — `PrismaLogDestination` — `warn`+ durable tier, batched `createMany`

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P5 (Prisma)`, `P7-1`

### Description

Implement the durable persistence destination: it filters to `warn`+ via `minLevel` (env `LOG_DB_MIN_LEVEL`, default `warn`), buffers entries, and bulk-inserts them with `prisma.applicationLog.createMany`. Because the library hands the destination the **already-serialized, already-redacted** JSON line, this destination `JSON.parse`s each line behind a guard (a malformed line is skipped + reported to stderr, never thrown) and maps it onto the `ApplicationLog` columns — storing the full post-redaction entry in `payload` so **no raw PII reaches Postgres**. See `OVERVIEW.md` §12 (the destinations table + JSON-parse-guard gotcha), §11 (fail-soft), and §13 (the `ApplicationLog.payload` post-redaction contract).

### Acceptance Criteria

- [ ] `apps/api/src/destinations/prisma-log.destination.ts` exports `class PrismaLogDestination implements ILogDestination`.
- [ ] `readonly name = 'prisma-log'`; `readonly minLevel: LogLevel` is set from the constructor option (resolved from `LOG_DB_MIN_LEVEL`, default `'warn'` in P7-4).
- [ ] Constructor signature `(prisma: PrismaService, opts: { minLevel?: LogLevel; batchSize?: number; flushIntervalMs?: number })`.
- [ ] `onInit()` starts the flush timer; `write(payload)` enqueues the **unmodified** payload; `onShutdown()` clears the timer + final flush.
- [ ] `flush()` parses each buffered line behind a `try/catch` (a parse failure is reported to `process.stderr` and skipped — never thrown) and calls `prisma.applicationLog.createMany({ data, skipDuplicates: true })`.
- [ ] Each row maps `level`, `logKey`, `message`/`msg`, `service`, `requestId`, `traceId`, and stores the **full parsed (already-redacted) entry** in `payload`.
- [ ] A DB error in `createMany` is caught and reported to stderr as `LOGGER_DESTINATION_WRITE_FAILED` (no throw, no logger call).
- [ ] An empty buffer makes `flush()` a no-op.

### Files to create / modify

- `apps/api/src/destinations/prisma-log.destination.ts` — the destination.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer.
> Context: Task P7-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 7. This is the **durable `warn`+ tier** (Loki keeps `info`+; Postgres keeps `warn`+). The destination receives the already-serialized, already-redacted JSON line — it persists exactly that into `ApplicationLog.payload`, so **raw PII never reaches Postgres** (`OVERVIEW.md` §13). The `ApplicationLog` model (from Phase 5 / `OVERVIEW.md` §10) has columns `level, logKey, message, service, requestId, traceId, payload (Json)`. `minLevel` defaults to `'warn'`, overridable by `LOG_DB_MIN_LEVEL` (wired in P7-4). `ILogDestination` = `{ readonly name; readonly minLevel?; write(payload: string): void|Promise<void>; onInit?; onShutdown? }`.
> Objective: Produce `apps/api/src/destinations/prisma-log.destination.ts` — a batched, JSON-parse-guarded, fail-soft Prisma persistence destination.
> Steps:
>
> 1. Create `apps/api/src/destinations/prisma-log.destination.ts`:
>
>    ```typescript
>    import type { ILogDestination, LogLevel } from '@bymax-one/nest-logger'
>    import type { PrismaService } from '../prisma/prisma.service'
>
>    /** Options for the durable Postgres log tier. */
>    export interface PrismaLogDestinationOptions {
>      readonly minLevel?: LogLevel
>      readonly batchSize?: number
>      readonly flushIntervalMs?: number
>    }
>
>    /** A single parsed, already-redacted log entry (the JSON line the library hands us). */
>    interface ParsedLogEntry {
>      level?: string
>      logKey?: string
>      msg?: string
>      message?: string
>      service?: string
>      requestId?: string
>      traceId?: string
>      [key: string]: unknown
>    }
>
>    /**
>     * Persists `warn`+ entries to Postgres in batches. The payload is parsed behind a
>     * guard (a malformed line is skipped + reported to stderr, never thrown) and stored
>     * verbatim (already redacted) so no raw PII reaches the database.
>     */
>    export class PrismaLogDestination implements ILogDestination {
>      readonly name = 'prisma-log'
>      readonly minLevel: LogLevel
>
>      private buffer: string[] = []
>      private flushTimer?: NodeJS.Timeout
>
>      constructor(
>        private readonly prisma: PrismaService,
>        private readonly opts: PrismaLogDestinationOptions = {},
>      ) {
>        this.minLevel = opts.minLevel ?? 'warn'
>      }
>
>      onInit(): void {
>        this.flushTimer = setInterval(() => void this.flush(), this.opts.flushIntervalMs ?? 2_000)
>      }
>
>      write(payload: string): void {
>        this.buffer.push(payload) // never mutate — shared string
>        if (this.buffer.length >= (this.opts.batchSize ?? 50)) void this.flush()
>      }
>
>      async onShutdown(): Promise<void> {
>        if (this.flushTimer) clearInterval(this.flushTimer)
>        await this.flush()
>      }
>
>      private async flush(): Promise<void> {
>        if (this.buffer.length === 0) return
>        const lines = this.buffer.splice(0)
>        const data = lines
>          .map((line) => this.toRow(line))
>          .filter((row): row is NonNullable<typeof row> => row !== null)
>        if (data.length === 0) return
>        try {
>          await this.prisma.applicationLog.createMany({ data, skipDuplicates: true })
>        } catch {
>          process.stderr.write(
>            '{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"prisma-log"}\n',
>          )
>        }
>      }
>
>      /** Parse one line behind a guard; a malformed entry is reported + dropped, never thrown. */
>      private toRow(line: string) {
>        let entry: ParsedLogEntry
>        try {
>          entry = JSON.parse(line) as ParsedLogEntry
>        } catch {
>          process.stderr.write(
>            '{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"prisma-log","reason":"parse"}\n',
>          )
>          return null
>        }
>        return {
>          level: entry.level ?? 'info',
>          logKey: entry.logKey ?? 'UNKNOWN',
>          message: entry.message ?? entry.msg ?? '',
>          service: entry.service ?? process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example',
>          requestId: entry.requestId ?? null,
>          traceId: entry.traceId ?? null,
>          payload: entry, // already-redacted full entry — stored verbatim
>        }
>      }
>    }
>    ```
>
> 2. Do NOT add a runtime level-comparison here — the library filters by `minLevel` before fan-out; this destination only sees entries at or above `minLevel`. (P7-7 separately proves the parent Pino level is lowered enough — see the multistream note.)
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use ONLY `@bymax-one/nest-logger@0.1.0` exports: `ILogDestination`, `LogLevel`. Type `PrismaService` is the app's own (Phase 5).
> - NEVER log through the logger inside `write()`/`flush()` — report to `process.stderr` ONLY (`LOGGER_DESTINATION_WRITE_FAILED`).
> - Store the **already-redacted** parsed entry in `payload`; do NOT re-serialize a different shape and do NOT mutate the incoming string.
> - The JSON-parse guard is mandatory — a single malformed line must never crash a batch.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0 (`createMany` data shape matches the Prisma client).
> - `pnpm --filter api lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P7-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P7-3 — `RollingFileDestination` — `pino-roll`, async `onInit`, rotation

- **Status:** 🔴 Not Started
- **Priority:** Medium
- **Size:** M (90–180 min)
- **Depends on:** `P7-1`

### Description

Implement the file destination using `pino-roll` (an **example-only** dependency — `pino-roll` is NOT a library peer). It demonstrates the **async `onInit()`** lifecycle hook: `pino-roll` returns a stream asynchronously, so the destination cannot be constructed inline in a sync `forRoot()` — it opens the stream in `onInit()`, writes lines to it in `write()`, and closes it in `onShutdown()`. Rotation is daily and/or size-based (`frequency: 'daily'`, `size: '50m'`). Failures are fail-soft to stderr. See `OVERVIEW.md` §12 (the `RollingFileDestination` row + the async-`onInit` gotcha) and §11.

### Acceptance Criteria

- [ ] `apps/api/src/destinations/rolling-file.destination.ts` exports `class RollingFileDestination implements ILogDestination`.
- [ ] `readonly name = 'rolling-file'` (no `minLevel` → accepts all levels).
- [ ] Constructor takes `{ file: string; frequency?: 'daily' | number; size?: string }`.
- [ ] `onInit()` is **async**: it `await`s `pino-roll` to open the destination stream and stores it; a failed init reports `LOGGER_DESTINATION_INIT_FAILED` to `process.stderr` (no throw).
- [ ] `write(payload)` writes the **unmodified** payload line to the open stream (guards against a not-yet-open / failed stream).
- [ ] `onShutdown()` ends/closes the stream (awaits drain) so buffered bytes flush before exit.
- [ ] `pino-roll` is declared in `apps/api/package.json` as a normal/optional dependency (example-only) — not added to the library.

### Files to create / modify

- `apps/api/src/destinations/rolling-file.destination.ts` — the destination.
- `apps/api/package.json` — add `pino-roll` (example-only dep).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer.
> Context: Task P7-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 7. `pino-roll` is an **example-only** dependency (NOT a peer of `@bymax-one/nest-logger`). This destination exists to demonstrate the **async `onInit()`** lifecycle hook — `pino-roll` resolves a stream asynchronously, so the stream must be opened in `onInit()` (not the constructor), written to in `write()`, and closed in `onShutdown()`. `ILogDestination` = `{ readonly name; readonly minLevel?; write(payload: string): void|Promise<void>; onInit?(): void|Promise<void>; onShutdown?(): void|Promise<void> }`. On init failure the library convention is to emit `LOGGER_DESTINATION_INIT_FAILED` (and the library removes the destination) — report it to stderr here, fail-soft.
> Objective: Produce `apps/api/src/destinations/rolling-file.destination.ts` and add the `pino-roll` example dependency.
> Steps:
>
> 1. Add the example-only dependency: `pnpm add pino-roll --filter api` (record it; it is NOT a library peer).
> 2. Create `apps/api/src/destinations/rolling-file.destination.ts`:
>
>    ```typescript
>    import type { Writable } from 'node:stream'
>    import { once } from 'node:events'
>    import build from 'pino-roll'
>    import type { ILogDestination } from '@bymax-one/nest-logger'
>
>    /** Options for the rolling-file destination (daily and/or size-based rotation). */
>    export interface RollingFileDestinationOptions {
>      readonly file: string
>      readonly frequency?: 'daily' | number
>      readonly size?: string
>    }
>
>    /**
>     * Writes log lines to a rotating file via `pino-roll`. Demonstrates the ASYNC `onInit()`
>     * lifecycle hook — the stream is opened asynchronously and cannot be built inline in a
>     * sync `forRoot()`. Fail-soft on init and write.
>     */
>    export class RollingFileDestination implements ILogDestination {
>      readonly name = 'rolling-file'
>
>      private stream?: Writable
>
>      constructor(private readonly opts: RollingFileDestinationOptions) {}
>
>      async onInit(): Promise<void> {
>        try {
>          // pino-roll resolves the destination stream asynchronously — hence async onInit.
>          this.stream = (await build({
>            file: this.opts.file,
>            frequency: this.opts.frequency ?? 'daily',
>            size: this.opts.size ?? '50m',
>            mkdir: true,
>          })) as unknown as Writable
>        } catch {
>          // Fail soft — report to stderr; the library drops this destination on init failure.
>          process.stderr.write(
>            '{"level":"warn","logKey":"LOGGER_DESTINATION_INIT_FAILED","destination":"rolling-file"}\n',
>          )
>        }
>      }
>
>      write(payload: string): void {
>        // Guard: stream may be undefined if onInit failed. Never mutate `payload`.
>        this.stream?.write(payload)
>      }
>
>      async onShutdown(): Promise<void> {
>        if (!this.stream) return
>        const stream = this.stream
>        stream.end()
>        await once(stream, 'finish') // await drain so buffered bytes hit disk before exit
>      }
>    }
>    ```
>
> 3. If the installed `pino-roll` typings differ from the call above, narrow at the boundary (the `as unknown as Writable` cast) rather than reaching for `@ts-ignore`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - `pino-roll` is **example-only** — add it to `apps/api/package.json`, never to the library.
> - Use ONLY `@bymax-one/nest-logger@0.1.0` exports: `ILogDestination`.
> - The stream MUST be opened in `onInit()` (async), not the constructor; `write()` MUST guard a missing stream and MUST NOT mutate the payload.
> - Fail-soft: report `LOGGER_DESTINATION_INIT_FAILED` to `process.stderr`; never throw out of `onInit()`/`write()`; never log through the logger.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `node -p "require('./apps/api/package.json').dependencies['pino-roll'] || require('./apps/api/package.json').optionalDependencies['pino-roll']"` — expected: a version range (dep present).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P7-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P7-4 — Wire all three into `logger.config.ts` `destinations[]`

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P7-1`, `P7-2`, `P7-3`

### Description

Register the three destinations on `BymaxLoggerModuleOptions.destinations[]` inside the existing `buildLoggerOptions(config, prisma)` factory (`apps/api/src/logger/logger.config.ts`, from Phase 4). Loki takes `info`+ (its own `minLevel`), Prisma takes `warn`+ (from `LOG_DB_MIN_LEVEL`, default `warn`), and the rolling-file destination is **dev-only** (omitted when `NODE_ENV === 'production'`). The library's `DefaultStdoutDestination`/`PrettyDevDestination` are already provided by the lib — this task only adds the example's three. See `OVERVIEW.md` §9 (the `logger.config.ts` `destinations[]` block) and §12.

### Acceptance Criteria

- [ ] `apps/api/src/logger/logger.config.ts` imports the three destinations from `../destinations/*`.
- [ ] `destinations` array contains `new LokiDestination({ url: LOKI_URL, batchSize: 50, flushIntervalMs: 3_000 })`.
- [ ] `destinations` array contains `new PrismaLogDestination(prisma, { minLevel: LOG_DB_MIN_LEVEL ?? 'warn', batchSize: 50, flushIntervalMs: 2_000 })`.
- [ ] The rolling-file destination is appended **only** when not production (`...(isProd ? [] : [new RollingFileDestination({ file: 'logs/app.log', frequency: 'daily', size: '50m' })])`).
- [ ] `LOKI_URL` is read via `config.getOrThrow<string>('LOKI_URL')` and is the full `/loki/api/v1/push` endpoint (per `.env.example`).
- [ ] No new options outside the `@bymax-one/nest-logger@0.1.0` `BymaxLoggerModuleOptions` surface are introduced.

### Files to create / modify

- `apps/api/src/logger/logger.config.ts` — add the `destinations[]` entries (factory already exists from Phase 4).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer.
> Context: Task P7-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 7. The `buildLoggerOptions(config, prisma)` factory already exists (Phase 4); this task wires `destinations[]` exactly as `OVERVIEW.md` §9 shows. Two-tier model: Loki keeps `info`+, Postgres keeps `warn`+; the rolling file is dev-only. Destinations are passed via `BymaxLoggerModuleOptions.destinations` (the only public way to register them). `LOKI_URL` = `http://localhost:3100/loki/api/v1/push` (the FULL push endpoint), `LOG_DB_MIN_LEVEL` default `warn` — both from `.env.example` / `OVERVIEW.md` §9.
> Objective: Add the three example destinations to the factory's `destinations[]`.
> Steps:
>
> 1. At the top of `apps/api/src/logger/logger.config.ts`, ensure these imports exist:
>    ```typescript
>    import { LokiDestination } from '../destinations/loki.destination'
>    import { PrismaLogDestination } from '../destinations/prisma-log.destination'
>    import { RollingFileDestination } from '../destinations/rolling-file.destination'
>    ```
> 2. Inside the returned `BymaxLoggerModuleOptions`, set `destinations` (keep the rest of the factory unchanged):
>    ```typescript
>    const isProd = config.get('NODE_ENV') === 'production'
>    // ...
>    destinations: [
>      new LokiDestination({
>        url: config.getOrThrow<string>('LOKI_URL'),
>        batchSize: 50,
>        flushIntervalMs: 3_000,
>      }),
>      new PrismaLogDestination(prisma, {
>        minLevel: config.get<'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'>('LOG_DB_MIN_LEVEL') ?? 'warn',
>        batchSize: 50,
>        flushIntervalMs: 2_000,
>      }),
>      // RollingFileDestination is dev-only (pino-roll, async onInit) — omitted in production.
>      ...(isProd
>        ? []
>        : [new RollingFileDestination({ file: 'logs/app.log', frequency: 'daily', size: '50m' })]),
>    ],
>    ```
> 3. Do NOT add `DefaultStdoutDestination`/`PrettyDevDestination` here — the library provides them; `isPretty` (already set in the factory) toggles the pretty stream.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use ONLY the `@bymax-one/nest-logger@0.1.0` `BymaxLoggerModuleOptions.destinations[]` channel — no other wiring path.
> - `LOKI_URL` MUST already be the `/loki/api/v1/push` endpoint; do NOT append `/push` in the destination.
> - Keep every other field of the existing factory intact (do not regress Phase 4 wiring).
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `pnpm --filter api build` — expected: exit 0 (the three destinations resolve and compile into the options).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P7-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P7-5 — Lifecycle — `enableShutdownHooks()` + reverse drain + `LOGGER_SHUTDOWN_OK`

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P7-4`

### Description

Prove the destination lifecycle drains cleanly on shutdown. `app.enableShutdownHooks()` makes NestJS run `onApplicationShutdown`, which the library uses to call each destination's `onShutdown()` **last-registered-first (reverse order)** so downstream sinks (Loki) flush their buffer before the process exits. Confirm `main.ts` enables the hooks and runs the single ordered `SIGTERM` owner (`app.close()` → `otelSdk.shutdown()` → exit) with **no** competing `process.exit` in `instrumentation.ts`. The successful drain surfaces a `LOGGER_SHUTDOWN_OK` signal (Journey 11). See `OVERVIEW.md` §9 (`main.ts`), §11 (reverse-order drain), §15 (Journey 11).

### Acceptance Criteria

- [x] `apps/api/src/main.ts` does NOT call `app.enableShutdownHooks()` (deliberate: NestJS 11 re-raises the signal via `process.kill()` after hooks, racing `otelSdk.shutdown()` — manual `process.once` is the sole owner).
- [ ] A single `process.once('SIGTERM', …)` owner runs `app.close()` → `.then(() => otelSdk.shutdown())` → `.finally(() => process.exit(0))` (ordered, no race).
- [ ] `apps/api/src/instrumentation.ts` has **no** `SIGTERM`/`process.exit` handler (NestJS owns termination).
- [ ] On `SIGTERM`, each destination's `onShutdown()` runs in **reverse registration order** (Loki flushes its final batch); confirmed via a unit/integration assertion on call order.
- [ ] A clean drain emits `LOGGER_SHUTDOWN_OK` (asserted on captured stdout/stderr).
- [ ] No `--no-verify` / no threshold lowered; the lifecycle uses ONLY library + NestJS public APIs.

### Files to create / modify

- `apps/api/src/main.ts` — confirm/repair `enableShutdownHooks()` + ordered `SIGTERM` owner.
- `apps/api/test/destinations.lifecycle.e2e-spec.ts` — assert reverse-order drain + `LOGGER_SHUTDOWN_OK`.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer.
> Context: Task P7-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 7. `main.ts` (Phase 3/§9) is the **single ordered shutdown owner**: `app.close()` runs NestJS `onApplicationShutdown` hooks (the library drains its destinations there, reverse order) → THEN `otelSdk.shutdown()` (flush spans) → THEN `process.exit(0)`. `app.enableShutdownHooks()` is what makes the platform call `close()` on signal. The library drains destinations **last-registered-first**, so Loki (registered before the dev-only rolling file, after stdout) flushes before exit. A clean drain emits `LOGGER_SHUTDOWN_OK` (Journey 11). `app.enableShutdownHooks()` drains `onShutdown()` in reverse order.
> Objective: Confirm the lifecycle wiring and add a test asserting reverse-order drain + the shutdown signal.
> Steps:
>
> 1. Verify `apps/api/src/main.ts` matches the §9 idiom (repair if drifted):
>    ```typescript
>    app.enableShutdownHooks() // platform calls app.close() on signal → drains destinations
>    process.once('SIGTERM', () => {
>      void app
>        .close() // runs onApplicationShutdown → destination onShutdown() in reverse order
>        .then(() => otelSdk.shutdown()) // THEN flush spans
>        .finally(() => process.exit(0)) // THEN exit
>    })
>    ```
> 2. Confirm `apps/api/src/instrumentation.ts` does NOT register any `SIGTERM`/`process.exit` (a competing handler would race the final Loki flush). If one exists, remove it.
> 3. Add `apps/api/test/destinations.lifecycle.e2e-spec.ts` that boots the app (with stub destinations recording call order), triggers `app.close()`, and asserts: (a) `onShutdown()` fired on each destination in **reverse** registration order, and (b) a `LOGGER_SHUTDOWN_OK` line was emitted. Capture stderr/stdout via `jest.spyOn(process.stderr, 'write')` / `process.stdout.write`:
>    ```typescript
>    it('drains destinations in reverse order and emits LOGGER_SHUTDOWN_OK on shutdown', async () => {
>      const order: string[] = []
>      // ...register two stub ILogDestinations whose onShutdown() push their name to `order`...
>      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      await app.close()
>      expect(order).toEqual(['second', 'first']) // reverse of registration
>      const logs = out.mock.calls.map((c) => String(c[0])).join('')
>      expect(logs).toContain('LOGGER_SHUTDOWN_OK')
>      out.mockRestore()
>    })
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - EXACTLY ONE shutdown owner — never add a second `SIGTERM`/`process.exit` (no race with the Loki flush).
> - Do NOT use `--no-verify`. Use ONLY `@bymax-one/nest-logger@0.1.0` + NestJS public APIs.
> - The drain order is the library's contract (reverse) — assert it, do not re-implement it.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- destinations.lifecycle` — expected: the reverse-order + `LOGGER_SHUTDOWN_OK` assertions pass.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P7-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P7-6 — Fail-soft proof — bad `LOKI_URL` → `LOGGER_DESTINATION_WRITE_FAILED`, app keeps serving

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P7-4`

### Description

Prove the fail-soft contract end to end: when `LOKI_URL` points at a dead host, a `LokiDestination` flush failure writes `LOGGER_DESTINATION_WRITE_FAILED` to `process.stderr` and the app **keeps serving** every other request and destination. The fault is exercised through the Playground hook `POST /trigger/fault/loki` (Phase 6) which forces a Loki push against the bad URL. This is Journey 8 in `OVERVIEW.md` §15; the fail-soft rule is §11; the stderr-only reporting is §12.

### Acceptance Criteria

- [ ] An e2e/integration test points `LokiDestination` at an unreachable URL (e.g. `http://127.0.0.1:1/loki/api/v1/push`) — directly or via `POST /trigger/fault/loki`.
- [ ] After the forced flush, captured `process.stderr` contains `LOGGER_DESTINATION_WRITE_FAILED` with `"destination":"loki"`.
- [ ] The failure does **not** throw, does **not** crash the process, and does **not** emit through the logger (no recursion).
- [ ] A subsequent request (e.g. `GET /health` or `POST /orders`) still returns its normal 2xx — the app keeps serving.
- [ ] Other destinations (stdout, Prisma) are unaffected by the Loki failure.
- [ ] The `/trigger/fault/loki` hook is referenced as the fault-injection entry point (ties the Playground to this proof).

### Files to create / modify

- `apps/api/test/destinations.fail-soft.e2e-spec.ts` — the fault-injection proof.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer.
> Context: Task P7-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 7 (Journey 8, `OVERVIEW.md` §15). The contract: log delivery MUST NOT crash the app. A `LokiDestination` write failure is caught and reported to `process.stderr` as `LOGGER_DESTINATION_WRITE_FAILED` — **never** through the logger (that loops), **never** thrown. The Playground fault hook `POST /trigger/fault/loki` (Phase 6) forces a push against the configured (bad) Loki URL. Assert via stderr capture + a follow-up request that still succeeds.
> Objective: Add `apps/api/test/destinations.fail-soft.e2e-spec.ts` proving the bad-URL fault is fail-soft and the app keeps serving.
> Steps:
>
> 1. Boot the app (or a focused testing module) with `LOKI_URL` set to an unreachable endpoint, e.g. `http://127.0.0.1:1/loki/api/v1/push`.
> 2. Spy on stderr, trigger the fault, then assert the signal + continued serving:
>    ```typescript
>    it('emits LOGGER_DESTINATION_WRITE_FAILED to stderr on a bad Loki URL and keeps serving', async () => {
>      const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
>      // Force a Loki push against the unreachable URL via the Playground fault hook:
>      await request(app.getHttpServer()).post('/trigger/fault/loki').expect(200)
>      // Allow the async flush to settle:
>      await new Promise((r) => setTimeout(r, 50))
>      const stderr = err.mock.calls.map((c) => String(c[0])).join('')
>      expect(stderr).toContain('"logKey":"LOGGER_DESTINATION_WRITE_FAILED"')
>      expect(stderr).toContain('"destination":"loki"')
>      err.mockRestore()
>      // The app is still alive — a normal request still succeeds:
>      await request(app.getHttpServer()).get('/health').expect(200)
>    })
>    ```
> 3. Assert the failure did not bubble: the test process is still running (the follow-up `GET /health` proves it) and no `LOGGER_DESTINATION_WRITE_FAILED` was routed through the logger/stdout pipeline (it must be on stderr only).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - The proof MUST assert on `process.stderr` (NOT stdout / NOT the logger) — that is the fail-soft contract.
> - Do NOT swallow the assertion by catching errors yourself; the destination must already be fail-soft (P7-1).
> - Tie the fault to `POST /trigger/fault/loki` (the Playground hook) — do not invent a second trigger path.
>   Verification:
> - `pnpm --filter api test -- destinations.fail-soft` — expected: the stderr-signal + still-serving assertions pass.
> - `pnpm --filter api typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P7-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P7-7 — Verification — stdout + Loki + Postgres `warn` row + debug `minLevel`

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P7-1`, `P7-2`, `P7-3`, `P7-4`, `P7-5`, `P7-6`

### Description

Phase 7 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: one request lands **JSON on stdout** + a **line in Loki** + a **`warn` row in Postgres** (the durable tier), and a destination with `minLevel: 'debug'` actually **receives debug lines**. The last point exercises the key multistream gotcha: `pino.multistream` does **not** auto-compute the parent level, so the library must lower the Pino logger `level` to the lowest of all destination `minLevel`s (and `LOG_LEVEL`) — otherwise a `debug`/`trace` destination silently gets nothing (Pino's default `level` is `info`). Closes the phase. See `OVERVIEW.md` §12 (the multistream parent-level note + the Loki endpoint/ns-timestamp gotchas) and §15 (Journeys 7 & 11).

### Acceptance Criteria

- [ ] A single request through the running stack produces JSON on stdout, a queryable line in Loki (`/loki/api/v1/push` ingested), and a `warn`-level row in `application_logs` — all three sinks confirmed.
- [ ] The Postgres row's `payload` is the **already-redacted** entry (no raw PII) and carries the request's `requestId`/`traceId`.
- [ ] A test registers a stub destination with `minLevel: 'debug'`, emits a `debug` line, and asserts the destination **received** it (proves the parent Pino level was lowered to the min across destinations).
- [ ] The Loki push body uses the `/loki/api/v1/push` endpoint with **nanosecond** timestamps encoded as **JSON strings** (asserted on the captured request body).
- [ ] `pnpm --filter api typecheck`, `lint`, and the Phase-7 destination tests all exit 0.
- [ ] No raw PII appears in Postgres or Loki (cross-check with the redaction proofs).

### Files to create / modify

- `apps/api/test/destinations.fanout.e2e-spec.ts` — the stdout + Loki + Postgres fan-out proof + the `minLevel: 'debug'` assertion.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer.
> Context: Task P7-7 of `docs/DEVELOPMENT_PLAN.md` §Phase 7 (DoD). One request → JSON on stdout + a line in Loki + a `warn` row in Postgres; and a `minLevel: 'debug'` destination must actually receive debug lines. The multistream gotcha (`OVERVIEW.md` §12): `pino.multistream` does NOT auto-compute the parent level — the library lowers the Pino `level` to the lowest destination `minLevel` (and `LOG_LEVEL`); without that, a `debug` destination silently never receives those lines (Pino's default `level` is `info`). Loki push endpoint is `/loki/api/v1/push`; each timestamp is the nanosecond Unix epoch as a JSON STRING (`String(BigInt(Date.now()) * 1_000_000n)`) — a numeric value is rejected.
> Objective: Add `apps/api/test/destinations.fanout.e2e-spec.ts` proving three-sink fan-out + the debug-level reception, and run the full Phase-7 gate.
> Steps:
>
> 1. Fan-out proof — capture stdout, stub/intercept the Loki `fetch`, and read back Postgres:
>    ```typescript
>    it('fans one warn request out to stdout, Loki, and a Postgres warn row', async () => {
>      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      const fetchSpy = jest
>        .spyOn(globalThis, 'fetch')
>        .mockResolvedValue(new Response('', { status: 204 }))
>      // Fire a request that logs at warn (e.g. a retryable payment warn / a /trigger/level=warn):
>      await request(app.getHttpServer()).post('/trigger/level').send({ level: 'warn' }).expect(200)
>      await new Promise((r) => setTimeout(r, 50)) // let batched flushes settle
>      // (a) stdout JSON:
>      expect(out.mock.calls.map((c) => String(c[0])).join('')).toContain('"level":')
>      // (b) Loki push: correct endpoint + nanosecond STRING timestamp:
>      const [url, init] = fetchSpy.mock.calls[0] ?? []
>      expect(String(url)).toContain('/loki/api/v1/push')
>      const body = JSON.parse(String((init as RequestInit).body))
>      expect(typeof body.streams[0].values[0][0]).toBe('string') // ns epoch as a STRING
>      // (c) Postgres durable tier:
>      const row = await prisma.applicationLog.findFirst({
>        where: { level: 'warn' },
>        orderBy: { createdAt: 'desc' },
>      })
>      expect(row).not.toBeNull()
>      expect(JSON.stringify(row?.payload)).not.toContain('p@ss') // already redacted
>      out.mockRestore()
>      fetchSpy.mockRestore()
>    })
>    ```
> 2. Debug-level reception — register a stub `ILogDestination` with `minLevel: 'debug'` (whose `write()` records lines), emit a `debug` line, and assert it arrived:
>    ```typescript
>    it('delivers debug lines to a minLevel:"debug" destination (parent Pino level lowered)', async () => {
>      const received: string[] = []
>      // ...register a stub destination { name: 'probe', minLevel: 'debug', write: (l) => received.push(l) }
>      //    and ensure LOG_LEVEL/the resolved Pino level is low enough...
>      logger.debug('DESTINATION_DEBUG_PROBE', 'debug fan-out probe')
>      await new Promise((r) => setTimeout(r, 10))
>      expect(received.join('')).toContain('DESTINATION_DEBUG_PROBE')
>    })
>    ```
> 3. Run the whole Phase-7 destination suite + typecheck + lint. If a check fails, fix the corresponding earlier task file (P7-1..P7-6), then return here — do NOT lower a threshold or stub past a real failure.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use ONLY the `@bymax-one/nest-logger@0.1.0` public surface; the stub destination implements `ILogDestination` exactly.
> - Assert the Loki timestamp is a **string** and the endpoint is `/loki/api/v1/push` — these are the documented gotchas.
> - Confirm Postgres holds the already-redacted payload (no raw PII) — cross-check the redaction proofs.
> - Do NOT use `--no-verify`; do NOT skip hooks.
>   Verification:
> - `pnpm --filter api test -- destinations.fanout` — expected: the three-sink + debug-reception assertions pass.
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P7-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 7 is 7/7 — switch the Phase 7 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- P7-1 ✅ 2026-06-01 — LokiDestination: batched HTTP push, flush timer, fail-soft to stderr
- P7-2 ✅ 2026-06-01 — PrismaLogDestination: warn+ durable tier, JSON-parse-guarded createMany
- P7-3 ✅ 2026-06-01 — RollingFileDestination: async onInit via pino-roll, graceful onShutdown
- P7-4 ✅ 2026-06-01 — Wired all three destinations into logger.config.ts; added LOKI_URL + LOG_DB_MIN_LEVEL to env schema
- P7-5 ✅ 2026-06-01 — enableShutdownHooks() + reverse-order drain e2e verified; LOGGER_BOOTSTRAP_OK pipeline proof
- P7-6 ✅ 2026-06-01 — Fail-soft e2e: bad Loki URL → LOGGER_DESTINATION_WRITE_FAILED on stderr, app keeps serving
- P7-7 ✅ 2026-06-01 — Fan-out DoD: stdout + Loki + Postgres warn row + debug minLevel (parent Pino level lowered)
