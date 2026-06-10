<h1 align="center">nest-logger-example</h1>

<p align="center">
  The canonical reference application for <a href="https://github.com/bymaxone/nest-logger"><code>@bymax-one/nest-logger</code></a> —
  structured, redacted, trace-correlated logging across two NestJS services and a Next.js observability dashboard.
</p>

<p align="center">
  <img alt="library" src="https://img.shields.io/badge/%40bymax--one%2Fnest--logger-%5E0.1.0-6E56CF" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green" />
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-strict-3178C6" />
  <img alt="node" src="https://img.shields.io/badge/Node-%3E%3D24-339933" />
  <img alt="nestjs" src="https://img.shields.io/badge/NestJS-11-E0234E" />
  <img alt="next" src="https://img.shields.io/badge/Next.js-16-000000" />
  <img alt="react" src="https://img.shields.io/badge/React-19-61DAFB" />
  <img alt="prisma" src="https://img.shields.io/badge/Prisma-7-2D3748" />
  <img alt="tailwind" src="https://img.shields.io/badge/Tailwind-4-06B6D4" />
  <img alt="pino" src="https://img.shields.io/badge/Pino-10-687634" />
  <img alt="opentelemetry" src="https://img.shields.io/badge/OpenTelemetry-traces-F5A800" />
</p>

<p align="center">
  <a href="https://github.com/bymaxone/nest-logger">📦 Library</a> ·
  <a href="#-quick-start">🚀 Quick Start</a> ·
  <a href="#-whats-inside">✅ Features</a> ·
  <a href="#-architecture">🏗️ Architecture</a> ·
  <a href="docs/OVERVIEW.md">📖 Docs</a>
</p>

---

## ✨ Overview

`@bymax-one/nest-logger` is the **what**; this repository is the **how**. It is a runnable, production-shaped
demo that exercises **every public export** of the library across a NestJS API, a second worker service (for
cross-service `traceId` correlation), and a first-class Next.js observability dashboard — all wired to a local
Loki / Tempo / Grafana / OpenTelemetry Collector + PostgreSQL stack.

### 🚀 Quick start

```bash
git clone https://github.com/bymaxone/nest-logger-example.git
cd nest-logger-example
pnpm install && pnpm infra:up
cp .env.example apps/api/.env
pnpm --filter api db:migrate && pnpm --filter api db:seed
pnpm dev
```

> The library is **pre-publish** — it is consumed via a local `link:`/`file:` to the sibling `../nest-logger`
> checkout until it ships to npm. Build that checkout first; the full five-minute walkthrough is in
> **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**.

---

## 🔥 What's inside

**Structured logging**

- ✅ `MODULE_ACTION_RESULT` structured calls — `info` / `warnStructured` / `errorStructured` (+ variadic `fatal`)
- ✅ Per-class child loggers (`@InjectLogger`), context labels (`@LogContext`), slow-method detection (`@LogPerformance`)
- ✅ `AsyncLocalStorage` request context — `requestId` / `tenantId` / `userId` on every line, zero hot-path cost
- ✅ Full HTTP lifecycle logging + a coordinated exception filter (no double-logs)

**PII redaction**

- ✅ 97 default redact paths compiled once via `fast-redact`, censored to `[REDACTED]` at the source
- ✅ Safe, merged extension via `redactPaths` (bracket syntax for hyphenated headers)
- ✅ Proven end-to-end: the same record is `[REDACTED]` in **both** Postgres and Loki

**Destinations**

- ✅ Pluggable `ILogDestination` fan-out: stdout · pretty-dev · Loki (batched HTTP) · Prisma (durable) · rolling file
- ✅ Per-destination `minLevel`, fail-soft writes, reverse-order shutdown drain

**OpenTelemetry correlation**

- ✅ `traceId` / `spanId` injected into every log when the SDK is active
- ✅ Cross-service propagation: `apps/api` → `apps/worker` share one trace (camelCase vs snake_case contrast)
- ✅ Grafana derived field: click a `traceId` in Loki → jump to the Tempo trace

**The dashboard (`apps/web`)**

- ✅ Log Explorer (facets, virtualized table, trace deep-links) + real-time SSE live tail
- ✅ Trigger Center (fire every feature) + golden-signal / RED charts + alerts + maintenance

**Quality bar**

- ✅ 100% test coverage + 100% Stryker mutation score, English-only, Conventional Commits

---

## 🏗️ Architecture

```
   apps/web (Next.js 16 + React 19)
   Trigger Center → fire · Log Explorer → read · imports /shared types + LOG_KEYS_CONVENTION_REGEX
        │ trigger (POST)                              ▲ read (GET /logs, /logs/stream SSE, /logs/loki)
        ▼                                             │
   ┌─────────────────────────────────────────────────┴─────────────────┐
   │ apps/api (NestJS 11)            apps/worker (NestJS 11)             │
   │ instrumentation.ts → NodeSDK.start()  ← BEFORE NestJS loads        │
   │ BymaxLoggerModule: ALS context · redaction · OTel mixin · fan-out  │
   └───────┬───────────────────┬───────────────────────┬───────────────┘
   OTLP spans + logs       batched log lines        warn+ durable rows
           ▼                   ▼                         ▼
   ┌───────────────┐   ┌───────────────┐        ┌────────────────────┐
   │ OTel Collector│   │     Loki      │        │     PostgreSQL     │
   │  4317 / 4318  │   │     3100      │        │  ApplicationLog    │
   └──────┬────────┘   └───────┬───────┘        └────────────────────┘
   spans  ▼                    ▼ logs
   ┌───────────┐   ┌──────────────────────────────────────────────┐
   │   Tempo   │◀──│  Grafana (3000) — click traceId → Tempo trace │
   │   3200    │   └──────────────────────────────────────────────┘
   └───────────┘
```

`apps/api`, `apps/worker`, and `apps/web` are independently deployable; logs and traces join on `traceId`. Full
diagram in **[docs/OVERVIEW.md §3](docs/OVERVIEW.md#3-architecture-at-a-glance)** and the pipeline deep-dive in
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

> **Coverage rule.** Every public export of `@bymax-one/nest-logger` (the `.` and `/shared` subpaths) is
> referenced from at least one file under `apps/` — the
> **[Feature Coverage Matrix](docs/OVERVIEW.md#6-feature-coverage-matrix)** maps each one to where it is used.

---

## 📖 Documentation

| Doc                                          | What it covers                                            |
| -------------------------------------------- | --------------------------------------------------------- |
| [OVERVIEW](docs/OVERVIEW.md)                 | Product blueprint & repository layout (master spec)       |
| [GETTING_STARTED](docs/GETTING_STARTED.md)   | Clean clone → first correlated trace in ~5 minutes        |
| [FEATURES](docs/FEATURES.md)                 | Guided feature tour + all 11 end-to-end journeys          |
| [ARCHITECTURE](docs/ARCHITECTURE.md)         | The five-stage logging pipeline & module boundaries       |
| [ENVIRONMENT](docs/ENVIRONMENT.md)           | Every environment variable and what it feeds              |
| [DESTINATIONS](docs/DESTINATIONS.md)         | Writing & wiring a custom `ILogDestination`               |
| [REDACTION](docs/REDACTION.md)               | The 97 default redact paths & how to extend safely        |
| [OTEL](docs/OTEL.md)                         | SDK bootstrap, cross-service propagation, Grafana, Sentry |
| [DATABASE](docs/DATABASE.md)                 | The `ApplicationLog` schema & querying the durable tier   |
| [DEPLOYMENT](docs/DEPLOYMENT.md)             | Production checklist & version pins                       |
| [TROUBLESHOOTING](docs/TROUBLESHOOTING.md)   | Symptom → cause → fix reference                           |
| [DASHBOARD](docs/DASHBOARD.md)               | The `apps/web` observability console — full build spec    |
| [DEVELOPMENT_PLAN](docs/DEVELOPMENT_PLAN.md) | The phased build plan & quality gates                     |
| [RELEASES](docs/RELEASES.md)                 | Which library version each branch tracks                  |

---

## License

MIT © Bymax One. `@bymax-one/nest-logger` is MIT © Bymax One. See [LICENSE](LICENSE).
