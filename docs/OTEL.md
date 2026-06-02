# OpenTelemetry — SDK Bootstrap, Correlation, and Grafana Setup

> Phase 9 — cross-service trace correlation: `apps/api` (camelCase fields) ↔ `apps/worker` (snake_case fields).

---

## SDK bootstrap

The OTel SDK **must start before any NestJS code loads**. The example enforces this by making
`import './instrumentation'` the **literal first import** in every service's `main.ts`.

Each service owns its own `instrumentation.ts` and `NodeSDK` instance:

| File                                 | Service                      | Port |
| ------------------------------------ | ---------------------------- | ---- |
| `apps/api/src/instrumentation.ts`    | `nest-logger-example-api`    | 3001 |
| `apps/worker/src/instrumentation.ts` | `nest-logger-example-worker` | 3002 |

The SDK ships spans to `OTLP_TRACE_ENDPOINT` (defaults to `http://localhost:4318/v1/traces`).

---

## Field-format contrast

| Service       | `otel.fieldFormat`    | Emitted keys                           |
| ------------- | --------------------- | -------------------------------------- |
| `apps/api`    | `camelCase` (default) | `traceId` / `spanId` / `traceFlags`    |
| `apps/worker` | `snake_case`          | `trace_id` / `span_id` / `trace_flags` |

`apps/worker` also sets `otel.traceIdField: 'trace_id'` explicitly to demonstrate
the per-field override. The underlying trace-id **value** is identical across both services.

---

## Click `traceId` → Tempo

The Loki datasource provisioned in `docker/grafana/provisioning/datasources/datasources.yml`
defines a **derived field** that turns the `traceId` (or `trace_id`) in every log line into
a clickable link that jumps to the correlated Tempo trace.

Regex: `"trace_?[iI]d":"([a-f0-9]{32})"` — matches both `"traceId":"<id>"` (api, camelCase)
and `"trace_id":"<id>"` (worker, snake_case).

To use it:

1. Open **Grafana → Explore → Loki**.
2. Expand any log line that contains a `traceId` or `trace_id` field.
3. Click the **traceId** link in the derived-fields row → Tempo opens the unified trace.

---

## Cross-service correlation in Grafana

1. `pnpm infra:up && pnpm dev` (api on `:3001`, worker on `:3002`).
2. `curl -XPOST localhost:3001/downstream/dispatch` — note the `traceId` printed to stdout.
3. Open **Grafana → Explore → Loki**, enter:
   ```logql
   {service=~"nest-logger-example-.*"} | json | traceId="<that-id>"
   ```
   Both `apps/api` and `apps/worker` log lines appear, interleaved.
   > To query worker lines directly (snake_case field) use `trace_id="<id>"` instead.
4. Expand any line → click the **traceId** derived field → Tempo opens the unified trace
   spanning both services.

---

## Optional: Sentry + OpenTelemetry

Gate this integration behind `SENTRY_DSN` (unset → fully no-op, zero runtime cost).

In **each service's** `instrumentation.ts`, add the Sentry init **before** `new NodeSDK(...)`:

```typescript
import * as Sentry from '@sentry/node'
import { SentryPropagator } from '@sentry/opentelemetry'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enableLogs: true,
    // Captures 'error'/'fatal' level Pino logs as Sentry events via the built-in integration.
    integrations: [Sentry.pinoIntegration({ error: { levels: ['error', 'fatal'] } })],
  })
}

export const otelSdk = new NodeSDK({
  // …
  // Wire the Sentry propagator so traceIds flow between OTel spans and Sentry events:
  ...(process.env.SENTRY_DSN ? { textMapPropagator: new SentryPropagator() } : {}),
})
```

**Package requirements**: `@sentry/node` ≥ 10.18 + `@sentry/opentelemetry`.

**Important**:

- Use the **built-in** `Sentry.pinoIntegration()` exported from `@sentry/node` — there is
  **no** separate `@sentry/pino` package.
- The legacy `@sentry/opentelemetry-node` is NOT used.
- Do **not** add `@opentelemetry/instrumentation-pino` — the library already injects trace
  context; adding it would double-inject the trace fields (OVERVIEW.md §14 "Do not double-inject").
