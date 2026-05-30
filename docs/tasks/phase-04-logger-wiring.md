# Phase 4 — Logger Wiring — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-4--logger-wiring) §Phase 4
> **Total tasks:** 6
> **Progress:** 🔴 0 / 6 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                                | Status | Priority | Size | Depends on             |
| ----- | ------------------------------------------------------------------- | ------ | -------- | ---- | ---------------------- |
| P4-1  | `logger.config.ts` — `buildLoggerOptions(config, prisma)` factory   | 🔴     | High     | M    | —                      |
| P4-2  | Wire `BymaxLoggerModule.forRootAsync` in `app.module.ts`            | 🔴     | High     | S    | P4-1                   |
| P4-3  | `RequestIdMiddleware` in `AppModule.configure()` (ALS scope)        | 🔴     | High     | S    | P4-2                   |
| P4-4  | `log-audit.service.ts` (`@Inject(LOGGER_OPTIONS_TOKEN)`)            | 🔴     | High     | S    | P4-1, P4-2             |
| P4-5  | Wire `HttpLoggingInterceptor` + `HttpExceptionFilter` (global)      | 🔴     | High     | M    | P4-2, P4-3             |
| P4-6  | Verification gate (requestId/tenantId, interceptor+filter, bootstrap)| 🔴     | High     | S    | P4-1..P4-5             |

---

## P4-1 — `logger.config.ts` — `buildLoggerOptions(config, prisma)` factory

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `—`

### Description

Create `apps/api/src/logger/logger.config.ts`, the **single source of truth** for `BymaxLoggerModuleOptions`. The exported `buildLoggerOptions(config, prisma)` factory maps the Zod-validated env (Phase 3) into the library's options object: `service`, `level`, `isPretty`, `redactPaths` (merged with the 97 defaults), `redactCensor: '[REDACTED]'`, `maxEntrySizeBytes`, `serializers`, `timestamp`, an `http` block (with anchored `excludePaths`), and an `otel` block (`shouldAutoInjectTraceContext: true` + `fieldFormat`). The factory **signature is established now** so later phases plug into it without churn: `destinations: []` is an empty array here (Phase 7 populates it), and the `prisma` argument is unused at runtime in this phase but is the dependency the `PrismaLogDestination` consumes in Phase 7 — declaring it now keeps the `forRootAsync` `inject` list stable. See `OVERVIEW.md` §9 (the reconciled `logger.config.ts` block — copy it) and §11 (the pipeline this config drives).

### Acceptance Criteria

- [ ] `apps/api/src/logger/logger.config.ts` exports `buildLoggerOptions(config: ConfigService, prisma: PrismaService): BymaxLoggerModuleOptions`.
- [ ] `service` = `{ name: config.getOrThrow('OTEL_SERVICE_NAME'), version: config.get('RELEASE_SHA') ?? 'dev' }`.
- [ ] `level` from `LOG_LEVEL` (default `'info'`); `isGlobal: true`; `isPretty: NODE_ENV !== 'production'`.
- [ ] `redactPaths` parsed from `LOG_EXTRA_REDACT_PATHS` (comma-split, trimmed, empties dropped); `redactCensor: '[REDACTED]'` (string); `maxEntrySizeBytes: 65_536`.
- [ ] `shouldUseAsNestLogger: true`; `serializers` is a `Record<string, (input: unknown) => unknown>` narrowing inside the body; `timestamp` returns the Pino fragment `,"time":"<ISO-8601>"`.
- [ ] `http` = `{ isEnabled: true, excludePaths: [/^\/health$/, /^\/metrics$/], shouldCaptureExceptions: true, shouldGenerateRequestId: false, tenantIdHeader: 'x-tenant-id' }`.
- [ ] `otel` = `{ shouldAutoInjectTraceContext: true, fieldFormat: OTEL_FIELD_FORMAT === 'snake_case' ? 'snake_case' : 'camelCase' }`.
- [ ] `destinations: []` (empty — populated in Phase 7); a code comment states Phase 7 owns it.
- [ ] No invented options — every key exists on `BymaxLoggerModuleOptions` / `HttpOptions` / `OtelOptions` in `@bymax-one/nest-logger@0.1.0`.
- [ ] `pnpm --filter api typecheck` passes.

### Files to create / modify

- `apps/api/src/logger/logger.config.ts` — the options factory (create).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer wiring `@bymax-one/nest-logger@0.1.0` into its reference app.
> Context: Task P4-1 of `docs/DEVELOPMENT_PLAN.md` §Phase 4 (Logger Wiring). This is the canonical options factory described in `docs/OVERVIEW.md` §9 (the block is already reconciled to the shipped `0.1.0` types — copy it faithfully) and §11 (the pipeline). The Zod env schema + `ConfigModule` come from Phase 3. `PrismaService` arrives in Phase 5; you only declare the parameter now (type-import it), you do **not** use it at runtime this phase. `destinations[]` is populated in Phase 7.
> Objective: Produce `apps/api/src/logger/logger.config.ts` exporting `buildLoggerOptions(config, prisma): BymaxLoggerModuleOptions`.
> Steps:
>
> 1. Create the file with type-only imports for the config + library options + the future Prisma service:
>    ```typescript
>    import type { ConfigService } from '@nestjs/config'
>    import type { BymaxLoggerModuleOptions } from '@bymax-one/nest-logger'
>    import type { PrismaService } from '../prisma/prisma.service'
>    ```
>    (`PrismaService` does not exist until Phase 5 — if its file is absent, create a minimal placeholder `apps/api/src/prisma/prisma.service.ts` exporting an empty `@Injectable() class PrismaService {}` ONLY to satisfy the type import, and leave a `// TODO(Phase 5)` note. Do NOT implement Prisma here.)
> 2. Parse the extra redact paths and the prod flag, then return the options object EXACTLY as the reconciled `OVERVIEW.md` §9 block specifies:
>    ```typescript
>    export function buildLoggerOptions(
>      config: ConfigService,
>      prisma: PrismaService,
>    ): BymaxLoggerModuleOptions {
>      const isProd = config.get('NODE_ENV') === 'production'
>      const extraPaths = (config.get<string>('LOG_EXTRA_REDACT_PATHS') ?? '')
>        .split(',')
>        .map((p) => p.trim())
>        .filter(Boolean)
>
>      return {
>        service: {
>          name: config.getOrThrow<string>('OTEL_SERVICE_NAME'),
>          version: config.get<string>('RELEASE_SHA') ?? 'dev',
>        },
>        level: config.get<string>('LOG_LEVEL') ?? 'info',
>        isGlobal: true,
>        isPretty: !isProd, // PrettyDevDestination in dev, JSON in prod
>        redactPaths: extraPaths, // merged with the 97 defaults
>        redactCensor: '[REDACTED]', // public type: string ONLY (no censor function in 0.1.0)
>        maxEntrySizeBytes: 65_536,
>        shouldUseAsNestLogger: true, // self-bridge the NestJS logger (default true; explicit here)
>        serializers: {
>          // Record<string, (input: unknown) => unknown> — narrow inside the body (strictFunctionTypes).
>          upstreamError: (e) => {
>            const err = e as { status?: number; code?: string }
>            return { status: err.status, code: err.code }
>          },
>        },
>        timestamp: () => `,"time":"${new Date().toISOString()}"`, // Pino timestamp fn (ISO-8601 UTC)
>        http: {
>          isEnabled: true,
>          excludePaths: [/^\/health$/, /^\/metrics$/], // RegExp[] — anchored, ReDoS-safe
>          shouldCaptureExceptions: true, // pair the HttpExceptionFilter with the interceptor
>          shouldGenerateRequestId: false, // we wire RequestIdMiddleware ourselves (P4-3)
>          tenantIdHeader: 'x-tenant-id', // resolve tenantId into the ALS scope from this header
>        },
>        otel: {
>          shouldAutoInjectTraceContext: true, // detect @opentelemetry/api → inject traceId/spanId/traceFlags
>          fieldFormat:
>            config.get('OTEL_FIELD_FORMAT') === 'snake_case' ? 'snake_case' : 'camelCase',
>        },
>        destinations: [], // EMPTY here — Phase 7 (P7-*) pushes Loki/Prisma/RollingFile into this array.
>      }
>    }
>    ```
> 3. The `prisma` parameter is intentionally unused this phase. Do NOT delete it (Phase 7 needs it for `new PrismaLogDestination(prisma, …)`). If ESLint `no-unused-vars` trips, prefix the JSDoc with an explanatory line — do NOT add `eslint-disable`; instead reference it harmlessly, e.g. `void prisma` with a `// retained for Phase 7 PrismaLogDestination` comment, or rely on the `args: 'after-used'` default (a used `config` before an unused trailing `prisma` is allowed by the default `@typescript-eslint/no-unused-vars`).
>    Constraints:
>
> - Use ONLY options that exist on `BymaxLoggerModuleOptions`, `HttpOptions`, `OtelOptions` in `@bymax-one/nest-logger@0.1.0`. `HttpOptions` has NO `slowThresholdMs` and NO `userIdResolver`; `redactCensor` is a STRING only. Never invent an option.
> - `excludePaths` MUST be `RegExp[]` (anchored), NOT `string[]`.
> - English-only comments; boolean-ish keys keep the library's `is`/`should` prefixes.
> - Do NOT wire `destinations` here, and do NOT implement Prisma — those are Phases 7 and 5.
>   Verification:
>
> - `pnpm --filter api typecheck` — expected: exit 0 (the object satisfies `BymaxLoggerModuleOptions`).
> - `pnpm --filter api lint` — expected: exit 0 (no `eslint-disable`, no `@ts-ignore`).

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

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P4-1`

### Description

Register the logger in `apps/api/src/app.module.ts` via `BymaxLoggerModule.forRootAsync({ imports, inject, useFactory })`, delegating to `buildLoggerOptions` (P4-1). `ConfigModule.forRoot({ isGlobal: true })` is imported so `ConfigService` is injectable. The **target** inject list is `[ConfigService, PrismaService]` (matching the factory signature), but `PrismaService` is produced in **Phase 5** — so in this phase inject **only `ConfigService`** and pass a temporary stub for the factory's `prisma` argument, with a `// TODO(Phase 5)` marking where `PrismaService` joins the `inject` array. This keeps `apps/api` compiling and booting now, and Phase 5 flips one line. See `OVERVIEW.md` §9 (the reconciled `app.module.ts` block).

### Acceptance Criteria

- [ ] `apps/api/src/app.module.ts` imports `BymaxLoggerModule` from `@bymax-one/nest-logger` and `buildLoggerOptions` from `./logger/logger.config`.
- [ ] `ConfigModule.forRoot({ isGlobal: true })` is in `imports` (Phase 3 may already have it — do not duplicate).
- [ ] `BymaxLoggerModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (config) => buildLoggerOptions(config, <stub>) })` is in `imports`.
- [ ] A `// TODO(Phase 5): add PrismaService to inject + pass the real instance to buildLoggerOptions` comment documents the dependency the plan calls out.
- [ ] `AppModule` is exported; the module compiles with the strict tsconfig.
- [ ] `pnpm --filter api typecheck` passes and `pnpm --filter api dev` boots without a DI resolution error for the logger.

### Files to create / modify

- `apps/api/src/app.module.ts` — add the `forRootAsync` registration (modify; created in Phase 3).

### Agent Execution Prompt

> Role: Senior NestJS engineer.
> Context: Task P4-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 4. The reconciled wiring is in `docs/OVERVIEW.md` §9 (`app.module.ts` block). The plan explicitly notes: the FINAL `inject` is `[ConfigService, PrismaService]`, but `PrismaService` comes from **Phase 5** — until then inject ONLY `ConfigService`. `buildLoggerOptions` (P4-1) already accepts `(config, prisma)`; this phase passes a stub for `prisma`.
> Objective: Register `BymaxLoggerModule.forRootAsync` in `apps/api/src/app.module.ts`.
> Steps:
>
> 1. Ensure `ConfigModule.forRoot({ isGlobal: true })` is present (from Phase 3). Add the logger registration:
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { ConfigModule, ConfigService } from '@nestjs/config'
>    import { BymaxLoggerModule } from '@bymax-one/nest-logger'
>    import { buildLoggerOptions } from './logger/logger.config'
>    import { PrismaService } from './prisma/prisma.service' // placeholder until Phase 5
>
>    @Module({
>      imports: [
>        ConfigModule.forRoot({ isGlobal: true }),
>        BymaxLoggerModule.forRootAsync({
>          imports: [ConfigModule],
>          // TODO(Phase 5): add PrismaService here and pass the real instance below.
>          inject: [ConfigService],
>          useFactory: (config: ConfigService) =>
>            // Phase 5 swaps the stub for the injected PrismaService.
>            buildLoggerOptions(config, new PrismaService()),
>        }),
>        // ...feature modules added in later phases
>      ],
>    })
>    export class AppModule {}
>    ```
>    (If the Phase-5 `PrismaService` placeholder created in P4-1 is an empty `@Injectable()`, `new PrismaService()` is a harmless no-op stub. When Phase 5 lands, change `inject` to `[ConfigService, PrismaService]` and `useFactory` to `(config, prisma) => buildLoggerOptions(config, prisma)`.)
> 2. The `NestModule`/`configure()` middleware wiring is added in P4-3 — do NOT add it here; keep this task focused on the module registration.
>    Constraints:
>
> - API surface is ONLY `BymaxLoggerModule.forRootAsync({ imports, inject, useFactory })` — those are the exact keys in `@bymax-one/nest-logger@0.1.0`. Do NOT pass options the module does not accept.
> - Do NOT introduce `PrismaService` into the `inject` array this phase (it isn't provided yet — that would break DI). Leave the documented TODO.
> - Do NOT register `RequestIdMiddleware`, the interceptor, or the filter here (P4-3 / P4-5).
>   Verification:
>
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api dev` — expected: boots; Nest logs the module init with no "Nest can't resolve dependencies of the LOGGER…" error.

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

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P4-2`

### Description

Open the per-request `AsyncLocalStorage` scope by applying the library's `RequestIdMiddleware` to every route. `AppModule` implements `NestModule` and, in `configure(consumer)`, calls `consumer.apply(RequestIdMiddleware).forRoutes('*')`. This is what seeds `requestId` (generated or read from `x-request-id`) and `tenantId` (read from the `tenantIdHeader` configured in P4-1) into the ALS store, so every downstream log line carries them — the singleton-scope, zero-request-scope-latency design in `OVERVIEW.md` §11. Because P4-1 set `http.shouldGenerateRequestId: false`, the explicit middleware is the chosen mechanism (the alternative `http.shouldGenerateRequestId: true` or the exported `applyRequestIdMiddleware()` helper are noted but NOT used here). See `OVERVIEW.md` §9 (`app.module.ts` `configure()` block).

### Acceptance Criteria

- [ ] `AppModule implements NestModule` and imports `MiddlewareConsumer`, `NestModule` (type imports) from `@nestjs/common` and `RequestIdMiddleware` from `@bymax-one/nest-logger`.
- [ ] `configure(consumer: MiddlewareConsumer): void` calls `consumer.apply(RequestIdMiddleware).forRoutes('*')`.
- [ ] A comment notes the two alternatives (`http.shouldGenerateRequestId: true` / `applyRequestIdMiddleware()`) and that `shouldGenerateRequestId` is `false` precisely because the middleware is wired explicitly here.
- [ ] No change to the `forRootAsync` registration from P4-2 beyond adding the `implements NestModule` + `configure()` members.
- [ ] `pnpm --filter api typecheck` passes; the app boots.

### Files to create / modify

- `apps/api/src/app.module.ts` — add `implements NestModule` + `configure()` (modify).

### Agent Execution Prompt

> Role: Senior NestJS engineer.
> Context: Task P4-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 4. The plan deliverable is `consumer.apply(RequestIdMiddleware).forRoutes('*')` in `configure()`, which opens the ALS scope (`requestId`/`tenantId`). The reconciled block is in `docs/OVERVIEW.md` §9. P4-1 set `http.shouldGenerateRequestId: false`, so the explicit middleware is the active mechanism.
> Objective: Make `AppModule` apply `RequestIdMiddleware` to all routes.
> Steps:
>
> 1. Extend the `app.module.ts` from P4-2 to implement `NestModule`:
>    ```typescript
>    import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
>    import { ConfigModule, ConfigService } from '@nestjs/config'
>    import { BymaxLoggerModule, RequestIdMiddleware } from '@bymax-one/nest-logger'
>    import { buildLoggerOptions } from './logger/logger.config'
>    import { PrismaService } from './prisma/prisma.service'
>
>    @Module({
>      imports: [
>        ConfigModule.forRoot({ isGlobal: true }),
>        BymaxLoggerModule.forRootAsync({
>          imports: [ConfigModule],
>          inject: [ConfigService], // TODO(Phase 5): + PrismaService
>          useFactory: (config: ConfigService) => buildLoggerOptions(config, new PrismaService()),
>        }),
>      ],
>    })
>    export class AppModule implements NestModule {
>      configure(consumer: MiddlewareConsumer): void {
>        // Opens the ALS scope (requestId / tenantId) per request. Alternatives NOT used here:
>        // set `http.shouldGenerateRequestId: true` in the module options, or call the exported
>        // `applyRequestIdMiddleware()` helper. We wire the middleware explicitly, hence
>        // `shouldGenerateRequestId: false` in logger.config.ts (P4-1).
>        consumer.apply(RequestIdMiddleware).forRoutes('*')
>      }
>    }
>    ```
> 2. Keep everything else from P4-2 intact (the `forRootAsync` block + the Phase-5 TODO).
>    Constraints:
>
> - Use `RequestIdMiddleware` exactly as exported by `@bymax-one/nest-logger@0.1.0`. Do NOT hand-roll a request-id middleware.
> - `forRoutes('*')` (all routes) — the `http.excludePaths` regexes from P4-1 govern which routes are *access-logged*, not which open an ALS scope; every route still gets a `requestId`.
> - Do NOT set `shouldGenerateRequestId: true` (that would double-wire request-id generation).
>   Verification:
>
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api dev` then `curl -s -D - http://localhost:3000/health -o /dev/null` — expected: 200 (later phases assert the propagated `requestId` on a logged route; `/health` is excluded from access logs but still scoped).

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

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P4-1`, `P4-2`

### Description

Create `apps/api/src/logger/log-audit.service.ts`, an injectable that reads the **resolved** module options via `@Inject(LOGGER_OPTIONS_TOKEN)` and reports the effective redaction posture. It imports the library's exported `DEFAULT_REDACT_PATHS` (from the `.` subpath — this reference also satisfies the export-usage audit, §6) and exposes: `listEffectiveRedactPaths()` = `DEFAULT_REDACT_PATHS` + `opts.redactPaths`; `listConfiguredRedactPaths()` = just `opts.redactPaths`; and `hasDefaultRedactionDisabled()` = `opts.shouldDisableDefaultRedact === true`. Phase 8 asserts critical PII paths are present via this service; here we just stand it up and register it. Copy the reconciled implementation from `OVERVIEW.md` §13.

### Acceptance Criteria

- [ ] `apps/api/src/logger/log-audit.service.ts` exists; class `LogAuditService` is `@Injectable()`.
- [ ] Constructor injects the resolved options: `constructor(@Inject(LOGGER_OPTIONS_TOKEN) private readonly opts: BymaxLoggerModuleOptions) {}`.
- [ ] Imports `DEFAULT_REDACT_PATHS`, `LOGGER_OPTIONS_TOKEN`, and `type BymaxLoggerModuleOptions` from `@bymax-one/nest-logger`.
- [ ] `listEffectiveRedactPaths(): readonly string[]` returns `[...DEFAULT_REDACT_PATHS, ...(opts.redactPaths ?? [])]`.
- [ ] `listConfiguredRedactPaths(): readonly string[]` returns `opts.redactPaths ?? []`.
- [ ] `hasDefaultRedactionDisabled(): boolean` returns `opts.shouldDisableDefaultRedact === true`.
- [ ] The service is registered as a provider in a module Nest can resolve (e.g. a `LoggerModule` providing/exporting it, imported by `AppModule`, OR added to `AppModule` providers) so `LOGGER_OPTIONS_TOKEN` resolves at runtime.
- [ ] `pnpm --filter api typecheck` passes; instantiating the service through Nest does not throw a missing-provider error.

### Files to create / modify

- `apps/api/src/logger/log-audit.service.ts` — the audit service (create).
- `apps/api/src/logger/logger.module.ts` _(optional)_ — a thin module providing/exporting `LogAuditService` (create if you prefer module encapsulation over `AppModule` providers).
- `apps/api/src/app.module.ts` — provide/import `LogAuditService` (modify).

### Agent Execution Prompt

> Role: Senior NestJS engineer.
> Context: Task P4-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 4. The reconciled implementation is in `docs/OVERVIEW.md` §13 — copy it. The service injects the resolved options through `@Inject(LOGGER_OPTIONS_TOKEN)` and references `DEFAULT_REDACT_PATHS` (a real `.`-subpath export — referencing it also feeds the §6 export-usage audit). Phase 8 builds the CI gate on top; this phase only stands the service up and registers it.
> Objective: Produce `apps/api/src/logger/log-audit.service.ts` and register it.
> Steps:
>
> 1. Create the service exactly as the `OVERVIEW.md` §13 block:
>    ```typescript
>    import { Inject, Injectable } from '@nestjs/common'
>    import {
>      DEFAULT_REDACT_PATHS,
>      LOGGER_OPTIONS_TOKEN,
>      type BymaxLoggerModuleOptions,
>    } from '@bymax-one/nest-logger'
>
>    @Injectable()
>    export class LogAuditService {
>      constructor(
>        @Inject(LOGGER_OPTIONS_TOKEN) private readonly opts: BymaxLoggerModuleOptions,
>      ) {}
>
>      /** Effective redact paths = the library's exported defaults + the app-supplied extensions. */
>      listEffectiveRedactPaths(): readonly string[] {
>        return [...DEFAULT_REDACT_PATHS, ...(this.opts.redactPaths ?? [])]
>      }
>
>      /** Just the app-supplied extra redact paths merged on top of the library defaults. */
>      listConfiguredRedactPaths(): readonly string[] {
>        return this.opts.redactPaths ?? []
>      }
>
>      /** Whether the dangerous opt-out is active (should only ever be true in a test module). */
>      hasDefaultRedactionDisabled(): boolean {
>        return this.opts.shouldDisableDefaultRedact === true
>      }
>    }
>    ```
> 2. Register it so `LOGGER_OPTIONS_TOKEN` resolves. Because `BymaxLoggerModule` is global (`isGlobal: true`, P4-1) the token is available app-wide, so the simplest path is adding `LogAuditService` to `AppModule`'s `providers`. Optionally create `apps/api/src/logger/logger.module.ts` that `providers: [LogAuditService]` + `exports: [LogAuditService]`, imported by `AppModule` — pick one and keep it consistent.
> 3. Do NOT add the Phase-8 assertions/e2e here; just make the service injectable and resolvable.
>    Constraints:
>
> - Inject the options with the real token `LOGGER_OPTIONS_TOKEN` from `@bymax-one/nest-logger@0.1.0` — do NOT fabricate a token name.
> - `DEFAULT_REDACT_PATHS` MUST be imported from the `.` subpath (it is a public export in `0.1.0`); referencing it is required by the export-usage audit.
> - English-only JSDoc; no `eslint-disable`.
>   Verification:
>
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api dev` — expected: boots; resolving `LogAuditService` does not raise "Nest can't resolve dependencies … LOGGER_OPTIONS_TOKEN". (A quick way: temporarily inject it into an existing controller's ctor and hit a route, or rely on Phase 8's test — do NOT leave debug wiring behind.)

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

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P4-2`, `P4-3`

### Description

Activate the library's HTTP observability pair globally: the `HttpLoggingInterceptor` (emits `HTTP_REQUEST_START` / `HTTP_REQUEST_SUCCESS` / `HTTP_REQUEST_REDIRECT` / `HTTP_REQUEST_*_ERROR` / `HTTP_REQUEST_COMPLETED`) and the `HttpExceptionFilter` (emits `HTTP_EXCEPTION_HANDLED` / `HTTP_EXCEPTION_UNHANDLED`). P4-1 already enabled both via `http.isEnabled: true` and `http.shouldCaptureExceptions: true`; this task confirms they are registered **app-wide** following the library's documented mechanism, and proves **double-log avoidance** — the filter and interceptor coordinate (the library's internal `__bymax_logger_handled` flag) so an exception is logged exactly once, not twice. `/health` and `/metrics` stay silent via the P4-1 `excludePaths`. Cross-reference `OVERVIEW.md` §11 (pipeline) and the matrix rows 14–17 in §6.

### Acceptance Criteria

- [ ] The `HttpLoggingInterceptor` is active globally (whichever registration the library prescribes for `0.1.0`: enabled through `http.isEnabled: true` and auto-bound by `BymaxLoggerModule`, OR bound as an `APP_INTERCEPTOR` provider — use the library's actual mechanism, do not duplicate-bind).
- [ ] The `HttpExceptionFilter` is active globally (via `http.shouldCaptureExceptions: true` auto-binding, OR an `APP_FILTER` provider — match the library's mechanism; do not bind twice).
- [ ] No double-binding: if `http.isEnabled` / `shouldCaptureExceptions` already auto-register them, do NOT also add `APP_INTERCEPTOR`/`APP_FILTER` (and vice-versa) — exactly one registration path is used.
- [ ] A temporary smoke check shows a request to a logged route emits `HTTP_REQUEST_START` + a terminal HTTP key, and a thrown `HttpException` logs `HTTP_EXCEPTION_HANDLED` **once** (no duplicate line).
- [ ] `/health` and `/metrics` produce **no** access-log lines (excluded in P4-1).
- [ ] `pnpm --filter api typecheck` passes; app boots; any temporary smoke route/handler added for the check is removed before completion.

### Files to create / modify

- `apps/api/src/app.module.ts` — bind the interceptor/filter IF the library requires explicit `APP_INTERCEPTOR`/`APP_FILTER` providers (modify; otherwise no change beyond P4-1's `http` flags).
- _(reference only)_ `apps/api/src/logger/logger.config.ts` — the `http.isEnabled` / `shouldCaptureExceptions` flags from P4-1 drive this.

### Agent Execution Prompt

> Role: Senior NestJS engineer.
> Context: Task P4-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 4. Deliverable: the `HttpLoggingInterceptor` + `HttpExceptionFilter` are active globally with **double-log avoidance** (the library coordinates them via an internal `__bymax_logger_handled` flag — see `OVERVIEW.md` §6 row 17 and §11). P4-1 already set `http.isEnabled: true` and `http.shouldCaptureExceptions: true`. The HTTP log keys are reserved keys (`HTTP_REQUEST_*`, `HTTP_EXCEPTION_*`) owned by the library.
> Objective: Ensure both HTTP components are globally active exactly once, and verify single-logging.
> Steps:
>
> 1. Determine `@bymax-one/nest-logger@0.1.0`'s registration model for the HTTP interceptor/filter by inspecting the installed package types:
>    ```bash
>    grep -RnoE "Http(Logging|Exception)|APP_(INTERCEPTOR|FILTER)|isEnabled|shouldCaptureExceptions" \
>      node_modules/@bymax-one/nest-logger/dist/server/index.d.ts
>    ```
>    - If `BymaxLoggerModule` auto-registers them when `http.isEnabled` / `http.shouldCaptureExceptions` are true (most likely, given the option names), then NO extra wiring is needed — assert they fire and STOP. Add a brief comment in `app.module.ts` noting they are enabled via the `http` options in `logger.config.ts`.
>    - If the library instead exports `HttpLoggingInterceptor` / `HttpExceptionFilter` classes intended to be bound by the consumer, register them once, app-wide:
>      ```typescript
>      import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
>      import { HttpLoggingInterceptor, HttpExceptionFilter } from '@bymax-one/nest-logger'
>      // inside @Module({ providers: [...] })
>      { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
>      { provide: APP_FILTER, useClass: HttpExceptionFilter },
>      ```
>      Use ONLY whichever single mechanism the package actually requires — never both at once (that double-binds and double-logs).
> 2. Smoke-test double-log avoidance WITHOUT leaving test code behind: spy on stdout in a throwaway e2e or a scratch script — fire a route that throws an `HttpException`, capture stdout, and assert `HTTP_EXCEPTION_HANDLED` appears exactly once and the matching `HTTP_REQUEST_*_ERROR` is consistent (the canonical assertion pattern is in `OVERVIEW.md` §16). Remove the scratch code afterward; the durable e2e lands in Phase 14.
> 3. Confirm `/health` + `/metrics` emit no access logs (driven by `excludePaths` in P4-1).
>    Constraints:
>
> - Exactly ONE registration path. Do NOT bind an interceptor/filter that the library already auto-binds.
> - Do NOT re-implement HTTP logging or the exception filter — use the library's components/behavior only.
> - Do NOT weaken `http.excludePaths`. English-only comments; no `@ts-ignore`.
> - Remove any temporary smoke route/handler/script before marking done (no debug wiring on `main`).
>   Verification:
>
> - `pnpm --filter api typecheck` — expected: exit 0.
> - Throwaway stdout-capture check — expected: a logged route shows `"logKey":"HTTP_REQUEST_START"` + a terminal `HTTP_REQUEST_*` key; an `HttpException` shows `"logKey":"HTTP_EXCEPTION_HANDLED"` exactly once.
> - `curl -s http://localhost:3000/health` while spying stdout — expected: no `HTTP_REQUEST_*` line for `/health`.

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

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P4-1`, `P4-2`, `P4-3`, `P4-4`, `P4-5`

### Description

Phase 4 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove the wired logger behaves correctly end to end. Capture stdout and assert that (a) **every request log carries `requestId` and `tenantId`** (the ALS scope opened by P4-3, tenant read from the `x-tenant-id` header configured in P4-1); (b) the **HTTP interceptor + exception filter are active** (a logged route shows `HTTP_REQUEST_START` + a terminal HTTP key; a thrown `HttpException` logs `HTTP_EXCEPTION_HANDLED` once); and (c) the library emits its **`LOGGER_BOOTSTRAP_OK`** key on successful startup (`RESERVED_LOG_KEYS.LOGGER_BOOTSTRAP_OK`). Closes the phase. No durable test files are mandated here (Phase 14 owns the e2e suite) — this is a manual/scratch verification that the wiring is correct.

### Acceptance Criteria

- [ ] On boot, the app emits a line with `"logKey":"LOGGER_BOOTSTRAP_OK"` (the value of `RESERVED_LOG_KEYS.LOGGER_BOOTSTRAP_OK`).
- [ ] A request to a non-excluded route with an `x-tenant-id` header produces log lines containing BOTH a non-empty `requestId` and the supplied `tenantId`.
- [ ] The same request emits `HTTP_REQUEST_START` and a terminal `HTTP_REQUEST_*` key (success/redirect/error as appropriate).
- [ ] A route that throws an `HttpException` logs `HTTP_EXCEPTION_HANDLED` exactly once (double-log avoidance holds, carried over from P4-5).
- [ ] `/health` and `/metrics` emit no access-log lines.
- [ ] `pnpm --filter api typecheck`, `pnpm --filter api lint`, and `pnpm --filter api build` all exit 0; no `@ts-ignore` / `eslint-disable` / `--no-verify` anywhere.

### Files to create / modify

- _(none — verification only; fix the corresponding earlier task file P4-1..P4-5 if a check fails)_

### Agent Execution Prompt

> Role: Senior NestJS engineer.
> Context: Task P4-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 4. DoD (verbatim from the plan): "every request log carries `requestId`/`tenantId`; HTTP interceptor + exception filter active; `LOGGER_BOOTSTRAP_OK` emitted." The bootstrap key is `RESERVED_LOG_KEYS.LOGGER_BOOTSTRAP_OK` (a `/shared` export). The stdout-capture assertion pattern is in `OVERVIEW.md` §16. Durable e2e tests are Phase 14 — here you only confirm the wiring with a scratch check and then close the phase.
> Objective: Confirm all Phase 4 behaviors and close the phase.
> Steps:
>
> 1. Boot the API (`pnpm --filter api dev`) and confirm the startup line:
>    ```bash
>    # in another shell, or by piping the dev output — look for the reserved bootstrap key:
>    # expect a JSON line containing "logKey":"LOGGER_BOOTSTRAP_OK"
>    ```
>    (The exact string is the value of `RESERVED_LOG_KEYS.LOGGER_BOOTSTRAP_OK` from `@bymax-one/nest-logger/shared` — confirm the literal by `grep -n "LOGGER_BOOTSTRAP_OK" node_modules/@bymax-one/nest-logger/dist/shared/index.d.ts` or the runtime emission.)
> 2. Exercise a non-excluded route with a tenant header and assert context propagation. Since Phase 4 may not yet have demo routes (those are Phase 6), use any always-present route the skeleton exposes, or a throwaway supertest spec mirroring `OVERVIEW.md` §16:
>    ```typescript
>    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>    await request(app.getHttpServer())
>      .get('/some-non-excluded-route')
>      .set('x-tenant-id', 't_acme')
>      .expect(200)
>    const logs = stdout.mock.calls.map((c) => String(c[0])).join('')
>    expect(logs).toContain('"logKey":"HTTP_REQUEST_START"')
>    expect(logs).toMatch(/"requestId":"[^"]+"/) // non-empty requestId present
>    expect(logs).toContain('"tenantId":"t_acme"') // tenant from x-tenant-id header
>    stdout.mockRestore()
>    ```
>    If the skeleton has only `/health` + `/metrics` (both excluded), add a tiny temporary `GET /__wiring-check` controller for the assertion and REMOVE it afterward — do NOT ship it.
> 3. Assert single-logging on an `HttpException` route (reuse the P4-5 check) and that `/health` + `/metrics` are silent.
> 4. Run the typecheck/lint/build gate. If any assertion fails, fix the responsible earlier task (P4-1..P4-5) — do NOT patch around it here and do NOT lower any expectation.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §0 Guiding Principles — no `@ts-ignore`, no `eslint-disable`, no `--no-verify`, no threshold lowering.
> - Do NOT author the full Phase-14 e2e suite here; keep this verification minimal and remove any scratch routes/specs you add for the check.
> - English-only.
>   Verification:
>
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `pnpm --filter api build` — expected: exit 0.
> - Manual/scratch stdout capture — expected: `LOGGER_BOOTSTRAP_OK` on boot; `requestId` + `tenantId` on a logged request; `HTTP_EXCEPTION_HANDLED` once; no logs for `/health` / `/metrics`.

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

- _Phase not started._
