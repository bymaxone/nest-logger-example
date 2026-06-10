# Getting started

From a clean clone to a NestJS API emitting a **structured, redacted, trace-correlated** log line —
a `traceId` you click through to a Tempo trace in Grafana — in about five minutes.

This is the front door. It deliberately stays shallow: every deep dive lives in a sibling doc, linked
inline. If you only read one page, read this one.

---

## Prerequisites

| Tool           | Version   | Check                    |
| -------------- | --------- | ------------------------ |
| Node.js        | `>= 24`   | `node -v` (`nvm use`)    |
| pnpm           | `>= 10.8` | `pnpm -v`                |
| Docker Compose | v2        | `docker compose version` |

The repo pins Node 24 in `.nvmrc`, so `nvm use` selects the right runtime.

> **The library is not on npm yet.** `@bymax-one/nest-logger` is consumed through a local
> [`link:`](./OVERVIEW.md#7-library-consumption) to the **sibling** `../nest-logger` checkout (both repos
> live side by side under `…/bymax-one/`). Before installing this repo, build the library once and keep
> its `dist/` fresh:
>
> ```bash
> # one terminal — keep the library's dist/ rebuilding (sibling of this repo under …/bymax-one/)
> cd ../nest-logger
> pnpm install
> pnpm build --watch          # tsup watch — emits the dual ESM/CJS subpath build
> ```
>
> Leave that running. See [OVERVIEW §7](./OVERVIEW.md#7-library-consumption) for the `link:` mechanics and
> what changes once the library publishes.

---

## Quick start

With the library building in the other terminal, from the **repo root**:

```bash
# 1. Install workspace deps (resolves the link: to ../nest-logger)
pnpm install

# 2. Bring up Postgres + Loki + Tempo + OTel Collector + Grafana, and wait for health
pnpm infra:up

# 3. Create the API env file from the root template
cp .env.example apps/api/.env

# 4. Apply migrations + seed demo tenants/orders
pnpm --filter api db:migrate
pnpm --filter api db:seed

# 5. Start api + worker + web together (each in watch mode)
pnpm dev
```

`pnpm infra:up` runs `docker compose up -d --wait`, so it blocks until every backend reports healthy.
`pnpm dev` fans out to all three apps in parallel.

---

## What you should see

| Surface                     | URL                            | Notes                                                             |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| **Dashboard** (`apps/web`)  | <http://localhost:3003>        | Overview, Log Explorer, Trigger Center, Alerts, Maintenance       |
| **API health** (`apps/api`) | <http://localhost:3001/health> | Liveness probe — emits **no** access log                          |
| **Worker** (`apps/worker`)  | <http://localhost:3002>        | Second service; proves cross-service trace correlation            |
| **Grafana**                 | <http://localhost:3000>        | Explore: query Loki, click a `traceId` to jump to the Tempo trace |

> `/health` and `/metrics` are listed in `http.excludePaths` (a `RegExp[]`), so hitting them produces no
> `HTTP_REQUEST_*` lines — health-check noise never reaches your logs.

---

## Your first correlated trace

Fire a single request at the orders endpoint:

```bash
curl -sS -X POST http://localhost:3001/orders \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: t_acme' \
  -d '{"amount": 4200}'
```

On the API's stdout you get **three** JSON lines that share **one `requestId`** and **one `traceId`** —
the HTTP interceptor brackets the handler, and the structured `info()` call sits in the middle:

```jsonc
{"level":30,"logKey":"HTTP_REQUEST_START","url":"/orders","requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
{"level":30,"logKey":"ORDER_CREATE_SUCCESS","msg":"Order created","requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
{"level":30,"logKey":"HTTP_REQUEST_SUCCESS","url":"/orders","status":201,"durationMs":12,"requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
```

- `requestId` comes from `RequestIdMiddleware` opening an `AsyncLocalStorage` scope per request.
- `traceId` comes from the active OpenTelemetry span — the library reads `trace.getActiveSpan()` and injects
  it into every line (it never touches the SDK itself). See [OVERVIEW §14](./OVERVIEW.md#14-opentelemetry-correlation)
  for why the SDK must start first.

Now follow that `traceId` end to end:

1. Open Grafana at <http://localhost:3000> → **Explore**.
2. Pick the **Loki** datasource and run:
   ```logql
   {service="nest-logger-example-api"} | json | traceId="4bf92f3577b34da6a3ce929d0e0e4736"
   ```
   (substitute the `traceId` from your own output).
3. The Loki datasource ships a **derived field** on `traceId`. Click it → Grafana jumps straight to the
   **Tempo** trace for that request. That click is the payoff: logs and traces joined on one id.

---

## Prefer the UI?

You do not need `curl`. Open the dashboard's **Trigger Center** at
<http://localhost:3003/trigger> and click **"Structured success"** — it fires the same `POST /orders` and
auto-pivots the Log Explorer to the resulting `requestId` / `traceId`. Every journey below has a matching
button there. The full tour is in **[FEATURES.md](./FEATURES.md)**.

---

## Common snags

| Symptom                                       | Most likely cause                                                                    | Fix                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| No `traceId` in my log lines                  | The OTel SDK started **after** NestJS, so HTTP auto-instrumentation never patched in | [TROUBLESHOOTING → "No `traceId` in my logs?"](./TROUBLESHOOTING.md#no-traceid-in-my-logs)                       |
| Loki / Explorer shows nothing                 | Wrong Loki push path or a numeric (not string) nanosecond timestamp                  | [TROUBLESHOOTING → "Loki shows nothing"](./TROUBLESHOOTING.md#loki-shows-nothing)                                |
| `Cannot find module '@bymax-one/nest-logger'` | The sibling `link:` target was never built — `dist/` is missing                      | [TROUBLESHOOTING → "Cannot find module …"](./TROUBLESHOOTING.md#cannot-find-module-bymax-onenest-logger)         |
| `debug` / `trace` lines never appear          | The Pino parent level is above your destination's `minLevel`                         | [TROUBLESHOOTING → "`debug` / `trace` lines never appear"](./TROUBLESHOOTING.md#debug--trace-lines-never-appear) |

---

## Where to next

- **[FEATURES.md](./FEATURES.md)** — every library feature fired and shown working, plus all 11 end-to-end journeys.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the five-stage logging pipeline and the module boundaries.
- **[ENVIRONMENT.md](./ENVIRONMENT.md)** — every environment variable and what it feeds.
- **[OTEL.md](./OTEL.md)** — SDK bootstrap, cross-service propagation, Grafana, optional Sentry.
- **[REDACTION.md](./REDACTION.md)** — the 97 default redact paths and how to extend them safely.
- **[OVERVIEW.md](./OVERVIEW.md)** — the full product blueprint.
