# nest-logger-example — Project Overview

> **Reference implementation for [`@bymax-one/nest-logger`](https://github.com/bymaxone/nest-logger)** — structured JSON logging for NestJS built on **Pino 10**, with optional **OpenTelemetry** trace correlation, automatic **PII redaction**, and pluggable **destinations**.
>
> Maintained by **[Bymax One](https://bymax.one)** • MIT License

---

> **📄 About this document.** This is the master **technical blueprint** for `nest-logger-example`. The repository does not exist yet — this file is the authoritative specification an engineer (or an AI agent) reads to build it end to end. It mirrors and improves the proven structure of the sibling [`nest-auth-example`](https://github.com/bymaxone/nest-auth-example) reference app, adapted to demonstrate the **logging** library instead of the **auth** library.
>
> **⚠️ Library status.** `@bymax-one/nest-logger` is **pre-1.0** (`0.1.0`, **implemented** — Phase 4 complete, `dist/` built, **not yet published to npm**). The public API in this document has been **reconciled against the shipped `0.1.0` TypeScript types** (`dist/server/index.d.ts` + `dist/shared/index.d.ts`), which are authoritative. Until the library publishes, the example consumes it through a **local link** (§7); switch to the semver range at first publish. Where any doc and the package types disagree, **the package types win.**
>
> **🔧 Reconciled against the shipped `0.1.0` types (May-2026 audit).** The earlier blueprint was authored pre-code against the library's `README.md`, which itself drifts from the shipped code. This document now follows the **code**; the corrections applied:
>
> | Symbol                                         | Shipped `0.1.0` (authoritative)                                                                                                 | Correction applied                                                      |
> | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
> | NestJS-logger bridge                           | `app.useLogger(app.get(PinoLoggerService))` + option `shouldUseAsNestLogger` (default true)                                     | no `BymaxLoggerModule.useNestLogger(app)` helper ships — use the idiom  |
> | Request-id middleware                          | `RequestIdMiddleware` (via `consumer.apply(...)`) or `http.shouldGenerateRequestId`; `applyRequestIdMiddleware()` also exported | as documented                                                           |
> | `otel` auto-inject flag                        | **`otel.shouldAutoInjectTraceContext`** (default true)                                                                          | was `autoInjectTraceContext`                                            |
> | `warnStructured`                               | **`(logKey, message: string, userId?, meta?)`**                                                                                 | was `(logKey, error, context?)` — message+userId, not Error+context     |
> | structured fatal                               | **none** — use `fatal()` (variadic) or `errorStructured()`                                                                      | `fatalStructured` does not exist                                        |
> | `@LogContext`                                  | **class decorator `@LogContext(name)`** — records a label; `setContext()` applies it in `0.1.0`                                 | was `(store)` method decorator                                          |
> | `http.excludePaths`                            | **`readonly RegExp[]`** (anchored, ReDoS-safe)                                                                                  | was `string[]`                                                          |
> | `redactCensor`                                 | **`string`** only                                                                                                               | the censor-function form is not in the public type                      |
> | `DEFAULT_REDACT_PATHS`                         | **exported** from the `.` subpath; the example references it                                                                    | was wrongly called internal (the export-usage audit needs it)           |
> | `http.slowThresholdMs` / `http.userIdResolver` | **do not exist** in `HttpOptions`                                                                                               | slow = `@LogPerformance(ms)`; userId via `info(logKey, msg, userId, …)` |
>
> The library's own `README.md` still documents some of these incorrectly (`@LogContext(store)`, `warnStructured(error)`, `fatalStructured`, a `redactCensor` function) — a docs issue should be filed upstream. `TraceContextMixin`, `REDACT_MAX_DEPTH`, the composed mixin, and `LOGGER_ERROR_CODES` are **internal** (not public exports) — referenced as observable _behaviors_, not importable surface.

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Architecture at a Glance](#3-architecture-at-a-glance)
4. [Tech Stack](#4-tech-stack)
5. [Repository Layout](#5-repository-layout)
6. [Feature Coverage Matrix](#6-feature-coverage-matrix)
7. [Library Consumption](#7-library-consumption)
8. [Local Stack (Docker Compose)](#8-local-stack-docker-compose)
9. [Configuration & Environment](#9-configuration--environment)
10. [The Demo Domain & Log Explorer Dashboard](#10-the-demo-domain--log-explorer-dashboard)
11. [The Logging Pipeline (Deep Dive)](#11-the-logging-pipeline-deep-dive)
12. [Destinations Showcase](#12-destinations-showcase)
13. [PII Redaction Showcase](#13-pii-redaction-showcase)
14. [OpenTelemetry Correlation](#14-opentelemetry-correlation)
15. [Demonstrated Journeys](#15-demonstrated-journeys)
16. [Testing Strategy](#16-testing-strategy)
17. [Deployment Notes](#17-deployment-notes)
18. [Versioning & Release Tracking](#18-versioning--release-tracking)
19. [Contributing](#19-contributing)
20. [License, Attribution & Status](#20-license-attribution--status)

---

## 1. Purpose

`nest-logger-example` is the **canonical reference application** for the `@bymax-one/nest-logger` package. It exists to show — end to end, with no shortcuts — how to wire a production-grade **structured logging and observability pipeline** into a NestJS application.

It is simultaneously:

- A **runnable demo** — `git clone`, `docker compose up`, `pnpm dev`, and you have a NestJS API emitting structured JSON logs (shipped to **Loki**, durably persisted to **Postgres**, distributed-**trace** correlated) **plus a Next.js 16 observability dashboard** where you fire any kind of log and watch it stream in real time — charted, filtered, and one click from its trace — no Grafana required.
- A **knowledge base** — every public export of the library (server subpath + `/shared` subpath) is exercised and documented in context, so consumers can copy proven patterns into their own apps.
- A **living migration guide** — it demonstrates how to **replace ad-hoc logging** (`console.log`, raw `nestjs-pino`, hand-rolled redact lists, custom header serializers) with the cohesive, batteries-included `BymaxLoggerModule`.

> **Why this matters.** The sibling `nest-auth-example` today wires logging by hand with the community `nestjs-pino` module — a `forRootAsync` factory that manually lists ~12 redact paths, plumbs a custom `req` serializer through `sanitizeHeaders`, and re-implements request-id/tenant-id `customProps` on every project. That pattern works, but it **drifts**: redact lists fall out of date, header allowlists diverge per service, and there is no built-in OTel correlation or `MODULE_ACTION_RESULT` convention. `@bymax-one/nest-logger` collapses all of that into one module with **97 default PII paths**, automatic trace correlation, an enforced log-key convention, and pluggable destinations. **This repository is the proof.**

If a feature is documented in the library README but is _not_ demonstrated in this repository, that is considered a documentation gap and tracked as an issue (see §6 — the coverage rule is CI-enforced).

---

## 2. Goals & Non-Goals

### Goals

1. **Demonstrate every public feature** of `@bymax-one/nest-logger` in a realistic, runnable context (see §6 — Feature Coverage Matrix). This includes both the server subpath (`@bymax-one/nest-logger`) and the zero-dependency `/shared` subpath.
2. **Mirror real-world production setup** — Docker-based local observability stack (Loki + Grafana + Tempo + OpenTelemetry Collector + Postgres), environment-variable configuration, OTel SDK bootstrap, and structured JSON on stdout.
3. **Stay copy-paste friendly** — module organization, destination implementations, the OTel `main.ts` bootstrap, and the redaction config are intentionally generic so users can lift them directly.
4. **Make logs tangible — a first-class Log Explorer dashboard.** Ship a real Next.js 16 app (`apps/web`) that both **fires** every logging feature on demand (a **Log Playground** — exactly how `nest-auth-example`'s UI exercises each auth feature) and **visualizes** the resulting logs (a **Log Explorer** with filters, live tail, and trace deep-links), reading them back from **both Postgres** (your own DB, the "real case") **and Loki** (the aggregator) with a UI toggle — so a newcomer can see the library working without ever opening Grafana.
5. **Prove cross-service correlation** — a second service (`apps/worker`) shows a single `traceId` flowing across an HTTP hop, with both services' logs joined on that ID in the Explorer and in Grafana.
6. **Be approachable for first-time users** — sensible defaults, a seeded demo domain, and a guided "first 5 minutes" walkthrough that ends with the user firing a log from the Playground and watching it appear (redacted, correlated) in the Explorer.
7. **Stay current with the library** — pinned to a specific `@bymax-one/nest-logger` version per release, with upgrade notes (see §18).

### Non-Goals

- **It is not a starter template.** Use `create-bymax-app` (planned, separate repository) for that. This repo prioritizes completeness over minimalism.
- **It is not an APM/observability platform.** It runs Loki/Tempo/Grafana **locally** purely so the demo is self-contained. Production users point the OTLP exporter and the Loki destination at their own managed backends (Grafana Cloud, Datadog, Honeycomb, etc.).
- **It does not initialize the OTel SDK inside the library.** That is the consumer's responsibility, demonstrated in `apps/api/src/instrumentation.ts` / `main.ts`. The library only **detects** an active span and injects its IDs.
- **It is not a UI kit.** `apps/web` is a real, first-class dashboard, but its styling is intentionally minimal — it is not a design system or component library. Copy its data-fetching and trigger patterns, not its CSS. (It also demonstrates the isomorphic `/shared` subpath, which is the only browser-relevant surface the logger ships.)
- **It does not maintain backwards compatibility across library major versions.** Each major version of the library will have its own branch in this repository (see §18).

---

## 3. Architecture at a Glance

Two NestJS services emit structured logs and OTLP spans. Logs reach Loki (`info`+, the full aggregation tier) and a durable `warn`+ tier lands in Postgres; spans reach Tempo. The **`apps/web` dashboard** fires logs (Playground) and reads them back (Explorer + charts) from **either Postgres or Loki** through the API — the source toggle deliberately exposes the two-tier asymmetry as a teaching moment. Grafana remains available as the "production" view, joining logs ↔ traces on `traceId`.

```
        ┌──────────────────────────────────────────────────────────────────────┐
        │  apps/web · Next.js 16 + React 19                                      │
        │  ───────────────────────────────                                       │
        │  • Log Playground  → buttons/forms fire every feature (POST triggers)  │
        │  • Log Explorer    → table + live tail; filter by level/logKey/        │
        │                       traceId/requestId/time; source toggle ↓          │
        │                       [ Postgres (your DB) | Loki (aggregator) ]       │
        │  • imports LOG_KEYS_CONVENTION_REGEX + types from /shared              │
        └───────┬───────────────────────────────────────────────▲───────────────┘
        trigger │ POST /orders /payments /pii-demo /downstream    │ read
                │ HTTP (X-Request-Id, X-Tenant-Id)                │ GET /logs · /logs/stream (SSE) · /logs/loki
                ▼                                                 │
┌──────────────────────────────────────────────────────────────────────────────────┐
│  apps/api  ·  NestJS 11 + Express 5                                                 │
│  ─────────────────────────────────────                                             │
│  instrumentation.ts → NodeSDK.start()         ← BEFORE any NestJS import            │
│  main.ts            → NestFactory.create(AppModule, { bufferLogs: true })           │
│                       app.useLogger(app.get(PinoLoggerService))                    │
│                                                                                    │
│  BymaxLoggerModule.forRootAsync({ ... })                                            │
│    ├─ PinoLoggerService            (info / warnStructured / errorStructured / …)    │
│    ├─ LogContextService            (AsyncLocalStorage: requestId, tenantId, userId) │
│    ├─ RequestIdMiddleware          (opens the ALS scope per request)                │
│    ├─ HttpLoggingInterceptor       (HTTP_REQUEST_START / _SUCCESS / _CLIENT_ERROR…) │
│    ├─ HttpExceptionFilter          (HTTP_EXCEPTION_HANDLED / _UNHANDLED)            │
│    ├─ TraceContextMixin            (injects traceId / spanId / traceFlags)          │
│    ├─ fast-redact                  (97 default PII paths + app extensions)          │
│    └─ Destinations:                                                                │
│         • DefaultStdoutDestination  (always on — JSON to stdout)                    │
│         • PrettyDevDestination      (dev only — pino-pretty)                        │
│         • LokiDestination           (batched HTTP push → Loki)                      │
│         • PrismaLogDestination      (warn+ → Postgres; durable/audit tier)          │
│         • RollingFileDestination    (pino-roll → ./logs/app-*.log)                  │
│  logs/ module: GET /logs (Prisma) · GET /logs/stream (SSE) · GET /logs/loki (proxy) │
│  Demo domain: /orders, /payments, /pii-demo, /downstream, /admin, /health          │
└───────┬──────────────────────────┬──────────────────────────┬─────────────────────┘
        │ OTLP spans + logs         │ batched log lines (info+) │ warn+ rows (durable tier)
        ▼                           ▼                           ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────────┐
│  OTel Collector │        │      Loki       │        │     PostgreSQL      │
│  (4317 / 4318)  │        │     (3100)      │◀──┐    │       (5432)        │
│  traces→Tempo   │        │  log storage    │   │    │  application_logs   │
│  logs→Loki      │        └────────┬────────┘   │    └─────────────────────┘
└───────┬─────────┘                 │     query (/logs/loki proxy) ┘
        │ spans                     │ logs
        ▼                           ▼
┌─────────────────┐        ┌──────────────────────────────────────────────────┐
│      Tempo      │◀───────│                    Grafana (3000)                  │
│     (3200)      │  trace │  Explore: query Loki by {service,logKey,traceId}   │
│  trace storage  │  ↔ log │  Click traceId → jump to the correlated Tempo span │
└─────────────────┘  link  └──────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│  apps/worker  ·  NestJS 11 (no HTTP server, or a tiny one)                        │
│  Receives a W3C `traceparent` header from apps/api, extracts the context, and    │
│  emits logs carrying the SAME traceId — proving cross-service correlation.        │
└────────────────────────────────────────────────────────────────────────────────┘
```

The three app services are independently deployable. All log/trace state is carried out-of-band to the observability backends; there is no shared in-process state between services. The dashboard is a pure client of the API's `logs/` read endpoints — it never connects to Postgres or Loki directly.

---

## 4. Tech Stack

| Layer                 | Technology                                       | Version                    | Why                                                                                                                      |
| --------------------- | ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Logging library**   | `@bymax-one/nest-logger`                         | `^0.1.0` (pre-1.0)         | The library this project demonstrates                                                                                    |
| Logging engine        | Pino                                             | `^10.0`                    | Library peer dep — ~750k logs/sec, JSON-native                                                                           |
| Pretty dev output     | `pino-pretty`                                    | `^13.0` (optional)         | Human-readable logs in development                                                                                       |
| Rolling files         | `pino-roll`                                      | `^3.0` (optional)          | File destination with daily/size rotation                                                                                |
| Backend runtime       | Node.js                                          | `>=24`                     | Library requirement                                                                                                      |
| Backend framework     | NestJS                                           | `^11.0`                    | Library peer dependency                                                                                                  |
| HTTP adapter          | Express                                          | `^5.0`                     | Default adapter; library is Express-first (Fastify is v0.2)                                                              |
| Tracing API           | `@opentelemetry/api`                             | `>=1.9.0 <1.10` (optional) | The version cap lives HERE (sdk-node peers `<1.10`); lib detects it to inject `traceId`/`spanId`                         |
| Tracing SDK           | `@opentelemetry/sdk-node`                        | `^0.218.0`                 | Still on the 0.x experimental line (no 1.x yet) — consumer-side init in `instrumentation.ts`                             |
| OTLP exporter         | `@opentelemetry/exporter-trace-otlp-http`        | `^0.218`                   | Ships spans to the OTel Collector (same 0.2xx line as sdk-node)                                                          |
| Auto-instrumentation  | `@opentelemetry/auto-instrumentations-node`      | `^0.76`                    | ⚠️ DIFFERENT version line from the core experimental pkgs (`0.7x`, not `0.2xx`); HTTP/Express/pg spans + W3C propagation |
| Database              | PostgreSQL                                       | `18`                       | Backs the `PrismaLogDestination` + demo domain                                                                           |
| ORM                   | Prisma                                           | `^6.0`                     | Type-safe; popular in the NestJS ecosystem                                                                               |
| Log storage           | Grafana Loki                                     | `latest`                   | Local log aggregation for the demo                                                                                       |
| Trace storage         | Grafana Tempo                                    | `latest`                   | Local trace storage for the demo                                                                                         |
| Telemetry pipeline    | OpenTelemetry Collector                          | `latest`                   | OTLP receiver → Tempo (traces) + Loki (logs)                                                                             |
| Dashboards            | Grafana                                          | `latest`                   | Explore view; trace ↔ log correlation                                                                                    |
| Error tracking (opt.) | Sentry (`@sentry/node`, `@sentry/opentelemetry`) | `^10.0` (>=10.18)          | Optional — `SentryPropagator` + built-in `Sentry.pinoIntegration()` (`enableLogs`)                                       |
| **Dashboard**         | Next.js / React                                  | `^16` / `^19`              | First-class Log Explorer + Playground (see §10 + `docs/DASHBOARD.md`)                                                    |
| Dashboard charts      | Recharts (+ Tremor primitives)                   | latest                     | Observability charts: volume, error-rate, latency, level mix                                                             |
| Dashboard data        | TanStack Query + Table + Virtual                 | latest                     | Caching, virtualized log table, infinite scroll                                                                          |
| Real-time             | Server-Sent Events (SSE)                         | —                          | Live tail of new log entries into the Explorer                                                                           |
| Package manager       | pnpm                                             | `^10.8`                    | Matches the library; first-class workspaces                                                                              |
| Container runtime     | Docker Compose                                   | v2                         | Single-command local stack                                                                                               |
| Testing (api/worker)  | Jest + supertest                                 | `^30`                      | Unit + e2e with stdout-capture assertions                                                                                |
| Mutation testing      | Stryker                                          | `^9`                       | Example gate `break: 100` (matches `nest-auth-example`); the lib itself uses ≥99 / `break: 95`                           |
| Testing (web, opt.)   | Vitest + Playwright                              | latest                     | Unit + end-to-end                                                                                                        |

---

## 5. Repository Layout

```
nest-logger-example/
├── apps/
│   ├── api/                              # Primary NestJS service — the star of the demo
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # ApplicationLog (warn+) + Order/Payment + SavedView/AlertRule/Incident/AuditEvent
│   │   │   ├── migrations/
│   │   │   └── seed.ts                   # Demo tenants + sample orders
│   │   ├── src/
│   │   │   ├── instrumentation.ts        # OTel NodeSDK bootstrap (imported FIRST)
│   │   │   ├── main.ts                   # bufferLogs + app.useLogger(get(PinoLoggerService)) + ordered shutdown
│   │   │   ├── app.module.ts             # BymaxLoggerModule.forRootAsync({ ... })
│   │   │   ├── logger/
│   │   │   │   ├── logger.config.ts       # Factory: BymaxLoggerModuleOptions from env
│   │   │   │   └── log-audit.service.ts   # @Inject(LOGGER_OPTIONS_TOKEN) — verify active redact paths
│   │   │   ├── destinations/             # ILogDestination implementations
│   │   │   │   ├── loki.destination.ts          # batched HTTP push
│   │   │   │   ├── prisma-log.destination.ts     # minLevel: 'warn' → Postgres
│   │   │   │   └── rolling-file.destination.ts   # pino-roll
│   │   │   ├── orders/                   # Demo feature — structured logging on the hot path
│   │   │   ├── payments/                 # Demo feature — @LogPerformance, errorStructured
│   │   │   ├── pii-demo/                 # Endpoints that log PII → show redaction
│   │   │   ├── downstream/              # Calls apps/worker → cross-service trace propagation
│   │   │   ├── logs/                     # READ API powering the dashboard (see docs/DASHBOARD.md §12)
│   │   │   │   ├── logs.controller.ts        # GET /logs (keyset), /aggregate, /facets, /context, /export
│   │   │   │   ├── logs.sse.controller.ts    # GET /logs/stream (SSE live tail)
│   │   │   │   ├── loki-proxy.controller.ts  # GET /logs/loki (LogQL query_range / labels / tail)
│   │   │   │   ├── logs.service.ts           # compiles LogQuery → Prisma where + LogQL
│   │   │   │   └── dto/log-query.dto.ts      # Zod; logKey checked vs LOG_KEYS_CONVENTION_REGEX
│   │   │   ├── alerts/                   # Alert rules (cron eval) + channels + incident lifecycle
│   │   │   ├── governance/               # Saved views, RBAC restriction, retention sweep, audit_events
│   │   │   ├── trigger/                  # POST triggers for the Playground (level/status/fault/burst)
│   │   │   ├── config/                   # Zod-validated env schema
│   │   │   ├── prisma/                   # PrismaService
│   │   │   └── health/                   # /health (excluded from HTTP logging)
│   │   ├── test/                         # supertest e2e (stdout capture assertions)
│   │   ├── stryker.config.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── worker/                           # Second NestJS service — proves cross-service correlation
│   │   ├── src/
│   │   │   ├── instrumentation.ts        # its own OTel SDK bootstrap
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts             # BymaxLoggerModule (same convention)
│   │   │   └── tasks/                    # extracts traceparent, logs with the SAME traceId
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                              # First-class observability dashboard (full tree: docs/DASHBOARD.md §16)
│       ├── app/
│       │   ├── layout.tsx                # ThemeProvider + QueryProvider + global controls (time/source/role/live)
│       │   ├── page.tsx                  # Overview — golden signals, RED, breakdowns, pipeline health
│       │   ├── explorer/page.tsx         # Log Explorer — facets, query bar, virtualized table, detail drawer
│       │   ├── trigger/page.tsx          # Trigger Center — fire every log type/feature (the Playground)
│       │   ├── alerts/page.tsx           # Alert rules, channels, incident timeline
│       │   ├── maintenance/page.tsx      # Retention, export, RBAC, redaction proof, audit
│       │   └── api/logs/stream/route.ts  # optional SSE proxy (Next 16 route handler)
│       ├── components/                   # charts/ explorer/ controls/ trigger/ alerts/ governance/ ui/
│       ├── lib/                          # api-client, use-event-source (SSE), filters (nuqs), log-keys (/shared)
│       ├── hooks/                        # useLogs (infinite), useAggregate, useFacets, useFollowMode
│       ├── package.json
│       └── tsconfig.json
│
├── docker/
│   ├── otel-collector/config.yml         # OTLP receiver → Tempo (traces) + Loki (logs)
│   ├── loki/loki-config.yml
│   ├── tempo/tempo-config.yml
│   ├── promtail/promtail-config.yml      # (alternative log-shipping path; see §8)
│   ├── grafana/provisioning/             # auto-registered Loki + Tempo datasources, derived field
│   └── postgres/init.sql                 # CREATE DATABASE logger_example;
│
├── docs/
│   ├── OVERVIEW.md                       # ← you are here (master technical blueprint)
│   ├── DASHBOARD.md                      # the apps/web observability dashboard — full build spec + design system
│   ├── DEVELOPMENT_PLAN.md               # phased build plan + quality gates (100% cov, Stryker, audit)
│   ├── design_system.html                # rendered, project-agnostic UI design-system guide (open in browser)
│   ├── GETTING_STARTED.md                # 5-minute quickstart → first correlated trace in Grafana
│   ├── FEATURES.md                       # guided tour of each demonstrated feature
│   ├── ARCHITECTURE.md                   # deeper dive into the logging pipeline & module boundaries
│   ├── ENVIRONMENT.md                    # full env-var reference
│   ├── DESTINATIONS.md                   # how to write & wire a custom ILogDestination
│   ├── REDACTION.md                      # the 97 default paths + how to extend safely
│   ├── OTEL.md                           # SDK bootstrap, cross-service propagation, Grafana setup
│   ├── DATABASE.md                       # ApplicationLog schema + querying logs in Postgres
│   ├── DEPLOYMENT.md                     # production checklist (point exporters at managed backends)
│   ├── TROUBLESHOOTING.md                # "no traceId in my logs?" checklist, etc.
│   ├── RELEASES.md                       # which library version each branch tracks
│   ├── tasks/                            # per-phase task files (phase-00 … phase-18) — see DEVELOPMENT_PLAN
│   │   └── README.md                     # phase-file anatomy + status conventions
│   └── stryker/                          # mutation BASELINE.md / HISTORY.md / IMPLEMENTATION_PLAN.md
│
├── docker-compose.yml                    # postgres, loki, tempo, otel-collector, grafana
├── docker-compose.override.yml           # dev hot-reload conveniences (gitignored on prod)
├── .env.example
├── package.json                          # workspace root
├── pnpm-workspace.yaml                   # packages: ['apps/*']
├── README.md
├── LICENSE                               # MIT
└── CHANGELOG.md
```

> **Improvement over `nest-auth-example`.** This repo keeps `apps/api` as the centerpiece, **adds `apps/worker`** to demonstrate the one logging feature a single service cannot show — **distributed trace correlation across a service boundary** — and makes `apps/web` a **first-class observability dashboard** (a real Log Explorer + Trigger Playground + charts + alerts + maintenance), not a thin console. Just as `nest-auth-example`'s web app exercises every auth feature through a real UI, this web app fires every logging feature and visualizes the results in real time. The full dashboard design — pages, charts, the SSE live-tail, the Postgres⇄Loki query API, and the recommended Next.js 16 stack — lives in **[`docs/DASHBOARD.md`](DASHBOARD.md)**. `apps/web` also demonstrates the isomorphic `/shared` subpath (types + `LOG_KEYS_CONVENTION_REGEX` validating the Explorer's query bar), the logger's only browser-relevant surface.

---

## 6. Feature Coverage Matrix

Every row maps to a public feature/export of `@bymax-one/nest-logger`. Each one is exercised somewhere in this repository.

| #   | Library feature                                | Library surface                                                                                                                                 | Demonstrated in                                                                          | Status |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| 1   | Synchronous registration                       | `BymaxLoggerModule.forRoot(options)`                                                                                                            | `apps/worker/src/app.module.ts`                                                          | ✅     |
| 2   | Async registration with `ConfigService`        | `BymaxLoggerModule.forRootAsync(...)` typed by `BymaxLoggerModuleOptions` / `BymaxLoggerModuleAsyncOptions` / `BymaxLoggerModuleOptionsFactory` | `apps/api/src/app.module.ts` + `logger/logger.config.ts`                                 | ✅     |
| 3   | Global module flag                             | `isGlobal` (→ `DynamicModule.global`)                                                                                                           | `forRootAsync` in `apps/api` (default `true`, set explicitly)                            | ✅     |
| 4   | NestJS internal-logger bridge                  | `app.useLogger(app.get(PinoLoggerService))` (or option `shouldUseAsNestLogger`) + `{ bufferLogs: true }`                                        | `apps/api/src/main.ts`, `apps/worker/src/main.ts`                                        | ✅     |
| 5   | Structured `info` / `warnStructured`           | `PinoLoggerService.info(logKey, msg, userId?, meta?)`                                                                                           | `orders/orders.service.ts`                                                               | ✅     |
| 6   | Error logging with `Error` object              | `PinoLoggerService.errorStructured(logKey, error, userId?, meta?)`                                                                              | `payments/payments.service.ts` catch block                                               | ✅     |
| 7   | Structured warn + variadic `fatal()`           | `warnStructured(logKey, msg, userId?, meta?)`; `fatal()` (no `fatalStructured`)                                                                 | `payments` (retryable warn), bootstrap fatal path                                        | ✅     |
| 8   | NestJS `LoggerService` interface methods       | `log` / `verbose` (bridge → `info` / `trace`)                                                                                                   | NestJS framework logs after the logger bridge                                            | ✅     |
| 9   | Per-class logger injection (child logger)      | `@InjectLogger(context)`                                                                                                                        | every service constructor (e.g. `@InjectLogger(OrdersService.name)`)                     | ✅     |
| 10  | Class context label                            | `@LogContext(name)` (class decorator — records label; `setContext()` applies it) + `LOG_CONTEXT_METADATA_KEY`                                   | `downstream/downstream.service.ts`                                                       | ✅     |
| 11  | Performance / slow-method logging              | `@LogPerformance(thresholdMs?)` → `METHOD_EXECUTION` / `_SLOW_`                                                                                 | `payments/payments.service.ts` (intentionally slow path)                                 | ✅     |
| 12  | AsyncLocalStorage context propagation          | `LogContextService.run / set / get / getStore`                                                                                                  | `RequestIdMiddleware` + `downstream` (manual `set`)                                      | ✅     |
| 13  | Automatic request-id middleware                | `RequestIdMiddleware` (via `consumer.apply(...)` / `applyRequestIdMiddleware()`) or `http.shouldGenerateRequestId`                              | `apps/api/src/app.module.ts` `configure()`                                               | ✅     |
| 14  | HTTP request/response logging                  | `HttpLoggingInterceptor` (`http.isEnabled: true`)                                                                                               | global; visible on every `/orders` call                                                  | ✅     |
| 15  | HTTP log keys (start/success/redirect/4xx/5xx) | `HTTP_REQUEST_*` reserved keys                                                                                                                  | exercised by 2xx/4xx/5xx demo routes                                                     | ✅     |
| 16  | Exception filter                               | `HttpExceptionFilter` (`HTTP_EXCEPTION_HANDLED` / `_UNHANDLED`)                                                                                 | `payments` throws `HttpException`; `pii-demo` throws unexpected                          | ✅     |
| 17  | Double-log avoidance (filter ↔ interceptor)    | `__bymax_logger_handled` coordination                                                                                                           | asserted in `test/http-logging.e2e-spec.ts`                                              | ✅     |
| 18  | URL normalization (`:id` placeholder)          | `normalizeUrl` (UUID/ULID/nanoid/numeric → `/:id`)                                                                                              | `/orders/:id` calls show `"url":"/orders/:id"`                                           | ✅     |
| 19  | Slow-method flag                               | `@LogPerformance(thresholdMs)`                                                                                                                  | `/orders/slow` exceeds threshold                                                         | ✅     |
| 20  | HTTP path exclusion                            | `http.excludePaths`                                                                                                                             | `/health` and `/metrics` produce no access logs                                          | ✅     |
| 21  | OTel trace correlation (auto)                  | `otel.shouldAutoInjectTraceContext` behavior (the mixin is internal)                                                                            | every log when SDK active → `traceId`/`spanId`/`traceFlags`                              | ✅     |
| 22  | Field-name format (camelCase / snake_case)     | `otel.fieldFormat` (+ per-field overrides)                                                                                                      | `apps/worker` set to `snake_case` to contrast with `apps/api`                            | ✅     |
| 23  | Cross-service trace propagation                | W3C `traceparent` (auto-instrumentation + `propagation.inject`)                                                                                 | `apps/api/downstream` → `apps/worker` share one `traceId`                                | ✅     |
| 24  | Graceful OTel SDK shutdown                     | `sdk.shutdown()` on `SIGTERM`                                                                                                                   | `instrumentation.ts` in both services                                                    | ✅     |
| 25  | Default PII redaction (97 paths)               | `DEFAULT_REDACT_PATHS` (exported from `.`; auto-applied)                                                                                        | `pii-demo` logs password/cpf/cardNumber → `[REDACTED]`                                   | ✅     |
| 26  | Custom redact-path extension (merge)           | `redactPaths`                                                                                                                                   | `logger.config.ts` adds `*.webhookSignature`, `payload.creditCard.*`                     | ✅     |
| 27  | Custom censor (string)                         | `redactCensor` (public type: `string`)                                                                                                          | `'[REDACTED]'` string in `api`                                                           | ✅     |
| 28  | HTTP header redaction (bracket syntax)         | `req.headers["x-api-key"]`, `res.headers["set-cookie"]`                                                                                         | `pii-demo` echoes headers; verified redacted                                             | ✅     |
| 29  | Disable defaults (audit warning)               | `shouldDisableDefaultRedact` → `LOGGER_BOOTSTRAP_WARNING`                                                                                       | documented + covered by a dedicated test module (never the default)                      | ✅     |
| 30  | Wildcard depth boundary (1–4)                  | observable behavior — defaults redact to depth 4 (`REDACT_MAX_DEPTH` is internal)                                                               | nested-payload test asserts depth-4 redacted, depth-5 not                                | ✅     |
| 31  | Oversized-entry guard                          | `maxEntrySizeBytes` → `LOGGER_ENTRY_TRUNCATED`                                                                                                  | `/pii-demo/huge` logs a >64 KB object → truncated envelope                               | ✅     |
| 32  | Pluggable destinations                         | `ILogDestination` + `destinations[]`                                                                                                            | `destinations/*` wired via `forRootAsync`                                                | ✅     |
| 33  | Default stdout destination                     | `DefaultStdoutDestination`                                                                                                                      | always on — base JSON stream                                                             | ✅     |
| 34  | Pretty dev destination                         | `PrettyDevDestination` / `isPretty`                                                                                                             | dev mode (`NODE_ENV !== 'production'`)                                                   | ✅     |
| 35  | Per-destination level filtering                | `ILogDestination.minLevel`                                                                                                                      | `PrismaLogDestination` persists `warn`+ only                                             | ✅     |
| 36  | Destination lifecycle hooks                    | `onInit()` / `onShutdown()` (+ reverse-order drain)                                                                                             | `LokiDestination` flush timer; `app.enableShutdownHooks()`                               | ✅     |
| 37  | Fail-soft destination errors                   | `LOGGER_DESTINATION_INIT_FAILED` / `_WRITE_FAILED`                                                                                              | fault-injection test (bad Loki URL) → app keeps running                                  | ✅     |
| 38  | Log-key convention validation                  | `LOG_KEYS_CONVENTION_REGEX` (from `/shared`)                                                                                                    | `scripts/audit-log-keys.mjs` (CI) + `apps/web/lib/log-keys.ts`                           | ✅     |
| 39  | Reserved log keys                              | `RESERVED_LOG_KEYS` (16) (from `/shared`)                                                                                                       | CI guard: app code never reuses a reserved key                                           | ✅     |
| 40  | Error-code catalog awareness                   | `LOGGER_ERROR_CODES` (8) behaviors                                                                                                              | `TROUBLESHOOTING.md` + tests assert each surfaces correctly                              | ✅     |
| 41  | Isomorphic `/shared` types                     | `LogLevel`, `LogEntry`, `ServiceMetadata`, `ReservedLogKey`                                                                                     | `apps/web` form types + `PrismaLogDestination` typing                                    | ✅     |
| 42  | Runtime options audit                          | `@Inject(LOGGER_OPTIONS_TOKEN)`                                                                                                                 | `logger/log-audit.service.ts` lists active redact paths                                  | ✅     |
| 43  | Raw Pino escape hatch                          | `getRawLogger()` (dynamic level, advanced)                                                                                                      | `/admin/log-level` toggles `getRawLogger().level` at runtime                             | ✅     |
| 44  | Sentry + OTel (optional)                       | `@sentry/opentelemetry` `SentryPropagator` + built-in `Sentry.pinoIntegration()`                                                                | gated behind `SENTRY_DSN`; documented in `OTEL.md`                                       | ✅     |
| 45a | `http` per-app options                         | `HttpOptions`: `http.shouldCaptureExceptions` / `shouldGenerateRequestId` / `tenantIdHeader` / `excludePaths`                                   | `logger.config.ts` (§9) wires all four                                                   | ✅     |
| 45b | `otel` per-field name overrides                | `OtelOptions`: `otel.traceIdField` / `spanIdField` / `traceFlagsField`                                                                          | `apps/worker` sets `traceIdField: 'trace_id'` (§14)                                      | ✅     |
| 45c | Custom serializers + timestamp + self-bridge   | `serializers` / `timestamp` / `shouldUseAsNestLogger`                                                                                           | `logger.config.ts` (§9)                                                                  | ✅     |
| 45d | Power-user logger methods                      | `PinoLoggerService.setContext(ctx)` / `child(bindings)`                                                                                         | `setContext` in a service ctor; `child()` in a fan-out service                           | ✅     |
| 45e | Remaining injection tokens                     | `LOGGER_PINO_INSTANCE_TOKEN` / `LOGGER_DESTINATIONS_TOKEN` / `LOG_CONTEXT_TOKEN`                                                                | `/admin/log-level` (pino instance), pipeline-health svc (destinations)                   | ✅     |
| 45f | Redirect + completed HTTP keys                 | `HTTP_REQUEST_REDIRECT` (3xx) / `HTTP_REQUEST_COMPLETED`                                                                                        | `GET /orders/legacy` → 302; `/trigger/status/302`; interceptor timing key                | ✅     |
| 45  | Real-time log streaming (live tail)            | `LogEntry` SSE feed                                                                                                                             | `apps/web` Explorer **Live** + `logs/logs.sse.controller.ts` (see `DASHBOARD.md` §7/§14) | ✅     |
| 46  | Observability charts from log fields           | aggregation over `level`/`logKey`/`status`/`durationMs`                                                                                         | `apps/web` Overview (RED, volume, breakdowns) ← `GET /logs/aggregate`                    | ✅     |
| 47  | Redaction proven end-to-end in the UI          | `[REDACTED]` payload in Postgres **and** Loki                                                                                                   | `apps/web` governance "redacted at source" panel (`DASHBOARD.md` §10)                    | ✅     |
| 48  | Two-tier persistence model                     | `warn`+ Postgres vs `info`+ Loki                                                                                                                | dashboard **source toggle** + teaching callout                                           | ✅     |

> **Dashboard surfaces (rows 45–48)** are the tip of `apps/web`. Its full feature set — Trigger Center (fire every log type), Log Explorer (facets, virtualized table, detail drawer, trace deep-links), real-time live tail, charts (golden signals + RED + breakdowns), Alerts & Incidents, RBAC, retention, export, saved views — is specified in **[`docs/DASHBOARD.md`](DASHBOARD.md)**, grounded in how Datadog/Grafana/Kibana/SigNoz/Sentry build these tools.

> **Coverage rule.** Every public export from `@bymax-one/nest-logger` (server `.` subpath and `./shared` subpath) is referenced from at least one file in this repository. A CI step (`scripts/audit-library-exports.mjs`, ported from `nest-auth-example`) parses the package's type declarations and fails the build if any export is unused here. The matrix above is regenerated from that script.

---

## 7. Library Consumption

`@bymax-one/nest-logger` is consumed as a normal dependency. **It is not yet published to npm**, so today the example consumes it through a **local link** (see below); once the library publishes, the example pins a semver range and records the exact tested version per commit (see §18).

The library declares **required peers** (`@nestjs/common` & `@nestjs/core` `^11`, `pino` `^10`, `reflect-metadata` `^0.2`, `rxjs` `^7.8`) and **optional peers** (`pino-pretty`, `@opentelemetry/api` — install them in the app to light up `PrettyDevDestination` / trace injection). `pino-roll` is **not** a library peer — it's an **example-only** dependency for this repo's own `RollingFileDestination`. The OTel SDK packages are likewise the consumer's own deps (the library only reads `@opentelemetry/api`).

```jsonc
// apps/api/package.json, apps/worker/package.json
{
  "dependencies": {
    "@bymax-one/nest-logger": "^0.1.0", // after publish; today use the local link below
    "@nestjs/common": "^11.0.0", // required peer of the library
    "@nestjs/core": "^11.0.0", // required peer of the library
    "pino": "^10.0.0", // required peer
    "reflect-metadata": "^0.2.0", // required peer
    "rxjs": "^7.8.0", // required peer (also pulled transitively by @nestjs/core)
    // OTel SDK is the CONSUMER's dependency (lib only reads @opentelemetry/api):
    "@opentelemetry/sdk-node": "^0.218.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.218.0",
    "@opentelemetry/auto-instrumentations-node": "^0.76.0", // ← separate 0.7x line
    "@opentelemetry/resources": "^2.0.0",
    "@opentelemetry/semantic-conventions": "^1.30.0",
    // This app starts the SDK itself, and sdk-node hard-peers @opentelemetry/api,
    // so it is a real dependency HERE (vs an optional peer of the library); cap <1.10:
    "@opentelemetry/api": ">=1.9.0 <1.10",
  },
  "optionalDependencies": {
    "pino-pretty": "^13.0.0", // optional PEER of the lib (PrettyDevDestination)
    "pino-roll": "^3.0.0", // EXAMPLE-only — for this repo's RollingFileDestination, NOT a lib peer
  },
}
```

### Current consumption — local link (pre-publish)

`@bymax-one/nest-logger` is **not on npm yet**, so the example links the local checkout. Each app declares a link to the sibling library; the lib's already-built `dist/` resolves its types **and** runtime via the package `exports` map:

```jsonc
// apps/api/package.json and apps/worker/package.json — current, pre-publish
{
  "dependencies": {
    // pnpm symlink to the sibling checkout (≈ `npm link`); `file:` resolves identically.
    "@bymax-one/nest-logger": "link:../../../nest-logger",
  },
}
```

```bash
# 1) build the library once and keep it watching so dist/ stays fresh:
cd ../nest-logger                    # sibling of nest-logger-example under …/bymax-one/
pnpm install && pnpm build --watch   # tsup watch — ESM + CJS dual subpath

# 2) in this repository, install (resolves the link:) and run:
cd ../nest-logger-example
pnpm install
pnpm dev                             # nest start --watch picks up the rebuilt dist/
```

> **Path note.** From `nest-logger-example/apps/api`, the library is three levels up (`../../../nest-logger`); from the repo root it is one level up (`../nest-logger`). Both repos are siblings under `…/bymax-one/`.

### After the library publishes

Switch each app to the semver range and drop the link:

```bash
pnpm add @bymax-one/nest-logger@^0.1.0 --filter api --filter worker
pnpm install
```

> Until the first publish, the local `link:`/`file:` **is** what `main` uses — it is the only way to resolve the package. Once `@bymax-one/nest-logger` is on npm, `main` declares the published semver range (`^0.1.0`, `^1.0.0` after GA) and the link is reserved for side-by-side dev.

### Subpath imports

```typescript
// Server code (NestJS) — full API
import {
  BymaxLoggerModule,
  PinoLoggerService,
  LogContextService,
  InjectLogger,
  type ILogDestination,
} from '@bymax-one/nest-logger'

// Isomorphic code (no NestJS, no Pino) — types + constants only
import {
  LOG_KEYS_CONVENTION_REGEX,
  RESERVED_LOG_KEYS,
  type LogEntry,
  type LogLevel,
} from '@bymax-one/nest-logger/shared'
```

The `/shared` subpath is zero-dependency and safe to import in the Next.js console, test helpers, CLI scripts, or any package that must not pull in NestJS.

---

## 8. Local Stack (Docker Compose)

A single `docker compose up -d --wait` brings up the full observability backend; the app services run on the host for fast hot-reload (a `--profile full` override can containerize them too).

| Service          | Image                                 | Host port(s)            | Purpose                                                     |
| ---------------- | ------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| `postgres`       | `postgres:18-alpine`                  | `5432`                  | `application_logs` table (Prisma destination) + demo domain |
| `loki`           | `grafana/loki:latest`                 | `3100`                  | Log storage; receives logs from the OTel Collector          |
| `tempo`          | `grafana/tempo:latest`                | `3200`                  | Trace storage; receives spans from the OTel Collector       |
| `otel-collector` | `otel/opentelemetry-collector:latest` | `4317` gRPC/`4318` HTTP | OTLP receiver → routes traces to Tempo, logs to Loki        |
| `grafana`        | `grafana/grafana:latest`              | `3000`                  | Explore UI; Loki + Tempo datasources auto-provisioned       |

> **Two log-shipping paths, both shown.** (a) The **`LokiDestination`** pushes batched log lines directly to Loki's push API from the app — the canonical "custom destination" demo. (b) Alternatively, the **OTel Collector** receives logs over OTLP and forwards them to Loki via the **`otlphttp` exporter** pointed at Loki's **native OTLP endpoint** (`http://loki:3100/otlp`, with `allow_structured_metadata: true` on Loki). ⚠️ The Collector's old `loki` exporter was **deprecated and removed (late 2024)** — do **not** use it; Loki v3+ ingests OTLP directly. The example wires (a) by default and documents (b) in `docs/OTEL.md`. A `promtail` service is provided (commented) as a third, file-tailing option for the `RollingFileDestination`.

`docker/grafana/provisioning/` ships a **derived field** on the Loki datasource that turns the `traceId` in every log line into a clickable link to the Tempo trace — this is the payoff that proves end-to-end correlation works.

Root `package.json` infra scripts (ported from `nest-auth-example`):

```jsonc
{
  "scripts": {
    "infra:up": "docker compose up -d --wait",
    "infra:down": "docker compose down",
    "infra:nuke": "docker compose down -v",
    "infra:logs": "docker compose logs -f",
  },
}
```

---

## 9. Configuration & Environment

All runtime configuration is environment-variable driven and validated at startup with a **Zod schema** (`apps/api/src/config/env.schema.ts`). A single root `.env.example` documents every variable; each service reads its own `.env`.

| Variable                  | Service      | Example                                                        | Used for                                                                 |
| ------------------------- | ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                | all          | `development`                                                  | Drives `isPretty` default + `deployment.environment` resource attr       |
| `PORT`                    | api / worker | `3001` / `3002`                                                | HTTP listen port (Grafana owns `3000`)                                   |
| `LOG_LEVEL`               | all          | `debug`                                                        | `BymaxLoggerModuleOptions.level`                                         |
| `OTEL_SERVICE_NAME`       | all          | `nest-logger-example-api`                                      | `service.name` + OTel resource `service.name`                            |
| `RELEASE_SHA`             | all          | `$(git rev-parse --short HEAD)`                                | `service.version` + OTel resource `service.version`                      |
| `OTLP_TRACE_ENDPOINT`     | all          | `http://localhost:4318/v1/traces`                              | Where the OTLP exporter ships spans (the Collector)                      |
| `LOG_EXTRA_REDACT_PATHS`  | api          | `*.webhookSignature,payload.creditCard.*`                      | Comma-split → merged into `redactPaths`                                  |
| `LOKI_URL`                | api          | `http://localhost:3100/loki/api/v1/push`                       | `LokiDestination` push endpoint                                          |
| `LOKI_QUERY_URL`          | api          | `http://localhost:3100`                                        | Base URL the `logs/loki` proxy queries (`query_range`, `labels`, `tail`) |
| `DATABASE_URL`            | api          | `postgresql://postgres:postgres@localhost:5432/logger_example` | Prisma connection (domain + `PrismaLogDestination`)                      |
| `LOG_DB_MIN_LEVEL`        | api          | `warn`                                                         | `PrismaLogDestination.minLevel` — the durable Postgres tier              |
| `RETENTION_DAYS`          | api          | `30`                                                           | TTL sweep over `application_logs` (Maintenance page)                     |
| `OTEL_FIELD_FORMAT`       | all          | `camelCase` \| `snake_case`                                    | `otel.fieldFormat`                                                       |
| `SENTRY_DSN`              | api          | _(unset)_                                                      | Optional — enables the Sentry + OTel integration                         |
| `NEXT_PUBLIC_API_URL`     | web          | `http://localhost:3001`                                        | Dashboard → `apps/api` `logs/` API base (queries, SSE, aggregates)       |
| `NEXT_PUBLIC_GRAFANA_URL` | web          | `http://localhost:3000` (Grafana)                              | "View trace" deep-links to Tempo via Grafana                             |

> **Env-name note.** The library README/spec reference both `OTEL_SERVICE_NAME`/`RELEASE_SHA` and `SERVICE_NAME`/`GIT_SHA` in different examples. This example standardizes on the **OTel-aligned names** (`OTEL_SERVICE_NAME`, `RELEASE_SHA`) so the same variables feed both the logger's `service` block and the OTel SDK `Resource`. The mapping lives in `apps/api/src/logger/logger.config.ts`.

### Canonical wiring

`apps/api/src/instrumentation.ts` — **imported before anything else**:

```typescript
// instrumentation.ts — the FIRST import in main.ts (side-effecting)
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
// NOTE: no SIGTERM/process.exit here. NestJS owns termination (see main.ts); the SDK
// is flushed in an onApplicationShutdown hook so spans drain AFTER the log destinations.
// A standalone process.exit(0) here would race app shutdown and cut off the final
// LokiDestination flush.
```

`apps/api/src/main.ts`:

```typescript
import './instrumentation' // MUST be first — starts the OTel SDK before NestJS loads
import { otelSdk } from './instrumentation'
import { NestFactory } from '@nestjs/core'
import { PinoLoggerService } from '@bymax-one/nest-logger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  // Bridge NestJS's internal logger to the library. The standard NestJS idiom below
  // is guaranteed to work and auto-flushes the buffered logs. The library ALSO
  // self-bridges when the module option `shouldUseAsNestLogger` is true (its default),
  // making this line optional — keep it for explicitness/portability.
  app.useLogger(app.get(PinoLoggerService))

  // SINGLE coordinated shutdown owner (no competing handler in instrumentation.ts):
  // app.close() runs NestJS onApplicationShutdown hooks (the library drains its
  // destinations there) → THEN flush the OTel SDK → THEN exit. Ordered, no race.
  app.enableShutdownHooks() // also drains destinations if the platform calls close() for us
  process.once('SIGTERM', () => {
    void app
      .close()
      .then(() => otelSdk.shutdown())
      .finally(() => process.exit(0))
  })

  await app.listen(process.env.PORT ?? 3001)
}

void bootstrap()
```

`apps/api/src/app.module.ts`:

```typescript
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { BymaxLoggerModule, RequestIdMiddleware } from '@bymax-one/nest-logger'
import { buildLoggerOptions } from './logger/logger.config'
import { PrismaService } from './prisma/prisma.service'
import { OrdersModule } from './orders/orders.module'
import { PaymentsModule } from './payments/payments.module'
import { PiiDemoModule } from './pii-demo/pii-demo.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BymaxLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) =>
        buildLoggerOptions(config, prisma),
    }),
    OrdersModule,
    PaymentsModule,
    PiiDemoModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Standard NestJS middleware wiring — opens the ALS scope (requestId/tenantId) per
    // request. Alternatively, set `http.shouldGenerateRequestId: true` in the module
    // options to let the library register the request-id middleware for you.
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
```

`apps/api/src/logger/logger.config.ts` (the single source of truth for the module options):

```typescript
import type { ConfigService } from '@nestjs/config'
import type { BymaxLoggerModuleOptions } from '@bymax-one/nest-logger'
import { LokiDestination } from '../destinations/loki.destination'
import { PrismaLogDestination } from '../destinations/prisma-log.destination'
import { RollingFileDestination } from '../destinations/rolling-file.destination'
import type { PrismaService } from '../prisma/prisma.service'

export function buildLoggerOptions(
  config: ConfigService,
  prisma: PrismaService,
): BymaxLoggerModuleOptions {
  const isProd = config.get('NODE_ENV') === 'production'
  const extraPaths = (config.get<string>('LOG_EXTRA_REDACT_PATHS') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  return {
    service: {
      name: config.getOrThrow<string>('OTEL_SERVICE_NAME'),
      version: config.get<string>('RELEASE_SHA') ?? 'dev',
    },
    level: config.get<string>('LOG_LEVEL') ?? 'info',
    isGlobal: true,
    isPretty: !isProd, // PrettyDevDestination in dev, JSON in prod
    redactPaths: extraPaths, // merged with the 97 defaults
    redactCensor: '[REDACTED]',
    maxEntrySizeBytes: 65_536,
    shouldUseAsNestLogger: true, // self-bridge the NestJS logger (default true; explicit here)
    // Custom serializers merged with the library defaults (err/req/res). This is exactly the
    // hand-rolled "custom header serializer" drift §1 calls out — shown here as a one-liner.
    serializers: {
      // Serializer params are typed `unknown` (lib: Record<string, (input: unknown) => unknown>),
      // so narrow inside the body rather than in the parameter signature (strictFunctionTypes).
      upstreamError: (e) => {
        const err = e as { status?: number; code?: string }
        return { status: err.status, code: err.code }
      },
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`, // ISO-8601 UTC (Pino timestamp fn)
    http: {
      isEnabled: true,
      excludePaths: [/^\/health$/, /^\/metrics$/], // RegExp[] — anchored, ReDoS-safe (the lib .test()s each per request)
      shouldCaptureExceptions: true, // pair the HttpExceptionFilter with the interceptor
      shouldGenerateRequestId: false, // false: we wire RequestIdMiddleware ourselves (app.module configure())
      tenantIdHeader: 'x-tenant-id', // resolve tenantId into the ALS scope from this header
      // NOTE: HttpOptions has no `slowThresholdMs`/`userIdResolver` — slow detection is the
      // `@LogPerformance(ms)` decorator; userId rides the structured `info(logKey, msg, userId, …)` arg.
    },
    otel: {
      shouldAutoInjectTraceContext: true, // detect @opentelemetry/api → inject traceId/spanId/traceFlags (default true)
      fieldFormat: config.get('OTEL_FIELD_FORMAT') === 'snake_case' ? 'snake_case' : 'camelCase',
      // per-field overrides also exist (traceIdField / spanIdField / traceFlagsField) — the
      // apps/worker config sets `traceIdField: 'trace_id'` explicitly to demonstrate them (§14).
    },
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
    ],
  }
}
```

---

## 10. The Demo Domain & Log Explorer Dashboard

To produce **realistic** logs (not `logger.info('hello')`), the example ships a small toy domain, a `logs/` read-API, and a first-class **observability dashboard** (`apps/web`) that fires those logs and visualizes them in real time. The domain is intentionally generic so the logging patterns transfer to any real app.

| Module       | Endpoint(s)                                                                                                         | What it demonstrates                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `orders`     | `POST /orders`, `GET /orders/:id`                                                                                   | Hot-path structured logging; `requestId`/`tenantId` auto-propagation; URL `:id` norm                                        |
| `orders`     | `GET /orders/slow`                                                                                                  | `@LogPerformance(ms)` → `METHOD_SLOW_EXECUTION` slow-method flag                                                            |
| `payments`   | `POST /payments`                                                                                                    | `@LogPerformance`, `errorStructured`, `HttpException` → `HTTP_EXCEPTION_HANDLED`                                            |
| `pii-demo`   | `POST /pii-demo/signup`                                                                                             | Default redaction of `password`/`email`/`cpf`/`cardNumber`/`cardCvv`                                                        |
| `pii-demo`   | `POST /pii-demo/nested`                                                                                             | Wildcard depth 1–4 coverage (and the depth-5 boundary)                                                                      |
| `pii-demo`   | `GET /pii-demo/echo-headers`                                                                                        | Header redaction (`authorization`, `x-api-key`, `set-cookie`)                                                               |
| `pii-demo`   | `POST /pii-demo/huge`                                                                                               | `maxEntrySizeBytes` → `LOGGER_ENTRY_TRUNCATED`                                                                              |
| `downstream` | `POST /downstream/dispatch`                                                                                         | Calls `apps/worker` → cross-service `traceId` correlation + `@LogContext(name)` class label                                 |
| `admin`      | `PATCH /admin/log-level`                                                                                            | `getRawLogger().level` runtime level change                                                                                 |
| `trigger`    | `POST /trigger/level`, `/trigger/status/:code`, `/trigger/fault/loki`, `/trigger/burst`                             | Dashboard **Playground** hooks — fire any level, HTTP status, destination fault, or a load burst                            |
| `logs`       | `GET /logs`, `/logs/aggregate`, `/logs/facets`, `/logs/context`, `/logs/stream` (SSE), `/logs/loki`, `/logs/export` | **Read-API** powering the dashboard — keyset paging, chart aggregations, facets, live tail, Loki proxy (`DASHBOARD.md` §12) |
| `health`     | `GET /health`, `GET /metrics`                                                                                       | Excluded from HTTP logging via `http.excludePaths`                                                                          |

### Database schema (Prisma)

Two domain tables plus the destination's log sink:

```prisma
// apps/api/prisma/schema.prisma

model ApplicationLog {
  id        String   @id @default(cuid())
  level     String   // 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  logKey    String   // MODULE_ACTION_RESULT, e.g. 'PAYMENT_REFUND_FAILED'
  message   String
  service   String   // service.name
  requestId String?
  traceId   String?  // join key with Tempo
  payload   Json     // the full, already-redacted log entry
  createdAt DateTime @default(now())

  @@index([level])
  @@index([logKey])
  @@index([traceId])
  @@index([createdAt])
}

model Order {
  id        String   @id @default(cuid())
  tenantId  String
  amount    Int      // cents
  status    String   @default("pending")
  createdAt DateTime @default(now())

  @@index([tenantId])
}

model Payment {
  id        String   @id @default(cuid())
  orderId   String
  amount    Int
  status    String
  createdAt DateTime @default(now())
}
```

`ApplicationLog.payload` stores exactly what the `PrismaLogDestination` receives — **post-redaction**, so no raw PII ever reaches Postgres. `traceId` is denormalized into its own indexed column so you can `SELECT * FROM application_logs WHERE trace_id = '…'` and reconstruct a request without leaving the database. (This is the simplified shape; the **dashboard-grade schema** — `time`/`status`/`durationMs`/`tenantId`/`spanId` columns plus BRIN/keyset/JSONB-GIN indexes tuned for log querying — is in [`DASHBOARD.md`](DASHBOARD.md) §13, along with the `SavedView`/`AlertRule`/`Incident`/`AuditEvent` tables.)

### The observability dashboard (`apps/web`)

The example does not stop at emitting logs — it ships a **real, production-grade observability console** so a newcomer can _see_ the library working without touching Grafana. It is the logging-world analog of how `nest-auth-example`'s UI exercises every auth feature. Full design (pages, charts, SSE live-tail, query API, tech stack, ASCII wireframes, and best-practice rationale with citations) is in **[`docs/DASHBOARD.md`](DASHBOARD.md)**. In brief, `apps/web` provides:

- **Overview** — golden-signal health strip + **RED** (Rate/Errors/Duration from `HTTP_REQUEST_*` + `durationMs`), a brushable stacked-by-level **log-volume** timeseries, breakdowns (level donut, top `logKey`s/services/errors/tenants, status mix), an **SLO/error-budget** gauge, and a **pipeline-health** panel (the library's `LOGGER_DESTINATION_*` / `LOGGER_ENTRY_TRUNCATED` fail-soft signals).
- **Log Explorer** — faceted rail, a query bar (compiled to **both** SQL and LogQL, shown), a **virtualized** table (TanStack Virtual, 50k rows @60fps, keyset infinite-scroll), a detail drawer with the full **redacted** JSON, and `traceId` **deep-links** to Tempo + "all logs for this trace" across `api` + `worker`.
- **Live tail** — real-time **SSE** stream with follow-mode (pause-on-scroll, "jump to latest"), rAF-batched ring buffer, and Sentry-style guardrails.
- **Trigger Center (Playground)** — buttons to fire every log type/feature (levels, structured success/error, PII payloads, nested-depth, headers, oversized, slow method, 4xx/5xx, cross-service, destination fault, load burst), each auto-pivoting the Explorer to the resulting `requestId`/`traceId`.
- **Alerts & Incidents** — log-pattern rules (`expr + threshold + for`), channel registry, PagerDuty-style incident lifecycle.
- **Maintenance & Governance** — retention TTL sweep, JSON/CSV export, query-based **RBAC**, an **audit trail**, and the hero panel: **"PII redacted at source"** — the same record shown from Postgres and Loki, both `[REDACTED]`, contrasted with the scrub-after-ingest model of other platforms.

The dashboard reads everything through the `apps/api` `logs/` API (§5), honoring the global **time range**, **source toggle** (`warn`+ Postgres ⇄ `info`+ Loki), and **tenant/role** controls.

---

## 11. The Logging Pipeline (Deep Dive)

A single log call flows through five stages. The example documents each stage in `docs/ARCHITECTURE.md`; the summary:

```
service.logger.info('ORDER_CREATE_SUCCESS', 'Order created', userId, { orderId, amount })
        │
        ▼
PinoLoggerService.info()                       ← validates nothing at runtime; logKey is a plain string
        │                                         (CI validates keys against LOG_KEYS_CONVENTION_REGEX)
        ▼
composed Pino mixin (runs per log, O(1))
        ├── LogContextService.getStore()        → { requestId, tenantId, userId }   (ALS — merged FIRST)
        └── trace.getActiveSpan()               → { traceId, spanId, traceFlags }   (OTel — merged LAST, wins)
        │
        ▼
fast-redact (compiled once at bootstrap)        ← 97 default paths + app extensions; ~3% throughput cost
        │
        ▼
size guard (Buffer.byteLength vs maxEntrySizeBytes)  → replaces oversized entries with LOGGER_ENTRY_TRUNCATED
        │
        ▼
pino.multistream → fan-out to every destination (each applies its own minLevel)
        ├── DefaultStdoutDestination   (always on)
        ├── PrettyDevDestination       (dev only)
        ├── LokiDestination            (batched HTTP)
        ├── PrismaLogDestination       (warn+ → Postgres)
        └── RollingFileDestination     (pino-roll)
```

**Key design facts the example surfaces (and tests):**

- **Singleton scope, not `Scope.REQUEST`.** Per-request context (`requestId`, `tenantId`, `userId`) is delivered by `AsyncLocalStorage`, not NestJS request scope — zero injection-graph latency on the hot path.
- **One composed mixin.** ALS context is merged first, then OTel trace context, which **wins on name conflicts** (an active span is the authoritative trace identity at that instant).
- **No-op spans are skipped.** A zeroed `traceId` (`'0'.repeat(32)`) is ignored; **unsampled** spans (`traceFlags === 0`) still carry valid context and are kept — gating on `traceFlags` would silently drop correlation on every unsampled request.
- **`traceFlags` is W3C 2-hex lowercase** (`'01'` sampled, `'00'` not).
- **Redaction is compiled once.** `fast-redact` turns the 97 paths into a specialized function at bootstrap — no per-log regex or tree-walking. The original in-memory object is **never mutated**; redaction happens at serialization time.
- **Destinations never crash the app.** A throw in `write()` is caught and reported to `stderr` as `LOGGER_DESTINATION_WRITE_FAILED`; a rejected `onInit()` removes that destination (`LOGGER_DESTINATION_INIT_FAILED`) while the others keep running. **Never log to the logger from inside `write()`** (infinite loop) — the example's destinations write failures to `process.stderr` directly.
- **Shutdown drains in reverse order.** `app.enableShutdownHooks()` triggers `onShutdown()` on each destination, last-registered first, so downstream sinks (Loki) flush their buffer before the process exits.

---

## 12. Destinations Showcase

A **destination** is any object implementing `ILogDestination` — the contract is deliberately tiny:

```typescript
interface ILogDestination {
  readonly name: string // identifier used in error logs
  readonly minLevel?: LogLevel // entries below this are filtered out (undefined = accept all)
  write(payload: string): void | Promise<void> // receives the already-serialized JSON line (+ newline)
  onInit?(): void | Promise<void> // bootstrap: open connections, start flush timers
  onShutdown?(): void | Promise<void> // graceful shutdown: flush + close (reverse-order)
}
```

The example ships these implementations under `apps/api/src/destinations/` (each with its own unit tests):

| Destination                | `minLevel` | Strategy                                          | Demonstrates                                            |
| -------------------------- | ---------- | ------------------------------------------------- | ------------------------------------------------------- |
| `DefaultStdoutDestination` | (all)      | sync `process.stdout.write` (from the library)    | the always-on base stream                               |
| `PrettyDevDestination`     | (all)      | `pino-pretty` (from the library, dev only)        | human-readable colorized output                         |
| `LokiDestination`          | `info`     | buffer → `POST /loki/api/v1/push` on timer/batch  | HTTP batching, labels, fail-soft, `onInit`/`onShutdown` |
| `PrismaLogDestination`     | `warn`     | buffer → `prisma.applicationLog.createMany`       | DB persistence, `minLevel` filtering, JSON-parse guard  |
| `RollingFileDestination`   | (all)      | `pino-roll` (async `onInit`), daily/size rotation | async lifecycle, file rotation                          |

**`LokiDestination` (the canonical custom destination):**

```typescript
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
    this.flushTimer = setInterval(() => void this.flush(), this.opts.flushIntervalMs ?? 5_000)
  }

  write(payload: string): void {
    this.buffer.push(payload)
    if (this.buffer.length >= (this.opts.batchSize ?? 100)) void this.flush()
  }

  async onShutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer)
    await this.flush()
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const batch = this.buffer.splice(0)
    const body = JSON.stringify({
      streams: [
        {
          stream: { service: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example' },
          // Loki wants nanosecond timestamps; the line is the raw JSON entry
          values: batch.map((line) => [String(BigInt(Date.now()) * 1_000_000n), line.trim()]),
        },
      ],
    })
    try {
      await fetch(`${this.opts.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    } catch {
      // Fail soft — log delivery MUST NOT crash the app. Report to stderr, not the logger.
      process.stderr.write(
        `{"level":"warn","logKey":"LOGGER_DESTINATION_WRITE_FAILED","destination":"loki"}\n`,
      )
    }
  }
}
```

**Destination gotchas the example documents and tests** (see `docs/DESTINATIONS.md`):

- `pino.multistream` does **not** auto-compute the parent level — the library **must explicitly set the Pino logger `level` to the lowest of all destination `minLevel`s (and the configured `LOG_LEVEL`)**, or a destination with `minLevel: 'debug'`/`'trace'` silently never receives those lines (Pino's default `level` is `info`). Each stream then re-filters by its own `minLevel`. An e2e test asserts a `minLevel: 'debug'` destination actually receives debug lines.
- The Loki push endpoint is `/loki/api/v1/push` (not `/push`); each `values` timestamp must be the **nanosecond** Unix epoch encoded as a **JSON string** (e.g. `String(BigInt(Date.now()) * 1_000_000n)`) — a numeric value is rejected.
- `RollingFileDestination` needs `pino-roll`'s **async** `onInit()` — it cannot be constructed inline in a sync `forRoot()` without awaiting init; the library handles this through the lifecycle hook.
- Destinations share the **same** payload string — never mutate it.
- Worker-thread transports (Pino's `transport` option) do **not** inherit `AsyncLocalStorage` — contextual fields must already be on the entry (they are, because the mixin runs on the main thread before fan-out).

---

## 13. PII Redaction Showcase

The library auto-applies **97 default redact paths** compiled into a single `fast-redact` function (< 3% throughput impact). The example proves they work and shows how to extend them.

### The 97 defaults

`23 common fields × 4 wildcard depths + 5 absolute header paths = 97`.

| Category                  | Fields                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords (5)             | `password`, `passwordHash`, `passwordConfirm`, `newPassword`, `oldPassword`                                                               |
| Tokens (6)                | `token`, `accessToken`, `refreshToken`, `idToken`, `apiKey`, `apiSecret`                                                                  |
| MFA (3)                   | `mfaSecret`, `mfaRecoveryCodes`, `totpSecret`                                                                                             |
| Payment / PCI DSS (5)     | `cardNumber`, `cardCvv`, `cvv`, `cvc`, `cardExpiry`                                                                                       |
| BR documents / LGPD (3)   | `cpf`, `cnpj`, `rg`                                                                                                                       |
| Conservative PII (1)      | `email`                                                                                                                                   |
| HTTP headers (5 absolute) | `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-api-key"]`, `req.headers["x-auth-token"]`, `res.headers["set-cookie"]` |

Each common field is listed at depths 1–4 (`*.field`, `*.*.field`, `*.*.*.field`, `*.*.*.*.field`) because **`fast-redact`'s `*` matches a single level only — there is no recursive `**`**. `REDACT*MAX_DEPTH = 4`, so a secret nested **five** levels deep is \_not* redacted by default — the example demonstrates this boundary explicitly (and documents why: the path list trades exhaustiveness for realistic nesting depth).

> **LGPD note demonstrated in `docs/REDACTION.md`.** `cpf`/`cnpj`/`rg` and `email` are redacted by default; a person's `nome` (name) **alone** is not personal-data-sensitive enough under LGPD Art. 5 III to redact by default, so it is **not** in the defaults — the example logs a name in cleartext to make this explicit.

### Extending & customizing

```typescript
// Extra paths are MERGED with the 97 defaults (never replace them):
redactPaths: [
  '*.webhookSignature',     // depth-1 wildcard
  'payload.creditCard.*',   // all fields inside a subobject
  'req.headers["x-service-token"]', // hyphenated header → MUST use bracket syntax
],

// The censor is a string in the public type (BymaxLoggerModuleOptions.redactCensor?: string):
redactCensor: '[REDACTED]',
// NOTE: fast-redact itself also accepts a censor *function*, but `@bymax-one/nest-logger@0.1.0`
// types `redactCensor` as `string` only — a function form would not typecheck.
```

### `pii-demo` in action

`POST /pii-demo/signup` logs the incoming DTO as metadata:

```jsonc
// What the service passes to logger.info('USER_SIGNUP_ATTEMPT', …, { email, cpf, cardNumber, cardCvv, … })
// What lands in stdout / Loki / Postgres (post-redaction):
{
  "level": 30,
  "logKey": "USER_SIGNUP_ATTEMPT",
  "msg": "Signup initiated",
  "email": "[REDACTED]",
  "cpf": "[REDACTED]",
  "cardNumber": "[REDACTED]",
  "cardCvv": "[REDACTED]",
  "payment": { "cardNumber": "[REDACTED]" }, // redacted at depth 2
  "requestId": "r_7f3a9b",
  "tenantId": "t_acme",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
}
```

### Auditing what's active

`logger/log-audit.service.ts` injects the resolved options and exposes the effective path list — used by an e2e test as a CI gate that critical PII paths are present:

The library's 97 default paths are exported as **`DEFAULT_REDACT_PATHS`** from the `.` subpath (and auto-applied). The audit service imports it to report the **effective** path list (defaults + the example's own extensions); the CI gate asserts critical PII coverage. Referencing the export here also satisfies the export-usage audit (§6):

```typescript
import { Inject, Injectable } from '@nestjs/common'
import {
  DEFAULT_REDACT_PATHS,
  LOGGER_OPTIONS_TOKEN,
  type BymaxLoggerModuleOptions,
} from '@bymax-one/nest-logger'

// The e2e gate asserts every entry here is effectively redacted by emitting a payload with
// these fields and checking the serialized output is [REDACTED].
export const EXPECTED_REDACTED_FIELDS = [
  'password',
  'email',
  'cpf',
  'cardNumber',
  'authorization',
] as const

@Injectable()
export class LogAuditService {
  constructor(@Inject(LOGGER_OPTIONS_TOKEN) private readonly opts: BymaxLoggerModuleOptions) {}

  /** Effective redact paths = the library's exported defaults + the app-supplied extensions. */
  listEffectiveRedactPaths(): readonly string[] {
    return [...DEFAULT_REDACT_PATHS, ...(this.opts.redactPaths ?? [])]
  }

  /** Just the app-supplied extra redact paths merged on top of the library defaults. */
  listConfiguredRedactPaths(): readonly string[] {
    return this.opts.redactPaths ?? []
  }

  /** Whether the dangerous opt-out is active (should only ever be true in a test module). */
  hasDefaultRedactionDisabled(): boolean {
    return this.opts.shouldDisableDefaultRedact === true
  }
}
```

> **`shouldDisableDefaultRedact: true`** removes all 97 defaults and emits a `LOGGER_BOOTSTRAP_WARNING` so a security review can audit when PII protection was intentionally reduced. The example wires this **only** inside a dedicated test module — never in the running app — and asserts the warning is emitted.

---

## 14. OpenTelemetry Correlation

This is the feature that elevates the example from "nice JSON logs" to "production observability." It is also the feature that requires the most care, so the example is opinionated and the steps are exact.

### The hard rule

> **The OTel SDK must `start()` before any NestJS code loads.** The example enforces this by making `import './instrumentation'` the literal first line of `main.ts`. If the SDK starts after NestJS is imported, auto-instrumentation cannot patch the HTTP/Express/pg modules and **`traceId` will silently never appear in your logs.**

### What the library does vs. what the consumer does

| Responsibility                                        | Owner        | Where in this repo                |
| ----------------------------------------------------- | ------------ | --------------------------------- |
| Initialize `NodeSDK`, exporters, resource             | **Consumer** | `apps/api/src/instrumentation.ts` |
| Enable auto-instrumentation + W3C propagation         | **Consumer** | `getNodeAutoInstrumentations()`   |
| Graceful `sdk.shutdown()` on `SIGTERM`                | **Consumer** | `instrumentation.ts`              |
| Detect `@opentelemetry/api`, read `getActiveSpan()`   | **Library**  | `TraceContextMixin` (automatic)   |
| Inject `traceId`/`spanId`/`traceFlags` into every log | **Library**  | composed mixin (automatic)        |
| Field-name format (`camelCase`/`snake_case`)          | **Library**  | `otel.fieldFormat`                |

The library never touches the SDK — it only **reads** the ambient span. If `@opentelemetry/api` is not installed, logs simply omit the trace fields with **no error** (graceful degradation, asserted by a test that runs without the OTel peer).

### Cross-service correlation (`apps/api` → `apps/worker`)

The HTTP auto-instrumentation injects a W3C `traceparent` header automatically on outbound calls, so `apps/api/src/downstream` calling `apps/worker` propagates the trace with zero manual code. For **non-instrumented** clients (custom fetch wrappers, some vendor SDKs), the example shows the manual path:

```typescript
import { propagation, context } from '@opentelemetry/api'

const headers: Record<string, string> = { 'content-type': 'application/json' }
propagation.inject(context.active(), headers) // adds `traceparent` + `tracestate`
await fetch(workerUrl, { method: 'POST', headers, body })
```

Both services then log lines carrying the **same `traceId`**. In Grafana Explore you filter Loki by that `traceId` and see interleaved logs from both services, then click through to the unified trace in Tempo.

### Field format contrast (a teaching device)

`apps/api` uses the default `camelCase` (`traceId`/`spanId`/`traceFlags`); `apps/worker` is configured with `otel.fieldFormat: 'snake_case'` (`trace_id`/`span_id`/`trace_flags`, the OTel Logs Data Model). This contrast lets the docs explain _when_ you'd choose each (camelCase for Pino-native tooling; snake_case when your backend expects the OTel Logs Data Model or you also run `@opentelemetry/instrumentation-pino`).

> **Do not double-inject.** Running both the library's mixin **and** `@opentelemetry/instrumentation-pino` on the same logger duplicates the trace fields. Disable one — the example keeps the library's mixin and does **not** add the Pino instrumentation.

### Optional Sentry integration

Gated behind `SENTRY_DSN`. When set, `instrumentation.ts` calls `Sentry.init({ dsn, enableLogs: true, integrations: [Sentry.pinoIntegration({ error: { levels: ['error', 'fatal'] } })] })` **before** `new NodeSDK(...)`, and registers `new SentryPropagator()` as the SDK's `textMapPropagator`. The capture mechanism is Sentry's **built-in `Sentry.pinoIntegration()`** (exported from `@sentry/node`) — **there is no separate `@sentry/pino` package**. Requires **`@sentry/node` ≥ 10.18** + `@sentry/opentelemetry` (the legacy `@sentry/opentelemetry-node` is **not** used). Full walkthrough in `docs/OTEL.md`.

---

## 15. Demonstrated Journeys

`docs/FEATURES.md` walks through each of these end to end, with the exact `curl` command, the resulting log line(s), and a Grafana screenshot:

1. **First request → first correlated trace.** `POST /orders` → see `HTTP_REQUEST_START` / `ORDER_CREATE_SUCCESS` / `HTTP_REQUEST_SUCCESS` on stdout, all sharing one `requestId` and one `traceId`; open Grafana, filter Loki by that `traceId`, click through to Tempo.
2. **PII never leaks.** `POST /pii-demo/signup` with a password, CPF, and card number → confirm `[REDACTED]` everywhere (stdout, Loki, Postgres).
3. **Depth boundary.** `POST /pii-demo/nested` → secret at depth 4 redacted, at depth 5 not — and why.
4. **Slow-path detection.** `GET /orders/slow` → `METHOD_SLOW_EXECUTION` and the HTTP slow-request flag.
5. **Error handling.** `POST /payments` (forced failure) → `errorStructured` with the serialized stack, `HTTP_EXCEPTION_HANDLED` logged **once** (double-log avoidance proven).
6. **Cross-service correlation.** `POST /downstream/dispatch` → both `apps/api` and `apps/worker` logs joined on one `traceId`.
7. **Destinations fan-out.** Same request → JSON on stdout, line in Loki, and (for a `warn`) a row in `application_logs`; inspect via Prisma Studio.
8. **Fault tolerance.** Point `LOKI_URL` at a dead host → `LOGGER_DESTINATION_WRITE_FAILED` on stderr, app keeps serving, other destinations unaffected.
9. **Oversized entry.** `POST /pii-demo/huge` → `LOGGER_ENTRY_TRUNCATED` envelope instead of a multi-MB line.
10. **Runtime level change.** `PATCH /admin/log-level` → `getRawLogger().level` flips live; `debug` lines start/stop appearing.
11. **Graceful shutdown.** `SIGTERM` the API → destinations flush their buffers (`LOGGER_SHUTDOWN_OK`), Loki receives the final batch.

---

## 16. Testing Strategy

The example holds itself to the **same shipped quality bar as `nest-auth-example`** — **100% test coverage** (statements/branches/functions/lines, both apps) **and 100% Stryker mutation score** (`break: 100`), plus the export-usage and log-key audits — enforced by four GitHub Actions workflows (`ci.yml`, `mutation.yml`, `mutation-nightly.yml`, `release.yml`). The exact thresholds, jobs, and which phase each gate lands in are specified in **[`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md)** (§Appendix C — Quality Gates; testing = Phase 14, mutation = Phase 15, CI/CD = Phase 17, audit = Phase 18).

| Layer         | Tool                        | Scope                                                                                                                                    |
| ------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`    | Jest                        | Destination implementations, `logger.config`, `LogAuditService`, guards/decorators                                                       |
| `apps/api`    | Jest + supertest            | HTTP logging e2e — **assert on captured stdout JSON** (spy `process.stdout.write`)                                                       |
| `apps/api`    | Stryker                     | Mutation testing (jest-runner + ts-checker) — **`break: 100`**; per-PR incremental + Monday nightly full                                 |
| `apps/api`    | Jest + supertest            | `logs/` read-API — keyset paging, `/logs/aggregate` math, facets, SSE stream emits                                                       |
| `apps/worker` | Jest + supertest            | Cross-service propagation: assert the worker's logs carry the inbound `traceId`                                                          |
| Integration   | Testcontainers              | Spin a real Loki container; assert end-to-end log delivery + Loki proxy queries                                                          |
| `apps/web`    | Vitest                      | `/shared` log-key validation, filter↔URL (`nuqs`), severity mapping, SSE hook buffer                                                     |
| `apps/web`    | Playwright                  | Journeys: fire from Trigger Center → row appears in live Explorer; brush chart → filter; open detail → "view trace"; RBAC tenant scoping |
| Repo-wide     | `audit-library-exports.mjs` | CI gate: every library export is referenced here (§6 coverage rule)                                                                      |
| Repo-wide     | `audit-log-keys.mjs`        | CI gate: every app log key matches `LOG_KEYS_CONVENTION_REGEX` and reuses no `RESERVED_LOG_KEYS`                                         |

Two complementary log-assertion techniques: for **unit** tests prefer **`pino-test`** (the official Pino helper — attach a sink stream and assert structured entries deterministically, no global stdout spying); for **e2e** use **stdout capture** — spy on `process.stdout.write`, perform a request with supertest, then assert the emitted JSON contains the expected `logKey`, the normalized `url`, the propagated `requestId`, and **no** un-redacted PII. The e2e fixture (`test/fixtures/`) mirrors the library's own e2e harness.

```typescript
it('logs HTTP_REQUEST_START + HTTP_REQUEST_SUCCESS and redacts the body', async () => {
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  await request(app.getHttpServer())
    .post('/pii-demo/signup')
    .send({ email: 'a@b.com', password: 'p@ss' })
    .expect(201)
  const logs = stdout.mock.calls.map((c) => String(c[0])).join('')
  expect(logs).toContain('"logKey":"HTTP_REQUEST_START"')
  expect(logs).toContain('"logKey":"HTTP_REQUEST_SUCCESS"')
  expect(logs).toContain('[REDACTED]')
  expect(logs).not.toContain('p@ss')
  stdout.mockRestore()
})
```

Mutation, coverage, commitlint, and Husky configs are ported from `nest-auth-example` and the library, keeping the toolchain identical across the Bymax monorepo.

---

## 17. Deployment Notes

The example targets a "service + sidecar backends" topology. In production you do **not** run Loki/Tempo/Grafana yourself unless you want to — you point the exporters at managed backends.

Production checklist (full version in `docs/DEPLOYMENT.md`):

- Set `NODE_ENV=production` → `isPretty` defaults off; you get pure JSON on stdout (the container runtime ships it).
- Set a **meaningful** `RELEASE_SHA` in CI (git SHA or build version) so every log/trace is attributable to a deploy.
- Point `OTLP_TRACE_ENDPOINT` at your collector / Grafana Cloud / Honeycomb / Datadog OTLP endpoint.
- Point `LOKI_URL` (or the Collector's logs pipeline) at your managed log backend; add basic-auth/headers to the `LokiDestination` as needed.
- Keep `@opentelemetry/instrumentation-fs` disabled; review which auto-instrumentations you actually need.
- Use a **single ordered shutdown owner** (see `main.ts` §9): on `SIGTERM`, `app.close()` (drains the library's destinations via `onApplicationShutdown`) → **then** `otelSdk.shutdown()` (flush spans) → **then** exit. Do **not** also register a competing `process.exit()` in `instrumentation.ts`. Give your orchestrator a grace period long enough for the final `LokiDestination` flush.
- Tune `maxEntrySizeBytes` and destination `batchSize`/`flushIntervalMs` to your throughput and your backend's ingestion limits.
- Decide your redaction posture: keep `email`/`cpf` redacted unless you have a documented, reviewed reason to disable defaults.
- Mind the OTel version pin: pin `@opentelemetry/sdk-node` on its **own 0.x line** (`^0.218.0` — there is no 1.x yet) and put the upper bound on the API: `@opentelemetry/api` `>=1.9.0 <1.10` (mirrors sdk-node's own `@opentelemetry/api` peer range, which is what actually prevents an accidental 1.10 upgrade). Pin `@opentelemetry/auto-instrumentations-node` on its separate `^0.76` line.

The API and worker each ship a multi-stage `Dockerfile` (Node 24 alpine) that runs `node --enable-source-maps dist/main.js`; an `start:instrumented` variant uses `node --import ./dist/instrumentation.mjs` for the cleaner Node 20.6+ bootstrap.

---

## 18. Versioning & Release Tracking

Because the library is pre-1.0, branch tracking is explicit:

| Branch | Tracks library version | Notes                                                                    |
| ------ | ---------------------- | ------------------------------------------------------------------------ |
| `main` | `^0.1.0` (pre-1.0)     | Current — local `link:` until first publish, then the published `^0.1.0` |
| `next` | `^1.0.0` (when out)    | Pre-release tracking the GA library; expect breaking changes             |

Every commit on `main` records the exact `@bymax-one/nest-logger` version it was tested against in `docs/RELEASES.md`. When the library reaches `1.0.0`, `main` flips its range to `^1.0.0`, the 0.x branch is archived, and the matrix in §6 is re-audited against the GA export surface. Each future **major** of the library gets its own long-lived branch here.

---

## 19. Contributing

Issues and PRs are welcome. Because this is a reference application, the bar for changes is: **"does this make the demonstration of `@bymax-one/nest-logger` clearer or more complete?"** Generic refactors that obscure library usage will be declined.

The repo follows the Bymax coding standards (shared with the library and `nest-auth-example`):

- TypeScript strict (`noImplicitAny`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`).
- Boolean identifiers prefixed with `is` / `has` / `should` / `can` (hence `isEnabled`, `isPretty`, `shouldDisableDefaultRedact`).
- All application log keys in `MODULE_ACTION_RESULT` format; CI validates against `LOG_KEYS_CONVENTION_REGEX` and rejects reuse of any `RESERVED_LOG_KEYS`.
- Conventional Commits enforced by commitlint + Husky.
- English-only comments and identifiers.
- The §6 coverage rule is enforced — new library exports must be demonstrated here before the example pins a release that ships them.

See `CONTRIBUTING.md` (to be added) for the full process.

---

## 20. License, Attribution & Status

- **Code:** MIT — © Bymax One.
- **Library:** `@bymax-one/nest-logger` — MIT — © Bymax One.
- **Third-party:** Pino, OpenTelemetry, Grafana Loki/Tempo, Prisma — see `THIRD_PARTY_NOTICES.md`.

> **Document version:** 1.0 — initial technical blueprint, authored before implementation begins.
> **Library version targeted:** `@bymax-one/nest-logger@^0.1.0` (0.1.0, implemented; consumed via local link until published).
> **Project status:** **specification only.** The repository currently contains `docs/` and `.git/`. This document is the product blueprint; the **authoritative, phased build plan with quality gates** is **[`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md)** (19 phases, 0–18, with a Progress dashboard and per-phase definition-of-done), and the per-phase task files live under [`docs/tasks/`](tasks/README.md) — mirroring the structure used in `nest-auth-example`.

### Suggested build order (for the implementer)

The high-level sequence below maps to the phases in [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) — that file is the source of truth (it names every task, its dependencies, and where each quality gate lands).

1. **Repo foundation & observability stack** — pnpm workspace, tooling, Docker stack (§8), `.env.example` (§9). _(Plan Phases 0–1)_
2. **`apps/api` skeleton + OTel bootstrap** — Nest app, `instrumentation.ts` + `main.ts` (§9/§14). _(Phases 2–3)_
3. **Logger wiring** — `BymaxLoggerModule.forRootAsync` + `logger.config.ts` + `consumer.apply(RequestIdMiddleware)` (§9). _(Phase 4)_
4. **Prisma + demo domain** — `ApplicationLog` schema/indexes + `orders`/`payments`/`pii-demo`/`trigger`/`health` (§10). _(Phases 5–6)_
5. **Destinations** — `loki`, `prisma-log`, `rolling-file` + lifecycle/fail-soft (§12). _(Phase 7)_
6. **Redaction proofs** — `pii-demo` + `LogAuditService` (§13). _(Phase 8)_
7. **OTel correlation** — `traceId` in logs, Grafana derived field, `apps/worker` cross-service hop (§14). _(Phase 9)_
8. **`logs/` read-API** — keyset `/logs`, `/aggregate`, `/facets`, `/context`, `/stream` (SSE), `/loki`, `/export` ([`DASHBOARD.md`](DASHBOARD.md) §12–§14). _(Phase 10)_
9. **`apps/web` dashboard** — skeleton **with the copied design system** ([`DASHBOARD.md`](DASHBOARD.md) §15), then Overview/Explorer/Live Tail, then Trigger/Alerts/Maintenance. _(Phases 11–13)_
10. **Testing & gates** — 100% coverage (Jest+Vitest), Stryker `break: 100`, supertest stdout-capture, Playwright; export/log-key audits; the four CI workflows (§16, [`DEVELOPMENT_PLAN.md` Appendix C](DEVELOPMENT_PLAN.md#appendix-c--quality-gates)). _(Phases 14–15, 17–18)_
11. **Docs & polish** — fill the sibling `docs/*.md` files (§5), `README.md`, `CHANGELOG.md`, `RELEASES.md`. _(Phase 16)_
