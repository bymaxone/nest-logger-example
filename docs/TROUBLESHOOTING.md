# Troubleshooting

A symptom → cause → fix → see-also reference for `@bymax-one/nest-logger` in this repo.

> **Search this page by the exact error string** — every reserved log key and error message the library can
> emit has an entry below. `Ctrl-F` the `LOGGER_*` key or the literal message you're seeing.

---

## No `traceId` in my logs?

**Symptom.** Log lines are structured and correlated by `requestId`, but there is no `traceId` / `spanId`
field (or `trace_id` in the worker).

**Cause.** The most common cause is **ordering**: the OTel SDK started _after_ NestJS loaded, so the HTTP /
Express auto-instrumentation never patched in and there is no active span to read. Other causes: the
`@opentelemetry/api` peer is missing, there is genuinely no active span at log time, or injection was disabled.

**Fix.** Walk the checklist:

1. Is the instrumentation module imported **first** in `main.ts`, before any NestJS import? If not,
   move it. `otelSdk.start()` must run before NestJS loads.
2. Is `@opentelemetry/api` installed? Without it the library degrades gracefully and omits trace fields by
   design.
3. Is there an **active span** at the moment you log? Auto-instrumentation opens one per HTTP request; code
   outside a request (a bare CLI script, a startup hook) has none.
4. Are you **gating on `traceFlags`** anywhere? Don't — unsampled spans (`traceFlags === 0`) still carry a
   valid `traceId` and must be kept.
5. Is `otel.shouldAutoInjectTraceContext` left at its default `true` (not turned off)?

**See also.** [OTEL.md → the hard rule](./OTEL.md#the-hard-rule).

---

## `LOGGER_DESTINATION_WRITE_FAILED`

**Symptom.** A `LOGGER_DESTINATION_WRITE_FAILED` line on **stderr**, naming a destination (e.g. `"loki"`),
while the app keeps serving requests normally.

**Cause.** A destination's `write()`/`flush()` threw — typically a bad `LOKI_URL`, a dead backend host, or a
missing auth header. This is **fail-soft by design**: delivery failures never crash the request path, and they
are reported to stderr, never back through the logger.

**Fix.** Correct the destination's config: verify `LOKI_URL` is reachable and ends in `/loki/api/v1/push`, add
any required auth headers to `LokiDestination`, and confirm the backend is up. The other destinations are
unaffected and keep delivering.

**See also.** [DESTINATIONS.md → gotchas](./DESTINATIONS.md#gotchas).

---

## `LOGGER_DESTINATION_INIT_FAILED`

**Symptom.** A `LOGGER_DESTINATION_INIT_FAILED` line at boot; that destination produces nothing afterward.

**Cause.** A destination's `onInit()` rejected — e.g. `pino-pretty` not installed for `PrettyDevDestination`,
or `pino-roll` unable to open its file for `RollingFileDestination`. The registry **drops** that destination
and continues with the rest.

**Fix.** Install the missing optional peer (`pino-pretty`, `pino-roll`) or fix the resource the destination
needs (file path permissions, directory existence), then restart.

**See also.** [DESTINATIONS.md](./DESTINATIONS.md).

---

## Loki shows nothing

**Symptom.** The app runs and stdout has logs, but Loki (and the dashboard's Loki source) is empty.

**Cause.** Almost always the **push path** or the **timestamp format**. Loki rejects a wrong endpoint and
rejects numeric timestamps.

**Fix.**

- Push to `/loki/api/v1/push` (not `/push`). `LOKI_URL` should be `http://<host>:3100/loki/api/v1/push`.
- Each `values` timestamp must be the **nanosecond** Unix epoch encoded as a **JSON string** —
  `String(BigInt(Date.now()) * 1_000_000n)`. A numeric value is rejected.
- Confirm the Loki container is healthy (`pnpm infra:logs`).

**See also.** [DESTINATIONS.md → gotchas](./DESTINATIONS.md#gotchas) · [OTEL.md → Grafana](./OTEL.md#grafana-derived-field--click-traceid--tempo).

---

## `LOGGER_ENTRY_TRUNCATED`

**Symptom.** Instead of your full log entry you see a `LOGGER_ENTRY_TRUNCATED` envelope with
`originalSizeBytes` / `maxEntrySizeBytes`.

**Cause.** The serialized entry exceeded `maxEntrySizeBytes` (64 KiB in this repo). The size guard replaces
oversized entries so a pathological payload can't ship a multi-megabyte line.

**Fix.** Trim what you log (don't attach whole request/response bodies as metadata), or raise
`maxEntrySizeBytes` in `logger.config.ts` if large entries are genuinely expected and your backend tolerates
them.

**See also.** [ENVIRONMENT.md → logger tuning](./ENVIRONMENT.md#logger-tuning).

---

## Logs are duplicated

**Symptom.** The same exception (or the same request) is logged twice.

**Cause.** Two possibilities:

- **Filter ↔ interceptor double-log.** Both `HttpExceptionFilter` and `HttpLoggingInterceptor` tried to log the
  same exception. The library coordinates them with an internal `__bymax_logger_handled` marker, so this
  normally cannot happen — if it does, you likely registered a second, custom filter/interceptor that logs
  independently.
- **Double trace injection.** Running `@opentelemetry/instrumentation-pino` _and_ the library's mixin injects
  the trace fields twice.

**Fix.** Don't add a competing exception filter that re-logs; let the library's pair handle it. Remove
`@opentelemetry/instrumentation-pino` — the library already injects trace context.

**See also.** [FEATURES.md → error handling](./FEATURES.md#5-error-handling--double-log-avoidance) · [OTEL.md → don't double-inject](./OTEL.md#field-format-contrast).

---

## `debug` / `trace` lines never appear

**Symptom.** You set `LOG_LEVEL=debug` (or a destination with `minLevel: 'debug'`) but no `debug`/`trace` lines
show up anywhere.

**Cause.** `pino.multistream` does not auto-compute the parent level. If the Pino logger's `level` is above
your target, those entries are filtered out **before** fan-out and no destination ever sees them.

**Fix.** Ensure the parent `level` is the **lowest** of all destination `minLevel`s and `LOG_LEVEL` — the
library does this for you, so check that your destination actually declares `minLevel: 'debug'`/`'trace'` and
that `LOG_LEVEL` isn't pinned higher. At runtime you can flip the level via `PATCH /admin/log-level`
(`getRawLogger().level`).

**See also.** [FEATURES.md → runtime level change](./FEATURES.md#10-runtime-level-change) · [DESTINATIONS.md → gotchas](./DESTINATIONS.md#gotchas).

---

## `LOGGER_BOOTSTRAP_WARNING`

**Symptom.** A `LOGGER_BOOTSTRAP_WARNING` at startup.

**Cause.** Default redaction was disabled via `shouldDisableDefaultRedact: true`. The library emits this
warning on purpose, so a security review can see when PII protection was reduced.

**Fix.** This flag should only ever appear in a **dedicated test module** — never in a running service. If you
see it in production, remove the flag and restore the defaults.

**See also.** [REDACTION.md → the dangerous opt-out](./REDACTION.md#the-dangerous-opt-out).

---

## `Cannot find module '@bymax-one/nest-logger'`

**Symptom.** The build or `pnpm dev` fails with `Cannot find module '@bymax-one/nest-logger'` (or its
`/shared` subpath).

**Cause.** The library is consumed via a local `link:` to the sibling `../nest-logger` checkout, and that
checkout's `dist/` was never built — there is nothing to resolve.

**Fix.** Build the library, then reinstall here:

```bash
cd ../nest-logger
pnpm install && pnpm build   # or `pnpm build --watch` to keep it fresh
cd ../nest-logger-example
pnpm install
```

**See also.** [GETTING_STARTED.md → prerequisites](./GETTING_STARTED.md#prerequisites) · [OVERVIEW.md §7](./OVERVIEW.md#7-library-consumption).

---

## See also

- **[GETTING_STARTED.md](./GETTING_STARTED.md)** — the happy path these entries diverge from.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — production configuration and the shutdown owner.
- **[OTEL.md](./OTEL.md)** · **[DESTINATIONS.md](./DESTINATIONS.md)** · **[REDACTION.md](./REDACTION.md)** — the deep dives.
