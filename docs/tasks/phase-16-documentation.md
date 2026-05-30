# Phase 16 — Documentation — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-16--documentation) §Phase 16
> **Total tasks:** 8
> **Progress:** 🔴 0 / 8 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                                                  | Status | Priority | Size | Depends on   |
| ----- | ------------------------------------------------------------------------------------- | ------ | -------- | ---- | ------------ |
| P16-1 | `docs/GETTING_STARTED.md` — 5-minute quickstart → first correlated trace              | 🔴     | High     | M    | Phase 15     |
| P16-2 | `docs/FEATURES.md` — guided feature tour + the §15 journeys (curl + logs)             | 🔴     | High     | L    | P16-1        |
| P16-3 | `docs/ARCHITECTURE.md` + `docs/DATABASE.md` — pipeline deep-dive + schema             | 🔴     | High     | L    | P16-1        |
| P16-4 | `docs/ENVIRONMENT.md` + `docs/DESTINATIONS.md` — env reference + custom dest          | 🔴     | High     | L    | P16-1        |
| P16-5 | `docs/REDACTION.md` + `docs/OTEL.md` — 97 paths + OTel/Grafana/Sentry                 | 🔴     | High     | L    | P16-1        |
| P16-6 | `docs/DEPLOYMENT.md` + `docs/TROUBLESHOOTING.md` — prod checklist + "no traceId?"     | 🔴     | High     | M    | P16-1        |
| P16-7 | Root `README.md` (badges, quick start, feature checklist, ASCII arch) + `RELEASES.md` | 🔴     | High     | M    | P16-1..P16-6 |
| P16-8 | Verification gate — `markdown-link-check` + §6 coverage-matrix ↔ audit                | 🔴     | High     | S    | P16-1..P16-7 |

---

## P16-1 — `docs/GETTING_STARTED.md` — 5-Minute Quickstart → First Correlated Trace

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `Phase 15`

### Description

Write the "first five minutes" onboarding doc: from a clean clone to a NestJS API emitting a **structured, redacted, trace-correlated** log line that the reader clicks through to a Tempo trace in Grafana. This is the front door of the repository — it must match the **exact** scripts that exist (`pnpm infra:up`, `pnpm --filter api …`, `pnpm dev`) and the **reconciled** `@bymax-one/nest-logger@0.1.0` wiring (no `fatalStructured`, `redactCensor` is a string, `otel.shouldAutoInjectTraceContext`, `http.excludePaths` is `RegExp[]`). It mirrors the voice of `nest-auth-example`'s `docs/GETTING_STARTED.md` (terse, numbered, every command copy-pasteable, a "common snags" tail that links into `TROUBLESHOOTING.md`). Because the library is **pre-publish**, the prerequisites must cover the sibling `link:` checkout (`OVERVIEW.md` §7) rather than an npm install.

### Acceptance Criteria

- [ ] `docs/GETTING_STARTED.md` exists with an H1 and a one-line promise ("clean clone → first correlated trace in ~5 minutes").
- [ ] **Prerequisites** section: Node ≥ 24 (`nvm use`), pnpm ≥ 10.8, Docker Compose v2 — **plus** the sibling `nest-logger` checkout + `pnpm build --watch` (the lib is not on npm; cross-links to `OVERVIEW.md` §7).
- [ ] **Quick start** fenced block with the real ordered commands: build the linked lib → `pnpm install` → `pnpm infra:up` → `cp .env.example apps/api/.env` → `pnpm --filter api prisma:migrate` + `prisma:seed` → `pnpm dev`.
- [ ] **"What you should see"** lists the real URLs: web `http://localhost:3000`, API health `http://localhost:3000/health` (or the configured `PORT`), Grafana `http://localhost:3000` Grafana note, worker `:3001`.
- [ ] **First correlated trace** walkthrough: `curl -X POST http://localhost:3000/orders …` → shows the `HTTP_REQUEST_START` / `ORDER_CREATE_SUCCESS` / `HTTP_REQUEST_SUCCESS` lines sharing one `requestId` + one `traceId` → open Grafana → filter Loki by `traceId` → click the derived field → land on the Tempo trace.
- [ ] A "fire it from the dashboard instead" note pointing at `apps/web` Trigger Center (forward-link to `FEATURES.md`).
- [ ] **Common snags** tail with 3–4 entries, each linking into `TROUBLESHOOTING.md` (created in P16-6) — e.g. "no `traceId` in my logs", "Loki shows nothing", "`Cannot find module '@bymax-one/nest-logger'`".
- [ ] All internal links resolve (relative `./FILE.md#anchor`); no link to a doc that will not exist after Phase 16.

### Files to create / modify

- `docs/GETTING_STARTED.md` — the quickstart.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / technical writer authoring developer onboarding docs.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see `docs/OVERVIEW.md` §7 Library Consumption, §9 Configuration, §14 OpenTelemetry, and `docs/DEVELOPMENT_PLAN.md` §Phase 16). This is task P16-1. The house style is `nest-auth-example`'s `docs/GETTING_STARTED.md` (terse, numbered, copy-pasteable). The library is **pre-publish** — consumed via a local `link:` to the sibling `../nest-logger` checkout. **The package types are authoritative**; use the reconciled API only.
> Objective: Produce `docs/GETTING_STARTED.md` — a clean clone to a first correlated trace in ~5 minutes.
> Steps:
>
> 1. Open with an H1 (`# Getting started`) and a one-sentence promise that ends at "a correlated `traceId` you click through to Tempo in Grafana".
> 2. **Prerequisites** — Node ≥ 24 (`.nvmrc` → `nvm use`), pnpm ≥ 10.8, Docker Compose v2. Then a callout: the lib is not on npm yet, so build the sibling checkout first:
>    ```bash
>    # one terminal — keep the library's dist/ fresh (sibling of this repo under …/bymax-one/)
>    cd ../nest-logger && pnpm install && pnpm build --watch
>    ```
>    Link to `[OVERVIEW §7](./OVERVIEW.md#7-library-consumption)` for the `link:` details.
> 3. **Quick start** — one fenced `bash` block, numbered comments, matching the real scripts:
>    ```bash
>    # 1. Install workspace deps (resolves the link: to ../nest-logger)
>    pnpm install
>    # 2. Bring up Postgres + Loki + Tempo + OTel Collector + Grafana, wait for health
>    pnpm infra:up
>    # 3. Create the API env file from the root template
>    cp .env.example apps/api/.env
>    # 4. Apply migrations + seed demo tenants/orders
>    pnpm --filter api prisma:migrate
>    pnpm --filter api prisma:seed
>    # 5. Start api + worker + web together
>    pnpm dev
>    ```
> 4. **What you should see** — bullet the live endpoints (web `http://localhost:3000`, API health `http://localhost:3000/health`, `apps/worker` on `:3001`, Grafana via the compose stack). Note `/health` and `/metrics` emit **no** access logs (they are in `http.excludePaths`).
> 5. **Your first correlated trace** — a numbered walkthrough:
>    ```bash
>    curl -sS -X POST http://localhost:3000/orders \
>      -H 'content-type: application/json' \
>      -H 'x-tenant-id: t_acme' \
>      -d '{"amount": 4200}'
>    ```
>    Then show the three stdout lines that share one `requestId` and one `traceId`:
>    ```jsonc
>    {"level":30,"logKey":"HTTP_REQUEST_START","url":"/orders","requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
>    {"level":30,"logKey":"ORDER_CREATE_SUCCESS","msg":"Order created","requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
>    {"level":30,"logKey":"HTTP_REQUEST_SUCCESS","url":"/orders","status":201,"durationMs":12,"requestId":"r_7f3a9b","traceId":"4bf92f3577b34da6a3ce929d0e0e4736"}
>    ```
>    Then: open Grafana → Explore → Loki → `{service="nest-logger-example-api"} | json | traceId="…"` → click the **`traceId` derived field** → land on the Tempo trace (the payoff). Reference `OVERVIEW.md` §14 for why this works.
> 6. **Prefer the UI?** — one line pointing at the `apps/web` Trigger Center (link forward to `./FEATURES.md`), which fires the same log without `curl`.
> 7. **Common snags** — 3–4 symptom→fix bullets, each deep-linking into `./TROUBLESHOOTING.md` (P16-6): "no `traceId` in my logs", "Loki is empty", "`Cannot find module '@bymax-one/nest-logger'`".
>    Constraints:
>
> - English only; reconciled API only (NO `fatalStructured`; `redactCensor` is a string; `otel.shouldAutoInjectTraceContext`; `http.excludePaths: RegExp[]`). Where any wording would contradict the package types, the types win.
> - Use only scripts/paths that actually exist in this repo (`pnpm infra:up`, `pnpm dev`, `pnpm --filter api …`); do NOT invent commands.
> - Keep it to ~5 minutes of reading + doing; defer deep dives to the sibling docs via links.
>   Verification:
> - `npx markdown-link-check docs/GETTING_STARTED.md` — expected: every link resolves (run after the P16-6 docs exist; until then, no broken **intra-Phase-16** links).
> - Manual: every fenced command maps 1:1 to a real `package.json` script or a real route.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P16-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P16-2 — `docs/FEATURES.md` — Guided Feature Tour + the §15 Journeys

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (180–360 min)
- **Depends on:** `P16-1`

### Description

Write the guided tour that walks every demonstrated library feature **and** the 11 end-to-end journeys from `OVERVIEW.md` §15, each with the exact `curl` and the resulting log line(s). This is the doc a reader opens to answer "show me feature X working". It must map onto the §6 Feature Coverage Matrix (so nothing the audit demands is missing) and reconcile to `0.1.0`: structured calls are `info(logKey, msg, userId?, meta?)`, `warnStructured(logKey, msg, userId?, meta?)`, `errorStructured(logKey, error, userId?, meta?)`; there is **no** `fatalStructured` (use variadic `fatal()`); `@LogContext(name)` is a **class** label; `@LogPerformance(ms)` drives slow detection; `http.excludePaths` is `RegExp[]`. Cover both the `curl` path and the `apps/web` Trigger Center path for each journey.

### Acceptance Criteria

- [ ] `docs/FEATURES.md` exists with an H1, a short intro, and a table of contents linking each journey.
- [ ] A **feature → demo** map section keyed to `OVERVIEW.md` §6 (synchronous/async registration, `@InjectLogger`, `@LogContext(name)`, `@LogPerformance`, ALS context, HTTP interceptor/filter, URL normalization, redaction, destinations, OTel correlation, `getRawLogger()` runtime level, `/shared` types).
- [ ] All **11 journeys** from §15 documented, each as: intent → `curl` (or Trigger Center button) → the resulting JSON log line(s) → what to notice. The 11: first correlated trace; PII never leaks; depth boundary (4 vs 5); slow-path; error handling + double-log avoidance; cross-service correlation; destinations fan-out; fault tolerance; oversized entry; runtime level change; graceful shutdown.
- [ ] Each journey's log line uses **reserved keys** correctly (e.g. `HTTP_REQUEST_START`, `METHOD_SLOW_EXECUTION`, `HTTP_EXCEPTION_HANDLED`, `LOGGER_DESTINATION_WRITE_FAILED`, `LOGGER_ENTRY_TRUNCATED`, `LOGGER_SHUTDOWN_OK`) — and never invents a key that collides with the 16 `RESERVED_LOG_KEYS`.
- [ ] Redaction journey shows `password`/`cpf`/`cardNumber`/header values rendered as `[REDACTED]`; explicitly notes the censor is the **string** `'[REDACTED]'`.
- [ ] Each journey cross-links the relevant deep-dive doc (`REDACTION.md`, `OTEL.md`, `DESTINATIONS.md`, `DATABASE.md`).
- [ ] A "from the dashboard" callout per journey where `apps/web` has a matching Trigger Center action.

### Files to create / modify

- `docs/FEATURES.md` — the feature tour + journeys.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / technical writer.
> Context: Task P16-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 16. Source the journeys verbatim from `docs/OVERVIEW.md` §15 and the feature map from §6 (Feature Coverage Matrix) + §10 (demo domain table). The reconciled `0.1.0` API is in §9/§11/§13/§14 — follow it, not the library README. House style: `nest-auth-example`'s `docs/FEATURES.md` (per-feature heading, real curl, real output, "what to notice").
> Objective: Produce `docs/FEATURES.md` covering every demonstrated feature and all 11 §15 journeys.
> Steps:
>
> 1. H1 (`# Features`) + intro: "every feature the library ships, fired here and shown working — by `curl` or from the `apps/web` Trigger Center." Add a ToC anchor-linking the 11 journeys.
> 2. **Feature map** — a table mirroring `OVERVIEW.md` §6 columns (feature · library surface · demonstrated-in file · how to fire it). Keep the surface names exact: `BymaxLoggerModule.forRoot`/`forRootAsync`, `@InjectLogger(ctx)`, `@LogContext(name)`, `@LogPerformance(ms)`, `LogContextService`, `RequestIdMiddleware`, `HttpLoggingInterceptor`, `HttpExceptionFilter`, `DEFAULT_REDACT_PATHS`, `ILogDestination`, `getRawLogger()`, `LOG_KEYS_CONVENTION_REGEX`.
> 3. **The 11 journeys** — one `##` per journey. Template each as:
>    - **Intent** (one line).
>    - **Fire it** — the exact `curl`, e.g. for the error journey:
>      ```bash
>      curl -sS -X POST http://localhost:3000/payments \
>        -H 'content-type: application/json' \
>        -d '{"orderId":"ord_1","amount":-1}'   # forced failure
>      ```
>    - **You get** — the JSON line(s). For the error journey show `errorStructured` output + a single `HTTP_EXCEPTION_HANDLED` (call out double-log avoidance via `__bymax_logger_handled`):
>      ```jsonc
>      {"level":50,"logKey":"PAYMENT_CHARGE_FAILED","msg":"Charge failed","err":{"type":"Error","message":"...","stack":"..."},"requestId":"r_…","traceId":"…"}
>      {"level":50,"logKey":"HTTP_EXCEPTION_HANDLED","status":400,"url":"/payments","requestId":"r_…","traceId":"…"}
>      ```
>    - **Notice** — the teaching point (here: the exception is logged once, not twice).
>    - **From the dashboard** — the matching Trigger Center button, where one exists.
>    - **Go deeper** — link the relevant deep-dive doc.
> 4. Cover the structured-call signatures exactly once, near the top, so each journey can reference them:
>    ```typescript
>    logger.info('ORDER_CREATE_SUCCESS', 'Order created', userId, { orderId, amount })
>    logger.warnStructured('PAYMENT_RETRYABLE', 'Will retry', userId, { attempt })
>    logger.errorStructured('PAYMENT_CHARGE_FAILED', error, userId, { orderId })
>    logger.fatal('boot failed', err) // variadic — there is NO fatalStructured
>    ```
> 5. For the slow-path journey use `GET /orders/slow` → `METHOD_SLOW_EXECUTION` (decorator `@LogPerformance(ms)`); for oversized use `POST /pii-demo/huge` → `LOGGER_ENTRY_TRUNCATED`; for fault use a dead `LOKI_URL` → `LOGGER_DESTINATION_WRITE_FAILED` on stderr while the app keeps serving; for shutdown use `SIGTERM` → `LOGGER_SHUTDOWN_OK`.
>    Constraints:
>
> - English only; reconciled API only. Do NOT write `fatalStructured`, a `redactCensor` function, `@LogContext(store)`, `autoInjectTraceContext`, or `http.excludePaths` as strings.
> - Every `logKey` you invent for the demo domain must be `MODULE_ACTION_RESULT` (uppercase, ≥2 segments) and MUST NOT equal any of the 16 reserved keys.
> - Keep outputs realistic and post-redaction (no raw PII anywhere in the doc).
>   Verification:
> - `npx markdown-link-check docs/FEATURES.md` — expected: all links resolve.
> - `grep -c "fatalStructured" docs/FEATURES.md` — expected: `0`.
> - Manual: every journey in `OVERVIEW.md` §15 has a matching `##` section here.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P16-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P16-3 — `docs/ARCHITECTURE.md` + `docs/DATABASE.md` — Pipeline Deep-Dive + Schema

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (180–360 min)
- **Depends on:** `P16-1`

### Description

Write the two structural docs. `ARCHITECTURE.md` is the deep dive into the five-stage logging pipeline (`OVERVIEW.md` §11) and the module boundaries across `apps/api` / `apps/worker` / `apps/web`: how `PinoLoggerService` → composed mixin (ALS first, OTel last-wins) → `fast-redact` → size guard → `pino.multistream` fan-out works, and why singleton scope + `AsyncLocalStorage` (not `Scope.REQUEST`) is used. `DATABASE.md` documents the `ApplicationLog` schema (the dashboard-grade columns + BRIN/keyset/JSONB-GIN indexes referenced in `DASHBOARD.md` §13) and how to **query** the durable Postgres tier (post-redaction payloads, `trace_id` reconstruction, the two-tier `warn`+ Postgres vs `info`+ Loki model). Both reconcile to `0.1.0` (mixin/`REDACT_MAX_DEPTH` are **internal behaviors**, not importable; `TraceContextMixin` is not a public export).

### Acceptance Criteria

- [ ] `docs/ARCHITECTURE.md` exists: an ASCII pipeline diagram (the five stages from §11) + prose for each stage.
- [ ] Documents the design facts from §11: singleton scope (ALS, not `Scope.REQUEST`); one composed mixin (ALS merged first, OTel wins on conflict); no-op span skipped (`'0'.repeat(32)`), unsampled spans **kept**; `traceFlags` is W3C 2-hex lowercase; redaction compiled once, original object never mutated; destinations never crash the app; reverse-order shutdown drain.
- [ ] Explicitly labels `TraceContextMixin`, the composed mixin, and `REDACT_MAX_DEPTH` as **internal** (observable behaviors, not public exports).
- [ ] A module-boundary section: `apps/api` (the star), `apps/worker` (cross-service trace proof, `snake_case` field format), `apps/web` (pure client of the `logs/` API; imports only `/shared`).
- [ ] `docs/DATABASE.md` exists: the `ApplicationLog` Prisma model (post-redaction `payload`, indexed `traceId`) + a note that the dashboard-grade columns/indexes (BRIN on `time`, keyset `(time DESC, id DESC)`, GIN `jsonb_path_ops` on `payload`) live in `DASHBOARD.md` §13.
- [ ] `DATABASE.md` has a **querying** section with real SQL: reconstruct a request by `trace_id`, filter by `level`/`logKey`, time-range with the keyset pattern; plus a `prisma.applicationLog.findMany` equivalent.
- [ ] `DATABASE.md` explains the **two-tier** model (`warn`+ durable in Postgres via `LOG_DB_MIN_LEVEL`; `info`+ in Loki) and that **no raw PII** reaches Postgres (payload is already redacted).
- [ ] Both docs cross-link each other, `OVERVIEW.md` §11/§13, `DASHBOARD.md` §13, and `REDACTION.md`.

### Files to create / modify

- `docs/ARCHITECTURE.md` — pipeline + module boundaries.
- `docs/DATABASE.md` — `ApplicationLog` schema + querying.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / technical writer documenting a logging pipeline + its persistence tier.
> Context: Task P16-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 16. Source the pipeline from `docs/OVERVIEW.md` §11, the schema from §10 + `docs/DASHBOARD.md` §13, the two-tier model from §3/§10. Reconciled `0.1.0`: the mixin and `REDACT_MAX_DEPTH` are **internal** behaviors (not importable); `TraceContextMixin` is NOT a public export. The package types win on any conflict.
> Objective: Produce `docs/ARCHITECTURE.md` and `docs/DATABASE.md`.
> Steps:
>
> 1. **ARCHITECTURE.md** — H1, then reproduce/adapt the five-stage ASCII flow from §11:
>    ```
>    PinoLoggerService.info(logKey, msg, userId?, meta?)
>          ▼  composed mixin (per log, O(1))
>          ├─ LogContextService.getStore()  → { requestId, tenantId, userId }   (ALS — merged FIRST)
>          └─ trace.getActiveSpan()         → { traceId, spanId, traceFlags }   (OTel — merged LAST, wins)
>          ▼  fast-redact (compiled once)   → 97 default paths + app extensions
>          ▼  size guard (Buffer.byteLength vs maxEntrySizeBytes) → LOGGER_ENTRY_TRUNCATED
>          ▼  pino.multistream fan-out (each destination re-filters by its own minLevel)
>    ```
>    Then one subsection per stage. Bake in the §11 design facts (singleton scope, OTel-wins, no-op span skip, unsampled kept, immutable redaction, fail-soft destinations, reverse-order drain). Add a "what's internal vs public" callout naming `TraceContextMixin` / composed mixin / `REDACT_MAX_DEPTH` as internal.
> 2. Add a **module boundaries** section: `apps/api` owns the OTel SDK bootstrap (`instrumentation.ts` first) + `forRootAsync`; `apps/worker` is a second service with its own SDK and `otel.fieldFormat: 'snake_case'`; `apps/web` never touches Postgres/Loki directly — it reads the `logs/` API and imports only the `/shared` subpath.
> 3. **DATABASE.md** — H1, then the `ApplicationLog` model fenced as `prisma` (id/level/logKey/message/service/requestId/traceId/payload Json/createdAt + the four `@@index` lines). Note the dashboard-grade superset (time/status/durationMs/tenantId/spanId + BRIN/keyset/GIN) lives in `DASHBOARD.md` §13; do not duplicate it.
> 4. Add a **Querying the durable tier** section with real SQL:
>
>    ```sql
>    -- Reconstruct one request end-to-end from the database alone:
>    SELECT "createdAt", level, "logKey", message, payload
>    FROM "ApplicationLog"
>    WHERE "traceId" = '4bf92f3577b34da6a3ce929d0e0e4736'
>    ORDER BY "createdAt";
>
>    -- Keyset page of recent errors (matches the API's pagination):
>    SELECT id, "createdAt", "logKey", message
>    FROM "ApplicationLog"
>    WHERE level IN ('error','fatal') AND ("createdAt", id) < ($1, $2)
>    ORDER BY "createdAt" DESC, id DESC
>    LIMIT 50;
>    ```
>
>    Plus the Prisma equivalent (`prisma.applicationLog.findMany({ where: { traceId }, orderBy: { createdAt: 'asc' } })`).
>
> 5. Add a **Two-tier model** section: `warn`+ → Postgres (durable/audit, gated by `LOG_DB_MIN_LEVEL`, default `warn`); `info`+ → Loki (aggregation). Stress that `payload` is **already redacted** before it is written — no raw PII in Postgres — and cross-link `REDACTION.md`.
>    Constraints:
>
> - English only; reconciled `0.1.0` only. Do NOT present the mixin or `REDACT_MAX_DEPTH` as importable; do NOT import `TraceContextMixin`.
> - Keep the dashboard-grade schema in `DASHBOARD.md` (link to it) — `DATABASE.md` documents the simplified shape + querying, not a copy.
> - SQL must match the actual column names/casing of the Prisma model.
>   Verification:
> - `npx markdown-link-check docs/ARCHITECTURE.md docs/DATABASE.md` — expected: all links resolve.
> - `grep -E "TraceContextMixin|REDACT_MAX_DEPTH" docs/ARCHITECTURE.md` — expected: only in an "internal (not exported)" context, never in an `import` line.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P16-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P16-4 — `docs/ENVIRONMENT.md` + `docs/DESTINATIONS.md` — Env Reference + Custom Destination

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (180–360 min)
- **Depends on:** `P16-1`

### Description

Write the configuration + extensibility pair. `ENVIRONMENT.md` is the full env-var reference (every variable in `OVERVIEW.md` §9 / `DEVELOPMENT_PLAN.md` Appendix A), each row mapping a variable → which service reads it → which `BymaxLoggerModuleOptions` / OTel field it feeds → its Zod validation (`apps/api/src/config/env.schema.ts`). `DESTINATIONS.md` teaches how to **write and wire a custom `ILogDestination`** — the tiny contract (`name`, optional `minLevel`, `write`, `onInit`, `onShutdown`), the canonical `LokiDestination`, the gotchas (multistream level math, Loki ns-timestamp string, async `onInit`, shared-payload immutability, never log from `write()`), and how to register it in `logger.config.ts` `destinations[]`. Both reconcile to `0.1.0` (`redactCensor` string, `otel.shouldAutoInjectTraceContext`, `http.excludePaths: RegExp[]`).

### Acceptance Criteria

- [ ] `docs/ENVIRONMENT.md` exists: a table of **every** variable from `OVERVIEW.md` §9 (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `OTEL_SERVICE_NAME`, `RELEASE_SHA`, `OTLP_TRACE_ENDPOINT`, `LOG_EXTRA_REDACT_PATHS`, `LOKI_URL`, `LOKI_QUERY_URL`, `DATABASE_URL`, `LOG_DB_MIN_LEVEL`, `RETENTION_DAYS`, `OTEL_FIELD_FORMAT`, `SENTRY_DSN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GRAFANA_URL`) with columns: variable · service · example · used-for · maps-to-option.
- [ ] `ENVIRONMENT.md` documents the **OTel-aligned naming** decision (`OTEL_SERVICE_NAME`/`RELEASE_SHA`, not `SERVICE_NAME`/`GIT_SHA`) and the Zod-validation-at-boot behavior; shows a `.env.example` excerpt.
- [ ] `ENVIRONMENT.md` notes `LOG_EXTRA_REDACT_PATHS` is comma-split and **merged** into `redactPaths` (never replaces the 97 defaults).
- [ ] `docs/DESTINATIONS.md` exists: the `ILogDestination` interface fenced exactly (`name`, `minLevel?`, `write(payload: string): void | Promise<void>`, `onInit?`, `onShutdown?`).
- [ ] `DESTINATIONS.md` includes a full custom-destination walkthrough (the `LokiDestination` from §12) and a "wire it" snippet adding it to `destinations[]` in `logger.config.ts`.
- [ ] `DESTINATIONS.md` documents the gotchas from §12: the library sets the Pino `level` to the lowest of all `minLevel`s + `LOG_LEVEL` (else `debug`/`trace` destinations get nothing); Loki push path `/loki/api/v1/push` with **nanosecond timestamps as JSON strings**; `RollingFileDestination` needs async `onInit`; destinations share one payload string (never mutate); **never** log from inside `write()` (write failures go to `process.stderr` as `LOGGER_DESTINATION_WRITE_FAILED`).
- [ ] `DESTINATIONS.md` documents the built-ins table (`DefaultStdoutDestination`, `PrettyDevDestination`, `LokiDestination`, `PrismaLogDestination`, `RollingFileDestination`) with their `minLevel` + strategy.
- [ ] Both docs cross-link `OVERVIEW.md` §9/§12, `REDACTION.md`, and `DEPLOYMENT.md`.

### Files to create / modify

- `docs/ENVIRONMENT.md` — full env reference.
- `docs/DESTINATIONS.md` — write/wire a custom `ILogDestination`.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / technical writer.
> Context: Task P16-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 16. Source env vars from `docs/OVERVIEW.md` §9 + `DEVELOPMENT_PLAN.md` Appendix A; destinations from §12 + the `ILogDestination` contract. Reconciled `0.1.0` types are authoritative (`redactCensor: string`, `otel.shouldAutoInjectTraceContext`, `http.excludePaths: readonly RegExp[]`). House style: `nest-auth-example`'s `docs/ENVIRONMENT.md` (one table, one row per var, a "generating values"/"production refinements" tail).
> Objective: Produce `docs/ENVIRONMENT.md` and `docs/DESTINATIONS.md`.
> Steps:
>
> 1. **ENVIRONMENT.md** — H1, intro ("all config is env-driven, Zod-validated at boot in `apps/api/src/config/env.schema.ts`"), then the full table. Columns: `Variable | Service | Example | Used for | Maps to`. Fill every §9 row; the `Maps to` column names the `BymaxLoggerModuleOptions`/OTel target (e.g. `LOG_LEVEL → options.level`, `OTEL_FIELD_FORMAT → otel.fieldFormat`, `LOG_DB_MIN_LEVEL → PrismaLogDestination.minLevel`, `LOG_EXTRA_REDACT_PATHS → redactPaths (merged)`).
> 2. Add an **OTel-aligned naming** note (why `OTEL_SERVICE_NAME`/`RELEASE_SHA` feed both the logger `service` block and the OTel `Resource`) and a `.env.example` fenced excerpt covering the common dev values.
> 3. Add a **Validation** subsection: Zod aborts boot on a missing/invalid var; show one example failure message shape.
> 4. **DESTINATIONS.md** — H1, then the interface fenced exactly:
>    ```typescript
>    interface ILogDestination {
>      readonly name: string
>      readonly minLevel?: LogLevel // undefined = accept everything
>      write(payload: string): void | Promise<void> // already-serialized JSON, newline-terminated, UTF-8
>      onInit?(): void | Promise<void> // module init: open connections, start flush timers
>      onShutdown?(): void | Promise<void> // onApplicationShutdown: flush + close (reverse order)
>    }
>    ```
> 5. Walk the canonical `LokiDestination` (buffer + flush timer + ns-timestamp + fail-soft) — adapt the §12 implementation. Then a "wire it" snippet:
>    ```typescript
>    // apps/api/src/logger/logger.config.ts
>    destinations: [
>      new LokiDestination({
>        url: config.getOrThrow('LOKI_URL'),
>        batchSize: 50,
>        flushIntervalMs: 3_000,
>      }),
>      new PrismaLogDestination(prisma, { minLevel: config.get('LOG_DB_MIN_LEVEL') ?? 'warn' }),
>      ...(isProd
>        ? []
>        : [new RollingFileDestination({ file: 'logs/app.log', frequency: 'daily', size: '50m' })]),
>    ]
>    ```
> 6. Add a **Gotchas** section (verbatim intent from §12): multistream parent-level math; `/loki/api/v1/push` + `String(BigInt(Date.now()) * 1_000_000n)`; async `onInit` for `pino-roll`; shared payload immutability; never log from `write()` (stderr `LOGGER_DESTINATION_WRITE_FAILED`); worker-thread transports do not inherit ALS.
> 7. Add the **built-ins** table (name · minLevel · strategy · demonstrates) for the five destinations.
>    Constraints:
>
> - English only; reconciled `0.1.0` only. The `redactCensor` is a string; do NOT show a censor function. `http.excludePaths` is `RegExp[]`.
> - Do NOT duplicate the dashboard-grade DB schema here (that's `DATABASE.md`/`DASHBOARD.md`).
> - Keep env names exactly as standardized in §9 (OTel-aligned).
>   Verification:
> - `npx markdown-link-check docs/ENVIRONMENT.md docs/DESTINATIONS.md` — expected: all links resolve.
> - Manual: count the env table rows == the §9 table rows (16).
> - `grep -E "redactCensor *: *\(" docs/DESTINATIONS.md docs/ENVIRONMENT.md` — expected: no match (no censor function).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P16-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P16-5 — `docs/REDACTION.md` + `docs/OTEL.md` — 97 Paths + OTel/Grafana/Sentry

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (180–360 min)
- **Depends on:** `P16-1`

### Description

Write the two "crown-jewel" feature docs. `REDACTION.md` documents the **97 default redact paths** (the `23 common fields × 4 depths + 5 absolute header paths` breakdown from `OVERVIEW.md` §13), the depth-4 vs depth-5 boundary (`fast-redact`'s `*` is single-level — no recursive `**`), how to **safely extend** via `redactPaths` (merged, bracket syntax for hyphenated headers), the **string** `redactCensor`, the dangerous `shouldDisableDefaultRedact` opt-out (emits `LOGGER_BOOTSTRAP_WARNING`), the LGPD note (`cpf`/`cnpj`/`rg`/`email` redacted; bare `nome` not), and that `DEFAULT_REDACT_PATHS` is an **exported** constant the audit service uses. `OTEL.md` documents the SDK bootstrap (`instrumentation.ts` first — the hard rule), what the library does vs the consumer, cross-service propagation (W3C `traceparent`, auto + manual `propagation.inject`), the `camelCase`/`snake_case` field-format contrast, the Grafana derived-field setup, and the **optional** Sentry integration (`Sentry.pinoIntegration()` from `@sentry/node` ≥ 10.18 + `@sentry/opentelemetry` `SentryPropagator`).

### Acceptance Criteria

- [ ] `docs/REDACTION.md` exists: the `97 = 23×4 + 5` breakdown with the category table (passwords 5, tokens 6, MFA 3, payment 5, BR docs 3, conservative PII 1 = 23 common; + 5 absolute header paths).
- [ ] `REDACTION.md` documents the depth boundary: `*` matches a single level, no `**`, defaults reach depth 4, a secret at depth 5 is **not** redacted — with the nested example showing depth-4 `[REDACTED]` and depth-5 cleartext.
- [ ] `REDACTION.md` shows safe extension: `redactPaths: ['*.webhookSignature', 'payload.creditCard.*', 'req.headers["x-service-token"]']` (bracket syntax for hyphenated headers), **merged** with defaults; and `redactCensor: '[REDACTED]'` with an explicit note that the public type is `string` only (a function would not typecheck).
- [ ] `REDACTION.md` documents `shouldDisableDefaultRedact: true` → emits `LOGGER_BOOTSTRAP_WARNING`, used **only** in a dedicated test module, never in the running app.
- [ ] `REDACTION.md` includes the LGPD note (`cpf`/`cnpj`/`rg`/`email` redacted by default; a person's `nome` alone is not, and is logged in cleartext to make this explicit) and shows `DEFAULT_REDACT_PATHS` imported by `LogAuditService` to list the **effective** paths.
- [ ] `docs/OTEL.md` exists: the **hard rule** (`import './instrumentation'` is the literal first line of `main.ts`; SDK must `start()` before any NestJS code or `traceId` silently never appears).
- [ ] `OTEL.md` has the responsibility split table (consumer: `NodeSDK`/exporters/resource/`shutdown()`; library: detect `@opentelemetry/api`, read `getActiveSpan()`, inject `traceId`/`spanId`/`traceFlags`, `otel.fieldFormat`).
- [ ] `OTEL.md` documents cross-service propagation (auto W3C `traceparent` + the manual `propagation.inject(context.active(), headers)` path), the `apps/api` camelCase vs `apps/worker` snake_case contrast (and the "don't double-inject with `@opentelemetry/instrumentation-pino`" warning), and the Grafana **derived field** (Loki `traceId` → Tempo).
- [ ] `OTEL.md` documents the **optional** Sentry path: gated behind `SENTRY_DSN`; `Sentry.init({ enableLogs: true, integrations: [Sentry.pinoIntegration({ error: { levels: ['error','fatal'] } })] })` **before** `new NodeSDK(...)` + `new SentryPropagator()` as `textMapPropagator`; requires `@sentry/node` ≥ 10.18 + `@sentry/opentelemetry` (no separate `@sentry/pino` package; legacy `@sentry/opentelemetry-node` not used).
- [ ] Both docs cross-link `OVERVIEW.md` §13/§14, `FEATURES.md`, `ENVIRONMENT.md`, and `TROUBLESHOOTING.md`.

### Files to create / modify

- `docs/REDACTION.md` — the 97 paths + safe extension.
- `docs/OTEL.md` — SDK bootstrap, cross-service, Grafana, optional Sentry.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / technical writer with security + observability depth.
> Context: Task P16-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 16. Source redaction from `docs/OVERVIEW.md` §13 and OTel from §14; the env vars (`OTEL_FIELD_FORMAT`, `SENTRY_DSN`, `OTLP_TRACE_ENDPOINT`) from §9. Reconciled `0.1.0`: `DEFAULT_REDACT_PATHS` is an **exported** constant; `redactCensor` is `string` only; `otel.shouldAutoInjectTraceContext` (default true); `REDACT_MAX_DEPTH` and the mixin are **internal**. The package types win.
> Objective: Produce `docs/REDACTION.md` and `docs/OTEL.md`.
> Steps:
>
> 1. **REDACTION.md** — H1, then the count math (`23 common fields × 4 wildcard depths + 5 absolute header paths = 97`) and the category table (passwords/tokens/MFA/payment/BR-docs/email + the 5 headers `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-api-key"]`, `req.headers["x-auth-token"]`, `res.headers["set-cookie"]`).
> 2. **Depth boundary** subsection: explain `*` is single-level (no `**`), defaults stop at depth 4; show a nested payload where depth-4 is `[REDACTED]` and depth-5 leaks, and why (realistic nesting vs exhaustiveness).
> 3. **Extending safely** subsection — show the merge:
>    ```typescript
>    redactPaths: [
>      '*.webhookSignature',
>      'payload.creditCard.*',
>      'req.headers["x-service-token"]', // hyphenated header → MUST use bracket syntax
>    ],
>    redactCensor: '[REDACTED]', // public type is string ONLY; a censor function would not typecheck
>    ```
>    Note paths are merged with (never replace) the 97 defaults.
> 4. **Auditing** subsection — show `LogAuditService` importing the exported defaults:
>    ```typescript
>    import {
>      DEFAULT_REDACT_PATHS,
>      LOGGER_OPTIONS_TOKEN,
>      type BymaxLoggerModuleOptions,
>    } from '@bymax-one/nest-logger'
>    // effective = [...DEFAULT_REDACT_PATHS, ...(opts.redactPaths ?? [])]
>    ```
>    Plus the `shouldDisableDefaultRedact: true → LOGGER_BOOTSTRAP_WARNING` opt-out (test-module only) and the LGPD note (`nome` logged in cleartext on purpose).
> 5. **OTEL.md** — H1, then the **hard rule** blockquote (SDK starts before NestJS; `import './instrumentation'` first). Reproduce the `instrumentation.ts` + `main.ts` essentials from §9 (no `process.exit` in instrumentation; single ordered SIGTERM owner in `main.ts`).
> 6. Add the **responsibility split** table and the **cross-service** section (auto `traceparent`; the manual snippet):
>    ```typescript
>    import { propagation, context } from '@opentelemetry/api'
>    const headers: Record<string, string> = { 'content-type': 'application/json' }
>    propagation.inject(context.active(), headers) // adds traceparent + tracestate
>    ```
>    Then the `camelCase` (`apps/api`) vs `snake_case` (`apps/worker`, `otel.fieldFormat: 'snake_case'`, `traceIdField: 'trace_id'`) contrast + the "don't run `@opentelemetry/instrumentation-pino` too" warning, and the Grafana derived-field setup (Loki `traceId` → Tempo trace).
> 7. **Optional Sentry** section — gated behind `SENTRY_DSN`: `Sentry.init({ dsn, enableLogs: true, integrations: [Sentry.pinoIntegration({ error: { levels: ['error','fatal'] } })] })` before `new NodeSDK(...)`, `new SentryPropagator()` as `textMapPropagator`; requires `@sentry/node` ≥ 10.18 + `@sentry/opentelemetry`. State plainly: there is **no** `@sentry/pino` package; the legacy `@sentry/opentelemetry-node` is not used.
>    Constraints:
>
> - English only; reconciled `0.1.0` only. `redactCensor` is a string; `DEFAULT_REDACT_PATHS` is exported (referenced, satisfying the export audit); `otel.shouldAutoInjectTraceContext` (NOT `autoInjectTraceContext`); `REDACT_MAX_DEPTH`/mixin are internal.
> - Do NOT recommend gating correlation on `traceFlags` (unsampled spans must be kept).
> - No raw PII in any example.
>   Verification:
> - `npx markdown-link-check docs/REDACTION.md docs/OTEL.md` — expected: all links resolve.
> - `grep -E "autoInjectTraceContext|fatalStructured|@sentry/pino" docs/OTEL.md docs/REDACTION.md` — expected: `0` matches.
> - Manual: the redact-path category counts sum to 23 common (+5 headers = 97 with the ×4 depths).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P16-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P16-6 — `docs/DEPLOYMENT.md` + `docs/TROUBLESHOOTING.md` — Prod Checklist + "No traceId?"

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P16-1`

### Description

Write the operational pair. `DEPLOYMENT.md` is the production checklist from `OVERVIEW.md` §17: `NODE_ENV=production` (JSON-only), a meaningful `RELEASE_SHA`, point `OTLP_TRACE_ENDPOINT` / `LOKI_URL` at managed backends, keep `instrumentation-fs` off, the **single ordered shutdown owner** (`app.close()` → `otelSdk.shutdown()` → exit), tune `maxEntrySizeBytes` / `batchSize` / `flushIntervalMs`, the redaction posture, and the OTel version pins (`@opentelemetry/sdk-node ^0.218` on its own 0.x line; `@opentelemetry/api >=1.9.0 <1.10`; `auto-instrumentations-node ^0.76`). `TROUBLESHOOTING.md` is the symptom→cause→fix→see-also reference, led by the flagship **"no `traceId` in my logs?"** checklist, plus the 8 internal `LOGGER_ERROR_CODES` behaviors surfaced as observable diagnostics (Loki empty, destination write failures, oversized entries, double logs, etc.).

### Acceptance Criteria

- [ ] `docs/DEPLOYMENT.md` exists: the §17 production checklist as actionable bullets (env, shutdown ordering, instrumentation, tuning, redaction posture, version pins).
- [ ] `DEPLOYMENT.md` documents the **single ordered shutdown owner** precisely: on `SIGTERM` → `app.close()` (drains destinations via `onApplicationShutdown`) → **then** `otelSdk.shutdown()` (flush spans) → **then** exit; and warns against a competing `process.exit()` in `instrumentation.ts`.
- [ ] `DEPLOYMENT.md` documents the OTel version-pin rule (`sdk-node ^0.218` own 0.x line; the upper bound lives on `@opentelemetry/api >=1.9.0 <1.10`; `auto-instrumentations-node ^0.76` separate line) and the `Dockerfile` run command (`node --enable-source-maps dist/main.js`, or the `--import ./dist/instrumentation.mjs` variant).
- [ ] `docs/TROUBLESHOOTING.md` exists with the **"No `traceId` in my logs?"** checklist as the lead entry: SDK started before NestJS? `@opentelemetry/api` installed? active span at log time? not gating on `traceFlags`? `shouldAutoInjectTraceContext` not disabled?
- [ ] `TROUBLESHOOTING.md` covers each diagnostic tied to the 8 internal `LOGGER_ERROR_CODES` behaviors: `LOGGER_DESTINATION_INIT_FAILED`, `LOGGER_DESTINATION_WRITE_FAILED` (bad `LOKI_URL`), `LOGGER_ENTRY_TRUNCATED` (oversized), `LOGGER_BOOTSTRAP_WARNING` (defaults disabled), plus "Loki shows nothing" (push path/ns-timestamp), "logs duplicated" (filter+interceptor double-log or double trace-injection), "`Cannot find module '@bymax-one/nest-logger'`" (link not built), "`debug` lines missing" (parent level math).
- [ ] Each `TROUBLESHOOTING.md` entry follows **symptom → cause → fix → see-also** (the `nest-auth-example` format) and is greppable by error string.
- [ ] Both docs cross-link `OVERVIEW.md` §17/§14/§12, `OTEL.md`, `DESTINATIONS.md`, `ENVIRONMENT.md`, and `GETTING_STARTED.md`.

### Files to create / modify

- `docs/DEPLOYMENT.md` — production checklist.
- `docs/TROUBLESHOOTING.md` — symptom→fix reference.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / SRE-minded technical writer.
> Context: Task P16-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 16. Source the prod checklist from `docs/OVERVIEW.md` §17, the OTel rules from §14, the destination/error behaviors from §11/§12, and the `LOGGER_ERROR_CODES` (8, internal) awareness from §6 row 40. House style: `nest-auth-example`'s `docs/TROUBLESHOOTING.md` (greppable, symptom→cause→fix→see-also). Reconciled `0.1.0` only.
> Objective: Produce `docs/DEPLOYMENT.md` and `docs/TROUBLESHOOTING.md`.
> Steps:
>
> 1. **DEPLOYMENT.md** — H1, intro ("service + sidecar-backends topology; point exporters at managed backends"), then the checklist bullets from §17. Make the **shutdown** bullet explicit:
>    ```typescript
>    // main.ts — the ONE shutdown owner (no competing process.exit in instrumentation.ts)
>    process.once('SIGTERM', () => {
>      void app
>        .close()
>        .then(() => otelSdk.shutdown())
>        .finally(() => process.exit(0))
>    })
>    ```
> 2. Add a **Version pins** subsection (sdk-node `^0.218` own 0.x line; cap on `@opentelemetry/api >=1.9.0 <1.10`; `auto-instrumentations-node ^0.76`) and a **Container** subsection (`node --enable-source-maps dist/main.js`; the `--import ./dist/instrumentation.mjs` Node 20.6+ variant). Cross-link `docker-compose.prod.yml` (Phase 17) without duplicating it.
> 3. Add a **Redaction posture** bullet: keep `email`/`cpf` redacted unless there's a documented, reviewed reason (`shouldDisableDefaultRedact`), linking `REDACTION.md`.
> 4. **TROUBLESHOOTING.md** — H1, then a "search this page by the exact error string" note, then **"No `traceId` in my logs?"** as the first `###` entry, structured symptom→cause→fix→see-also; the fix walks the §14 checklist (SDK-before-Nest, `@opentelemetry/api` present, active span, don't gate on `traceFlags`, `shouldAutoInjectTraceContext` not off).
> 5. Add one `###` entry per remaining diagnostic, each tied to an observable reserved/error signal:
>    - `LOGGER_DESTINATION_WRITE_FAILED` — bad `LOKI_URL` → app keeps serving; fix the URL/headers.
>    - "Loki shows nothing" — wrong push path (`/loki/api/v1/push`) or numeric (not string) ns-timestamp.
>    - `LOGGER_ENTRY_TRUNCATED` — payload > `maxEntrySizeBytes`; raise the cap or trim the meta.
>    - "logs duplicated" — both `HttpExceptionFilter` + `HttpLoggingInterceptor` logging (the `__bymax_logger_handled` flag prevents it) OR double trace injection (`@opentelemetry/instrumentation-pino` + the mixin).
>    - "`debug`/`trace` lines never appear" — the Pino parent `level` must be the lowest of all destination `minLevel`s + `LOG_LEVEL`.
>    - `LOGGER_BOOTSTRAP_WARNING` — defaults disabled via `shouldDisableDefaultRedact` (should only ever be a test module).
>    - "`Cannot find module '@bymax-one/nest-logger'`" — the sibling `link:` target isn't built; `pnpm build` in `../nest-logger`.
>      Constraints:
>
> - English only; reconciled `0.1.0` only (NO `fatalStructured`; `shouldAutoInjectTraceContext`; `http.excludePaths: RegExp[]`).
> - Treat `LOGGER_ERROR_CODES` as **internal** — document the **observable behaviors/log keys**, never as importable symbols.
> - Every fix must be a real action (a command, an env change, a config line) — no hand-waving.
>   Verification:
> - `npx markdown-link-check docs/DEPLOYMENT.md docs/TROUBLESHOOTING.md` — expected: all links resolve.
> - `grep -c "No \`traceId\`" docs/TROUBLESHOOTING.md` — expected: ≥ 1 (the flagship entry exists).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P16-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P16-7 — Root `README.md` (Badges, Quick Start, Feature Checklist, ASCII Architecture) + `RELEASES.md`

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P16-1`, `P16-2`, `P16-3`, `P16-4`, `P16-5`, `P16-6`

### Description

Replace the Phase 0 README stub with the full root `README.md` in the **`nest-auth-example` house style** — a centered badge block (library/license/TypeScript-strict/Node-24/NestJS-11/Next-16/React-19/Prisma-6/Tailwind-4), a one-paragraph overview ("if the library is **what**, this repo is **how**"), a `git clone … && pnpm install && pnpm infra:up && pnpm dev` quick-start fence, a "what's inside" feature checklist (✅ bullets grouped: structured logging, redaction, destinations, OTel correlation, the dashboard), an **ASCII architecture** diagram (the two-service + observability-backends topology from `OVERVIEW.md` §3, trimmed for a README), the coverage-rule callout, and a docs index linking every `docs/*.md`. Also keep `docs/RELEASES.md` current (the library-version-per-branch table; `main` tracks `^0.1.0` via local link pre-publish). Reconciled `0.1.0` throughout.

### Acceptance Criteria

- [ ] Root `README.md` rewritten (no longer the Phase 0 scaffolding stub): centered badge block + title + one-line tagline.
- [ ] Badges cover (at least): library `@bymax-one/nest-logger`, license, TypeScript-strict, Node 24+, NestJS 11, Next.js 16, React 19, Prisma 6, Tailwind 4 — plus a nav line (`📦 Library · 🚀 Quick Start · ✅ Features · 🏗️ Architecture · 📖 Docs`).
- [ ] **Quick start** fenced block: `git clone …`, `cd nest-logger-example`, `pnpm install && pnpm infra:up && pnpm dev` — with a one-line note that the lib is consumed via local `link:` pre-publish (link to `GETTING_STARTED.md`).
- [ ] **Feature checklist** ("what's inside"): ✅ bullets grouped — structured `MODULE_ACTION_RESULT` logging; 97-path PII redaction; pluggable destinations (stdout/pretty/Loki/Prisma/rolling-file); OTel `traceId` correlation + cross-service `apps/worker`; the `apps/web` Log Explorer + Trigger Playground; 100% coverage + 100% Stryker.
- [ ] **ASCII architecture** block: the `apps/web` → `apps/api` (+`apps/worker`) → Collector/Loki/Tempo/Postgres → Grafana topology (trimmed from `OVERVIEW.md` §3), inside a fenced code block.
- [ ] **Coverage-rule** callout: every public export of `@bymax-one/nest-logger` (`.` + `/shared`) is referenced in `apps/`, CI-enforced by `scripts/audit-library-exports.mjs`; links the §6 matrix.
- [ ] **Documentation** section linking all sibling docs: `OVERVIEW`, `GETTING_STARTED`, `FEATURES`, `ARCHITECTURE`, `ENVIRONMENT`, `DESTINATIONS`, `REDACTION`, `OTEL`, `DATABASE`, `DEPLOYMENT`, `TROUBLESHOOTING`, `DASHBOARD`, `DEVELOPMENT_PLAN`, `RELEASES`.
- [ ] `docs/RELEASES.md` is current: the branch→library-version table (`main` → `^0.1.0`, local `link:` until first publish; `next` → `^1.0.0` when out) and a per-release/tested-version note matching `OVERVIEW.md` §18.
- [ ] README uses only the reconciled API in any inline snippet (no `fatalStructured`, etc.) and every internal link resolves.

### Files to create / modify

- `README.md` — full root README (replaces the Phase 0 stub).
- `docs/RELEASES.md` — keep the version-tracking table current.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / technical writer crafting an open-source reference-repo README.
> Context: Task P16-7 of `docs/DEVELOPMENT_PLAN.md` §Phase 16. The **house style is `nest-auth-example`'s root `README.md`** (centered shields.io badge block, emoji nav, `## ✨ Overview`, `## 🔥 What's inside` checklist, `## 🏗️ Architecture` ASCII, a coverage-rule blockquote, a docs index). Source the architecture from `docs/OVERVIEW.md` §3, the feature set from §6/§10, the version table from §18. Reconciled `0.1.0` only; the lib is pre-publish (local `link:`).
> Objective: Produce the full root `README.md` and refresh `docs/RELEASES.md`.
> Steps:
>
> 1. Centered header: a `<p align="center">` badge block. Include shields for the library, license, `TypeScript-strict`, `Node-24+`, `NestJS-11`, `Next.js-16`, `React-19`, `Prisma-6`, `Tailwind-4`, then a nav line:
>    ```html
>    <p align="center">
>      <a href="https://github.com/bymaxone/nest-logger">📦 Library</a> ·
>      <a href="#-quick-start">🚀 Quick Start</a> · <a href="#-whats-inside">✅ Features</a> ·
>      <a href="#-architecture">🏗️ Architecture</a> ·
>      <a href="docs/OVERVIEW.md">📖 Docs</a>
>    </p>
>    ```
> 2. `## ✨ Overview` — one paragraph ("the canonical reference implementation of `@bymax-one/nest-logger`… if the library is **what** to use, this repo is **how**"), then a quick-start fence:
>    ```bash
>    git clone https://github.com/bymaxone/nest-logger-example.git
>    cd nest-logger-example
>    pnpm install && pnpm infra:up && pnpm dev
>    ```
>    Add a one-line note: the library is consumed via a local `link:` until it publishes — see `docs/GETTING_STARTED.md`.
> 3. `## 🔥 What's inside` — grouped ✅ checklists (Structured logging · PII redaction · Destinations · OTel correlation · The dashboard · Quality bar). Keep claims accurate to the reconciled API and the demo domain (§10).
> 4. `## 🏗️ Architecture` — a trimmed ASCII block adapted from §3 (web → api(+worker) → Collector/Loki/Tempo/Postgres → Grafana, joined on `traceId`).
> 5. A coverage-rule blockquote (every export referenced in `apps/`, CI-enforced by `scripts/audit-library-exports.mjs`; link the §6 matrix), then `## 📖 Documentation` linking every sibling doc (relative `docs/FILE.md`).
> 6. **RELEASES.md** — ensure the table reads: `main` → `^0.1.0` (local `link:` until first publish, then the published range); `next` → `^1.0.0` (when out). Keep/append the "exact tested library version per commit" note from §18; do not fabricate version history.
>    Constraints:
>
> - English only; reconciled `0.1.0` only in any snippet.
> - Match the `nest-auth-example` README structure/tone; keep badges accurate to THIS repo's stack (Pino 10, OTel, Loki/Tempo/Grafana, Prisma 6 — not auth/Redis).
> - Do NOT overstate test numbers — reference "100% coverage + 100% Stryker" (the gates), not invented suite counts.
> - This replaces the P0-7 stub; keep the same links-into-`docs/` intent but expand fully.
>   Verification:
> - `npx markdown-link-check README.md docs/RELEASES.md` — expected: all links resolve.
> - `grep -E "fatalStructured|autoInjectTraceContext" README.md` — expected: `0` matches.
> - Manual: the Documentation section lists all 14 doc links above.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P16-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P16-8 — Verification Gate — `markdown-link-check` + §6 Coverage-Matrix ↔ Audit

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P16-1`, `P16-2`, `P16-3`, `P16-4`, `P16-5`, `P16-6`, `P16-7`

### Description

Phase 16 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove the documentation set is complete and accurate. Two checks: (1) **`markdown-link-check` passes** across every `docs/*.md` + the root `README.md` (no dead internal/external links); (2) the **§6 Feature Coverage Matrix** in `OVERVIEW.md` matches the **export-audit output** — i.e. every public export of `@bymax-one/nest-logger` (`.` + `/shared`) that the audit (`scripts/audit-library-exports.mjs`, Phase 18) reports as referenced is also represented in the matrix, and the matrix lists no export the audit doesn't know about. Closes the phase. Author-only verification — if a check fails, fix the offending doc (P16-1..P16-7), never lower the bar.

### Acceptance Criteria

- [ ] `markdown-link-check` runs clean over `docs/*.md` + `README.md` (every link resolves; intentional placeholders, if any, are config-ignored with a documented reason).
- [ ] A repo-local link-check config exists (`.markdown-link-check.json` or equivalent) ignoring only justified patterns (e.g. `localhost` runtime URLs), so CI (Phase 17) can reuse it.
- [ ] The **§6 coverage matrix** in `OVERVIEW.md` is reconciled against the export surface: every symbol in `node_modules/@bymax-one/nest-logger/dist/{server,shared}/index.d.ts` is either a matrix row or explicitly internal (mixin/`REDACT_MAX_DEPTH`/`LOGGER_ERROR_CODES`).
- [ ] If `scripts/audit-library-exports.mjs` exists at run time, its output (referenced/unused exports) agrees with the matrix; any divergence is fixed in the docs, not by editing the audit's ignore list to hide a real gap.
- [ ] The 30 public exports are accounted for: server (`BymaxLoggerModule`, `BymaxLoggerModuleAsyncOptions`, `BymaxLoggerModuleOptions`, `BymaxLoggerModuleOptionsFactory`, `DEFAULT_REDACT_PATHS`, `DefaultStdoutDestination`, `HttpExceptionFilter`, `HttpLoggingInterceptor`, `HttpOptions`, `ILogDestination`, `InjectLogger`, `LOGGER_DESTINATIONS_TOKEN`, `LOGGER_OPTIONS_TOKEN`, `LOGGER_PINO_INSTANCE_TOKEN`, `LOG_CONTEXT_METADATA_KEY`, `LOG_CONTEXT_TOKEN`, `LOG_KEYS_CONVENTION_REGEX`, `LogContext`, `LogContextService`, `LogEntry`, `LogLevel`, `LogPerformance`, `OtelOptions`, `PinoLoggerService`, `PrettyDevDestination`, `RESERVED_LOG_KEYS`, `RequestIdMiddleware`, `ServiceMetadata`, `applyRequestIdMiddleware`) + shared (the `/shared` re-exports) — none missing, none invented.
- [ ] No doc references a non-existent export (`fatalStructured`, a `redactCensor` function, `@LogContext(store)`, `autoInjectTraceContext`, `http.excludePaths` as `string[]`).

### Files to create / modify

- `.markdown-link-check.json` — link-check config (ignore patterns + reasons), if not already present.
- _(verification only otherwise — fix earlier P16 docs if a check fails; do not weaken a check)_

### Agent Execution Prompt

> Role: Senior TypeScript engineer / docs-CI gatekeeper.
> Context: Task P16-8 of `docs/DEVELOPMENT_PLAN.md` §Phase 16. DoD: `markdown-link-check` passes and the `OVERVIEW.md` §6 coverage matrix matches the export-audit output (`scripts/audit-library-exports.mjs`, Phase 18, parses `node_modules/@bymax-one/nest-logger/dist/{server,shared}/index.d.ts`). The reconciled `0.1.0` export surface is authoritative; internal symbols (`TraceContextMixin`/composed mixin, `REDACT_MAX_DEPTH`, `LOGGER_ERROR_CODES`) are NOT public and must not appear as matrix rows.
> Objective: Verify the docs set and close Phase 16.
> Steps:
>
> 1. Add/confirm a link-check config and run it over the whole docs set:
>    ```bash
>    npx markdown-link-check --config .markdown-link-check.json docs/*.md README.md
>    ```
>    Resolve every failure by fixing the link (or the target doc), not by broadening the ignore list. Only `localhost`/runtime URLs may be config-ignored, with a comment explaining why.
> 2. Recompute the public export surface and diff it against the §6 matrix:
>    ```bash
>    grep -oE "^export \{[^}]*\}" node_modules/@bymax-one/nest-logger/dist/server/index.d.ts
>    grep -oE "^export \{[^}]*\}" node_modules/@bymax-one/nest-logger/dist/shared/index.d.ts
>    ```
>    Confirm every exported symbol is either a matrix row in `OVERVIEW.md` §6 or documented as internal. Fix the matrix in `OVERVIEW.md` if (and only if) a real export is missing/extra — keep edits minimal and within §6.
> 3. If `scripts/audit-library-exports.mjs` is present, run `pnpm audit:exports` and confirm it agrees with the matrix; reconcile any divergence in the docs.
> 4. Grep the whole docs set for forbidden non-existent API and fix any hit in the owning P16 doc:
>    ```bash
>    grep -rnE "fatalStructured|autoInjectTraceContext|@LogContext\(store\)|redactCensor *: *\(" docs/ README.md
>    ```
>    Expected: no matches.
>    Constraints:
>
> - English only; reconciled `0.1.0` only. Do NOT add a matrix row for an internal symbol; do NOT hide a real coverage gap by editing the audit ignore list.
> - Do NOT modify the library, the audit script's logic, or any non-docs source to make a check pass — fix the docs.
> - Keep `OVERVIEW.md` edits surgical (only §6 rows that are actually wrong).
>   Verification:
> - `npx markdown-link-check --config .markdown-link-check.json docs/*.md README.md` — expected: 0 dead links.
> - `grep -rnE "fatalStructured|autoInjectTraceContext|@LogContext\(store\)" docs/ README.md` — expected: exit 1 (no matches).
> - `pnpm audit:exports` (if present) — expected: exit 0; matrix and audit agree.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P16-8 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 16 is 8/8 — switch the Phase 16 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
