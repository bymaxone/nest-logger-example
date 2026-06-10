# Features

Every feature `@bymax-one/nest-logger` ships is fired here and shown working — by `curl` or from the
`apps/web` **Trigger Center**. This page has two halves: a **feature → demo map** that points each library
surface at the file that exercises it, and **eleven end-to-end journeys**, each with the exact command, the
resulting JSON, and the teaching point.

Outputs below are shown **post-redaction** — exactly what lands on stdout, in Loki, and in Postgres. No raw
PII appears anywhere, because none ever leaves the process.

## The 11 journeys

1. [First correlated trace](#1-first-correlated-trace)
2. [PII never leaks](#2-pii-never-leaks)
3. [Depth boundary (4 vs 5)](#3-depth-boundary-4-vs-5)
4. [Slow-path detection](#4-slow-path-detection)
5. [Error handling + double-log avoidance](#5-error-handling--double-log-avoidance)
6. [Cross-service correlation](#6-cross-service-correlation)
7. [Destinations fan-out](#7-destinations-fan-out)
8. [Fault tolerance](#8-fault-tolerance)
9. [Oversized entry](#9-oversized-entry)
10. [Runtime level change](#10-runtime-level-change)
11. [Graceful shutdown](#11-graceful-shutdown)

---

## The structured logging API

Every journey leans on the same four call shapes. The structured calls take
`(logKey, message, userId?, metadata?)`; `fatal()` is the plain variadic NestJS method — there is no
structured-fatal variant:

```typescript
logger.info('ORDER_CREATE_SUCCESS', 'Order created', userId, { orderId, amount })
logger.warnStructured('PAYMENT_CHARGE_ATTEMPT', 'Charging card', userId, { attempt })
logger.errorStructured('PAYMENT_CHARGE_FAILED', error, userId, { orderId }) // serializes err.{type,message,stack}
logger.fatal('Bootstrap failed', err) // variadic — no structured-fatal variant
```

Application log keys follow `MODULE_ACTION_RESULT` (uppercase, ≥2 segments, validated in CI against
`LOG_KEYS_CONVENTION_REGEX`) and must never collide with one of the 16 `RESERVED_LOG_KEYS` the library owns
(`HTTP_REQUEST_*`, `METHOD_SLOW_EXECUTION`, `HTTP_EXCEPTION_HANDLED`, `LOGGER_DESTINATION_WRITE_FAILED`,
`LOGGER_ENTRY_TRUNCATED`, `LOGGER_SHUTDOWN_OK`, …).

---

## Feature → demo map

| Library surface                                                   | What it does                                                          | Demonstrated in                                          | Fire it with               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------- |
| `BymaxLoggerModule.forRoot(options)`                              | Synchronous registration                                              | `apps/worker/src/app.module.ts`                          | starts with the worker     |
| `BymaxLoggerModule.forRootAsync({ useFactory, inject, imports })` | Async registration off `ConfigService`                                | `apps/api/src/app.module.ts` + `logger/logger.config.ts` | starts with the API        |
| `PinoLoggerService.info / warnStructured / errorStructured`       | Structured `MODULE_ACTION_RESULT` logging                             | `orders`, `payments` services                            | journeys 1, 5              |
| `PinoLoggerService.fatal()`                                       | Variadic fatal (no structured variant)                                | bootstrap fatal path                                     | a failed boot              |
| `@InjectLogger(context)`                                          | Per-class child logger bound to a context label                       | every service constructor                                | implicit on every log      |
| `@LogContext(name)`                                               | Class context **label** (records it; `setContext` applies)            | `downstream/downstream.service.ts`                       | journey 6                  |
| `@LogPerformance(thresholdMs)`                                    | Slow-method detection → `METHOD_SLOW_EXECUTION`                       | `orders` slow path                                       | journey 4                  |
| `LogContextService` (`run` / `set` / `get` / `getStore`)          | `AsyncLocalStorage` per-request context                               | `RequestIdMiddleware`, `downstream`                      | journeys 1, 6              |
| `RequestIdMiddleware` / `applyRequestIdMiddleware`                | Opens the ALS scope, mints/echoes `x-request-id`                      | `apps/api/src/app.module.ts` `configure()`               | every request              |
| `HttpLoggingInterceptor` (`http.isEnabled`)                       | `HTTP_REQUEST_START` / `_SUCCESS` / `_CLIENT_ERROR` / `_SERVER_ERROR` | global                                                   | every request              |
| `HttpExceptionFilter`                                             | `HTTP_EXCEPTION_HANDLED` / `_UNHANDLED`                               | `payments`, `pii-demo`                                   | journey 5                  |
| `http.excludePaths` (`RegExp[]`)                                  | Bypass logging for health/metrics                                     | `/health`, `/metrics`                                    | hit either → no log        |
| `DEFAULT_REDACT_PATHS` (auto-applied, exported)                   | 97-path PII redaction                                                 | `pii-demo`                                               | journeys 2, 3              |
| `redactPaths` / `redactCensor` (string)                           | Merge extra paths; censor string `'[REDACTED]'`                       | `logger.config.ts`                                       | journeys 2, 3              |
| `ILogDestination` + `destinations[]`                              | Pluggable sinks                                                       | `apps/api/src/destinations/*`                            | journeys 7, 8              |
| `DefaultStdoutDestination` / `PrettyDevDestination`               | Built-in stdout + dev pretty-print                                    | always on / dev only                                     | every log                  |
| `maxEntrySizeBytes` → `LOGGER_ENTRY_TRUNCATED`                    | Oversized-entry guard                                                 | `pii-demo` huge payload                                  | journey 9                  |
| `getRawLogger()`                                                  | Escape hatch to the Pino instance (runtime level)                     | `admin/log-level`                                        | journey 10                 |
| `otel.shouldAutoInjectTraceContext` / `otel.fieldFormat`          | Inject `traceId`/`spanId`/`traceFlags`; camelCase vs snake_case       | `apps/api` (camelCase) vs `apps/worker` (snake_case)     | journeys 1, 6              |
| `LOG_KEYS_CONVENTION_REGEX`, `RESERVED_LOG_KEYS` (from `/shared`) | Key validation + reserved-key guard                                   | `apps/web/lib/log-keys.ts`, CI audit                     | the Explorer query bar     |
| `@Inject(LOGGER_OPTIONS_TOKEN)`                                   | Runtime audit of the resolved options                                 | `logger/log-audit.service.ts`                            | `GET /logger/redact-paths` |

---

## 1. First correlated trace

**Intent.** One request produces correlated logs you can follow into a trace.

**Fire it.**

```bash
curl -sS -X POST http://localhost:3001/orders \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: t_acme' \
  -d '{"amount": 4200}'
```

**You get** — three lines sharing one `requestId` and one `traceId`:

```jsonc
{"level":30,"logKey":"HTTP_REQUEST_START","url":"/orders","requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
{"level":30,"logKey":"ORDER_CREATE_SUCCESS","msg":"Order created","requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
{"level":30,"logKey":"HTTP_REQUEST_SUCCESS","url":"/orders","status":201,"durationMs":12,"requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
```

**Notice.** The interceptor brackets the handler; your `info()` sits inside. `requestId` rides the ALS scope,
`traceId` rides the active span — no manual plumbing in the handler.

**From the dashboard.** Trigger Center → **Structured success** (auto-pivots the Explorer to this `traceId`).

**Go deeper.** [OTEL.md](./OTEL.md) · [ARCHITECTURE.md](./ARCHITECTURE.md#the-five-stage-pipeline)

---

## 2. PII never leaks

**Intent.** Sensitive fields are redacted before serialization — at the source, not after ingest.

**Fire it.**

```bash
curl -sS -X POST http://localhost:3001/pii-demo/signup \
  -H 'content-type: application/json' \
  -d '{"email":"ana@example.com","password":"hunter2","cpf":"123.456.789-09","cardNumber":"4111111111111111","cardCvv":"123"}'
```

**You get:**

```jsonc
{
  "level": 30,
  "logKey": "USER_SIGNUP_ATTEMPT",
  "msg": "Signup initiated",
  "email": "[REDACTED]",
  "cpf": "[REDACTED]",
  "cardNumber": "[REDACTED]",
  "cardCvv": "[REDACTED]",
  "payment": { "cardNumber": "[REDACTED]" },
  "requestId": "r_7f3a9b",
  "tenantId": "t_acme",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
}
```

**Notice.** The censor is the literal **string** `'[REDACTED]'` (the public `redactCensor` type is `string`
only). The original in-memory object is never mutated — redaction happens at serialization time.

**From the dashboard.** Trigger Center → **PII payload**, then open Maintenance → "PII redacted at source"
to see the same record in both Postgres and Loki, both scrubbed.

**Go deeper.** [REDACTION.md](./REDACTION.md)

---

## 3. Depth boundary (4 vs 5)

**Intent.** Show the wildcard reach of the defaults — and where it intentionally stops.

**Fire it.**

```bash
curl -sS -X POST http://localhost:3001/pii-demo/nested \
  -H 'content-type: application/json' \
  -d '{"a":{"b":{"c":{"d":{"password":"deep"}}}}}'
```

**You get** (`PII_NESTED_PROBE`) — a secret four wildcard levels deep is `[REDACTED]`; one level deeper
survives:

```jsonc
{
  "logKey": "PII_NESTED_PROBE",
  "d4": { "a": { "b": { "c": { "password": "[REDACTED]" } } } },
  "d5": { "a": { "b": { "c": { "d": { "password": "deep" } } } } },
}
```

**Notice.** `fast-redact`'s `*` matches a **single** level — there is no recursive `**`. The defaults list each
field at depths 1–4, so depth 5 is out of range by design (the path list trades exhaustiveness for realistic
nesting). Extend it yourself if your payloads nest deeper.

**From the dashboard.** Trigger Center → **Deep-nested PII**.

**Go deeper.** [REDACTION.md → depth boundary](./REDACTION.md#the-depth-boundary-why-depth-5-leaks)

---

## 4. Slow-path detection

**Intent.** Flag methods that exceed a latency threshold.

**Fire it.**

```bash
curl -sS http://localhost:3001/orders/slow
```

**You get** — the structured success **plus** the library's slow-method signal:

```jsonc
{"level":30,"logKey":"ORDER_SLOW_SUCCESS","msg":"Slow order computed","requestId":"r_b21c","traceId":"…"}
{"level":40,"logKey":"METHOD_SLOW_EXECUTION","durationMs":1320,"thresholdMs":1000,"requestId":"r_b21c","traceId":"…"}
```

**Notice.** Slow detection is the **`@LogPerformance(thresholdMs)`** decorator, not an HTTP option — there is
no `http.slowThresholdMs`. The decorated method always returns a `Promise`, so apply it to async methods.

**From the dashboard.** Trigger Center → **Slow method**.

**Go deeper.** [FEATURES → feature map](#feature--demo-map)

---

## 5. Error handling + double-log avoidance

**Intent.** A thrown error is logged with its stack **once**, not duplicated by the interceptor and the filter.

**Fire it** (negative amount forces a failure):

```bash
curl -sS -X POST http://localhost:3001/payments \
  -H 'content-type: application/json' \
  -d '{"orderId":"ord_1","amount":-1}'
```

**You get** — the structured error (with serialized stack) and a single `HTTP_EXCEPTION_HANDLED`:

```jsonc
{"level":50,"logKey":"PAYMENT_CHARGE_FAILED","msg":"Charge failed","err":{"type":"Error","message":"amount must be positive","stack":"Error: amount…"},"requestId":"r_44e","traceId":"…"}
{"level":50,"logKey":"HTTP_EXCEPTION_HANDLED","status":400,"url":"/payments","requestId":"r_44e","traceId":"…"}
```

**Notice.** The exception appears **once**. The interceptor and the `HttpExceptionFilter` coordinate through an
internal `__bymax_logger_handled` marker so an already-logged exception is not logged again on the way out.

**From the dashboard.** Trigger Center → **Error with stack**.

**Go deeper.** [TROUBLESHOOTING → "logs duplicated"](./TROUBLESHOOTING.md#logs-are-duplicated)

---

## 6. Cross-service correlation

**Intent.** Two independently-deployed services share one `traceId` across an HTTP hop.

**Fire it.**

```bash
curl -sS -X POST http://localhost:3001/downstream/dispatch \
  -H 'content-type: application/json' \
  -d '{"task":"reindex"}'
```

**You get** — `apps/api` (camelCase) and `apps/worker` (snake_case) lines carrying the **same** trace id:

```jsonc
// apps/api
{"level":30,"logKey":"DOWNSTREAM_DISPATCH_START","msg":"Dispatching to worker","traceId":"4bf92f35…","spanId":"a1b2c3…"}
{"level":30,"logKey":"DOWNSTREAM_DISPATCH_SUCCESS","msg":"Worker accepted","traceId":"4bf92f35…"}
// apps/worker (otel.fieldFormat: 'snake_case', traceIdField: 'trace_id')
{"level":30,"logKey":"WORKER_TASK_RECEIVED","msg":"Task received","trace_id":"4bf92f35…","span_id":"d4e5f6…"}
{"level":30,"logKey":"WORKER_TASK_PROCESSED","msg":"Task done","trace_id":"4bf92f35…"}
```

**Notice.** The HTTP auto-instrumentation injects a W3C `traceparent` header automatically, so the worker
extracts the same trace context with zero manual code. The field-name casing differs only because the worker
is configured with `otel.fieldFormat: 'snake_case'` — a deliberate teaching contrast. `@LogContext('DownstreamService')`
labels the originating class.

**From the dashboard.** Trigger Center → **Cross-service** → then "all logs for this trace" interleaves both
services.

**Go deeper.** [OTEL.md → cross-service](./OTEL.md#cross-service-correlation)

---

## 7. Destinations fan-out

**Intent.** One log call reaches every configured sink, each filtering by its own `minLevel`.

**Fire it.** Re-run any `warn`+ producer, e.g. the slow path (its `METHOD_SLOW_EXECUTION` is `warn`):

```bash
curl -sS http://localhost:3001/orders/slow
```

**You get** the same entry in three places:

- **stdout** — JSON via `DefaultStdoutDestination` (and a pretty copy in dev).
- **Loki** — pushed in a batch by `LokiDestination` (`minLevel: 'info'`).
- **Postgres** — a row in `ApplicationLog` via `PrismaLogDestination` (`minLevel: 'warn'`), because this
  entry is `warn`. An `info` entry would reach stdout + Loki but **not** Postgres.

Inspect the durable row with Prisma Studio:

```bash
pnpm --filter api db:studio
```

**Notice.** This is the **two-tier** model: `info`+ goes to Loki (aggregation), `warn`+ also lands in Postgres
(durable/audit). The dashboard's source toggle exposes the asymmetry.

**Go deeper.** [DESTINATIONS.md](./DESTINATIONS.md) · [DATABASE.md](./DATABASE.md)

---

## 8. Fault tolerance

**Intent.** A failing destination must never take down the request path.

**Fire it.**

```bash
curl -sS -X POST http://localhost:3001/trigger/fault/loki
```

(or start the API with a dead `LOKI_URL` host).

**You get** — a fail-soft notice on **stderr**, while the request still succeeds:

```jsonc
{"level":40,"logKey":"TRIGGER_FAULT_REQUESTED","msg":"Injecting a Loki write fault"}
{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"loki"}
```

**Notice.** A throw inside `write()` is caught and reported to `process.stderr` — **never** back through the
logger (that would loop). The other destinations keep delivering; the app keeps serving.

**From the dashboard.** Trigger Center → **Fault-inject destination** → watch the Overview pipeline-health panel
flag it.

**Go deeper.** [DESTINATIONS.md → gotchas](./DESTINATIONS.md#gotchas) · [TROUBLESHOOTING → write failures](./TROUBLESHOOTING.md#logger_destination_write_failed)

---

## 9. Oversized entry

**Intent.** A pathologically large log line is truncated, not shipped as a multi-MB blob.

**Fire it.**

```bash
curl -sS -X POST http://localhost:3001/pii-demo/huge \
  -H 'content-type: application/json' \
  -d '{"note":"force a >64 KiB payload"}'
```

**You get** — a `LOGGER_ENTRY_TRUNCATED` envelope instead of the original:

```jsonc
{
  "level": 40,
  "logKey": "LOGGER_ENTRY_TRUNCATED",
  "originalSizeBytes": 91204,
  "maxEntrySizeBytes": 65536,
  "requestId": "r_9aa",
}
```

**Notice.** The size guard compares `Buffer.byteLength` against `maxEntrySizeBytes` (64 KiB here) and replaces
the entry. The original `PII_HUGE_PAYLOAD` intent never makes it onto the wire at full size.

**From the dashboard.** Trigger Center → **Oversized entry**.

**Go deeper.** [ENVIRONMENT.md → `maxEntrySizeBytes`](./ENVIRONMENT.md#logger-tuning)

---

## 10. Runtime level change

**Intent.** Flip the live log level without a redeploy.

**Fire it.**

```bash
curl -sS -X PATCH http://localhost:3001/admin/log-level \
  -H 'content-type: application/json' \
  -d '{"level":"debug"}'
```

**You get:**

```jsonc
{
  "level": 30,
  "logKey": "ADMIN_LOG_LEVEL_CHANGED",
  "msg": "Log level changed",
  "from": "info",
  "to": "debug",
}
```

**Notice.** `/admin/log-level` calls `getRawLogger().level = 'debug'` — the escape hatch to the underlying
Pino instance. `debug` lines start appearing immediately; set it back to `info` and they stop. (Destinations
still apply their own `minLevel` floor — see journey 7.)

**Go deeper.** [TROUBLESHOOTING → `debug` lines](./TROUBLESHOOTING.md#debug--trace-lines-never-appear)

---

## 11. Graceful shutdown

**Intent.** On termination, buffered destinations flush before the process exits.

**Fire it.**

```bash
# find the api process and send it SIGTERM (Ctrl-C in the dev terminal does the same)
kill -TERM "$(pgrep -f 'apps/api')"
```

**You get** — the shutdown notice after the destinations drain:

```jsonc
{ "level": 30, "logKey": "LOGGER_SHUTDOWN_OK", "msg": "All destinations flushed" }
```

**Notice.** `app.close()` runs the destinations' `onShutdown()` in **reverse registration order**, so
`LokiDestination` flushes its final batch before the OTel SDK shuts down and the process exits. A competing
`process.exit()` in `instrumentation.ts` would cut that flush short — the example deliberately has none.

**Go deeper.** [DEPLOYMENT.md → shutdown ordering](./DEPLOYMENT.md#the-single-ordered-shutdown-owner)

---

## See also

- **[GETTING_STARTED.md](./GETTING_STARTED.md)** — get the stack running first.
- **[REDACTION.md](./REDACTION.md)** · **[OTEL.md](./OTEL.md)** · **[DESTINATIONS.md](./DESTINATIONS.md)** · **[DATABASE.md](./DATABASE.md)** — the deep dives the journeys link into.
- **[OVERVIEW.md §15](./OVERVIEW.md#15-demonstrated-journeys)** — the journey list this page expands.
