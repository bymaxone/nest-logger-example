# Deployment

The example targets a **service + sidecar-backends** topology. In production you do **not** run
Loki/Tempo/Grafana yourself unless you want to — you point the exporters at managed backends and ship pure JSON
on stdout for the container runtime to collect.

This is the production checklist. Anything that goes wrong at runtime is in
**[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**.

---

## Production checklist

- **`NODE_ENV=production`** — `isPretty` defaults off, so you get pure JSON on stdout (no `pino-pretty`). The
  container runtime ships it.
- **A meaningful `RELEASE_SHA`** — set it in CI (git SHA or build version) so every log and span is
  attributable to a deploy. It feeds both `service.version` and the OTel `Resource`.
- **Point exporters at managed backends** — set `OTLP_TRACE_ENDPOINT` at your collector / Grafana Cloud /
  Honeycomb / Datadog OTLP endpoint, and `LOKI_URL` (or the Collector's logs pipeline) at your managed log
  backend. Add basic-auth or headers to `LokiDestination` as your backend requires.
- **Keep `@opentelemetry/instrumentation-fs` disabled** and review which auto-instrumentations you actually
  need — fewer hooks, less overhead and noise.
- **One ordered shutdown owner** — see [below](#the-single-ordered-shutdown-owner). Give your orchestrator a
  termination grace period long enough for the final `LokiDestination` flush.
- **Tune the throughput knobs** — `maxEntrySizeBytes`, and each destination's `batchSize` / `flushIntervalMs`,
  to your traffic and your backend's ingestion limits.
- **Decide your redaction posture** — see [below](#redaction-posture).
- **Honor the OTel version pins** — see [below](#version-pins).

The production env guards are enforced by the Zod schema: in `production`, `OTLP_TRACE_ENDPOINT` / `LOKI_URL` /
`WORKER_URL` / `DATABASE_URL` may not be the dev defaults or loopback, and `WEB_ORIGIN` must be `https://`.
See **[ENVIRONMENT.md](./ENVIRONMENT.md)**.

---

## The single ordered shutdown owner

On `SIGTERM`, the shutdown must run in a fixed order so buffered logs and spans both drain. `main.ts` owns it;
`instrumentation.ts` must have **no** competing `process.exit()`:

```typescript
// apps/api/src/main.ts — the ONE shutdown owner
let isShuttingDown = false
const shutdown = (): void => {
  if (isShuttingDown) return // idempotent: SIGTERM + SIGINT can both fire
  isShuttingDown = true
  void app
    .close() // 1. NestJS onApplicationShutdown → the library drains its destinations (reverse order)
    .then(() => otelSdk.shutdown()) // 2. flush spans to the collector
    .finally(() => process.exit(0)) // 3. exit
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
```

The order matters: `app.close()` first, so destinations flush their buffers (Loki's final batch lands) before
the SDK shuts down and the process exits. The example deliberately does **not** call
`app.enableShutdownHooks()` — on NestJS 11 it re-raises the signal and races this handler. A standalone
`process.exit(0)` inside `instrumentation.ts` would cut the destination flush short; there is none.

---

## Redaction posture

Keep `email` / `cpf` / `cnpj` / `rg` and the other defaults redacted unless you have a **documented, reviewed**
reason to do otherwise. The only way to remove the defaults is `shouldDisableDefaultRedact: true`, which emits a
`LOGGER_BOOTSTRAP_WARNING` precisely so a security review can catch it. Never disable defaults in a running
service. Full rules: **[REDACTION.md](./REDACTION.md)**.

---

## Version pins

The OTel packages are on **two different release lines** — pin them deliberately:

- `@opentelemetry/sdk-node` → `^0.218.0` (its own 0.x experimental line; there is no 1.x yet).
- `@opentelemetry/auto-instrumentations-node` → `^0.76.0` (a **separate** `0.7x` line, not the `0.2xx` core
  line).
- The upper bound lives on the **API**: `@opentelemetry/api` `>=1.9.0 <1.10`. This mirrors `sdk-node`'s own
  `@opentelemetry/api` peer range and is what actually prevents an accidental `1.10` upgrade from breaking the
  SDK.

See **[OVERVIEW.md §7](./OVERVIEW.md#7-library-consumption)** for the full dependency block.

---

## Container

The API and worker each ship a multi-stage `Dockerfile` (Node 24 alpine). The run command enables source maps:

```dockerfile
CMD ["node", "--enable-source-maps", "dist/main.js"]
```

An `start:instrumented` variant uses the Node 20.6+ `--import` bootstrap, which loads instrumentation before
the app entrypoint without relying on the first-import convention:

```dockerfile
CMD ["node", "--enable-source-maps", "--import", "./dist/instrumentation.mjs", "dist/main.js"]
```

A production compose file (`docker-compose.prod.yml`) wires the two services against managed backends; it is a
deployment artifact (planned / CI-owned) and is not duplicated here.

---

## See also

- **[ENVIRONMENT.md](./ENVIRONMENT.md)** — every variable and its production guard.
- **[OTEL.md](./OTEL.md)** — the SDK bootstrap and shutdown rationale.
- **[DESTINATIONS.md](./DESTINATIONS.md)** — `batchSize` / `flushIntervalMs` tuning and the drain order.
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** — when production behaves unexpectedly.
