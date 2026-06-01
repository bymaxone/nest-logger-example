# Phase 4 — Logger Wiring — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-4--logger-wiring) §Phase 4
> **Total tasks:** 6
> **Progress:** 🟢 6 / 6 done (100%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                  | Status | Priority | Size | Depends on |
| ---- | --------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| P4-1 | `logger.config.ts` — `buildLoggerOptions(config, prisma)` factory     | 🟢     | High     | M    | —          |
| P4-2 | Wire `BymaxLoggerModule.forRootAsync` in `app.module.ts`              | 🟢     | High     | S    | P4-1       |
| P4-3 | `RequestIdMiddleware` in `AppModule.configure()` (ALS scope)          | 🟢     | High     | S    | P4-2       |
| P4-4 | `log-audit.service.ts` (`@Inject(LOGGER_OPTIONS_TOKEN)`)              | 🟢     | High     | S    | P4-1, P4-2 |
| P4-5 | Wire `HttpLoggingInterceptor` + `HttpExceptionFilter` (global)        | 🟢     | High     | M    | P4-2, P4-3 |
| P4-6 | Verification gate (requestId/tenantId, interceptor+filter, bootstrap) | 🟢     | High     | S    | P4-1..P4-5 |

---

## P4-1 — `logger.config.ts` — `buildLoggerOptions(config, prisma)` factory

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `—`

### Description

Create `apps/api/src/logger/logger.config.ts`, the **single source of truth** for `BymaxLoggerModuleOptions`. The exported `buildLoggerOptions(config, prisma)` factory maps the Zod-validated env (Phase 3) into the library's options object: `service`, `level`, `isPretty`, `redactPaths` (merged with the 97 defaults), `redactCensor: '[REDACTED]'`, `maxEntrySizeBytes`, `serializers`, `timestamp`, an `http` block (with anchored `excludePaths`), and an `otel` block (`shouldAutoInjectTraceContext: true` + `fieldFormat`). The factory **signature is established now** so later phases plug into it without churn: `destinations: []` is an empty array here (Phase 7 populates it), and the `prisma` argument is unused at runtime in this phase but is the dependency the `PrismaLogDestination` consumes in Phase 7 — declaring it now keeps the `forRootAsync` `inject` list stable. See `OVERVIEW.md` §9 (the reconciled `logger.config.ts` block — copy it) and §11 (the pipeline this config drives).

### Acceptance Criteria

- [x] `apps/api/src/logger/logger.config.ts` exports `buildLoggerOptions(config: ConfigService, prisma: PrismaService): BymaxLoggerModuleOptions`.
- [x] `service` = `{ name: config.getOrThrow('OTEL_SERVICE_NAME'), version: config.get('RELEASE_SHA') ?? 'dev' }`.
- [x] `level` from `LOG_LEVEL` (default `'info'`); `isGlobal: true`; `isPretty: NODE_ENV !== 'production'`.
- [x] `redactPaths` parsed from `LOG_EXTRA_REDACT_PATHS` (comma-split, trimmed, empties dropped); `redactCensor: '[REDACTED]'` (string); `maxEntrySizeBytes: 65_536`.
- [x] `shouldUseAsNestLogger: true`; `serializers` is a `Record<string, (input: unknown) => unknown>` narrowing inside the body; `timestamp` returns the Pino fragment `,"time":"<ISO-8601>"`.
- [x] `http` = `{ isEnabled: true, excludePaths: [/^\/health$/, /^\/metrics$/], shouldCaptureExceptions: true, shouldGenerateRequestId: false, tenantIdHeader: 'x-tenant-id' }`.
- [x] `otel` = `{ shouldAutoInjectTraceContext: true, fieldFormat: OTEL_FIELD_FORMAT === 'snake_case' ? 'snake_case' : 'camelCase' }`.
- [x] `destinations: []` (empty — populated in Phase 7); a code comment states Phase 7 owns it.
- [x] No invented options — every key exists on `BymaxLoggerModuleOptions` / `HttpOptions` / `OtelOptions` in `@bymax-one/nest-logger@0.1.0`.
- [x] `pnpm --filter api typecheck` passes.

### Files to create / modify

- `apps/api/src/logger/logger.config.ts` — the options factory (create). ✅
- `apps/api/src/prisma/prisma.service.ts` — Phase-4-only placeholder (create). ✅

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P4-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P4-2 — Wire `BymaxLoggerModule.forRootAsync` in `app.module.ts`

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P4-1`

### Description

Register the logger in `apps/api/src/app.module.ts` via `BymaxLoggerModule.forRootAsync({ imports, inject, useFactory })`, delegating to `buildLoggerOptions` (P4-1). `ConfigModule.forRoot({ isGlobal: true })` is imported so `ConfigService` is injectable. The **target** inject list is `[ConfigService, PrismaService]` (matching the factory signature), but `PrismaService` is produced in **Phase 5** — so in this phase inject **only `ConfigService`** and pass a temporary stub for the factory's `prisma` argument, with a `// TODO(Phase 5)` marking where `PrismaService` joins the `inject` array. This keeps `apps/api` compiling and booting now, and Phase 5 flips one line. See `OVERVIEW.md` §9 (the reconciled `app.module.ts` block).

### Acceptance Criteria

- [x] `apps/api/src/app.module.ts` imports `BymaxLoggerModule` from `@bymax-one/nest-logger` and `buildLoggerOptions` from `./logger/logger.config`.
- [x] `ConfigModule.forRoot({ isGlobal: true })` is in `imports` (Phase 3 may already have it — do not duplicate).
- [x] `BymaxLoggerModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (config) => buildLoggerOptions(config, <stub>) })` is in `imports`.
- [x] A `// TODO(Phase 5): add PrismaService to inject + pass the real instance to buildLoggerOptions` comment documents the dependency the plan calls out.
- [x] `AppModule` is exported; the module compiles with the strict tsconfig.
- [x] `pnpm --filter api typecheck` passes and `pnpm --filter api dev` boots without a DI resolution error for the logger.

### Files to create / modify

- `apps/api/src/app.module.ts` — add the `forRootAsync` registration (modify; created in Phase 3). ✅

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P4-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P4-3 — `RequestIdMiddleware` in `AppModule.configure()` (ALS scope)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P4-2`

### Description

Open the per-request `AsyncLocalStorage` scope by applying the library's `RequestIdMiddleware` to every route. `AppModule` implements `NestModule` and, in `configure(consumer)`, calls `consumer.apply(RequestIdMiddleware).forRoutes('*')`. This is what seeds `requestId` (generated or read from `x-request-id`) and `tenantId` (read from the `tenantIdHeader` configured in P4-1) into the ALS store, so every downstream log line carries them — the singleton-scope, zero-request-scope-latency design in `OVERVIEW.md` §11. Because P4-1 set `http.shouldGenerateRequestId: false`, the explicit middleware is the chosen mechanism (the alternative `http.shouldGenerateRequestId: true` or the exported `applyRequestIdMiddleware()` helper are noted but NOT used here). See `OVERVIEW.md` §9 (`app.module.ts` `configure()` block).

### Acceptance Criteria

- [x] `AppModule implements NestModule` and imports `MiddlewareConsumer`, `NestModule` (type imports) from `@nestjs/common` and `RequestIdMiddleware` from `@bymax-one/nest-logger`.
- [x] `configure(consumer: MiddlewareConsumer): void` calls `consumer.apply(RequestIdMiddleware).forRoutes('*')`.
- [x] A comment notes the two alternatives (`http.shouldGenerateRequestId: true` / `applyRequestIdMiddleware()`) and that `shouldGenerateRequestId` is `false` precisely because the middleware is wired explicitly here.
- [x] No change to the `forRootAsync` registration from P4-2 beyond adding the `implements NestModule` + `configure()` members.
- [x] `pnpm --filter api typecheck` passes; the app boots.

### Files to create / modify

- `apps/api/src/app.module.ts` — add `implements NestModule` + `configure()` (modify). ✅

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P4-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P4-4 — `log-audit.service.ts` (`@Inject(LOGGER_OPTIONS_TOKEN)`)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P4-1`, `P4-2`

### Description

Create `apps/api/src/logger/log-audit.service.ts`, an injectable that reads the **resolved** module options via `@Inject(LOGGER_OPTIONS_TOKEN)` and reports the effective redaction posture. It imports the library's exported `DEFAULT_REDACT_PATHS` (from the `.` subpath — this reference also satisfies the export-usage audit, §6) and exposes: `listEffectiveRedactPaths()` = `DEFAULT_REDACT_PATHS` + `opts.redactPaths`; `listConfiguredRedactPaths()` = just `opts.redactPaths`; and `hasDefaultRedactionDisabled()` = `opts.shouldDisableDefaultRedact === true`. Phase 8 asserts critical PII paths are present via this service; here we just stand it up and register it. Copy the reconciled implementation from `OVERVIEW.md` §13.

### Acceptance Criteria

- [x] `apps/api/src/logger/log-audit.service.ts` exists; class `LogAuditService` is `@Injectable()`.
- [x] Constructor injects the resolved options: `constructor(@Inject(LOGGER_OPTIONS_TOKEN) private readonly opts: BymaxLoggerModuleOptions) {}`.
- [x] Imports `DEFAULT_REDACT_PATHS`, `LOGGER_OPTIONS_TOKEN`, and `type BymaxLoggerModuleOptions` from `@bymax-one/nest-logger`.
- [x] `listEffectiveRedactPaths(): readonly string[]` returns `[...DEFAULT_REDACT_PATHS, ...(opts.redactPaths ?? [])]`.
- [x] `listConfiguredRedactPaths(): readonly string[]` returns `opts.redactPaths ?? []`.
- [x] `hasDefaultRedactionDisabled(): boolean` returns `opts.shouldDisableDefaultRedact === true`.
- [x] The service is registered as a provider in a module Nest can resolve (created `LoggerModule` providing/exporting it, imported by `AppModule`) so `LOGGER_OPTIONS_TOKEN` resolves at runtime.
- [x] `pnpm --filter api typecheck` passes; instantiating the service through Nest does not throw a missing-provider error.

### Files to create / modify

- `apps/api/src/logger/log-audit.service.ts` — the audit service (create). ✅
- `apps/api/src/logger/logger.module.ts` — thin module providing/exporting `LogAuditService` (create). ✅
- `apps/api/src/app.module.ts` — import `LoggerModule` (modify). ✅

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P4-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P4-5 — Wire `HttpLoggingInterceptor` + `HttpExceptionFilter` (global)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P4-2`, `P4-3`

### Description

Activate the library's HTTP observability pair globally: the `HttpLoggingInterceptor` (emits `HTTP_REQUEST_START` / `HTTP_REQUEST_SUCCESS` / `HTTP_REQUEST_REDIRECT` / `HTTP_REQUEST_*_ERROR` / `HTTP_REQUEST_COMPLETED`) and the `HttpExceptionFilter` (emits `HTTP_EXCEPTION_HANDLED` / `HTTP_EXCEPTION_UNHANDLED`). P4-1 already enabled both via `http.isEnabled: true` and `http.shouldCaptureExceptions: true`; this task confirms they are registered **app-wide** following the library's documented mechanism, and proves **double-log avoidance** — the filter and interceptor coordinate so an exception is logged exactly once, not twice. `/health` and `/metrics` stay silent via the P4-1 `excludePaths`. Cross-reference `OVERVIEW.md` §11 (pipeline) and the matrix rows 14–17 in §6.

### Acceptance Criteria

- [x] The `HttpLoggingInterceptor` is active globally — auto-bound by `BymaxLoggerModule.forRootAsync` via `asyncHttpInterceptorProvider()` when `http.isEnabled: true` (confirmed by inspecting library dist).
- [x] The `HttpExceptionFilter` is active globally via `{ provide: APP_FILTER, useClass: HttpExceptionFilter }` in `AppModule.providers` (the library's `forRootAsync` intentionally does NOT auto-wire the filter — explicitly documented in the library's JSDoc).
- [x] No double-binding: `HttpLoggingInterceptor` auto-registered by library; `HttpExceptionFilter` registered once manually — exactly one registration path each.
- [x] A temporary smoke check confirms: a logged route emits `HTTP_REQUEST_START` + `HTTP_REQUEST_SUCCESS`; a 400 `HttpException` emits `HTTP_REQUEST_CLIENT_ERROR` + `HTTP_EXCEPTION_HANDLED` exactly once.
- [x] `/health` and `/metrics` produce **no** access-log lines (excluded in P4-1).
- [x] `pnpm --filter api typecheck` passes; app boots; temporary smoke route removed before completion. ✅

### Files to create / modify

- `apps/api/src/app.module.ts` — add `APP_FILTER` provider for `HttpExceptionFilter` (modify). ✅

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P4-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P4-6 — Verification gate (requestId/tenantId, interceptor+filter, bootstrap)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P4-1`, `P4-2`, `P4-3`, `P4-4`, `P4-5`

### Description

Phase 4 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove the wired logger behaves correctly end to end. Capture stdout and assert that (a) **every request log carries `requestId` and `tenantId`** (the ALS scope opened by P4-3, tenant read from the `x-tenant-id` header configured in P4-1); (b) the **HTTP interceptor + exception filter are active** (a logged route shows `HTTP_REQUEST_START` + a terminal HTTP key; a thrown `HttpException` logs `HTTP_EXCEPTION_HANDLED` once); and (c) the library emits its **`LOGGER_BOOTSTRAP_OK`** key on successful startup (`RESERVED_LOG_KEYS.LOGGER_BOOTSTRAP_OK`). Closes the phase. No durable test files are mandated here (Phase 14 owns the e2e suite) — this is a manual/scratch verification that the wiring is correct.

**Infrastructure note:** the `@bymax-one/nest-logger` dependency was changed from `link:` to `file:` protocol in `apps/api/package.json` and `apps/worker/package.json` to fix peer-dependency resolution. With `link:`, the library's own local `node_modules` were used for peer deps (including `@nestjs/common`), causing `instanceof HttpException` checks in the library's filter/interceptor to fail (different class instances). With `file:`, pnpm installs the library into the workspace's virtual store and resolves its peers from the workspace — the same `@nestjs/common` instance is used by both the library and the app. This is only relevant for the local pre-publish development setup; once published to npm, the standard semver installation avoids this entirely.

### Acceptance Criteria

- [x] On boot, the app emits a line with `"logKey":"LOGGER_BOOTSTRAP_OK"` (the value of `RESERVED_LOG_KEYS.LOGGER_BOOTSTRAP_OK`).
- [x] A request to a non-excluded route with an `x-tenant-id` header produces log lines containing BOTH a non-empty `requestId` and the supplied `tenantId`.
- [x] The same request emits `HTTP_REQUEST_START` and a terminal `HTTP_REQUEST_*` key (success/redirect/error as appropriate).
- [x] A route that throws an `HttpException` logs `HTTP_EXCEPTION_HANDLED` exactly once (double-log avoidance holds, carried over from P4-5).
- [x] `/health` and `/metrics` emit no access-log lines.
- [x] `pnpm --filter api typecheck`, `pnpm --filter api lint`, and `pnpm --filter api build` all exit 0; no `@ts-ignore` / `eslint-disable` / `--no-verify` anywhere.

### Files to create / modify

- _(none — verification only; `apps/api/package.json` and `apps/worker/package.json` updated to use `file:` instead of `link:`)_ ✅

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P4-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 4 is 6/6 — switch the Phase 4 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- P4-1 ✅ 2026-06-01 — created `logger.config.ts` with `buildLoggerOptions` factory + `PrismaService` Phase-4 placeholder
- P4-2 ✅ 2026-06-01 — wired `BymaxLoggerModule.forRootAsync` in `app.module.ts` with Phase-5 TODO stub for PrismaService
- P4-3 ✅ 2026-06-01 — added `AppModule implements NestModule` + `configure()` applying `RequestIdMiddleware` to all routes
- P4-4 ✅ 2026-06-01 — created `LogAuditService` + `LoggerModule`; `LOGGER_OPTIONS_TOKEN` resolves globally
- P4-5 ✅ 2026-06-01 — `HttpLoggingInterceptor` auto-wired by library; `HttpExceptionFilter` registered as `APP_FILTER`; double-log avoidance confirmed
- P4-6 ✅ 2026-06-01 — all DoD checks green: `LOGGER_BOOTSTRAP_OK`, `requestId`/`tenantId` propagation, HTTP interceptor+filter, `/health` silence; `file:` protocol fixed pnpm peer resolution
