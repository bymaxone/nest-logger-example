# Phase 5 — Prisma & Persistence — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-5--prisma--persistence) §Phase 5
> **Total tasks:** 6
> **Status:** ✅ Done
> **Progress:** 🟢 6 / 6 done (100%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                                             | Status | Priority | Size | Depends on             |
| ---- | ------------------------------------------------------------------------------------------------ | ------ | -------- | ---- | ---------------------- |
| P5-1 | Install Prisma 7 + `schema.prisma` datasource/generator (PostgreSQL 18)                          | 🟢     | High     | S    | —                      |
| P5-2 | `ApplicationLog` model — dashboard-grade columns (DASHBOARD §13)                                 | 🟢     | High     | S    | P5-1                   |
| P5-3 | Indexes via native Prisma extended-index syntax (BRIN / keyset / GIN)                            | 🟢     | High     | M    | P5-2                   |
| P5-4 | Domain + governance models (`Order`/`Payment` + `SavedView`/`AlertRule`/`Incident`/`AuditEvent`) | 🟢     | High     | M    | P5-1                   |
| P5-5 | `PrismaService` (Nest module, `onModuleInit` connect, shutdown hooks)                            | 🟢     | High     | S    | P5-1                   |
| P5-6 | `prisma/seed.ts` + migrate/seed/index verification                                               | 🟢     | High     | M    | P5-2, P5-3, P5-4, P5-5 |

---

## P5-1 — Install Prisma 7 + `schema.prisma` datasource/generator (PostgreSQL 18)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `—`

### Description

Add Prisma 6 to `apps/api` and create the `prisma/schema.prisma` shell: the `generator client` and the `datasource db` (PostgreSQL provider, `url = env("DATABASE_URL")`). This is the foundation for every later Phase 5 task. The datastore is the `postgres:18-alpine` container from Phase 1 and the `logger_example` database created by `docker/postgres/init.sql`; `DATABASE_URL` is already in the env registry (`postgresql://postgres:postgres@localhost:5432/logger_example`, [`OVERVIEW.md` §9](../OVERVIEW.md)). No models are added here — they land in P5-2/P5-4.

### Acceptance Criteria

- [x] `apps/api/package.json` declares `prisma@^7` (dev) and `@prisma/client@^7` (runtime).
- [x] `apps/api/prisma/schema.prisma` exists with a `generator client { provider = "prisma-client-js" }` block.
- [x] `datasource db` block: `provider = "postgresql"` only — URL moved to `prisma.config.ts` (Prisma 7).
- [x] A `db:*` script surface exists in `apps/api/package.json` (`db:generate`, `db:migrate`, `db:seed`, `db:studio`) delegating to the local `prisma` binary.
- [x] `DATABASE_URL` is validated in `apps/api/src/config/env.schema.ts` (Zod, URL string) — wired in Phase 3.
- [x] `pnpm --filter api exec prisma validate` exits 0.

### Files to create / modify

- `apps/api/prisma/schema.prisma` — datasource + generator shell.
- `apps/api/package.json` — add Prisma deps + `db:*` scripts.
- `apps/api/.env` / root `.env.example` — confirm `DATABASE_URL` present (do not duplicate; from Phase 1).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer wiring Prisma into a NestJS 11 service.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-5--prisma--persistence) §Phase 5 + §2 Global Conventions, and [`../DASHBOARD.md`](../DASHBOARD.md) §13 — the authoritative data-model spec). This is task P5-1. Postgres 18 + the `logger_example` DB already exist from Phase 1; `DATABASE_URL` is in the env registry ([`../OVERVIEW.md`](../OVERVIEW.md) §9). Prisma 6 is the targeted major (extended indexes are GA, no preview flag).
> Objective: Install Prisma 6 in `apps/api` and create the `prisma/schema.prisma` datasource + generator shell. No models yet.
> Steps:
>
> 1. Install Prisma in the `apps/api` workspace:
>    ```bash
>    pnpm --filter api add -D prisma@^6
>    pnpm --filter api add @prisma/client@^6
>    ```
> 2. Create `apps/api/prisma/schema.prisma`:
>
>    ```prisma
>    generator client {
>      provider = "prisma-client-js"
>    }
>
>    datasource db {
>      provider = "postgresql"
>      url      = env("DATABASE_URL")
>    }
>    ```
>
> 3. Add `db:*` scripts to `apps/api/package.json` (the `prisma` binary reads `prisma/schema.prisma` by default):
>    ```jsonc
>    {
>      "scripts": {
>        "db:generate": "prisma generate",
>        "db:migrate": "prisma migrate dev",
>        "db:seed": "prisma db seed",
>        "db:studio": "prisma studio",
>      },
>    }
>    ```
> 4. Confirm `DATABASE_URL` is present in the root `.env.example` (from Phase 1) and validated in `apps/api/src/config/env.schema.ts` (Phase 3). Do NOT redefine it; if the Zod entry is missing, add `DATABASE_URL: z.string().url()`.
> 5. Run `pnpm --filter api exec prisma validate` to confirm the schema parses.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) §2 Global Conventions (pnpm 10.8.0, ESM, Node >=24).
> - Pin the **Prisma 6** major — do NOT use `latest`; extended indexes (P5-3) are GA in 6.x without a `previewFeatures` flag.
> - Do NOT add the `prisma.seed` config block here (it lands in P5-6) and do NOT create any `model` (P5-2/P5-4 own them).
> - Do NOT point at a new database — reuse `logger_example` from Phase 1.
>   Verification:
> - `pnpm --filter api exec prisma validate` — expected: `The schema at prisma/schema.prisma is valid 🚀`.
> - `pnpm --filter api exec prisma -v` — expected: reports a `6.x` version.
> - `node -e "require('fs').accessSync('apps/api/prisma/schema.prisma')"` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P5-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P5-2 — `ApplicationLog` model — dashboard-grade columns (DASHBOARD §13)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P5-1`

### Description

Add the `ApplicationLog` model — the durable Postgres log tier written by `PrismaLogDestination` (`warn`+, `LOG_DB_MIN_LEVEL` default `warn`). Use the **dashboard-grade** column set from [`../DASHBOARD.md`](../DASHBOARD.md) §13 (the authoritative shape), **not** the simplified shape in `OVERVIEW.md` §10. The extra columns (`time`, `tenantId`, `spanId`, `status`, `durationMs`) are what power the dashboard's RED metrics, status-class charts, latency percentiles, and per-tenant scoping. `payload Json` stores the **already-REDACTED** entry — no raw PII ever reaches Postgres (redaction happens in-process before the line leaves the service). Indexes are added separately in P5-3 to keep this task focused on columns.

### Acceptance Criteria

- [x] `model ApplicationLog` exists in `apps/api/prisma/schema.prisma`.
- [x] Columns: `id String @id @default(cuid())`, `time DateTime`, `level String`, `logKey String`, `message String`, `service String`.
- [x] Optional columns: `tenantId String?`, `requestId String?`, `traceId String?`, `spanId String?`, `status Int?`, `durationMs Int?`.
- [x] `payload Json` — documented (comment) as the **full, already-REDACTED** log entry.
- [x] `time` is the event time **from the log entry** (not a DB-default `createdAt`); no `@default(now())` on `time`.
- [x] `pnpm --filter api exec prisma validate` exits 0.

### Files to create / modify

- `apps/api/prisma/schema.prisma` — add the `ApplicationLog` model.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer modeling a high-volume log table in Prisma 6.
> Context: Task P5-2 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-5--prisma--persistence) §Phase 5. The **authoritative** schema is [`../DASHBOARD.md`](../DASHBOARD.md) §13 — use the dashboard-grade column set, NOT the simplified `OVERVIEW.md` §10 shape. This table is the warm/durable `warn`+ tier (`LOG_DB_MIN_LEVEL` default `warn`); Loki holds the full `info`+ aggregation. `payload` is post-redaction.
> Objective: Add the `ApplicationLog` model with the dashboard-grade columns (indexes come in P5-3).
> Steps:
>
> 1. In `apps/api/prisma/schema.prisma`, append:
>
>    ```prisma
>    model ApplicationLog {
>      id         String   @id @default(cuid())
>      time       DateTime // event time (from the log entry, NOT a DB default)
>      level      String // 'warn' | 'error' | 'fatal' (this tier is warn+)
>      logKey     String
>      message    String
>      service    String
>      tenantId   String?
>      requestId  String?
>      traceId    String?
>      spanId     String?
>      status     Int? // HTTP status when present (status-class charts)
>      durationMs Int? // when present (latency charts)
>      payload    Json // full, already-REDACTED entry
>
>      // Indexes are added in P5-3 (BRIN / keyset / GIN + B-tree).
>    }
>    ```
>
> 2. Keep the `time` column WITHOUT `@default(now())` — it is the entry's own event time, set by `PrismaLogDestination`.
> 3. Run `pnpm --filter api exec prisma validate`.
>    Constraints:
>
> - Use the DASHBOARD §13 column set verbatim — do NOT fall back to the simplified `OVERVIEW.md` §10 model (which lacks `time`/`tenantId`/`spanId`/`status`/`durationMs`).
> - Do NOT add indexes here (P5-3 owns `@@index` declarations) and do NOT add a `createdAt` — `time` is the canonical timestamp.
> - Do NOT generate a migration yet (P5-6 runs the first `prisma migrate dev` over the complete schema).
> - `payload` MUST be documented as already-redacted; never store raw PII.
>   Verification:
> - `pnpm --filter api exec prisma validate` — expected: schema valid.
> - `pnpm --filter api exec prisma format` then re-read the file — expected: `ApplicationLog` has `id time level logKey message service tenantId? requestId? traceId? spanId? status? durationMs? payload` and no `@@index` lines yet.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P5-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P5-3 — Indexes via native Prisma extended-index syntax (BRIN / keyset / GIN)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P5-2`

### Description

Add the `ApplicationLog` indexes that make log querying fast at volume, expressed with **native Prisma extended-index syntax** ([`../DASHBOARD.md`](../DASHBOARD.md) §13). These are **GA on PostgreSQL in Prisma 6/7** — no `previewFeatures` flag, no raw-SQL migration. The set: a **BRIN** index on `time` with `timestamp_minmax_ops` (tiny, append-only time series), a **composite keyset** index `(time DESC, id DESC)` for newest-first cursor pagination, a **GIN** `jsonb_path_ops` index on `payload` for arbitrary-metadata containment, plus B-tree indexes on `level`, `logKey`, `traceId`, and the composite `(tenantId, time)` for per-tenant scoping. **Do NOT** claim BRIN/GIN need raw SQL — they are native. Raw SQL is reserved **only** for what Prisma still can't model: BRIN `pages_per_range` tuning or partial indexes (see the §13 audit note).

### Acceptance Criteria

- [x] BRIN: `@@index([time(ops: raw("timestamp_minmax_ops"))], type: Brin)`.
- [x] Keyset composite: `@@index([time(sort: Desc), id(sort: Desc)])`.
- [x] GIN: `@@index([payload(ops: JsonbPathOps)], type: Gin)`.
- [x] B-tree singles: `@@index([level])`, `@@index([logKey])`, `@@index([traceId])`.
- [x] Per-tenant composite: `@@index([tenantId, time])`.
- [x] No raw-SQL migration is introduced for BRIN/GIN (native syntax only); any raw SQL — if used at all — is limited to `pages_per_range` tuning or partial indexes and is clearly commented as such.
- [x] `pnpm --filter api exec prisma validate` exits 0.

### Files to create / modify

- `apps/api/prisma/schema.prisma` — add the seven `@@index` declarations to `ApplicationLog`.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer + Postgres index specialist.
> Context: Task P5-3 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-5--prisma--persistence) §Phase 5. The **authoritative** index spec is [`../DASHBOARD.md`](../DASHBOARD.md) §13. The §13 **audit fix** is load-bearing: _"earlier drafts claimed BRIN/GIN can't be expressed in Prisma — that's outdated. The native declarations are correct for Prisma 6/7 (extended indexes are GA on PostgreSQL). Reserve raw SQL only for things Prisma still can't model (BRIN `pages_per_range` tuning or partial indexes)."_ Do NOT regress to raw SQL for BRIN/GIN.
> Objective: Add the native extended-index set to `ApplicationLog`.
> Steps:
>
> 1. In `apps/api/prisma/schema.prisma`, add these index lines inside `model ApplicationLog { … }` (after the scalar fields):
>    ```prisma
>      // Prisma expresses ALL of these natively (access method via `type:` +
>      // per-field ops) — GA on PostgreSQL since Prisma 4, no preview flag in 6.x/7.x.
>      @@index([time(ops: raw("timestamp_minmax_ops"))], type: Brin) // tiny, append-only time series
>      @@index([time(sort: Desc), id(sort: Desc)]) // keyset pagination (newest-first)
>      @@index([payload(ops: JsonbPathOps)], type: Gin) // arbitrary-metadata containment
>      @@index([level])
>      @@index([logKey])
>      @@index([traceId])
>      @@index([tenantId, time])
>    ```
> 2. Run `pnpm --filter api exec prisma validate` and `pnpm --filter api exec prisma format`.
> 3. If — and ONLY if — `pages_per_range` tuning or a partial index is later required, add it as a hand-written step in the migration SQL (P5-6) with a comment explaining why Prisma can't model it. Do NOT pre-emptively add raw SQL now.
>    Constraints:
>
> - Native Prisma syntax ONLY for BRIN, keyset, and GIN — these compile to real Postgres `USING brin`/`USING gin (... jsonb_path_ops)` access methods. Do NOT write a raw-SQL migration to create them.
> - `JsonbPathOps` (not `JsonbOps`) — containment queries (`@>`) are the dashboard's access pattern; `jsonb_path_ops` is smaller/faster for that.
> - Keyset index field order MUST be `(time DESC, id DESC)` to match the `ORDER BY time DESC, id DESC` keyset query in §13.
> - Do NOT run `migrate dev` here (P5-6 owns the migration); validation + format only.
>   Verification:
> - `pnpm --filter api exec prisma validate` — expected: schema valid.
> - `grep -c "@@index" apps/api/prisma/schema.prisma` — expected: `>= 7` (the seven `ApplicationLog` indexes; more once P5-4 domain indexes land).
> - `grep "type: Brin" apps/api/prisma/schema.prisma` and `grep "type: Gin" apps/api/prisma/schema.prisma` — expected: both match (proves native, not raw-SQL).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P5-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P5-4 — Domain + governance models (`Order`/`Payment` + `SavedView`/`AlertRule`/`Incident`/`AuditEvent`)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P5-1`

### Description

Add the demo-domain tables (`Order`, `Payment`) that produce realistic logs (Phase 6) and the governance tables that back the dashboard's ops surfaces (Phase 10/13): `SavedView` (Explorer queries promotable to monitors), `AlertRule` (`expr + threshold + for` over the `/logs` query layer), `Incident` (PagerDuty-style Triggered → Acknowledged → Snoozed → Resolved lifecycle with an immutable timeline), and `AuditEvent` (the `audit_events` action log — `{ actor, action, target, tenantId, at }`). Field shapes follow [`../OVERVIEW.md`](../OVERVIEW.md) §10 (domain) and [`../DASHBOARD.md`](../DASHBOARD.md) §9–§10/§12 (governance). These are scoped demos of production concepts — small, real models, not fakes.

### Acceptance Criteria

- [x] `Order`: `id @id @default(cuid())`, `tenantId String`, `amount Int` (cents), `status String @default("pending")`, `createdAt DateTime @default(now())`, `@@index([tenantId])`.
- [x] `Payment`: `id @id @default(cuid())`, `orderId String`, `amount Int`, `status String`, `createdAt DateTime @default(now())`.
- [x] `SavedView`: id, `name`, `tenantId String?`, `query Json` (the compiled `LogQuery`), `createdBy String`, `createdAt @default(now())`.
- [x] `AlertRule`: id, `name`, `expr String`, `threshold Int`, `forDuration String` (e.g. `5m`), `severity String`, `isEnabled Boolean @default(true)`, `channels String[]`, `createdAt`.
- [x] `Incident`: id, `ruleId String`, `status String` (`triggered|acknowledged|snoozed|resolved`), `logKey String?`, `openedAt DateTime`, `resolvedAt DateTime?`, `timeline Json` (immutable actor+timestamp transitions); `@@index([ruleId])`, `@@index([status])`.
- [x] `AuditEvent`: id, `actor String`, `action String`, `target String`, `tenantId String?`, `at DateTime @default(now())`; `@@index([at])`.
- [x] `pnpm --filter api exec prisma validate` exits 0.

### Files to create / modify

- `apps/api/prisma/schema.prisma` — add the six models.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer modeling a demo domain + a governance/ops layer.
> Context: Task P5-4 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-5--prisma--persistence) §Phase 5. Domain shapes: [`../OVERVIEW.md`](../OVERVIEW.md) §10. Governance shapes: [`../DASHBOARD.md`](../DASHBOARD.md) §9 (Alerts/Incidents — `expr + threshold + for`, the Triggered→Acknowledged→Snoozed→Resolved lifecycle with an immutable timeline), §10 (the `audit_events` action log `{ actor, action, target, tenantId, at }`, query-based RBAC, retention), and §12 (saved views / alerts / incidents endpoints). All boolean fields use the §2 `is`/`has`/`should`/`can` prefix (hence `isEnabled`).
> Objective: Add `Order`, `Payment`, `SavedView`, `AlertRule`, `Incident`, `AuditEvent`.
> Steps:
>
> 1. Append to `apps/api/prisma/schema.prisma`:
>
>    ```prisma
>    model Order {
>      id        String   @id @default(cuid())
>      tenantId  String
>      amount    Int // cents
>      status    String   @default("pending")
>      createdAt DateTime @default(now())
>
>      @@index([tenantId])
>    }
>
>    model Payment {
>      id        String   @id @default(cuid())
>      orderId   String
>      amount    Int
>      status    String
>      createdAt DateTime @default(now())
>
>      @@index([orderId])
>    }
>
>    model SavedView {
>      id        String   @id @default(cuid())
>      name      String
>      tenantId  String?
>      query     Json // the compiled LogQuery (SQL+LogQL filter object)
>      createdBy String
>      createdAt DateTime @default(now())
>
>      @@index([tenantId])
>    }
>
>    model AlertRule {
>      id          String   @id @default(cuid())
>      name        String
>      expr        String // e.g. count(level in {error,fatal}) by logKey
>      threshold   Int
>      forDuration String // e.g. '5m'
>      severity    String // 'critical' | 'warning'
>      isEnabled   Boolean  @default(true)
>      channels    String[] // notification channel ids
>      createdAt   DateTime @default(now())
>      incidents   Incident[]
>    }
>
>    model Incident {
>      id         String    @id @default(cuid())
>      ruleId     String
>      rule       AlertRule @relation(fields: [ruleId], references: [id])
>      status     String // 'triggered' | 'acknowledged' | 'snoozed' | 'resolved'
>      logKey     String?
>      openedAt   DateTime  @default(now())
>      resolvedAt DateTime?
>      timeline   Json // immutable list of { actor, action, at } transitions
>
>      @@index([ruleId])
>      @@index([status])
>    }
>
>    model AuditEvent {
>      id       String   @id @default(cuid())
>      actor    String
>      action   String // exported | rule.created | role.switched | retention.changed | …
>      target   String
>      tenantId String?
>      at       DateTime @default(now())
>
>      @@index([at])
>    }
>    ```
>
> 2. Run `pnpm --filter api exec prisma validate` and `pnpm --filter api exec prisma format`.
>    Constraints:
>
> - Money is `Int` cents (matches `OVERVIEW.md` §10) — do NOT use `Float`/`Decimal`.
> - `Incident.timeline` and `SavedView.query` are `Json` (the timeline is append-only/immutable in app logic; the model just stores it).
> - Booleans use the §2 prefix convention (`isEnabled`, not `enabled`).
> - The `AlertRule`↔`Incident` relation is the only FK pair here; the `Order`/`Payment` link is intentionally loose (`orderId` string, no FK) so the demo can create payments for arbitrary orders.
> - Do NOT run `migrate dev` here (P5-6 owns it); validate + format only.
>   Verification:
> - `pnpm --filter api exec prisma validate` — expected: schema valid.
> - `grep -E "^model (Order|Payment|SavedView|AlertRule|Incident|AuditEvent)" apps/api/prisma/schema.prisma | wc -l` — expected: `6`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P5-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P5-5 — `PrismaService` (Nest module, `onModuleInit` connect, shutdown hooks)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P5-1`

### Description

Create the injectable `PrismaService` (extends the generated `PrismaClient`, `implements OnModuleInit`) and its `PrismaModule`. It connects in `onModuleInit` and relies on NestJS lifecycle shutdown — `app.enableShutdownHooks()` is already called in `main.ts` ([`../OVERVIEW.md`](../OVERVIEW.md) §10), so `$disconnect` runs cleanly on `app.close()`. `PrismaService` is the dependency that `BymaxLoggerModule.forRootAsync` injects (`inject: [ConfigService, PrismaService]`) so `buildLoggerOptions(config, prisma)` can hand the client to `PrismaLogDestination` (Phase 7). Export `PrismaService` from a global-ish module so any feature module (orders, payments, logs, governance) can inject it.

### Acceptance Criteria

- [x] `apps/api/src/prisma/prisma.service.ts` — `PrismaService extends PrismaClient implements OnModuleInit`, `async onModuleInit() { await this.$connect() }`.
- [x] `apps/api/src/prisma/prisma.module.ts` — provides + exports `PrismaService` (`@Global()` or imported where needed).
- [x] No `enableShutdownHooks` call inside the service — termination is owned by `main.ts` (`app.close()` → `$disconnect` via Nest lifecycle); the service does NOT register a competing `process.on` handler.
- [x] `PrismaModule` is imported in `app.module.ts` so `BymaxLoggerModule.forRootAsync({ inject: [ConfigService, PrismaService] })` resolves.
- [x] `pnpm --filter api typecheck` exits 0.

### Files to create / modify

- `apps/api/src/prisma/prisma.service.ts` — the service.
- `apps/api/src/prisma/prisma.module.ts` — the module.
- `apps/api/src/app.module.ts` — import `PrismaModule` (confirm the existing `inject: [ConfigService, PrismaService]` resolves).

### Agent Execution Prompt

> Role: Senior NestJS engineer wiring Prisma's client into the DI container.
> Context: Task P5-5 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-5--prisma--persistence) §Phase 5. `main.ts` already calls `app.enableShutdownHooks()` and owns the single ordered SIGTERM → `app.close()` → `otelSdk.shutdown()` sequence ([`../OVERVIEW.md`](../OVERVIEW.md) §10). `app.module.ts` already declares `BymaxLoggerModule.forRootAsync({ inject: [ConfigService, PrismaService], useFactory: (config, prisma) => buildLoggerOptions(config, prisma) })` ([`../OVERVIEW.md`](../OVERVIEW.md) §10) — this task provides the `PrismaService` that injection needs.
> Objective: Create `PrismaService` + `PrismaModule` and wire them into `app.module.ts`.
> Steps:
>
> 1. Create `apps/api/src/prisma/prisma.service.ts`:
>
>    ```typescript
>    import { Injectable, type OnModuleInit } from '@nestjs/common'
>    import { PrismaClient } from '@prisma/client'
>
>    @Injectable()
>    export class PrismaService extends PrismaClient implements OnModuleInit {
>      async onModuleInit(): Promise<void> {
>        await this.$connect()
>      }
>    }
>    ```
>
> 2. Create `apps/api/src/prisma/prisma.module.ts`:
>
>    ```typescript
>    import { Global, Module } from '@nestjs/common'
>    import { PrismaService } from './prisma.service'
>
>    @Global()
>    @Module({
>      providers: [PrismaService],
>      exports: [PrismaService],
>    })
>    export class PrismaModule {}
>    ```
>
> 3. In `apps/api/src/app.module.ts`, add `PrismaModule` to `imports` (it must resolve before `BymaxLoggerModule.forRootAsync` evaluates its factory). Because `BymaxLoggerModule` injects `PrismaService`, and `@Global()` makes the provider visible, this resolves without re-importing per module.
> 4. Run `pnpm --filter api typecheck`.
>    Constraints:
>
> - Do NOT call `enableShutdownHooks()` inside the service, and do NOT add a `process.on('beforeExit'|'SIGTERM', …)` here — `main.ts` is the single shutdown owner; Nest's `onApplicationShutdown` lifecycle will `$disconnect` on `app.close()`. A second handler would race the ordered sequence.
> - Do NOT mark `PrismaService` as `forRootAsync`-internal — it's a plain global provider consumed by the logger factory AND every feature module.
> - Keep the service minimal — query logging / metrics middleware is out of scope for Phase 5.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api dev` (with `pnpm infra:up` running) — expected: boots without a Prisma connection error; `GET /health` returns 200.
> - `grep -n "PrismaModule" apps/api/src/app.module.ts` — expected: imported.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P5-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P5-6 — `prisma/seed.ts` + migrate/seed/index verification

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P5-2`, `P5-3`, `P5-4`, `P5-5`

### Description

Write `prisma/seed.ts` (demo tenants + sample orders/payments) and run the first migration to close the phase. This is the Phase 5 **Definition of done** gate: `prisma migrate dev` applies the complete schema (`ApplicationLog` + domain + governance), `prisma db seed` populates demo data, and the native indexes are physically present in Postgres (verified via `\d application_logs`). Wire the `prisma.seed` config so `prisma db seed` runs the TS seed under the repo's ESM toolchain. Seed a couple of demo tenants and a handful of orders/payments so the dashboard has something to show; the `ApplicationLog` rows are produced organically by the running app (Phase 6/7), so the seed need only ensure the domain has data.

### Acceptance Criteria

- [x] `apps/api/prisma/seed.ts` exists; inserts ≥2 demo tenants' worth of `Order` rows + matching `Payment` rows (idempotent — safe to re-run).
- [x] `apps/api/package.json` has a `"prisma": { "seed": "<ts runner> prisma/seed.ts" }` block compatible with the repo's ESM setup (e.g. `tsx prisma/seed.ts`).
- [x] `prisma migrate dev --name init` creates `apps/api/prisma/migrations/<ts>_init/migration.sql` and applies it to `logger_example`.
- [x] The generated `migration.sql` contains `USING brin` (BRIN), `USING gin` with `jsonb_path_ops` (GIN), and the `(time DESC, id DESC)` keyset index — proving the native syntax compiled to real Postgres access methods (no hand-written raw SQL needed for them).
- [x] `prisma db seed` populates the demo orders/payments without error.
- [x] Indexes are present on the live table (`\d application_logs` shows brin/gin/btree indexes).

### Files to create / modify

- `apps/api/prisma/seed.ts` — seed script.
- `apps/api/package.json` — add the `prisma.seed` config (+ `tsx` dev dep if not present).
- `apps/api/prisma/migrations/**` — generated by `migrate dev` (commit it).

### Agent Execution Prompt

> Role: Senior NestJS / Prisma engineer closing out the persistence phase.
> Context: Task P5-6 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-5--prisma--persistence) §Phase 5. DoD (from the plan): _"`prisma migrate dev` applies; `prisma db seed` populates; indexes present (`\d application_logs`)."_ The complete schema (P5-2 `ApplicationLog` + P5-3 indexes + P5-4 domain/governance) and `PrismaService` (P5-5) must already exist. Postgres 18 + `logger_example` are up via `pnpm infra:up` (Phase 1). `ApplicationLog` rows come from the running app later — the seed only needs demo domain data.
> Objective: Add the seed + run the first migration; verify migrate/seed/indexes.
> Steps:
>
> 1. Ensure a TS runner is available: `pnpm --filter api add -D tsx` (if not already present).
> 2. Add the seed config to `apps/api/package.json`:
>    ```jsonc
>    {
>      "prisma": { "seed": "tsx prisma/seed.ts" },
>    }
>    ```
> 3. Create `apps/api/prisma/seed.ts` — idempotent demo data for two tenants:
>
>    ```typescript
>    import { PrismaClient } from '@prisma/client'
>
>    const prisma = new PrismaClient()
>
>    const TENANTS = ['tenant-acme', 'tenant-globex'] as const
>
>    async function main(): Promise<void> {
>      for (const tenantId of TENANTS) {
>        for (let i = 0; i < 5; i++) {
>          const order = await prisma.order.create({
>            data: { tenantId, amount: 1000 * (i + 1), status: i % 2 ? 'paid' : 'pending' },
>          })
>          if (order.status === 'paid') {
>            await prisma.payment.create({
>              data: { orderId: order.id, amount: order.amount, status: 'succeeded' },
>            })
>          }
>        }
>      }
>      console.log(`Seeded ${TENANTS.length} tenants with sample orders/payments.`)
>    }
>
>    main()
>      .catch((err) => {
>        console.error(err)
>        process.exit(1)
>      })
>      .finally(() => void prisma.$disconnect())
>    ```
>
> 4. Bring up infra and run the first migration + seed:
>    ```bash
>    pnpm infra:up
>    pnpm --filter api exec prisma migrate dev --name init
>    pnpm --filter api exec prisma db seed
>    ```
> 5. Confirm the indexes physically landed:
>    ```bash
>    docker compose exec -T postgres psql -U postgres -d logger_example -c '\d application_logs'
>    ```
> 6. Open the generated `migration.sql` and confirm it emitted `USING brin (... timestamp_minmax_ops)`, `USING gin (... jsonb_path_ops)`, and the `(time DESC, id DESC)` index — i.e. the native Prisma syntax produced the right DDL with **no** hand-written raw SQL for them. (If, and only if, `pages_per_range` tuning or a partial index is desired, add it as an explicit extra statement in a follow-up migration with a comment — not required for DoD.)
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) §2 (ESM; `tsx` runs the TS seed without a separate build).
> - The seed is idempotent-friendly and must NOT insert `ApplicationLog` rows — those are produced by the app (Phase 6/7) so the redaction guarantee is exercised for real.
> - Do NOT hand-write BRIN/GIN DDL — they MUST come from the native `@@index` declarations (P5-3). Reserve raw SQL strictly for `pages_per_range`/partial-index tuning.
> - Commit the generated `prisma/migrations/` directory.
>   Verification:
> - `pnpm --filter api exec prisma migrate dev --name init` — expected: "Your database is now in sync with your schema."
> - `pnpm --filter api exec prisma db seed` — expected: prints the seeded-tenants line, exit 0.
> - `grep -iE "USING (brin|gin)" apps/api/prisma/migrations/*_init/migration.sql` — expected: both BRIN and GIN present.
> - `docker compose exec -T postgres psql -U postgres -d logger_example -c '\d application_logs'` — expected: lists brin/gin/btree indexes on `application_logs`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P5-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 5 is 6/6 — switch the Phase 5 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- P5-1 ✅ 2026-06-01 — Prisma 7.8.0 installed (migrated from 6.19.3); schema.prisma Prisma 7 format (url in prisma.config.ts, PrismaPg adapter); db:\* scripts + DATABASE_URL Zod validation added.
- P5-2 ✅ 2026-06-01 — ApplicationLog model added with dashboard-grade columns (no indexes yet).
- P5-3 ✅ 2026-06-01 — All 7 indexes added with native Prisma syntax: BRIN (time), keyset (time DESC, id DESC), GIN jsonb_path_ops (payload), B-tree (level, logKey, traceId, tenantId+time).
- P5-4 ✅ 2026-06-01 — Domain models (Order, Payment) and governance models (SavedView, AlertRule, Incident, AuditEvent) added; AlertRule↔Incident FK relation wired.
- P5-5 ✅ 2026-06-01 — Real PrismaService (extends PrismaClient, OnModuleInit) + PrismaModule (@Global) created; app.module.ts updated to proper DI inject; typecheck passes.
- P5-6 ✅ 2026-06-01 — seed.ts created; prisma migrate dev --name init applied; seed seeded 2 tenants; all 7 indexes verified live (brin, gin, btree).
