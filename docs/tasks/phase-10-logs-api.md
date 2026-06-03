# Phase 10 — `logs/` Read-API — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-10--logs-read-api) §Phase 10
> **Total tasks:** 9
> **Progress:** 🟢 9 / 9 done (100%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                         | Status | Priority | Size | Depends on          |
| ----- | ------------------------------------------------------------ | ------ | -------- | ---- | ------------------- |
| P10-1 | `LogQuery` DTO (Zod) — `logs/dto/log-query.dto.ts`           | 🟢     | High     | M    | Phase 5, Phase 7    |
| P10-2 | `LogsService` — `LogQuery` → Prisma `where` **+** LogQL      | 🟢     | High     | L    | P10-1               |
| P10-3 | `GET /logs` — keyset cursor `(time,id)`, 410 on stale cursor | 🟢     | High     | M    | P10-2               |
| P10-4 | `GET /logs/aggregate` — time-bucketed counts (zero-filled)   | 🟢     | High     | L    | P10-2               |
| P10-5 | `GET /logs/facets` + `GET /logs/context` (+N/-N)             | 🟢     | High     | M    | P10-2               |
| P10-6 | `GET /logs/export` — JSON/CSV, 100k cap                      | 🟢     | Medium   | M    | P10-3               |
| P10-7 | `LogsSseController` — `GET /logs/stream` (`@Sse()`)          | 🟢     | High     | L    | P10-2, P10-3        |
| P10-8 | `LokiProxyController` — `GET /logs/loki` (LogQL)             | 🟢     | High     | M    | P10-2               |
| P10-9 | `alerts/` + `governance/` (RBAC, retention, audit, views)    | 🟢     | High     | L    | P10-3, P10-4, P10-5 |

---

## P10-1 — `LogQuery` DTO (Zod) — `logs/dto/log-query.dto.ts`

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `Phase 5, Phase 7`

### Description

Create the single filter DTO every read endpoint shares (`/logs`, `/logs/aggregate`, `/logs/facets`, `/logs/context`, `/logs/export`, `/logs/stream`). It is the contract that makes the dashboard's **source toggle** transparent: the same parsed object compiles to a Postgres `where` and a LogQL string later (P10-2). Validation is **Zod**, not `class-validator`, so the schema is isomorphic and the exact same shape can be reused by `apps/web`. The `logKey` field accepts an exact key or a `PREFIX_*` wildcard; its non-wildcard form is validated against **`LOG_KEYS_CONVENTION_REGEX`** imported from `@bymax-one/nest-logger/shared` so a typo'd key is rejected at the edge. `level` accepts either a single `LogLevel` or a `{ gte: LogLevel }` object (`level:error` vs `level>=warn`). See `DASHBOARD.md` §12 for the canonical `LogQuery` interface and the query-string table.

### Acceptance Criteria

- [x] `apps/api/src/logs/dto/log-query.dto.ts` exports a Zod schema `logQuerySchema` and the inferred type `LogQueryDto` (`z.infer`).
- [x] Fields: `level` (`LogLevel` **or** `{ gte: LogLevel }`), `logKey`, `service`, `tenantId`, `traceId`, `requestId`, `q`, `from`, `to`, `source` (`'postgres' | 'loki'`), `cursor`, `limit`.
- [x] `level` uses a shared `logLevelSchema = z.enum(['fatal','error','warn','info','debug','trace'])` whose values match the library `LogLevel` union (compile-time `satisfies`/assignability check against the imported `LogLevel`).
- [x] `logKey` rejects a value that is neither a `LOG_KEYS_CONVENTION_REGEX` match nor a `^[A-Z][A-Z0-9_]*_\*$` prefix wildcard.
- [x] `from`/`to` are ISO-8601 datetime strings (`z.string().datetime()`), optional; defaults applied downstream (`from = now-1h`, `to = now`).
- [x] `source` defaults to `'postgres'`; `limit` is `z.coerce.number().int().min(1).max(1000).default(100)`.
- [x] A reusable `ZodValidationPipe` (or `nestjs-zod`-style pipe) parses query params and throws `BadRequestException` (400) on failure.
- [x] Unit tests cover: a valid full query, an invalid `logKey`, a wildcard `logKey`, `level>=warn`, an out-of-range `limit`, and a bad ISO date.

### Files to create / modify

- `apps/api/src/logs/dto/log-query.dto.ts` — Zod schema + inferred type.
- `apps/api/src/logs/dto/log-query.dto.spec.ts` — schema unit tests.
- `apps/api/src/common/zod-validation.pipe.ts` — reusable Nest pipe (if not already present from an earlier phase).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer building a typed read-API DTO.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see `docs/DEVELOPMENT_PLAN.md` §Phase 10 + §2 Global Conventions and `docs/DASHBOARD.md` §12). This is task P10-1 — the filter DTO shared by every `logs/` endpoint. Use **Zod** (not `class-validator`); the schema must be isomorphic so `apps/web` can reuse it. `logKey` patterns are validated against `LOG_KEYS_CONVENTION_REGEX` imported from `@bymax-one/nest-logger/shared`.
> Objective: Produce `logs/dto/log-query.dto.ts` exactly matching the `LogQuery` interface in `DASHBOARD.md` §12, plus a reusable Zod validation pipe.
> Steps:
>
> 1. Import ONLY the public library symbols from the `/shared` subpath:
>    ```typescript
>    import { LOG_KEYS_CONVENTION_REGEX, type LogLevel } from '@bymax-one/nest-logger/shared'
>    import { z } from 'zod'
>    ```
> 2. Define the level enum and assert it stays in lockstep with the library `LogLevel` union:
>    ```typescript
>    export const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
>    // Compile-time guard: the Zod enum values MUST equal the library union.
>    type _LevelParity =
>      z.infer<typeof logLevelSchema> extends LogLevel
>        ? LogLevel extends z.infer<typeof logLevelSchema>
>          ? true
>          : never
>        : never
>    const _levelParity: _LevelParity = true
>    void _levelParity
>    ```
> 3. Build a `logKey` schema accepting an exact convention key OR a `PREFIX_*` wildcard:
>    ```typescript
>    const LOG_KEY_WILDCARD = /^[A-Z][A-Z0-9_]*_\*$/
>    export const logKeySchema = z
>      .string()
>      .refine((v) => LOG_KEYS_CONVENTION_REGEX.test(v) || LOG_KEY_WILDCARD.test(v), {
>        message: 'logKey must match MODULE_ACTION_RESULT or a PREFIX_* wildcard',
>      })
>    ```
> 4. Assemble the full schema mirroring `DASHBOARD.md` §12 (`level` is a union of a single level and `{ gte }`):
>    ```typescript
>    export const logQuerySchema = z.object({
>      level: z.union([logLevelSchema, z.object({ gte: logLevelSchema })]).optional(),
>      logKey: logKeySchema.optional(),
>      service: z.string().optional(),
>      tenantId: z.string().optional(),
>      traceId: z.string().optional(),
>      requestId: z.string().optional(),
>      q: z.string().optional(), // free-text msg contains (ILIKE / Loki |=)
>      from: z.string().datetime().optional(), // ISO; default now-1h applied in the service
>      to: z.string().datetime().optional(), // ISO; default now applied in the service
>      source: z.enum(['postgres', 'loki']).default('postgres'),
>      cursor: z.string().optional(), // opaque base64 keyset cursor (time,id)
>      limit: z.coerce.number().int().min(1).max(1000).default(100),
>    })
>    export type LogQueryDto = z.infer<typeof logQuerySchema>
>    ```
> 5. Create `common/zod-validation.pipe.ts` — a `@Injectable()` `PipeTransform` that runs `schema.safeParse(value)` and throws `new BadRequestException(result.error.format())` on failure, returning `result.data` otherwise. Make it generic over a `ZodSchema`.
> 6. Write `log-query.dto.spec.ts` covering every Acceptance-Criteria case (valid full query, invalid `logKey`, wildcard `logKey`, `{ gte: 'warn' }`, `limit` 0 and 5000, malformed ISO date).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions (strict TS, ESM, English-only, boolean `is`/`has` prefixes).
> - Import ONLY `LOG_KEYS_CONVENTION_REGEX`, `RESERVED_LOG_KEYS`, and the types `LogLevel` / `LogEntry` from `@bymax-one/nest-logger/shared`. Do NOT invent library exports.
> - Do NOT use `class-validator`/`class-transformer` for this DTO — Zod is the source of truth here.
> - Keep the DTO pure data + validation; query compilation belongs to P10-2.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0 (the `_LevelParity` guard compiles).
> - `pnpm --filter api test -- log-query.dto` — expected: all DTO unit tests pass.
> - `pnpm lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P10-2 — `LogsService` — `LogQuery` → Prisma `where` **+** LogQL

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P10-1`

### Description

The compiler at the heart of the read-API. `LogsService` turns one validated `LogQueryDto` into **both** a Prisma `where` object (Postgres `application_logs`) **and** a LogQL string (Loki) — the Explorer's "show generated SQL / show generated LogQL" teaching toggles render exactly these two outputs. This is also where the **keyset cursor** is encoded/decoded (opaque base64 of `(time,id)`) and where the **RBAC `tenantId` restriction** is injected (P10-9 calls into the same builder rather than bolting on a second path). No new datastore: it reads the same Postgres table written by `PrismaLogDestination` (Phase 7) and the same Loki stream. See `DASHBOARD.md` §12 (filter DTO) and §13 (Postgres `where` mapping + the LogQL mapping table).

### Acceptance Criteria

- [x] `apps/api/src/logs/logs.service.ts` exposes `buildPrismaWhere(q: LogQueryDto, restriction?: { tenantId?: string }): Prisma.ApplicationLogWhereInput`.
- [x] `buildLogQL(q: LogQueryDto, restriction?: { tenantId?: string }): string` produces a valid LogQL selector + pipeline (e.g. `{service="api"} | json | level="error" |= "refund"`).
- [x] `level` maps: a single level → equality; `{ gte }` → `IN` of all levels at/above it (Pino numeric order `fatal>error>warn>info>debug>trace`).
- [x] `logKey` exact → equality; `PREFIX_*` → Prisma `startsWith` AND LogQL `| logKey=~"PREFIX_.*"`.
- [x] `q` → Prisma `message: { contains, mode: 'insensitive' }` AND LogQL `|= "<q>"`.
- [x] `from`/`to` default to `now-1h` / `now`; both backends receive the same window.
- [x] `encodeCursor({ time, id })` → base64; `decodeCursor(s)`; a malformed cursor throws a typed `StaleCursorError`.
- [x] The `tenantId` restriction (when provided) is ANDed into **both** outputs and cannot be widened by the incoming query.
- [x] Unit tests assert exact `where` shapes and exact LogQL strings for: level equality, `level>=warn`, wildcard `logKey`, free-text `q`, a tenant restriction, and round-trip cursor encode/decode + a stale-cursor throw.

### Files to create / modify

- `apps/api/src/logs/logs.service.ts` — the dual compiler + cursor codec.
- `apps/api/src/logs/logs.service.spec.ts` — `where`/LogQL/cursor unit tests.
- `apps/api/src/logs/logs.module.ts` — `LogsModule` providing `LogsService` (imports `PrismaModule`).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer implementing a dual query compiler.
> Context: Task P10-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 10 (+ §2). `LogsService` compiles a `LogQueryDto` (from P10-1) into a Prisma `where` AND a LogQL string — these are the two outputs the dashboard's teaching toggles render (`DASHBOARD.md` §6, §12, §13). It reads the Postgres `application_logs` table from Phase 5 and the Loki stream from Phase 7; it introduces **no new datastore**. The keyset cursor is the opaque base64 of `(time,id)` (`DASHBOARD.md` §13). The RBAC `tenantId` restriction (P10-9) is injected through this same builder.
> Objective: Produce `logs/logs.service.ts` with `buildPrismaWhere`, `buildLogQL`, and the cursor codec, plus `LogsModule`.
> Steps:
>
> 1. Define the level ordering once and derive the `gte` set:
>    ```typescript
>    import type { LogLevel } from '@bymax-one/nest-logger/shared'
>    const LEVEL_RANK: Record<LogLevel, number> = {
>      fatal: 60,
>      error: 50,
>      warn: 40,
>      info: 30,
>      debug: 20,
>      trace: 10,
>    }
>    const levelsAtOrAbove = (min: LogLevel): LogLevel[] =>
>      (Object.keys(LEVEL_RANK) as LogLevel[]).filter((l) => LEVEL_RANK[l] >= LEVEL_RANK[min])
>    ```
> 2. Implement `buildPrismaWhere`:
>    ```typescript
>    buildPrismaWhere(q: LogQueryDto, restriction?: { tenantId?: string }): Prisma.ApplicationLogWhereInput {
>      const where: Prisma.ApplicationLogWhereInput = {
>        time: { gte: new Date(q.from ?? this.defaultFrom()), lte: new Date(q.to ?? this.defaultTo()) },
>      }
>      if (q.level) {
>        where.level = typeof q.level === 'string' ? q.level : { in: levelsAtOrAbove(q.level.gte) }
>      }
>      if (q.logKey) {
>        where.logKey = q.logKey.endsWith('_*') ? { startsWith: q.logKey.slice(0, -1) } : q.logKey
>      }
>      if (q.service) where.service = q.service
>      if (q.traceId) where.traceId = q.traceId
>      if (q.requestId) where.requestId = q.requestId
>      if (q.q) where.message = { contains: q.q, mode: 'insensitive' }
>      // RBAC: restriction wins and cannot be widened.
>      const tenantId = restriction?.tenantId ?? q.tenantId
>      if (tenantId) where.tenantId = tenantId
>      return where
>    }
>    ```
> 3. Implement `buildLogQL` mirroring the `DASHBOARD.md` §13 mapping table:
>    ```typescript
>    buildLogQL(q: LogQueryDto, restriction?: { tenantId?: string }): string {
>      const labels: string[] = [`service="${q.service ?? 'api'}"`]
>      const tenantId = restriction?.tenantId ?? q.tenantId
>      const pipeline: string[] = ['| json', '| __error__=""'] // drop malformed lines
>      if (q.level) {
>        pipeline.push(
>          typeof q.level === 'string'
>            ? `| level="${q.level}"`
>            : `| level=~"${levelsAtOrAbove(q.level.gte).join('|')}"`,
>        )
>      }
>      if (q.logKey) {
>        pipeline.push(q.logKey.endsWith('_*') ? `| logKey=~"${q.logKey.slice(0, -2)}.*"` : `| logKey="${q.logKey}"`)
>      }
>      if (tenantId) pipeline.push(`| tenantId="${tenantId}"`)
>      if (q.traceId) pipeline.push(`| traceId="${q.traceId}"`)
>      if (q.requestId) pipeline.push(`| requestId="${q.requestId}"`)
>      const lineFilter = q.q ? ` |= "${q.q}"` : ''
>      return `{${labels.join(',')}}${lineFilter} ${pipeline.join(' ')}`.trim()
>    }
>    ```
> 4. Add the cursor codec + a typed error:
>    ```typescript
>    export class StaleCursorError extends Error {}
>    encodeCursor(c: { time: Date; id: string }): string {
>      return Buffer.from(JSON.stringify({ t: c.time.toISOString(), i: c.id })).toString('base64url')
>    }
>    decodeCursor(s: string): { time: Date; id: string } {
>      try {
>        const { t, i } = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { t: string; i: string }
>        const time = new Date(t)
>        if (Number.isNaN(time.getTime()) || typeof i !== 'string') throw new Error('bad cursor')
>        return { time, id: i }
>      } catch {
>        throw new StaleCursorError('cursor is stale or malformed')
>      }
>    }
>    ```
> 5. Create `logs.module.ts` (`@Module`) importing `PrismaModule`, providing+exporting `LogsService`.
> 6. Write `logs.service.spec.ts` asserting EXACT `where` objects and EXACT LogQL strings for every Acceptance-Criteria row, plus cursor round-trip and a `StaleCursorError` throw on `decodeCursor('!!!')`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - The `tenantId` restriction MUST override the incoming `q.tenantId` (RBAC cannot be widened by the caller).
> - Do NOT execute queries here — this task is the pure compiler + codec only; endpoints (P10-3..P10-8) run them.
> - Escape user free-text safely in LogQL (no unescaped quotes); rely on Prisma parameterization for SQL.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- logs.service` — expected: all `where`/LogQL/cursor tests pass.
> - `pnpm lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P10-3 — `GET /logs` — keyset cursor `(time,id)`, 410 on stale cursor

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P10-2`

### Description

The paged log query — the Explorer's table data source. Pagination is **keyset (cursor)**, never `OFFSET`: it is constant-time and stable under concurrent inserts (`DASHBOARD.md` §13 — "~17× faster at depth"). Newest-first via `ORDER BY time DESC, id DESC`; the `(time,id) < (cursorTime,cursorId)` predicate walks the composite keyset index from Phase 5. The response returns the page plus the `nextCursor` (the last row's encoded `(time,id)`). A stale/invalid cursor surfaces as **HTTP 410 Gone** so the client knows to restart from the top (`DASHBOARD.md` §13). The `source` toggle selects Postgres (this controller) vs Loki (proxied via P10-8).

### Acceptance Criteria

- [x] `apps/api/src/logs/logs.controller.ts` defines `@Controller('logs')` with `@Get()` validated by the P10-1 Zod pipe.
- [x] When `source=postgres`: runs `prisma.applicationLog.findMany({ where, orderBy: [{ time: 'desc' }, { id: 'desc' }], take: limit })` with the cursor predicate ANDed into `where`.
- [x] When `source=loki`: delegates to the Loki path (calls the same service/proxy from P10-8) so the toggle is transparent.
- [x] Response shape `{ data: LogEntry[]; nextCursor: string | null; hasMore: boolean }`; `nextCursor` is the encoded `(time,id)` of the last row (or `null` when `data.length < limit`).
- [x] A `StaleCursorError` from `decodeCursor` is mapped to **HTTP 410** (e.g. via `GoneException` or an exception filter), with a body telling the client to restart.
- [x] e2e (supertest) covers: first page (no cursor), second page (using `nextCursor`), `hasMore=false` on the last page, a `410` for a corrupt cursor, and a `400` for an invalid `logKey`.

### Files to create / modify

- `apps/api/src/logs/logs.controller.ts` — `GET /logs`.
- `apps/api/src/logs/logs.controller.spec.ts` — controller unit tests.
- `apps/api/test/logs.e2e-spec.ts` — paging/410/400 e2e (append to the suite for later tasks).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer implementing keyset pagination.
> Context: Task P10-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 10. `GET /logs` is the Explorer's table source (`DASHBOARD.md` §6, §12). Pagination is keyset on `(time, id)` — NOT `OFFSET` (`DASHBOARD.md` §13). A stale cursor returns **410**. `source=postgres` uses Prisma here; `source=loki` delegates to the proxy (P10-8). The composite keyset index `(time DESC, id DESC)` exists from Phase 5.
> Objective: Produce `logs/logs.controller.ts` `GET /logs` using `LogsService` (P10-2) for `where` building and cursor codec.
> Steps:
>
> 1. The reference keyset SQL the Prisma query must reproduce (`DASHBOARD.md` §13):
>    ```sql
>    SELECT * FROM application_logs
>    WHERE tenant_id = $1                          -- RBAC restriction injected by LogsService
>      AND time BETWEEN $2 AND $3                  -- global time range
>      AND ($4::text IS NULL OR level = $4)        -- filters…
>      AND (time, id) < ($cursorTime, $cursorId)   -- the cursor
>    ORDER BY time DESC, id DESC
>    LIMIT $limit;
>    ```
> 2. Implement the handler:
>    ```typescript
>    @Get()
>    async list(@Query(new ZodValidationPipe(logQuerySchema)) q: LogQueryDto) {
>      if (q.source === 'loki') return this.loki.query(q) // P10-8 path
>      const where = this.logs.buildPrismaWhere(q)
>      if (q.cursor) {
>        const { time, id } = this.logs.decodeCursor(q.cursor) // throws StaleCursorError → 410
>        where.AND = [{ OR: [{ time: { lt: time } }, { time, id: { lt: id } }] }]
>      }
>      const rows = await this.prisma.applicationLog.findMany({
>        where,
>        orderBy: [{ time: 'desc' }, { id: 'desc' }],
>        take: q.limit,
>      })
>      const last = rows.at(-1)
>      const hasMore = rows.length === q.limit
>      return {
>        data: rows,
>        nextCursor: hasMore && last ? this.logs.encodeCursor({ time: last.time, id: last.id }) : null,
>        hasMore,
>      }
>    }
>    ```
> 3. Map `StaleCursorError` → 410. Either catch in the handler and `throw new GoneException('cursor is stale; restart from the top')`, or register a small `@Catch(StaleCursorError)` `ExceptionFilter` that responds 410. Prefer the filter so every endpoint sharing the codec behaves identically.
> 4. Register the controller in `LogsModule`; ensure `PrismaService` + `LogsService` are injected.
> 5. Write `logs.controller.spec.ts` (mock Prisma + service) and append `test/logs.e2e-spec.ts` cases: first page, follow `nextCursor`, last-page `hasMore=false`, corrupt cursor → 410, bad `logKey` → 400.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use keyset pagination ONLY; do NOT use `skip`/`OFFSET`.
> - The tuple comparison must be expressed correctly (`time < t OR (time = t AND id < id)`); a naive `time < t AND id < id` is WRONG.
> - Do NOT leak raw Prisma errors; the 410 body must be actionable.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- logs.controller` — expected: pass.
> - `pnpm --filter api test:e2e -- logs` — expected: paging + 410 + 400 cases green.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P10-4 — `GET /logs/aggregate` — time-bucketed counts (zero-filled)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P10-2`

### Description

The server-side aggregation endpoint that feeds **every chart** on the Overview and the Explorer histogram — the browser never crunches raw rows (`DASHBOARD.md` §5, §11). It supports four metrics: `volume` (stacked by level), `errorRate` (`(4xx+5xx)/total`), `latency` (p50/p95/p99 via `percentile_cont`), and `statusMix` (by status-class). Buckets are produced with `date_trunc` and **zero-filled** via `generate_series` so charts have no gaps. Group-by is restricted to **bounded** dimensions only (`level`, `status_class`, `logKey`, `service.name`, `tenantId`) — never `requestId`/`traceId`/`userId` (`DASHBOARD.md` §11 bounded-dimension rule). The exact SQL is given in `DASHBOARD.md` §13.

### Acceptance Criteria

- [x] `GET /logs/aggregate` accepts `?metric=volume|errorRate|latency|statusMix&groupBy=level|logKey|service|tenantId|status_class&bucket=auto|1m|5m|1h&...` validated by an aggregate-query schema (extends `logQuerySchema`).
- [x] `groupBy` is constrained by an allow-list to bounded dimensions; any other value → 400.
- [x] `bucket=auto` auto-scales: `1m` for ≤6h, `5m` for ≤24h, `1h` for ≤7d (`DASHBOARD.md` §4).
- [x] `volume` returns zero-filled `{ bucket, level, n }[]` covering all six levels per bucket (`generate_series` × `unnest(levels)`).
- [x] `errorRate` returns `{ bucket, errorRate }[]` = `count(*) FILTER (WHERE status >= 400)::float / NULLIF(count(*),0)` over `logKey LIKE 'HTTP_REQUEST_%'`.
- [x] `latency` returns `{ bucket, p50, p95, p99 }[]` via `percentile_cont` over non-null `duration_ms`.
- [x] `statusMix` returns counts by status-class (`2xx/3xx/4xx/5xx`) per bucket.
- [x] The `tenantId` restriction + time window from `LogsService` are applied to every variant.
- [x] Tests assert zero-filled empty buckets (a quiet window yields rows with `n=0`, not missing buckets) and correct percentile/error-rate math on a seeded fixture.

### Files to create / modify

- `apps/api/src/logs/logs.aggregate.service.ts` — the four `$queryRaw` builders.
- `apps/api/src/logs/dto/aggregate-query.dto.ts` — aggregate Zod schema (metric/groupBy/bucket).
- `apps/api/src/logs/logs.aggregate.service.spec.ts` — math + zero-fill tests.
- `apps/api/src/logs/logs.controller.ts` — add the `@Get('aggregate')` handler.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS + PostgreSQL engineer writing analytics SQL.
> Context: Task P10-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 10. `/logs/aggregate` feeds all Recharts panels (`DASHBOARD.md` §5, §11) — server-side aggregation only, the browser never aggregates raw rows. Group-by is bounded-dimension only (`DASHBOARD.md` §11). Use the EXACT SQL from `DASHBOARD.md` §13 via Prisma `$queryRaw`.
> Objective: Produce `logs/logs.aggregate.service.ts` (four metric builders) + the `aggregate-query.dto.ts` schema + the `@Get('aggregate')` handler.
> Steps:
>
> 1. Volume — stacked by level, zero-filled (`DASHBOARD.md` §13):
>    ```sql
>    SELECT b.bucket, l.level, COALESCE(c.n, 0) AS n
>    FROM generate_series($from, $to, $interval) AS b(bucket)
>    CROSS JOIN unnest(ARRAY['fatal','error','warn','info','debug','trace']) AS l(level)
>    LEFT JOIN (
>      SELECT date_trunc($unit, time) AS bucket, level, count(*) AS n
>      FROM application_logs
>      WHERE time BETWEEN $from AND $to AND tenant_id = $tenant
>      GROUP BY 1, 2
>    ) c ON c.bucket = b.bucket AND c.level = l.level
>    ORDER BY b.bucket;
>    ```
> 2. Error rate per bucket:
>    ```sql
>    SELECT date_trunc($unit, time) AS bucket,
>           count(*) FILTER (WHERE status >= 400)::float / NULLIF(count(*),0) AS error_rate
>    FROM application_logs WHERE logKey LIKE 'HTTP_REQUEST_%' AND time BETWEEN $from AND $to
>    GROUP BY 1 ORDER BY 1;
>    ```
> 3. Latency percentiles per bucket:
>    ```sql
>    SELECT date_trunc($unit, time) AS bucket,
>           percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
>           percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
>           percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
>    FROM application_logs WHERE duration_ms IS NOT NULL AND time BETWEEN $from AND $to
>    GROUP BY 1 ORDER BY 1;
>    ```
> 4. `statusMix` — bucket × status-class counts: `count(*) FILTER (WHERE status BETWEEN 200 AND 299) AS s2xx`, etc., per `date_trunc` bucket.
> 5. Build the `aggregate-query.dto.ts` schema extending `logQuerySchema` with `metric: z.enum(['volume','errorRate','latency','statusMix'])`, `groupBy: z.enum(['level','status_class','logKey','service','tenantId']).optional()`, `bucket: z.enum(['auto','1m','5m','1h']).default('auto')`. Resolve `auto` → `unit`/`interval` by the window length (≤6h→1m, ≤24h→5m, ≤7d→1h).
> 6. Use **parameterized** `prisma.$queryRaw` (tagged template or `Prisma.sql`) — never string-concatenate user input. Inject the `tenantId` restriction + `from`/`to` from `LogsService`.
> 7. Add `@Get('aggregate')` to `logs.controller.ts` switching on `metric`. Write `logs.aggregate.service.spec.ts` proving: a quiet bucket is present with `n=0` (zero-fill), `[1,1,1,5000]ms` yields the documented p50/p95/p99 (not the misleading 1251ms mean — `DASHBOARD.md` §2 principle 4), and `errorRate` matches a seeded 4xx/5xx mix.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - **Bounded `group by` ONLY** — reject `requestId`/`traceId`/`spanId`/`userId` via the allow-list (`DASHBOARD.md` §11).
> - All SQL MUST be parameterized; no string interpolation of user values.
> - Always zero-fill via `generate_series` so charts never gap.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- logs.aggregate` — expected: zero-fill + percentile + error-rate tests pass.
> - `pnpm lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P10-5 — `GET /logs/facets` + `GET /logs/context` (+N/-N)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P10-2`

### Description

Two drill-down endpoints. **`/logs/facets`** powers the Explorer's faceted left rail: distinct values + live counts for `level`, `service`, `logKey`, `tenantId` scoped to the current query + time range (`DASHBOARD.md` §6, §12). **`/logs/context`** powers the detail drawer's "Context" tab: the N lines before and N lines after a given log, correlated by `requestId` (or `traceId`), so an engineer reads a single request's surrounding story (`DASHBOARD.md` §6). Both are bounded-dimension, low-cost reads off the same Postgres table.

### Acceptance Criteria

- [x] `GET /logs/facets?fields=level,service,logKey,tenantId&from=&to=` returns `{ [field]: { value: string; count: number }[] }`, each list sorted by count desc (top-N for `logKey`/`tenantId`).
- [x] Facet counts honor the active filter + time window + `tenantId` restriction (a facet query reuses `buildPrismaWhere`).
- [x] `GET /logs/context?requestId=…|traceId=…&before=10&after=10` returns `{ before: LogEntry[]; match: LogEntry | null; after: LogEntry[] }` ordered by `(time, id)`.
- [x] `before`/`after` are bounded (default 10, max 100) and validated; exactly one of `requestId`/`traceId` is required (else 400).
- [x] `fields` is restricted to the bounded-dimension allow-list; any other field → 400.
- [x] Tests cover: facet counts on a seeded set, a top-N truncation for `logKey`, context window ordering, and the "exactly one correlation id" 400.

### Files to create / modify

- `apps/api/src/logs/logs.facets.service.ts` — `groupBy` facet counts.
- `apps/api/src/logs/logs.context.service.ts` — before/match/after window.
- `apps/api/src/logs/dto/context-query.dto.ts` + `dto/facets-query.dto.ts` — Zod schemas.
- `apps/api/src/logs/logs.controller.ts` — add `@Get('facets')` + `@Get('context')`.
- `apps/api/src/logs/logs.facets.service.spec.ts` + `logs.context.service.spec.ts` — tests.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS + PostgreSQL engineer.
> Context: Task P10-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 10. `/logs/facets` feeds the Explorer facet rail with live value counts; `/logs/context` feeds the detail drawer's Context tab (N-before / N-after by `requestId`/`traceId`) — see `DASHBOARD.md` §6 + §12. Both reuse `LogsService.buildPrismaWhere` (P10-2) and read the Phase 5 table.
> Objective: Produce the facets + context services, their DTOs, and the two controller handlers.
> Steps:
>
> 1. Facets — one bounded `groupBy` per requested field, e.g.:
>    ```typescript
>    const rows = await this.prisma.applicationLog.groupBy({
>      by: ['logKey'],
>      where, // from buildPrismaWhere(q) — same filter + time window + tenant restriction
>      _count: { _all: true },
>      orderBy: { _count: { logKey: 'desc' } },
>      take: 50, // top-N for high-ish dimensions
>    })
>    ```
>    Restrict requested `fields` to the allow-list `['level','service','logKey','tenantId']`; reject anything else with 400.
> 2. Context — fetch N rows strictly before and N strictly after the anchor by `(time, id)`, correlated by the chosen id:
>    ```sql
>    -- before (older), reversed for display
>    SELECT * FROM application_logs
>    WHERE request_id = $rid AND (time, id) < ($anchorTime, $anchorId)
>    ORDER BY time DESC, id DESC LIMIT $before;
>    -- after (newer)
>    SELECT * FROM application_logs
>    WHERE request_id = $rid AND (time, id) > ($anchorTime, $anchorId)
>    ORDER BY time ASC, id ASC LIMIT $after;
>    ```
>    Resolve the anchor row first (by the most-recent match for the id), then run the two windowed queries; return `{ before, match, after }` with `before` re-sorted ascending so the drawer reads top→bottom.
> 3. DTOs: `facets-query.dto.ts` (`fields` parsed from a comma list, allow-listed) extending `logQuerySchema`; `context-query.dto.ts` requiring EXACTLY one of `requestId`/`traceId` (`z.union` / `superRefine`) with `before`/`after` `z.coerce.number().int().min(0).max(100).default(10)`.
> 4. Add `@Get('facets')` + `@Get('context')` to `logs.controller.ts`. Write the two spec files (mock Prisma) proving counts, top-N truncation, window ordering, and the one-id 400.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Facets are bounded-dimension only; NEVER facet on `requestId`/`traceId`/`userId`.
> - The tuple keyset comparison for context must be correct (`time </> t OR (time = t AND id </> id)`).
> - Reuse `buildPrismaWhere`; do NOT duplicate filter logic.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- "logs.facets|logs.context"` — expected: pass.
> - `pnpm lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P10-6 — `GET /logs/export` — JSON/CSV, 100k cap

- **Status:** 🟢 Done
- **Priority:** Medium
- **Size:** M (90–180 min)
- **Depends on:** `P10-3`

### Description

Download the **current filtered result set** as JSON or CSV — the Explorer's Export action and the Maintenance page's export panel (`DASHBOARD.md` §6, §10). It reuses the Explorer's exact `LogQuery`, hard-capped at **100,000 rows** (Datadog's cap), and streams a truncation banner/header when the cap is hit. CSV columns are fixed: `time, level, logKey, service, requestId, traceId, tenantId, msg` (`DASHBOARD.md` §10). Rows are paged internally via the keyset codec (P10-2) so the export never holds the whole set in memory at once. Export is an **audited action** (P10-9 writes an `audit_events` row).

### Acceptance Criteria

- [x] `GET /logs/export?format=json|csv&...` reuses `logQuerySchema` + a `format` enum (default `json`).
- [x] Streams the response (`StreamableFile` or a manual `Readable`) — does NOT buffer 100k rows in memory.
- [x] CSV columns exactly: `time,level,logKey,service,requestId,traceId,tenantId,msg`, RFC-4180-quoted (commas/quotes/newlines escaped).
- [x] Hard cap at 100,000 rows; when exceeded, sets a response header `X-Export-Truncated: true` and stops.
- [x] `Content-Type` (`application/json` / `text/csv`) + `Content-Disposition: attachment; filename="logs-export-<ISO>.{json|csv}"` set correctly.
- [x] Internally pages with the keyset cursor (no `OFFSET`); the `tenantId` restriction is honored.
- [x] Tests: CSV escaping of a `msg` containing a comma + quote + newline; the 100k cap sets the truncation header; JSON output is a valid array.

### Files to create / modify

- `apps/api/src/logs/logs.export.service.ts` — streaming JSON/CSV writer with keyset paging.
- `apps/api/src/logs/dto/export-query.dto.ts` — `format` + reuse of `logQuerySchema`.
- `apps/api/src/logs/logs.controller.ts` — add `@Get('export')`.
- `apps/api/src/logs/logs.export.service.spec.ts` — escaping + cap tests.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer implementing a streaming export.
> Context: Task P10-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 10. `/logs/export` downloads the Explorer's current filtered set as JSON/CSV, 100k-capped, with the fixed CSV columns from `DASHBOARD.md` §10. It reuses the same `LogQuery` + keyset codec (P10-2/P10-3). It is an audited action (the audit row is written in P10-9).
> Objective: Produce `logs/logs.export.service.ts` + the `@Get('export')` handler that streams, caps, and escapes correctly.
> Steps:
>
> 1. Page internally with the keyset cursor (reuse `buildPrismaWhere` + `encodeCursor`), accumulating up to `MAX_EXPORT_ROWS = 100_000`:
>    ```typescript
>    const MAX_EXPORT_ROWS = 100_000
>    async *rows(q: LogQueryDto): AsyncGenerator<ApplicationLog> {
>      let cursor: { time: Date; id: string } | undefined
>      let emitted = 0
>      while (emitted < MAX_EXPORT_ROWS) {
>        const where = this.logs.buildPrismaWhere(q)
>        if (cursor) where.AND = [{ OR: [{ time: { lt: cursor.time } }, { time: cursor.time, id: { lt: cursor.id } }] }]
>        const batch = await this.prisma.applicationLog.findMany({
>          where, orderBy: [{ time: 'desc' }, { id: 'desc' }], take: Math.min(1000, MAX_EXPORT_ROWS - emitted),
>        })
>        if (batch.length === 0) return
>        for (const r of batch) { yield r; emitted++ }
>        const last = batch.at(-1)!
>        cursor = { time: last.time, id: last.id }
>        if (batch.length < 1000) return
>      }
>    }
>    ```
> 2. CSV: emit the header row `time,level,logKey,service,requestId,traceId,tenantId,msg` then one line per row, RFC-4180-quoting each field:
>    ```typescript
>    const csvCell = (v: unknown): string => {
>      const s = v == null ? '' : String(v)
>      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
>    }
>    ```
> 3. JSON: stream `[`, comma-separated `JSON.stringify(row)`, `]` so memory stays flat.
> 4. In the controller, set headers and return a `StreamableFile`/`Readable`; when the generator stops at `MAX_EXPORT_ROWS`, set `res.setHeader('X-Export-Truncated', 'true')`. Set `Content-Disposition` with an ISO-stamped filename.
> 5. Write `logs.export.service.spec.ts`: a `msg` of `a,"b"\nc` round-trips through `csvCell` correctly; a fixture of >100k rows trips the truncation header; JSON output `JSON.parse`s to an array.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Stream — do NOT materialize 100k rows in an array before responding.
> - CSV MUST be RFC-4180 safe (escape `"`, `,`, `\n`, `\r`).
> - Honor the `tenantId` restriction and the 100k cap exactly.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- logs.export` — expected: escaping + cap tests pass.
> - `pnpm lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P10-7 — `LogsSseController` — `GET /logs/stream` (`@Sse()`)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P10-2, P10-3`

### Description

The real-time live-tail endpoint — the headline "watch logs in real time" feature (`DASHBOARD.md` §7, §14). It uses NestJS `@Sse()` returning an `Observable<MessageEvent>`. The row's keyset cursor is the SSE `id`, so on reconnect the browser re-sends `Last-Event-ID` and the server **replays only newer rows** from the keyset store before resuming the live merge — no missed lines, no per-client bookkeeping. A 15-second keep-alive `ping` defeats idle-timeout proxies, and `X-Accel-Buffering: no` + `Cache-Control: no-cache` defeat proxy buffering. A lightweight in-process `LogEventBus` (`EventEmitter`, or a Loki `tail` bridge) re-emits each entry to connected clients. The exact controller shape is in `DASHBOARD.md` §14.

### Acceptance Criteria

- [x] `apps/api/src/logs/logs.sse.controller.ts` defines `@Controller('logs')` with `@Sse('stream')` returning `Observable<MessageEvent>`.
- [x] The stream merges three sources: `replay$` (keyset replay since `Last-Event-ID`), `live$` (new entries matching the filter), and `keepAlive$` (`interval(15_000)` → `{ data: '', type: 'ping' }`).
- [x] Each live `MessageEvent` sets `id` to the row's keyset cursor (so reconnect resumes cleanly).
- [x] The `Last-Event-ID` header (or `lastEventId` query fallback) drives `replaySince`; a malformed id degrades gracefully (replay skipped, live continues) — it does NOT 500.
- [x] The filter is the same `LogQueryDto`; only matching entries are emitted (`matches(e, filter)`).
- [x] Response sets `X-Accel-Buffering: no` and `Cache-Control: no-cache`.
- [x] `LogEventBus` (`apps/api/src/logs/log-event.bus.ts`) is an injectable `EventEmitter` wrapper with `emit(entry)`, `replaySince(lastId, filter)`, and the `emitter` handle; `PinoLoggerService`/the Prisma destination feed it.
- [x] e2e proves: connecting receives a `ping` within ~15s; firing a log (via a demo endpoint) pushes a matching SSE `data` frame with an `id`; reconnecting with `Last-Event-ID` replays the missed row exactly once.

### Files to create / modify

- `apps/api/src/logs/logs.sse.controller.ts` — `@Sse('stream')`.
- `apps/api/src/logs/log-event.bus.ts` — in-process event bus + keyset replay.
- `apps/api/src/logs/logs.sse.controller.spec.ts` — merge/keep-alive/replay unit tests (marble or fake timers).
- `apps/api/test/logs-sse.e2e-spec.ts` — live-tail e2e.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS + RxJS engineer building an SSE stream.
> Context: Task P10-7 of `docs/DEVELOPMENT_PLAN.md` §Phase 10. `GET /logs/stream` is the live-tail feed (`DASHBOARD.md` §7 + §14). Transport is SSE (not WebSocket): server→client only, free auto-reconnect + `Last-Event-ID` resume. Keep-alive every 15s; set `X-Accel-Buffering: no`. Reuse the `LogQuery` filter + keyset cursor codec from P10-2.
> Objective: Produce `logs/logs.sse.controller.ts`, the `LogEventBus`, and the keyset replay, matching the `DASHBOARD.md` §14 shape.
> Steps:
>
> 1. Implement the controller exactly per `DASHBOARD.md` §14:
>
>    ```typescript
>    @Controller('logs')
>    export class LogsSseController {
>      constructor(private readonly bus: LogEventBus) {}
>
>      @Sse('stream')
>      stream(
>        @Query(new ZodValidationPipe(logQuerySchema)) filter: LogQueryDto,
>        @Headers('last-event-id') lastId?: string,
>      ): Observable<MessageEvent> {
>        const replay$ = this.bus.replaySince(lastId, filter) // keyset replay of missed rows
>        const live$ = fromEvent(this.bus.emitter, 'log').pipe(
>          filter((e: LogEntry) => matches(e, filter)),
>          map((e: LogEntry) => ({ data: JSON.stringify(e), id: e.cursor }) as MessageEvent),
>        )
>        const keepAlive$ = interval(15_000).pipe(
>          map(() => ({ data: '', type: 'ping' }) as MessageEvent),
>        )
>        return merge(replay$, live$, keepAlive$)
>      }
>    }
>    ```
>
> 2. Set the anti-buffering headers. Because `@Sse()` owns the response, set them via an interceptor or `@Header()` decorators: `@Header('X-Accel-Buffering', 'no')` and `@Header('Cache-Control', 'no-cache')` on the handler.
> 3. `LogEventBus` — wrap a Node `EventEmitter`:
>    ```typescript
>    @Injectable()
>    export class LogEventBus {
>      readonly emitter = new EventEmitter()
>      constructor(
>        private readonly logs: LogsService,
>        private readonly prisma: PrismaService,
>      ) {}
>      emit(entry: LogEntry & { cursor: string }): void {
>        this.emitter.emit('log', entry)
>      }
>      replaySince(lastId: string | undefined, filter: LogQueryDto): Observable<MessageEvent> {
>        if (!lastId) return EMPTY
>        let from: { time: Date; id: string }
>        try {
>          from = this.logs.decodeCursor(lastId)
>        } catch {
>          return EMPTY
>        } // malformed → skip replay, keep live
>        // query rows newer than `from` matching the filter, ordered ASC, map to MessageEvent with id=cursor
>        return from$(this.fetchSince(from, filter))
>      }
>    }
>    ```
>    `matches(entry, filter)` checks level/logKey/service/tenant/trace/request against the same semantics as `buildPrismaWhere`.
> 4. Wire `PinoLoggerService`/the Prisma destination (Phase 7) to call `bus.emit(entryWithCursor)` so live frames flow. Compute each entry's `cursor` via `encodeCursor`.
> 5. Tests: unit-test the merge with fake timers (a `ping` after 15s; a live entry maps to `{ data, id }`; a non-matching entry is filtered out; a bad `lastId` yields `EMPTY` replay). e2e: connect → receive `ping`; fire a demo log → receive a matching `data` frame; reconnect with `Last-Event-ID` → the missed row replays exactly once.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - SSE only (no WebSocket, no polling). A malformed `Last-Event-ID` must NOT 500 — degrade to live-only.
> - Keep-alive interval is exactly 15s; `X-Accel-Buffering: no` + `Cache-Control: no-cache` MUST be set.
> - Replay MUST be keyset-based (reuse the P10-2 codec) so no line is missed or duplicated.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- logs.sse` — expected: merge/keep-alive/replay unit tests pass.
> - `pnpm --filter api test:e2e -- logs-sse` — expected: ping + live-frame + replay e2e green.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P10-8 — `LokiProxyController` — `GET /logs/loki` (LogQL)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P10-2`

### Description

The other half of the **source toggle**: when the dashboard is set to Loki, the same `LogQuery` is answered by Loki instead of Postgres. This controller maps the filter to LogQL (via `LogsService.buildLogQL`) and proxies the three Loki HTTP-API shapes — `query_range` (paged search + chart buckets), `label/<name>/values` (facets), and `tail` (live, bridged to the SSE feed). Because Loki holds `info`+ (the full-fidelity tier) while Postgres holds `warn`+ (durable), the same window returns more rows on Loki — the dashboard's toggle callout explains the asymmetry as a lesson (`DASHBOARD.md` §4, §13). `LOKI_QUERY_URL` is the base URL (Appendix A).

### Acceptance Criteria

- [x] `apps/api/src/logs/loki-proxy.controller.ts` defines `@Controller('logs')` with `@Get('loki')` accepting the same `logQuerySchema` + a `mode=query_range|labels|tail` selector (default `query_range`).
- [x] `query_range` → `GET {LOKI_QUERY_URL}/loki/api/v1/query_range?query=<LogQL>&start=&end=&step=&limit=`; the LogQL comes from `buildLogQL`.
- [x] `labels` → `GET {LOKI_QUERY_URL}/loki/api/v1/label/<name>/values` for the facet rail.
- [x] `tail` → documented as bridged into `/logs/stream` (P10-7) — this endpoint returns the `tail` URL/handle or proxies it, but the browser consumes live via SSE, not the Loki WebSocket directly.
- [x] Chart buckets use `sum by (level) (count_over_time({…} | json [<interval>]))` with `step=<interval>` (`DASHBOARD.md` §13 table).
- [x] Loki errors / unreachable host return a typed 502 (`BadGatewayException`) with a clear message — the dashboard stays usable (fail-soft).
- [x] The `tenantId` restriction is injected into the LogQL pipeline (RBAC parity with Postgres).
- [x] Tests (mock `fetch`/HTTP) assert the composed LogQL + URL for `query_range`, the `label/.../values` URL for `labels`, and a 502 on a Loki 500/timeout.

### Files to create / modify

- `apps/api/src/logs/loki-proxy.controller.ts` — `GET /logs/loki`.
- `apps/api/src/logs/loki.client.ts` — thin HTTP client (`fetch`/`undici`) reading `LOKI_QUERY_URL`.
- `apps/api/src/logs/loki-proxy.controller.spec.ts` — URL/LogQL composition + 502 tests.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer building an HTTP proxy.
> Context: Task P10-8 of `docs/DEVELOPMENT_PLAN.md` §Phase 10. `/logs/loki` is the Loki half of the source toggle: the same `LogQuery` → LogQL (via `LogsService.buildLogQL`, P10-2) → Loki HTTP API (`query_range` / `labels` / `tail`). See the mapping table in `DASHBOARD.md` §13. `LOKI_QUERY_URL` is the base URL (DEVELOPMENT_PLAN Appendix A). Loki holds `info`+, so it returns more than Postgres for the same window — by design.
> Objective: Produce `logs/loki-proxy.controller.ts` + a thin `loki.client.ts`, mapping the filter to the three Loki shapes.
> Steps:
>
> 1. `loki.client.ts` — read `LOKI_QUERY_URL` from the env config; expose:
>    ```typescript
>    async queryRange(logql: string, startNs: string, endNs: string, step: string, limit: number): Promise<LokiQueryResponse>
>    async labelValues(name: string): Promise<string[]>
>    ```
>    Use native `fetch`; on a non-2xx response or a network throw, raise a typed `LokiUnavailableError`.
> 2. Controller — switch on `mode`:
>    ```typescript
>    @Get('loki')
>    async loki(@Query(new ZodValidationPipe(lokiQuerySchema)) q: LokiQueryDto) {
>      const logql = this.logs.buildLogQL(q)
>      switch (q.mode) {
>        case 'labels':
>          return { values: await this.client.labelValues(q.labelName ?? 'level') }
>        case 'tail':
>          return { stream: '/logs/stream', hint: 'consume live via SSE (P10-7)' }
>        case 'query_range':
>        default: {
>          const { start, end } = toNanoRange(q.from, q.to)
>          return this.client.queryRange(logql, start, end, q.step ?? '60s', q.limit)
>        }
>      }
>    }
>    ```
> 3. For chart buckets, the LogQL is the `count_over_time` aggregate (`DASHBOARD.md` §13): `sum by (level) (count_over_time(${selector} | json [${interval}]))` with `step=${interval}`. Expose this via a `metric=buckets` variant or a sibling method reused by P10-4's Loki path.
> 4. Map `LokiUnavailableError` → `BadGatewayException` (502) with an actionable message so the dashboard degrades gracefully (fail-soft parity with the library's destination behavior).
> 5. Inject the `tenantId` restriction into `buildLogQL` (RBAC parity). Write `loki-proxy.controller.spec.ts` (mock `fetch`): assert the exact `query_range` URL + LogQL, the `label/level/values` URL, and a 502 when `fetch` rejects or returns 500.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Reuse `LogsService.buildLogQL` — do NOT re-implement LogQL composition here.
> - Live tail is consumed via SSE (P10-7); this endpoint does NOT stream the Loki WebSocket straight to the browser.
> - A Loki outage MUST surface as 502, never crash the API.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- loki-proxy` — expected: URL/LogQL + 502 tests pass.
> - `pnpm lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-8 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P10-9 — `alerts/` + `governance/` (RBAC, retention, audit, views)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P10-3, P10-4, P10-5`

### Description

The "operate it like a real platform" backend — small, real, clearly-labeled scoped demos (`DASHBOARD.md` §9, §10). **`alerts/`**: a NestJS cron evaluates `expr + threshold + for` rules over the same `/logs` query layer (rate-based, error-rate-AND-volume-floor, aggregate, auto-resolve), routes to mockable channels (Slack/webhook/email-mock) by severity, and drives the incident lifecycle `Triggered → Acknowledged → Snoozed → Resolved` with an immutable timeline. **`governance/`**: saved views CRUD; the **RBAC `tenantId` restriction injected into the query builder** (`LogsService.buildPrismaWhere`/`buildLogQL` accept a `restriction` — RBAC reuses the query layer, never a second auth path); a **retention sweep cron** deleting `application_logs` older than `RETENTION_DAYS`; and an `audit_events` table recording actions (export, rule edit, role/tenant switch, retention change). Backing tables (`SavedView`/`AlertRule`/`Incident`/`AuditEvent`) exist from Phase 5. Endpoint shapes are in `DASHBOARD.md` §12.

### Acceptance Criteria

- [x] `apps/api/src/alerts/` — `AlertsModule` with: `alerts.rules.controller.ts` (`GET/POST/PATCH /alerts/rules`), `alerts.channels.controller.ts` (`GET/POST /alerts/channels`, test-fireable), `incidents.controller.ts` (`GET/PATCH /incidents` — ack/snooze/resolve), and `alerts.evaluator.service.ts` (a `@Cron` evaluating rules over `LogsService`).
- [x] Rule evaluation is **rate-based** and supports the documented shapes: error spike by `logKey` over a window, any `fatal`, a specific `PAYMENT_REFUND_FAILED` rate, and a heartbeat/absence rule; alerts **aggregate** (one notification per pattern) and **auto-resolve**.
- [x] Channels: Slack-webhook + generic-webhook + email-mock receivers with severity routing (critical → webhook+Slack; warning → Slack only); deliveries are mocked/logged (offline-safe) and a channel can be test-fired.
- [x] Incidents: lifecycle `Triggered → Acknowledged → Snoozed(1h/4h/8h/24h) → Resolved`; every transition appends `{ actor, at }` to an immutable timeline; each incident deep-links back to the Explorer filter (`logKey` + window).
- [x] `apps/api/src/governance/` — `GovernanceModule` with: `views.controller.ts` (`GET/POST /views` saved filter sets), `audit.controller.ts` (`GET /audit`, read-only), `maintenance.controller.ts` (`GET/PATCH /maintenance/retention`, Admin only), and `retention.sweep.service.ts` (`@Cron` deleting rows older than `RETENTION_DAYS`, default 30).
- [x] **RBAC**: an `RbacContext` (role + tenantId from the request, e.g. headers in this demo) is turned into a `restriction` and passed into `LogsService` on **every** read; a Viewer is hard-scoped to its own `tenantId` and cannot export; the restriction cannot be widened by the incoming query.
- [x] Every state-changing/sensitive action (export, rule create/edit/mute, role/tenant switch, retention change) writes an `audit_events` row `{ actor, action, target, tenantId, at }`.
- [x] Each scoped-demo controller/page-facing endpoint is documented with the `🎓 Scoped demo of <feature>` callout in its JSDoc/README.
- [x] Tests cover: an error-spike rule firing an incident, ack→resolve transitions appended to the timeline, severity-based channel routing, a Viewer query forced to its `tenantId` (and export denied), the retention sweep deleting only old rows, and an audit row written on export.

### Files to create / modify

- `apps/api/src/alerts/alerts.module.ts`, `alerts.rules.controller.ts`, `alerts.channels.controller.ts`, `incidents.controller.ts`, `alerts.evaluator.service.ts`, `channels/*` + DTOs.
- `apps/api/src/governance/governance.module.ts`, `views.controller.ts`, `audit.controller.ts`, `maintenance.controller.ts`, `retention.sweep.service.ts`, `rbac.context.ts`, `audit.service.ts` + DTOs.
- `apps/api/src/logs/logs.service.ts` — confirm `buildPrismaWhere`/`buildLogQL` accept the `restriction` (from P10-2).
- `apps/api/src/app.module.ts` — register `AlertsModule` + `GovernanceModule` + `ScheduleModule.forRoot()`.
- Matching `*.spec.ts` for evaluator, incidents, RBAC restriction, retention sweep, and audit writes.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer building scoped ops features.
> Context: Task P10-9 of `docs/DEVELOPMENT_PLAN.md` §Phase 10 — the `alerts/` + `governance/` modules (`DASHBOARD.md` §9, §10, §12). These are **honest, clearly-labeled scoped demos** of production concepts, real code over the two existing data sources. RBAC is enforced by injecting a `tenantId` restriction into the EXISTING query builder (`LogsService`, P10-2) — reuse the query layer, never a second auth path. Backing tables `SavedView`/`AlertRule`/`Incident`/`AuditEvent` exist from Phase 5. Crons use `@nestjs/schedule`.
> Objective: Produce the `alerts/` and `governance/` modules, wiring rules/channels/incidents, saved views, RBAC restriction, retention sweep, and the audit trail.
> Steps:
>
> 1. **Alerts evaluator** — a `@Cron('*/30 * * * * *')` (every 30s) that, per rule, runs a rate-based count over `LogsService` and fires when `value > threshold` sustained for `for`:
>    ```typescript
>    // Error spike — count(level ∈ {error,fatal}) by logKey over 5m > N
>    // Any FATAL — count(level = fatal) over 1m ≥ 1
>    // Specific failure — rate(PAYMENT_REFUND_FAILED) over 5m > X
>    // Heartbeat/absence — count(HTTP_REQUEST_SUCCESS) over 10m == 0
>    ```
>    Aggregate (one notification per pattern), auto-resolve when the condition clears, and append every incident transition to an immutable timeline. Each rule exposes its equivalent **Loki ruler YAML** as a teaching string.
> 2. **Channels** — a registry of receivers (`slack`/`webhook`/`email-mock`) with severity routing (critical → webhook+Slack; warning → Slack only). Make delivery an injectable interface so it is mockable/logged offline; expose a "test-fire" action.
> 3. **Incidents** — `@Patch('/incidents/:id')` transitions `ack`/`snooze`/`resolve`; snooze accepts `1h|4h|8h|24h`; persist `{ status, actor, at }` events; expose a `deepLink` back to the Explorer (`logKey` + time window).
> 4. **Saved views** — `GET/POST /views` storing named `LogQuery` filter sets (promotable to a rule, the Datadog "save view → monitor" pattern).
> 5. **RBAC** — build an `RbacContext` from the request (role + `tenantId`; in this demo read from `x-role` / `x-tenant-id` headers, clearly marked as a scoped stand-in for an IdP). Convert it to `{ tenantId }` and pass it as the `restriction` into `LogsService.buildPrismaWhere`/`buildLogQL` on EVERY read. A Viewer is hard-scoped to its tenant and denied export.
>    ```typescript
>    const restriction = rbac.role === 'admin' ? {} : { tenantId: rbac.tenantId }
>    const where = this.logs.buildPrismaWhere(query, restriction) // restriction cannot be widened by `query`
>    ```
> 6. **Retention sweep** — a `@Cron('0 0 * * *')` deleting `application_logs` where `time < now() - RETENTION_DAYS days`; expose `GET /maintenance/retention` (next-sweep time + rows-pending) and `PATCH` (Admin only).
> 7. **Audit** — an `AuditService.record({ actor, action, target, tenantId })` writing an `audit_events` row, called from export (P10-6), rule create/edit/mute, role/tenant switch, and retention change; `GET /audit` is read-only.
> 8. Register `AlertsModule`, `GovernanceModule`, and `ScheduleModule.forRoot()` in `app.module.ts`. Add the `🎓 Scoped demo of <feature>` callout to each module's JSDoc/README. Write the spec files for: an error-spike rule → incident, ack→resolve timeline, severity routing, Viewer tenant-scoping + export-denied, retention sweep deletes only old rows, and an audit row on export.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions (log keys validated vs `LOG_KEYS_CONVENTION_REGEX`; never reuse a `RESERVED_LOG_KEYS` value for an app/alert event).
> - RBAC MUST reuse `LogsService` (inject the `restriction`); do NOT build a parallel filtering path. The restriction cannot be widened by the caller's query.
> - Rules are **rate-based**, aggregate, and auto-resolve — not naive raw counts per row.
> - Channels MUST be offline-safe (mock/log delivery); no real network calls in tests.
> - Label every scoped feature honestly with the `🎓 Scoped demo` callout (`DASHBOARD.md` §1, §9, §10).
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api test -- "alerts|governance|incidents|retention|rbac"` — expected: pass.
> - `pnpm --filter api test:e2e -- "alerts|governance"` — expected: rule→incident, RBAC scoping, retention, and audit e2e green.
> - `pnpm lint` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P10-9 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 10 is 9/9 — switch the Phase 10 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- P10-1 ✅ 2026-06-03 — `logQuerySchema` + `logKeySchema` (Zod v4) + `ZodValidationPipe`; level parity guard; compile-time type checks pass
- P10-2 ✅ 2026-06-03 — `LogsService.buildPrismaWhere` + `buildLogQL` (LogQL injection–safe via `escapeLogQL`) + keyset cursor codec + `StaleCursorError`; `LogsModule`
- P10-3 ✅ 2026-06-03 — `GET /logs` keyset pagination; 410 on stale cursor; RBAC restriction threaded through; `where.AND` spread pattern for correctness
- P10-4 ✅ 2026-06-03 — `LogsAggregateService` (volume/errorRate/latency/statusMix); zero-fill via `generate_series`; `date_trunc` unit bug fixed; tenantId applied to all 4 metrics
- P10-5 ✅ 2026-06-03 — `LogsFacetsService` (bounded groupBy, top-50) + `LogsContextService` (N-before/N-after by requestId/traceId, keyset window)
- P10-6 ✅ 2026-06-03 — Streaming JSON/CSV export, 100k cap, RFC-4180 quoting, `X-Export-Truncated` header, keyset paging, viewer denied
- P10-7 ✅ 2026-06-03 — `LogsSseController` (`@Sse`) merging replay$/live$/keepAlive$; `LogEventBus` with `matches()`; RBAC restriction on replay and live filter
- P10-8 ✅ 2026-06-03 — `LokiProxyController` + `LokiClient`; `query_range`/`labels`/`tail` modes; `step` + `labelName` validated; 502 on Loki failure; RBAC injected into LogQL
- P10-9 ✅ 2026-06-03 — `AlertsModule` (rules/channels/incidents/evaluator cron) + `GovernanceModule` (views/audit/retention/RBAC); `@nestjs/schedule` installed; audit trail on all state-changing ops
