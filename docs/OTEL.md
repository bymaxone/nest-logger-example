# OpenTelemetry correlation

This is the feature that turns "nice JSON logs" into production observability: every log line carries the
`traceId` of the request that produced it, so you can pivot from a log to its full distributed trace in one
click. It is also the feature that most often silently fails, so the steps here are exact.

See **[FEATURES.md → first correlated trace](./FEATURES.md#1-first-correlated-trace)** for the live walkthrough
and **[OVERVIEW.md §14](./OVERVIEW.md#14-opentelemetry-correlation)** for the product framing.

---

## The hard rule

> **The OTel SDK must `start()` before any NestJS code loads.** The example enforces this by making
> `import './instrumentation'` the **literal first line** of `main.ts`. If the SDK starts after NestJS is
> imported, auto-instrumentation cannot patch the HTTP / Express / pg modules, and **`traceId` will silently
> never appear in your logs** — no error, just missing fields.

Each service owns its own `instrumentation.ts` and `NodeSDK` instance:

| File                                 | Service                      | Port |
| ------------------------------------ | ---------------------------- | ---- |
| `apps/api/src/instrumentation.ts`    | `nest-logger-example-api`    | 3001 |
| `apps/worker/src/instrumentation.ts` | `nest-logger-example-worker` | 3002 |

`apps/api/src/instrumentation.ts` — side-effecting, imported first:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

export const otelSdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-api',
    [ATTR_SERVICE_VERSION]: process.env.RELEASE_SHA ?? 'dev',
    'deployment.environment': process.env.NODE_ENV ?? 'development',
  }),
  traceExporter: new OTLPTraceExporter({ url: process.env.OTLP_TRACE_ENDPOINT }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // noisy in dev
    }),
  ],
})

otelSdk.start()
// NOTE: no SIGTERM / process.exit here. main.ts owns termination; the SDK is flushed AFTER the log
// destinations drain. A process.exit(0) here would race app shutdown and cut the final Loki flush.
```

`apps/api/src/main.ts` keeps a **single** ordered shutdown owner (it deliberately does **not** call
`enableShutdownHooks()`, which on NestJS 11 re-raises the signal and races the SDK flush):

```typescript
import './instrumentation' // MUST be first — starts the OTel SDK before NestJS loads
import { otelSdk } from './instrumentation'
// …
let isShuttingDown = false
const shutdown = (): void => {
  if (isShuttingDown) return
  isShuttingDown = true
  void app
    .close() // runs onApplicationShutdown → the library drains its destinations
    .then(() => otelSdk.shutdown()) // THEN flush spans
    .finally(() => process.exit(0)) // THEN exit
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
```

Ordering and rationale are covered in **[DEPLOYMENT.md → shutdown](./DEPLOYMENT.md#the-single-ordered-shutdown-owner)**.

---

## What the library does vs. what you do

| Responsibility                                      | Owner       | Where                             |
| --------------------------------------------------- | ----------- | --------------------------------- |
| Initialize `NodeSDK`, exporters, resource           | **You**     | `apps/api/src/instrumentation.ts` |
| Enable auto-instrumentation + W3C propagation       | **You**     | `getNodeAutoInstrumentations()`   |
| Graceful `otelSdk.shutdown()` on `SIGTERM`          | **You**     | `main.ts`                         |
| Detect `@opentelemetry/api`, read `getActiveSpan()` | **Library** | trace mixin (automatic)           |
| Inject `traceId` / `spanId` / `traceFlags` per log  | **Library** | composed mixin (automatic)        |
| Field-name format (`camelCase` / `snake_case`)      | **Library** | `otel.fieldFormat`                |

The library never touches the SDK — it only **reads** the ambient span. If `@opentelemetry/api` is not
installed, logs simply omit the trace fields with **no error** (graceful degradation). Injection is on by
default (`otel.shouldAutoInjectTraceContext: true`); set it to `false` to opt out.

> **Don't gate on `traceFlags`.** Unsampled spans (`traceFlags === 0`) still carry a valid `traceId` and are
> kept. Correlation must not depend on the sampling decision, or you lose it on every unsampled request.

---

## Cross-service correlation

The HTTP auto-instrumentation injects a W3C `traceparent` header automatically on outbound calls, so
`apps/api` calling `apps/worker` propagates the trace with **zero manual code** — both services then log lines
carrying the same `traceId`. For a non-instrumented client (a custom fetch wrapper, some vendor SDKs), inject
the headers yourself:

```typescript
import { propagation, context } from '@opentelemetry/api'

const headers: Record<string, string> = { 'content-type': 'application/json' }
propagation.inject(context.active(), headers) // adds `traceparent` + `tracestate`
await fetch(workerUrl, { method: 'POST', headers, body })
```

In Grafana Explore, filter Loki by that `traceId` to see interleaved logs from both services, then click
through to the unified trace in Tempo:

```logql
{service=~"nest-logger-example-.*"} | json | traceId="<that-id>"
```

> To query worker lines directly (snake_case field) use `trace_id="<id>"` instead.

### Field-format contrast

`apps/api` uses the default **camelCase** (`traceId` / `spanId` / `traceFlags`). `apps/worker` is configured
with **snake_case** to demonstrate the option and the OTel Logs Data Model wire format:

```typescript
// apps/worker/src/app.module.ts
otel: {
  shouldAutoInjectTraceContext: true,
  fieldFormat: 'snake_case',     // → trace_id / span_id / trace_flags
  traceIdField: 'trace_id',      // explicit per-field override (always wins over the shortcut)
}
```

The underlying trace-id **value** is identical across both services. Choose camelCase for Pino-native tooling;
choose snake_case when your backend expects the OTel Logs Data Model.

> **Do not double-inject.** Running both the library's mixin **and** `@opentelemetry/instrumentation-pino` on
> the same logger duplicates the trace fields. Disable one — the example keeps the library's mixin and does
> **not** add the Pino instrumentation.

---

## Grafana derived field — click `traceId` → Tempo

The Loki datasource provisioned under `docker/grafana/provisioning/` defines a **derived field** that turns the
`traceId` (or `trace_id`) in every log line into a clickable link to the correlated Tempo trace:

- Regex: `"trace_?[iI]d":"([a-f0-9]{32})"` — matches both `"traceId":"<id>"` (api, camelCase) and
  `"trace_id":"<id>"` (worker, snake_case).

To use it:

1. Open **Grafana → Explore → Loki** and run `{service="nest-logger-example-api"} | json | traceId="<id>"`.
2. Expand any matching line and click the **traceId** link in the derived-fields row.
3. Grafana opens the correlated **Tempo** trace for that request.

For shipping logs to Loki via the Collector instead of the direct push, use the Collector's `otlphttp`
exporter pointed at Loki's native OTLP endpoint (`http://loki:3100/otlp`, with `allow_structured_metadata: true`).
The deprecated Collector `loki` exporter was removed in late 2024 — do not use it; Loki v3+ ingests OTLP
directly.

---

## Optional Sentry integration

Gated behind `SENTRY_DSN` — unset means fully disabled, zero runtime cost. When set, `instrumentation.ts`
initializes Sentry **before** the OTel SDK and registers Sentry's propagator on it:

```typescript
import * as Sentry from '@sentry/node'
import { SentryPropagator } from '@sentry/opentelemetry'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enableLogs: true,
    // Capture 'error'/'fatal' Pino logs as Sentry events via the built-in integration:
    integrations: [Sentry.pinoIntegration({ error: { levels: ['error', 'fatal'] } })],
  })
}

export const otelSdk = new NodeSDK({
  // …resource + traceExporter…
  ...(process.env.SENTRY_DSN ? { textMapPropagator: new SentryPropagator() } : {}),
  // …instrumentations…
})
```

Key facts:

- The capture mechanism is Sentry's **built-in `Sentry.pinoIntegration()`** (exported from `@sentry/node`) —
  there is no separate Sentry-for-Pino package to install.
- Requires **`@sentry/node` ≥ 10.18** plus `@sentry/opentelemetry` for `SentryPropagator`.
- The legacy `@sentry/opentelemetry-node` package is **not** used.
- `Sentry.init(...)` runs **before** `new NodeSDK(...)` so Sentry's instrumentation hooks register first.

---

## See also

- **[FEATURES.md](./FEATURES.md#6-cross-service-correlation)** — the cross-service journey, fired and shown.
- **[ENVIRONMENT.md](./ENVIRONMENT.md)** — `OTLP_TRACE_ENDPOINT`, `OTEL_FIELD_FORMAT`, `SENTRY_DSN`.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — the OTel version pins and the shutdown owner.
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md#no-traceid-in-my-logs)** — when `traceId` is missing.
