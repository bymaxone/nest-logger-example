# Environment

Runtime configuration is environment-variable driven, and the core variables are **validated at boot with
Zod** (`apps/api/src/config/env.schema.ts`; `apps/worker` has its own slim schema). A missing or invalid
schema variable **aborts startup** with a precise message. A few values live outside the schema —
`RETENTION_DAYS` is read where the retention sweep uses it, and `SENTRY_DSN` only matters if you add the
optional Sentry integration. The root `.env.example` documents every variable; each service reads its own `.env`.

The `Maps to` column names the `BymaxLoggerModuleOptions` / OTel target each variable feeds; the mapping is
implemented in `apps/api/src/logger/logger.config.ts` and `apps/api/src/instrumentation.ts`.

---

## Reference

| Variable                  | Service      | Example                                                        | Used for                                                                   | Maps to                                               |
| ------------------------- | ------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `NODE_ENV`                | all          | `development`                                                  | Drives the `isPretty` default + the `deployment.environment` resource attr | `isPretty` default · OTel `Resource`                  |
| `PORT`                    | api / worker | `3001` / `3002`                                                | HTTP listen port (Grafana owns `3000`, web is `3003`)                      | `app.listen(PORT)`                                    |
| `LOG_LEVEL`               | all          | `debug`                                                        | Minimum level emitted                                                      | `options.level`                                       |
| `OTEL_SERVICE_NAME`       | all          | `nest-logger-example-api`                                      | Service identity on every log + span                                       | `service.name` · OTel `Resource` `service.name`       |
| `RELEASE_SHA`             | all          | `$(git rev-parse --short HEAD)`                                | Attribute every log/trace to a deploy                                      | `service.version` · OTel `Resource` `service.version` |
| `OTLP_TRACE_ENDPOINT`     | all          | `http://localhost:4318/v1/traces`                              | Where the OTLP exporter ships spans (the Collector)                        | `OTLPTraceExporter({ url })`                          |
| `OTEL_FIELD_FORMAT`       | all          | `camelCase` \| `snake_case`                                    | Trace-field casing on log entries                                          | `otel.fieldFormat`                                    |
| `LOG_EXTRA_REDACT_PATHS`  | api          | `*.webhookSignature,payload.creditCard.*`                      | Comma-split, trimmed, **merged** into the 97 defaults                      | `redactPaths` (merged, never replaces)                |
| `LOKI_URL`                | api          | `http://localhost:3100/loki/api/v1/push`                       | `LokiDestination` push endpoint                                            | `LokiDestination({ url })`                            |
| `LOKI_QUERY_URL`          | api          | `http://localhost:3100`                                        | Base URL the `logs/loki` proxy queries                                     | loki-proxy controller base URL                        |
| `DATABASE_URL`            | api          | `postgresql://postgres:postgres@localhost:5432/logger_example` | Prisma connection (domain + `PrismaLogDestination`)                        | Prisma datasource                                     |
| `LOG_DB_MIN_LEVEL`        | api          | `warn`                                                         | Floor of the durable Postgres tier                                         | `PrismaLogDestination.minLevel`                       |
| `RETENTION_DAYS`          | api          | `30`                                                           | TTL sweep over `ApplicationLog` (Maintenance page)                         | retention sweep window                                |
| `WORKER_URL`              | api          | `http://localhost:3002`                                        | `apps/api` → `apps/worker` dispatch hop (cross-service trace)              | `downstream` HTTP target                              |
| `WEB_ORIGIN`              | api          | `http://localhost:3003`                                        | Dashboard origin allowed by the API CORS policy                            | CORS allow-list                                       |
| `SENTRY_DSN`              | api          | _(unset)_                                                      | Optional — only used if you add the Sentry + OTel integration              | `Sentry.init({ dsn })` (opt-in; see OTEL.md)          |
| `NEXT_PUBLIC_API_URL`     | web          | `http://localhost:3001`                                        | Dashboard → `apps/api` `logs/` API base                                    | browser fetch base URL                                |
| `NEXT_PUBLIC_GRAFANA_URL` | web          | `http://localhost:3000`                                        | "View trace" deep-links to Tempo via Grafana                               | browser deep-link base                                |

> The `apps/api` Zod schema also enforces a few **production guards** beyond presence: in `production`,
> `OTLP_TRACE_ENDPOINT` / `LOKI_URL` / `WORKER_URL` / `DATABASE_URL` must not point at the dev defaults or
> loopback, and `WEB_ORIGIN` must be `https://`. See [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## OTel-aligned naming

The library's examples reference both `OTEL_SERVICE_NAME` / `RELEASE_SHA` and the older
`SERVICE_NAME` / `GIT_SHA`. This repo standardizes on the **OTel-aligned names** so the _same_ variable feeds
both surfaces:

- `OTEL_SERVICE_NAME` → the logger's `service.name` block **and** the OTel SDK `Resource` `service.name`.
- `RELEASE_SHA` → the logger's `service.version` **and** the OTel `Resource` `service.version`.

One source of truth per identity attribute, no drift between your logs and your traces.

---

## Extra redact paths are merged, never replaced

`LOG_EXTRA_REDACT_PATHS` is comma-split, trimmed, and appended to the 97 defaults:

```typescript
// apps/api/src/logger/logger.config.ts
const extraPaths = (config.get<string>('LOG_EXTRA_REDACT_PATHS') ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
// → options.redactPaths = extraPaths   (the library concatenates these onto DEFAULT_REDACT_PATHS)
```

Hyphenated header keys **must** use bracket syntax, e.g. `req.headers["x-service-token"]`. Full rules:
**[REDACTION.md → extending safely](./REDACTION.md#extending-safely)**.

---

## Logger tuning

A few options are tuned in `logger.config.ts` rather than via env, but matter operationally:

- `maxEntrySizeBytes: 65_536` — the 64 KiB ceiling; entries above it become a `LOGGER_ENTRY_TRUNCATED`
  envelope.
- `redactCensor: '[REDACTED]'` — the censor is a **string** (the public type is `string` only; a censor
  _function_ would not typecheck).
- `http.excludePaths: [/^\/health$/, /^\/metrics$/, /^\/logs\/stream$/]` — a `RegExp[]`, anchored and
  ReDoS-safe; matched paths emit no `HTTP_REQUEST_*` lines.
- destination `batchSize` / `flushIntervalMs` — Loki `50` / `3_000 ms`; Prisma `50` / `2_000 ms`.

---

## `.env.example` excerpt

The committed template (trimmed to the common dev values):

```bash
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug

OTEL_SERVICE_NAME=nest-logger-example-api
RELEASE_SHA=dev
OTLP_TRACE_ENDPOINT=http://localhost:4318/v1/traces
OTEL_FIELD_FORMAT=camelCase

LOG_EXTRA_REDACT_PATHS=*.webhookSignature,payload.creditCard.*,req.headers["x-service-token"]

LOKI_URL=http://localhost:3100/loki/api/v1/push
LOKI_QUERY_URL=http://localhost:3100

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/logger_example
LOG_DB_MIN_LEVEL=warn
RETENTION_DAYS=30

WORKER_URL=http://localhost:3002
WEB_ORIGIN=http://localhost:3003

SENTRY_DSN=

NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_GRAFANA_URL=http://localhost:3000
```

---

## Validation

Boot calls the Zod schema's `parse()` on `process.env`. A missing required variable (e.g. `DATABASE_URL` has
no default) aborts before NestJS starts:

```text
❌ Invalid environment configuration:
  · DATABASE_URL: Required
Process exiting (1).
```

Because validation happens **once at boot**, a misconfigured deploy fails fast and loudly instead of emitting
mislabeled or undelivered logs at runtime.

---

## See also

- **[DESTINATIONS.md](./DESTINATIONS.md)** — what `LOKI_URL` / `LOG_DB_MIN_LEVEL` actually wire up.
- **[REDACTION.md](./REDACTION.md)** — how `LOG_EXTRA_REDACT_PATHS` merges into the defaults.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — production values and the version-pin rules.
