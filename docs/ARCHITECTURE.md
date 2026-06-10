# Architecture

How a single `logger.info(...)` call becomes a redacted, trace-correlated JSON line on five backends — and
why the module boundaries across `apps/api`, `apps/worker`, and `apps/web` are drawn where they are.

For the schema and querying side of the durable tier, see **[DATABASE.md](./DATABASE.md)**. For the product
blueprint, see **[OVERVIEW.md §11](./OVERVIEW.md#11-the-logging-pipeline-deep-dive)**.

---

## The five-stage pipeline

A log call flows through five stages. Each runs on the **main thread, before fan-out**, so contextual fields
are already on the entry by the time any destination sees it:

```
PinoLoggerService.info(logKey, msg, userId?, meta?)
      │  validates nothing at runtime (CI checks keys vs LOG_KEYS_CONVENTION_REGEX)
      ▼
1. composed mixin (per log, O(1))
      ├─ LogContextService.getStore()  → { requestId, tenantId, userId }   (ALS — merged FIRST)
      └─ trace.getActiveSpan()         → { traceId, spanId, traceFlags }   (OTel — merged LAST, wins)
      ▼
2. fast-redact (compiled ONCE at bootstrap)  → 97 default paths + app extensions  (~3% throughput)
      ▼
3. size guard (Buffer.byteLength vs maxEntrySizeBytes)  → oversized ⇒ LOGGER_ENTRY_TRUNCATED envelope
      ▼
4. pino.multistream fan-out  (parent level = lowest of all minLevels + LOG_LEVEL)
      ├─ DefaultStdoutDestination   (always on — JSON)
      ├─ PrettyDevDestination       (dev only — pino-pretty)
      ├─ LokiDestination            (info+ — batched HTTP push)
      ├─ PrismaLogDestination       (warn+ — Postgres durable tier)
      └─ RollingFileDestination     (dev only — pino-roll)
      ▼
5. each destination re-filters by its own minLevel, then writes
```

### Stage 1 — the composed mixin

A Pino _mixin_ runs once per log and merges contextual fields onto the entry. The library composes **two**
sources into one mixin:

- **`AsyncLocalStorage` context** — `requestId`, `tenantId`, `userId`, read from `LogContextService.getStore()`.
  Merged **first**.
- **OpenTelemetry trace context** — `traceId`, `spanId`, `traceFlags`, read from `trace.getActiveSpan()`.
  Merged **last**, so on a name conflict the trace context **wins** (an active span is the authoritative trace
  identity at that instant).

A **no-op span** (zeroed trace id, `'0'.repeat(32)`) is skipped. An **unsampled** span (`traceFlags === 0`)
still carries valid ids and is **kept** — gating correlation on `traceFlags` would silently drop it on every
unsampled request. `traceFlags` is the W3C 2-hex lowercase form (`'01'` sampled, `'00'` not).

### Stage 2 — redaction (compiled once)

`fast-redact` turns the 97 default paths (plus any `redactPaths` extensions) into a **specialized function at
bootstrap** — no per-log regex or tree walk. The censor is the **string** `'[REDACTED]'`. The original
in-memory object is **never mutated**; redaction is applied at serialization time. Full path catalog and the
depth-4/5 boundary: **[REDACTION.md](./REDACTION.md)**.

### Stage 3 — the size guard

Before fan-out, the serialized entry's byte length is compared against `maxEntrySizeBytes` (64 KiB in this
repo). An oversized entry is replaced with a `LOGGER_ENTRY_TRUNCATED` envelope, so a pathological payload can
never ship a multi-megabyte line to Loki or Postgres.

### Stage 4 — multistream fan-out

`pino.multistream` does **not** auto-compute the parent level. The library explicitly sets the Pino logger
`level` to the **lowest** of every destination's `minLevel` and the configured `LOG_LEVEL` — otherwise a
`minLevel: 'debug'` destination would silently receive nothing (Pino's default level is `info`). Fan-out then
hands the same payload string to every destination.

### Stage 5 — per-destination write

Each destination re-applies its own `minLevel` and writes. Two invariants make this safe on the hot path:

- **Destinations never crash the app.** A throw in `write()` is caught and reported to `process.stderr` as
  `LOGGER_DESTINATION_WRITE_FAILED`; a rejected `onInit()` removes that destination
  (`LOGGER_DESTINATION_INIT_FAILED`) while the others keep running. **Never log from inside `write()`** — that
  would loop; the example's destinations write failures straight to `process.stderr`.
- **Shutdown drains in reverse order.** `app.close()` triggers each destination's `onShutdown()`,
  last-registered first, so buffered sinks (Loki) flush before the process exits → `LOGGER_SHUTDOWN_OK`.

---

## Why singleton scope, not `Scope.REQUEST`

Per-request fields (`requestId`, `tenantId`, `userId`) are delivered by `AsyncLocalStorage`, **not** NestJS
request scope. `PinoLoggerService` and `LogContextService` are plain singletons. This keeps **zero
injection-graph latency** on the hot path: there is no per-request provider instantiation, and the mixin reads
the ALS store directly. `RequestIdMiddleware` opens one ALS scope per request; everything logged within it —
sync or async — inherits the context.

---

## What is internal vs public

The pipeline above describes **observable behavior**. Some of the machinery is intentionally **not** part of
the public API and must not be imported:

| Symbol / concept         | Status       | How you interact with it                                                    |
| ------------------------ | ------------ | --------------------------------------------------------------------------- |
| `TraceContextMixin`      | **internal** | via `otel.shouldAutoInjectTraceContext` / `otel.fieldFormat` options        |
| the composed Pino mixin  | **internal** | it just runs; you observe `requestId` / `traceId` appearing on entries      |
| `REDACT_MAX_DEPTH` (= 4) | **internal** | observed as the depth-4 redaction boundary; tune coverage via `redactPaths` |
| `LOGGER_ERROR_CODES` (8) | **internal** | observed as the reserved `LOGGER_*` log keys on stderr/stdout               |

The **public** surface is the module, the service, the decorators, the destination contract, the tokens, the
redaction constant, and the `/shared` types — enumerated in
[OVERVIEW.md §6](./OVERVIEW.md#6-feature-coverage-matrix). If a behavior here is not in that matrix, treat it
as internal.

---

## Module boundaries

Three independently-deployable apps. No shared in-process state — all log/trace data is carried out-of-band to
the observability backends.

### `apps/api` — the star

Owns the OTel SDK bootstrap and the full logger wiring:

- `instrumentation.ts` is the **first** import in `main.ts`, so `NodeSDK.start()` runs before any NestJS code
  loads (the hard rule — see [OTEL.md](./OTEL.md#the-hard-rule)).
- `BymaxLoggerModule.forRootAsync({ useFactory, inject, imports })` builds options from `ConfigService` in
  `logger/logger.config.ts`.
- Hosts the demo domain (`orders`, `payments`, `pii-demo`, `downstream`, `trigger`, `admin`), the
  destinations, and the `logs/` read-API the dashboard consumes.
- Uses the default `camelCase` field format (`traceId` / `spanId` / `traceFlags`).

### `apps/worker` — the second service

Exists to prove the one thing a single service cannot show: **distributed trace correlation across a service
boundary**.

- Has its **own** OTel SDK bootstrap and registers the logger with `BymaxLoggerModule.forRoot()` (the
  **synchronous** variant — a deliberate contrast with the API's async wiring).
- Configured with `otel.fieldFormat: 'snake_case'` and `traceIdField: 'trace_id'`, so its lines read
  `trace_id` / `span_id` / `trace_flags` (the OTel Logs Data Model wire format).
- Receives a W3C `traceparent` from the API and emits `WORKER_TASK_RECEIVED` / `WORKER_TASK_PROCESSED` lines
  carrying the **same** trace id.

### `apps/web` — pure API client

A Next.js dashboard that **never** touches Postgres or Loki directly. It reads everything through the API's
`logs/` endpoints and imports only the zero-dependency **`@bymax-one/nest-logger/shared`** subpath
(`LogLevel`, `LogEntry`, `RESERVED_LOG_KEYS`, `LOG_KEYS_CONVENTION_REGEX`) to type its forms and validate the
Explorer's query bar. Its full design lives in **[DASHBOARD.md](./DASHBOARD.md)**.

---

## See also

- **[DATABASE.md](./DATABASE.md)** — the `ApplicationLog` schema and how to query the durable tier.
- **[DESTINATIONS.md](./DESTINATIONS.md)** — write and wire a custom `ILogDestination`.
- **[REDACTION.md](./REDACTION.md)** — the 97 default paths and the depth boundary.
- **[OTEL.md](./OTEL.md)** — SDK bootstrap and cross-service propagation.
