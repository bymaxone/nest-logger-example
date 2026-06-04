# nest-logger-example — Development Plan

> **Scope:** the master phased plan for building `nest-logger-example`, the reference application for [`@bymax-one/nest-logger`](https://github.com/bymaxone/nest-logger).
> **Source of truth:** this file. Per-phase task files live under [`docs/tasks/`](tasks/README.md); the product spec is [`OVERVIEW.md`](OVERVIEW.md); the dashboard spec is [`DASHBOARD.md`](DASHBOARD.md).
> **Targeted library version:** `@bymax-one/nest-logger@^0.1.0` (0.1.0, implemented; consumed via local link until published).
> **Document version:** 1.0 — authored before implementation.
> **Status:** specification only.

This plan mirrors the proven 3-layer structure of the sibling `nest-auth-example` (`DEVELOPMENT_PLAN.md` → `tasks/README.md` → `tasks/phase-NN-*.md`) and adopts its **shipped, hardened quality bar** — **100% test coverage** on all four metrics + **100% Stryker mutation score** + an **export-usage audit** — placed in the correct phases (see [§Appendix C — Quality Gates](#appendix-c--quality-gates)).

---

## Table of Contents

- [Progress Summary](#progress-summary)
- [0. Guiding Principles](#0-guiding-principles)
- [1. Phase Map & Dependencies](#1-phase-map--dependencies)
- [2. Global Conventions](#2-global-conventions)
- [Phases 0–18](#phase-0--repository-foundation--tooling)
- [Appendix A — Environment Variable Registry](#appendix-a--environment-variable-registry)
- [Appendix B — Library Export → Example File Map](#appendix-b--library-export--example-file-map)
- [Appendix C — Quality Gates](#appendix-c--quality-gates)

---

## Progress Summary

> Every phase has a task file under [`docs/tasks/`](tasks/README.md). When an agent completes a task it MUST update **both** the phase file **and** this table.
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked
>
> **Overall progress: 86 / 133 tasks done (65%)**

| #   | Phase                                     | Tasks file                        | Done / Total | %    | Status |
| --- | ----------------------------------------- | --------------------------------- | ------------ | ---- | ------ |
| 0   | Repository Foundation & Tooling           | `phase-00-repo-foundation.md`     | 8 / 8        | 100% | 🟢     |
| 1   | Local Observability Stack                 | `phase-01-observability-stack.md` | 6 / 6        | 100% | 🟢     |
| 2   | Library Consumption & Workspace Bootstrap | `phase-02-library-consumption.md` | 4 / 4        | 100% | 🟢     |
| 3   | `apps/api` Skeleton + OTel Bootstrap      | `phase-03-api-skeleton.md`        | 6 / 6        | 100% | 🟢     |
| 4   | Logger Wiring                             | `phase-04-logger-wiring.md`       | 6 / 6        | 100% | 🟢     |
| 5   | Prisma & Persistence                      | `phase-05-prisma-persistence.md`  | 6 / 6        | 100% | 🟢     |
| 6   | Demo Domain                               | `phase-06-demo-domain.md`         | 8 / 8        | 100% | 🟢     |
| 7   | Destinations                              | `phase-07-destinations.md`        | 7 / 7        | 100% | 🟢     |
| 8   | PII Redaction Proofs                      | `phase-08-redaction.md`           | 5 / 5        | 100% | 🟢     |
| 9   | OpenTelemetry Correlation + `apps/worker` | `phase-09-otel-correlation.md`    | 6 / 6        | 100% | 🟢     |
| 10  | `logs/` Read-API                          | `phase-10-logs-api.md`            | 9 / 9        | 100% | 🟢     |
| 11  | `apps/web` Skeleton + Design System       | `phase-11-web-skeleton.md`        | 7 / 7        | 100% | 🟢     |
| 12  | Dashboard — Overview, Explorer, Live Tail | `phase-12-dashboard-core.md`      | 8 / 9        | 89%  | 🟡     |
| 13  | Dashboard — Trigger, Alerts, Maintenance  | `phase-13-dashboard-ops.md`       | 0 / 9        | 0%   | 🔴     |
| 14  | Testing — Unit + E2E (**100% coverage**)  | `phase-14-testing.md`             | 0 / 10       | 0%   | 🔴     |
| 15  | Mutation Testing (**Stryker 100%**)       | `phase-15-mutation.md`            | 0 / 6        | 0%   | 🔴     |
| 16  | Documentation                             | `phase-16-documentation.md`       | 0 / 8        | 0%   | 🔴     |
| 17  | CI/CD & Release Automation                | `phase-17-cicd.md`                | 0 / 7        | 0%   | 🔴     |
| 18  | Audit & Hardening + v1.0.0                | `phase-18-audit-hardening.md`     | 0 / 6        | 0%   | 🔴     |

### How to update this dashboard

1. Set the task's row in its phase file to 🟢 Done and tick its acceptance criteria.
2. Increment the phase file's header progress counter.
3. Update this table's **Done / Total** and **%** for that phase.
4. Recompute **Overall progress** as the sum across all 133 tasks.
5. When a phase hits 100%, flip its **Status** here to 🟢 Done. **Never** mark a task done with failing verification.

---

## 0. Guiding Principles

1. **Library-faithful.** Every public export of `@bymax-one/nest-logger` (`.` + `/shared`) is demonstrated in `apps/`; CI enforces it (Phase 18). If the README documents it, this repo proves it.
2. **Copy-paste friendly.** Folder names, the OTel bootstrap, the redaction config, and the destinations are generic so users lift them directly.
3. **Production-shaped.** Real observability stack (Loki/Tempo/Grafana/OTel Collector + Postgres), env-driven config, graceful shutdown.
4. **The same quality bar as `nest-auth-example`.** 100% coverage + 100% mutation + export audit + lint/typecheck/e2e gates — non-negotiable, wired into CI.
5. **Design parity.** `apps/web` reuses `nest-auth-example`'s design system **verbatim** (tokens, fonts, shell, glass-morphism) — see [`DASHBOARD.md` §Design System](DASHBOARD.md).
6. **No shortcuts.** No `@ts-ignore`, no `eslint-disable` to pass a gate, no `--no-verify`, no lowering a threshold to make CI green.
7. **One in-progress task per phase** at a time; never start a task until every dependency is 🟢 Done.
8. **English-only** identifiers, comments, and docs. **Conventional Commits.**
9. **Honest scope.** Dashboard "ops" features (retention, RBAC, alerts) ship as small, real, clearly-labeled scoped demos of production concepts.

---

## 1. Phase Map & Dependencies

```
        ┌────────────────────────── BACKEND TRACK ──────────────────────────┐
0 ─▶ 1 ─▶ 2 ─▶ 3 ─▶ 4 ─▶ 5 ─▶ 6 ─▶ 7 ─▶ 8 ─▶ 9 ─▶ 10 ──┐
foundation  obs  lib  api  logger prisma demo dest redact otel  logs-API     │
   │        stack                                                            │
   │                                          ┌─── FRONTEND TRACK ───┐       │
   └────────────────────────────────▶ 11 ─▶ 12 ─▶ 13 ◀──────────────┘◀──────┘
                                      web    core   ops      (11 needs 10 for data;
                                      skel  dash   dash       12/13 consume logs-API)
                                                       │
        ┌──────────────── QUALITY & RELEASE TRACK ─────┘
        ▼
14 ─▶ 15 ─▶ 16 ─▶ 17 ─▶ 18
test  mutation docs  ci/cd audit+v1.0.0
(100%) (Stryker)            (export audit, hardening, tag)
```

**Parallelization.** Backend (0–10) is mostly linear. Once the `logs/` API (Phase 10) exists, the frontend track (11–13) can proceed in parallel with backend polish. The quality track (14–18) starts after both apps are feature-complete — **but coverage/mutation are written alongside each feature** (every phase's DoD requires its own tests to exist and pass at 100%); Phases 14–15 are the _consolidation + gate-hardening_ phases, not "write all tests at the end."

---

## 2. Global Conventions

| Concern             | Convention                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Package manager     | `pnpm@10.8.0` (pinned in `packageManager` + every CI `pnpm/action-setup@v4`), workspaces `apps/*`       |
| Runtime             | Node `>=24` (`.nvmrc` = `24`, `engines.node >=24`, setup-node `node-version: '24'`, `cache: pnpm`)      |
| Install             | `pnpm install --frozen-lockfile` everywhere; `.npmrc` → `frozen-lockfile=true`                          |
| Language            | TypeScript 5.9 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; ESM everywhere       |
| Lint / format       | ESLint 9 flat config (`recommendedTypeChecked`) + Prettier 3 (`printWidth 100`, `singleQuote`)          |
| Pre-commit          | husky `prepare: husky`; `.husky/pre-commit` → `pnpm exec lint-staged` (prettier + eslint --fix)         |
| Commits             | Conventional Commits (commitlint config present; enable in `commit-msg` for this repo)                  |
| Boolean naming      | prefix `is` / `has` / `should` / `can` (matches the library: `isEnabled`, `shouldDisableDefaultRedact`) |
| Log keys            | `MODULE_ACTION_RESULT`; validated vs `LOG_KEYS_CONVENTION_REGEX`; never reuse a `RESERVED_LOG_KEYS`     |
| **Test coverage**   | **100%** statements/branches/functions/lines — Jest (api) + Vitest (web). Gate in CI (Phase 14/17)      |
| **Mutation score**  | **Stryker thresholds `{ high: 100, low: 100, break: 100 }}`** — api (jest-runner) + web (vitest-runner) |
| **Export audit**    | `scripts/audit-library-exports.mjs` + `.audit-ignore.json` — every lib export referenced in `apps/`     |
| Dep automation      | `renovate.json` (weekend schedule; pin `@bymax-one/nest-logger`, group docker/actions)                  |
| Deps in the library | `@bymax-one/nest-logger` via local `link:`/`file:` until published (not on npm yet), then `^0.1.0`      |

---

## Phase 0 — Repository Foundation & Tooling

**Goal:** a buildable `pnpm` monorepo with the full Bymax toolchain — installs, lints, typechecks, formats; husky + lint-staged active.
**Prerequisites:** none.
**Deliverables:**

- [ ] `package.json` (root) — workspaces `apps/*`, `packageManager: pnpm@10.8.0`, `engines`, the quality/infra scripts (`build`, `typecheck`, `lint`, `test`, `test:cov`, `test:e2e`, `mutation`, `mutation:incremental`, `mutation:dry-run`, `format`, `infra:up/down/nuke/logs`, `infra:test:up/down`, `audit:exports`).
- [ ] `pnpm-workspace.yaml`, `.nvmrc` (`24`), `.npmrc` (`frozen-lockfile=true`).
- [ ] `tsconfig.base.json` (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`).
- [ ] `eslint.config.mjs` (flat, `recommendedTypeChecked`, test relaxations, ignores incl. `.stryker-tmp`/`reports`).
- [ ] `.prettierrc.mjs` (`printWidth 100`, `singleQuote`, `trailingComma: all`).
- [ ] `.husky/pre-commit` → `pnpm exec lint-staged`; `lint-staged.config.mjs`; `commitlint.config.mjs`.
- [ ] `renovate.json`; `.gitignore`; `LICENSE` (MIT); `README.md` stub; `CHANGELOG.md`.

**Definition of done:** `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` all pass on a clean checkout.

---

## Phase 1 — Local Observability Stack

**Goal:** `docker compose up -d --wait` brings up the full local backend so logs/traces are visible end to end.
**Prerequisites:** Phase 0.
**Deliverables:**

- [x] `docker-compose.yml` — `postgres:18-alpine`, `grafana/loki`, `grafana/tempo`, `otel/opentelemetry-collector`, `grafana/grafana` (healthchecks, `127.0.0.1`-bound ports, named volumes).
- [x] `docker/otel-collector/config.yml` (OTLP receiver → Tempo traces + Loki logs).
- [x] `docker/loki/loki-config.yml`, `docker/tempo/tempo-config.yml`.
- [x] `docker/grafana/provisioning/` — auto-registered Loki + Tempo datasources **+ the `traceId` derived field** linking Loki logs → Tempo.
- [x] `docker/postgres/init.sql` (`CREATE DATABASE logger_example;`).
- [x] `.env.example` (root) covering every variable in [Appendix A](#appendix-a--environment-variable-registry).

**Definition of done:** `pnpm infra:up` reports all services healthy; Grafana at `:3000` shows Loki + Tempo datasources.

---

## Phase 2 — Library Consumption & Workspace Bootstrap

**Goal:** the example consumes `@bymax-one/nest-logger` and both subpaths type-resolve.
**Prerequisites:** Phase 0.
**Deliverables:**

- [x] `apps/api` + `apps/worker` declare `@bymax-one/nest-logger` (local `link:`/`file:` until published, then `^0.1.0`).
- [x] A typed "subpath probe" importing from `.` (`BymaxLoggerModule`, `PinoLoggerService`) and `/shared` (`LogLevel`, `LOG_KEYS_CONVENTION_REGEX`) to prove resolution.
- [x] Peer/optional deps installed: `pino`, `rxjs`, `reflect-metadata`, `pino-pretty`, `pino-roll`, `@opentelemetry/*`.

**Definition of done:** `pnpm typecheck` resolves both subpaths; the probe compiles.

---

## Phase 3 — `apps/api` Skeleton + OTel Bootstrap

**Goal:** a booting NestJS 11 service with the OTel SDK started before NestJS and a `/health` route.
**Prerequisites:** Phase 2.
**Deliverables:**

- [ ] `apps/api` Nest app (Express), `nest-cli.json`, tsconfigs.
- [ ] `src/instrumentation.ts` — `export const otelSdk`; `NodeSDK` start **before** any NestJS import; OTLP exporter; fs-instrumentation disabled. **No** `process.exit` here (NestJS owns termination).
- [ ] `src/main.ts` — `import './instrumentation'` first; `NestFactory.create(AppModule, { bufferLogs: true })`; bridge via `app.useLogger(app.get(PinoLoggerService))` (or the `shouldUseAsNestLogger` option); single ordered `SIGTERM` handler → `app.close()` → `otelSdk.shutdown()` → exit.
- [ ] `src/config/env.schema.ts` (Zod) + `src/health/` (`/health`, `/metrics`).

**Definition of done:** `pnpm --filter api dev` boots; `GET /health` returns 200; a span reaches Tempo.

---

## Phase 4 — Logger Wiring

**Goal:** `BymaxLoggerModule` fully wired via `forRootAsync` from env.
**Prerequisites:** Phase 3.
**Deliverables:**

- [ ] `src/logger/logger.config.ts` — `buildLoggerOptions(config, prisma)` factory (service, level, `isPretty`, `redactPaths`, `redactCensor`, `maxEntrySizeBytes`, `http`, `otel`, `destinations`).
- [ ] `BymaxLoggerModule.forRootAsync({ imports, inject, useFactory })` in `app.module.ts`.
- [ ] `consumer.apply(RequestIdMiddleware).forRoutes('*')` in `configure()` (ALS `requestId`/`tenantId`) — or the `http.shouldGenerateRequestId` option.
- [ ] `src/logger/log-audit.service.ts` (`@Inject(LOGGER_OPTIONS_TOKEN)`).

**Definition of done:** every request log carries `requestId`/`tenantId`; HTTP interceptor + exception filter active; `LOGGER_BOOTSTRAP_OK` emitted.

---

## Phase 5 — Prisma & Persistence

**Goal:** Postgres-backed durable log tier + demo-domain tables.
**Prerequisites:** Phase 1, Phase 3.
**Deliverables:**

- [ ] `prisma/schema.prisma` — `ApplicationLog` (dashboard-grade columns; see `DASHBOARD.md` §13) + `Order`/`Payment` + `SavedView`/`AlertRule`/`Incident`/`AuditEvent`.
- [ ] Indexes via **native Prisma extended-index syntax** (BRIN on `time`, composite `(time DESC, id DESC)` keyset, GIN `jsonb_path_ops` on `payload`) — GA on PostgreSQL in Prisma 6/7; reserve raw SQL only for what Prisma can't model (BRIN `pages_per_range` tuning, partial indexes). See `DASHBOARD.md` §13.
- [ ] `PrismaService`; `prisma/seed.ts` (demo tenants + sample orders).

**Definition of done:** `prisma migrate dev` applies; `prisma db seed` populates; indexes present (`\d application_logs`).

---

## Phase 6 — Demo Domain

**Goal:** realistic structured logs from a toy domain.
**Prerequisites:** Phase 4, Phase 5.
**Deliverables:**

- [ ] `orders/` (`POST /orders`, `GET /orders/:id`, `GET /orders/slow`) — hot-path `info`, URL `:id` norm, slow flag.
- [ ] `payments/` (`POST /payments`) — `@LogPerformance`, `errorStructured`, `HttpException`.
- [ ] `pii-demo/` (signup/nested/echo-headers/huge) — redaction surfaces.
- [ ] `downstream/` (`POST /downstream/dispatch`) — `@LogContext(name)` class label + ctor `setContext()`, calls `apps/worker`.
- [ ] `trigger/` (`/trigger/level`, `/trigger/status/:code`, `/trigger/fault/loki`, `/trigger/burst`) — Playground hooks.
- [ ] `admin/` (`PATCH /admin/log-level` → `getRawLogger().level`).

**Definition of done:** each endpoint emits the expected `logKey`(s) on stdout with propagated context.

---

## Phase 7 — Destinations

**Goal:** pluggable destinations demonstrated, with lifecycle + fail-soft.
**Prerequisites:** Phase 4.
**Deliverables:**

- [ ] `destinations/loki.destination.ts` (batched HTTP push, flush timer).
- [ ] `destinations/prisma-log.destination.ts` (`minLevel` = `LOG_DB_MIN_LEVEL` default `warn`, batch `createMany`, JSON-parse guard).
- [ ] `destinations/rolling-file.destination.ts` (`pino-roll`, async `onInit`).
- [ ] Wired via `logger.config.ts` `destinations[]`; `app.enableShutdownHooks()` drains in reverse order.

**Definition of done:** a request lands JSON on stdout + a line in Loki + a `warn` row in Postgres; fault-injecting a bad Loki URL emits `LOGGER_DESTINATION_WRITE_FAILED` to stderr and the app keeps serving.

---

## Phase 8 — PII Redaction Proofs

**Goal:** prove the 97 default paths + extensions redact, end to end.
**Prerequisites:** Phase 6.
**Deliverables:**

- [x] `pii-demo` endpoints log `password`/`email`/`cpf`/`cardNumber`/headers → `[REDACTED]`.
- [x] Custom `redactPaths` (`*.webhookSignature`, `payload.creditCard.*`) merged; depth 1–4 vs depth-5 boundary demonstrated.
- [x] `LogAuditService.listEffectiveRedactPaths()` + `EXPECTED_REDACTED_FIELDS` CI-asserted gate; `shouldDisableDefaultRedact` danger proof.

**Definition of done:** e2e captures stdout and asserts `[REDACTED]` everywhere + no raw PII in Postgres/Loki. ✅

---

## Phase 9 — OpenTelemetry Correlation + `apps/worker`

**Goal:** `traceId` in every log + cross-service correlation.
**Prerequisites:** Phase 4.
**Deliverables:**

- [ ] Verify `traceId`/`spanId`/`traceFlags` injected; Grafana derived field clicks through to Tempo.
- [ ] `apps/worker` — second NestJS service with its own `instrumentation.ts`, `BymaxLoggerModule` (`otel.fieldFormat: 'snake_case'` for contrast), extracts `traceparent`, logs the same `traceId`.
- [ ] `downstream` → worker hop (auto-instrumented + a manual `propagation.inject` example).

**Definition of done:** one request produces interleaved `api` + `worker` logs sharing a `traceId`, visible in Grafana.

---

## Phase 10 — `logs/` Read-API

**Goal:** the API surface that powers the dashboard.
**Prerequisites:** Phase 5, Phase 7.
**Deliverables:**

- [ ] `logs/logs.controller.ts` — `GET /logs` (keyset), `/logs/aggregate`, `/logs/facets`, `/logs/context`, `/logs/export`.
- [ ] `logs/logs.sse.controller.ts` — `GET /logs/stream` (SSE, `Last-Event-ID` replay, keep-alive).
- [ ] `logs/loki-proxy.controller.ts` — `GET /logs/loki` (LogQL `query_range`/`labels`/`tail`).
- [ ] `logs/logs.service.ts` — compiles `LogQuery` → Prisma `where` **and** LogQL.
- [ ] `alerts/` (rules cron + channels + incidents) + `governance/` (saved views, RBAC restriction, retention sweep, `audit_events`).

**Definition of done:** each endpoint returns correct shapes (see `DASHBOARD.md` §12–§14); SSE streams new entries; Loki proxy answers the same query.

---

## Phase 11 — `apps/web` Skeleton + Design System

**Goal:** a Next.js 16 app that is **visually identical** to every Bymax example app.
**Prerequisites:** Phase 10 (for data) — skeleton can start earlier with mocks.
**UI base:** build to **[`docs/design_system.html`](design_system.html)** — the rendered, project-agnostic design-system guide (tokens, app shell, components, severity, and its §10 AI-agent recreation steps). `DASHBOARD.md` §15 mirrors it for this app.
**Deliverables:**

- [x] `apps/web` Next.js 16 + React 19 + Tailwind v4 + shadcn `new-york`; `components.json`, `postcss.config.mjs`, `tailwind.config.ts`.
- [x] `app/globals.css` — the **verbatim** token block (light `:root` + `.dark` + brand tokens + keyframes) from `DASHBOARD.md` §Design System.
- [x] `app/layout.tsx` — Geist Sans/Mono, **forced `dark`** on `<html>`, `Providers` (TanStack Query + Sonner `Toaster`).
- [x] `lib/utils.ts` (`cn`); the shadcn component set; `components/layout/` Topbar (64px) + Sidebar (250px, orange active state) app shell.
- [x] `lib/log-keys.ts` importing `LOG_KEYS_CONVENTION_REGEX` from `/shared`.

**Definition of done:** the shell renders with the orange/glass dark theme, the brand mark, and the logger nav; `pnpm --filter web build` succeeds. ✅ 2026-06-03

---

## Phase 12 — Dashboard: Overview, Explorer, Live Tail

**Goal:** the daily-driver pages.
**Prerequisites:** Phase 10, Phase 11.
**Deliverables:**

- [ ] `app/page.tsx` Overview — health strip + RED row + breakdowns + SLO + pipeline-health (Recharts, fed by `/logs/aggregate`).
- [ ] `app/explorer/page.tsx` — facet rail, query bar (SQL+LogQL shown), virtualized table (TanStack Virtual), detail drawer (`@uiw/react-json-view`), trace deep-links.
- [ ] Live tail via `EventSource` + `useLogStream` hook (follow-mode, rAF batching, ring buffer).
- [ ] Global controls (time range, source toggle, tenant/role) in URL via `nuqs`.

**Definition of done:** brushing the volume chart filters the Explorer; firing a log appears in the live tail; a row's `traceId` opens the trace.

---

## Phase 13 — Dashboard: Trigger, Alerts, Maintenance

**Goal:** the "operate it like a real platform" surface.
**Prerequisites:** Phase 12.
**Deliverables:**

- [ ] `app/trigger/page.tsx` — fire every log type/feature; auto-pivot Explorer to the new `requestId`/`traceId`.
- [ ] `app/alerts/page.tsx` — rule form (`expr + threshold + for`), channel registry, incident timeline.
- [ ] `app/maintenance/page.tsx` — retention sweep status, JSON/CSV export, RBAC role/tenant, **redaction-at-source** proof panel, audit table.

**Definition of done:** each Playground trigger produces the documented logKeys; an alert fires an incident; export downloads the filtered set; switching tenant scopes the Explorer.

---

## Phase 14 — Testing — Unit + E2E (**100% coverage**)

**Goal:** consolidate tests and **harden the coverage gate to 100%** on all four metrics in both apps.
**Prerequisites:** Phases 6–13 (each shipped with its own tests).
**Deliverables:**

- [ ] `apps/api` Jest unit (ESM) — `coverageThreshold.global` = `{ branches, lines, functions, statements }: 100`; `collectCoverageFrom` excludes `*.spec`/`*.module`/`main.ts`/`*.dto`/`*.d.ts`.
- [ ] `apps/api` supertest e2e — **stdout-capture** assertions (spy `process.stdout.write`): logKeys, URL norm, `requestId`, `[REDACTED]`, double-log avoidance; `logs/` API paging/aggregate/facets/SSE; `apps/worker` traceId propagation.
- [ ] `apps/web` Vitest (`jsdom`, v8) — `lib/**` + `components/**` thresholds all **100**; Playwright journeys (fire → live Explorer → trace; brush → filter; RBAC scoping).
- [ ] Optional `docker-compose.test.yml` + `infra:test:up/down` if integration (Testcontainers Loki) is used.

**Definition of done:** `pnpm test:cov` and `pnpm test:e2e` pass with **100%** coverage in both workspaces.

---

## Phase 15 — Mutation Testing (**Stryker 100%**)

**Goal:** 100% mutation score gate, incremental in CI.
**Prerequisites:** Phase 14.
**Deliverables:**

- [ ] `apps/api/stryker.config.json` — jest-runner + typescript-checker, `coverageAnalysis: perTest`, `mutate src/**/*.ts` (excl. `*.spec`/`*.module`/`main`/`*.dto`/`*.d.ts`/`index.ts`), `thresholds { high: 100, low: 100, break: 100 }`, `incremental: true`.
- [ ] `apps/web/stryker.config.json` — vitest-runner, `mutate lib/**/*.ts` + `components/**/*.tsx` (excl. tests/shadcn primitives), same thresholds.
- [ ] `apps/api/jest.stryker.config.ts` (coverage threshold removed; Stryker jest env).
- [ ] `docs/stryker/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md` — record the first measurement before hardening to 100.

**Definition of done:** `pnpm mutation` passes both workspaces at **break: 100** (zero surviving mutants).

---

## Phase 16 — Documentation

**Goal:** every `docs/*.md` is complete and accurate.
**Prerequisites:** features stable.
**Deliverables:**

- [ ] Fill `GETTING_STARTED`, `FEATURES`, `ARCHITECTURE`, `ENVIRONMENT`, `DESTINATIONS`, `REDACTION`, `OTEL`, `DATABASE`, `DEPLOYMENT`, `TROUBLESHOOTING`.
- [ ] Keep `OVERVIEW.md`, `DASHBOARD.md`, this plan, and `RELEASES.md` current.
- [ ] Root `README.md` (badges, quick start, feature checklist, ASCII architecture) in the `nest-auth-example` house style.

**Definition of done:** `markdown-link-check` passes; the §6 coverage matrix matches the audit output.

---

## Phase 17 — CI/CD & Release Automation

**Goal:** the four GitHub Actions workflows enforcing every gate.
**Prerequisites:** Phases 14–15.
**Deliverables:**

- [ ] `.github/workflows/ci.yml` — jobs `install → lint, typecheck, unit, export-usage-check`; `e2e-api → e2e-web`; `coverage-report` (`needs: [unit, e2e-api, e2e-web]`). Node 24, pnpm 10.8.0, `--frozen-lockfile`, concurrency cancel-in-progress.
- [ ] `.github/workflows/mutation.yml` — per-PR incremental Stryker, `dorny/paths-filter` per workspace, `actions/cache` of `stryker-incremental.json`.
- [ ] `.github/workflows/mutation-nightly.yml` — Monday 03:00 UTC full cold run.
- [ ] `.github/workflows/release.yml` — `v*` tags → build/push GHCR images → bot-append a row to `docs/RELEASES.md`.
- [ ] `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.prod.yml`.

**Definition of done:** a green PR shows all CI jobs passing; a `v*` tag publishes images + updates `RELEASES.md`.

---

## Phase 18 — Audit & Hardening + v1.0.0

**Goal:** library-export coverage, security pass, and the first tag.
**Prerequisites:** all prior phases.
**Deliverables:**

- [ ] `scripts/audit-library-exports.mjs` + `.audit-ignore.json` — every `@bymax-one/nest-logger` export (`.` + `/shared`) referenced in `apps/`; wired as the `export-usage-check` CI job + `audit:exports` script.
- [ ] `scripts/audit-log-keys.mjs` — every app log key matches `LOG_KEYS_CONVENTION_REGEX`, no `RESERVED_LOG_KEYS` reuse.
- [ ] Security pass — `helmet` on the API; close any coverage/mutation gaps surfaced.
- [ ] `CHANGELOG.md` `1.0.0` entry + a local annotated `v1.0.0` tag (pushed only when the library hits GA).

**Definition of done:** `pnpm audit:exports` exits 0; all CI gates green; the coverage matrix in `OVERVIEW.md` §6 is 100% demonstrated.

---

## Appendix A — Environment Variable Registry

See [`OVERVIEW.md` §9](OVERVIEW.md) for the canonical table (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `OTEL_SERVICE_NAME`, `RELEASE_SHA`, `OTLP_TRACE_ENDPOINT`, `LOG_EXTRA_REDACT_PATHS`, `LOKI_URL`, `LOKI_QUERY_URL`, `DATABASE_URL`, `LOG_DB_MIN_LEVEL`, `RETENTION_DAYS`, `OTEL_FIELD_FORMAT`, `SENTRY_DSN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GRAFANA_URL`). Each is `zod`-validated in `apps/api/src/config/env.schema.ts`.

## Appendix B — Library Export → Example File Map

Maintained by `scripts/audit-library-exports.mjs` and surfaced as the [§6 Feature Coverage Matrix](OVERVIEW.md#6-feature-coverage-matrix). The audit parses `node_modules/@bymax-one/nest-logger/dist/{server,shared}/index.d.ts`, extracts every exported symbol, and word-boundary-searches the `apps/` corpus; missing symbols fail CI unless listed in `.audit-ignore.json` with a reason + issue link.

## Appendix C — Quality Gates

The non-negotiable bar, mirroring `nest-auth-example`'s **shipped** configuration. (Note: `nest-auth-example`'s planning docs predated the hardening to 100% + Stryker; this plan bakes the **final** gates in from the start.)

| Gate                | Tool / config                                      | Threshold                          | Enforced in             |
| ------------------- | -------------------------------------------------- | ---------------------------------- | ----------------------- |
| Lint                | ESLint 9 flat (`eslint .`)                         | zero errors                        | CI `lint` (Phase 17)    |
| Typecheck           | `tsc --noEmit` per package                         | zero errors                        | CI `typecheck`          |
| Unit coverage (api) | Jest `coverageThreshold.global`                    | **100%** b/l/f/s                   | CI `unit` (Phase 14)    |
| Unit coverage (web) | Vitest v8 `coverage.thresholds`                    | **100%** b/l/f/s                   | CI `unit`               |
| E2E                 | supertest (api, stdout-capture) + Playwright (web) | all pass                           | CI `e2e-api`/`e2e-web`  |
| Mutation (api)      | Stryker jest-runner + typescript-checker           | **`break: 100`**                   | `mutation.yml` (PR)     |
| Mutation (web)      | Stryker vitest-runner                              | **`break: 100`**                   | `mutation.yml` (PR)     |
| Mutation drift      | Stryker full cold run                              | report; issue on regression        | `mutation-nightly.yml`  |
| Export usage        | `scripts/audit-library-exports.mjs`                | every export used (or ignored)     | CI `export-usage-check` |
| Log-key convention  | `scripts/audit-log-keys.mjs`                       | all match regex; no reserved reuse | CI (Phase 18)           |
| Pre-commit          | husky + lint-staged                                | prettier + eslint --fix on staged  | local                   |

> **Coverage-shim note.** The "uncovered branch" that NestJS `emitDecoratorMetadata` injects is a **known ts-jest issue** with a built-in fix: set **`ignoreCoverageForAllDecorators: true`** in the ts-jest transform options — prefer that over `nest-auth-example`'s bespoke `jest-ts-transform.cjs`. If the logger API has `emitDecoratorMetadata` off entirely, the standard ts-jest transform suffices and no shim is needed.
>
> **Mutation-bar note.** The example's `break: 100` matches the **`nest-auth-example` app** (whose shipped Stryker config is 100/100/100). The **`@bymax-one/nest-logger` library itself** targets ≥99 with `break: 95` — so "100% mutation" is the _example-app_ bar, not the library's. For the **web/UI** workspace, 100% mutation can be over-engineered; a pragmatic `break` (e.g. 90) on `components/**` while keeping `lib/**` at 100 is a defensible alternative — keep the export/log-key audits regardless.
>
> **Toolchain caveats (audit).**
>
> - **CI action order:** run `pnpm/action-setup@v4` **before** `actions/setup-node@v5` when using `cache: pnpm` (setup-node v5 errors if pnpm isn't on PATH yet — `actions/setup-node#1357`). The `install` job order already reflects this.
> - **Jest native ESM** (`NODE_OPTIONS=--experimental-vm-modules`) is still flagged _experimental_ as of Jest 30.4 — keep a documented CJS-transform fallback in case an upstream change breaks it.
> - **Pin a Vitest major** (e.g. `vitest@^3`) rather than `latest` — Stryker 9's `@stryker-mutator/vitest-runner` requires Vitest ≥ 2.
> - **Stryker pure-ESM config** needs Node ≥ 20; a JSON `stryker.config.json` avoids ESM-loader friction.
