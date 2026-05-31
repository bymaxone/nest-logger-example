# Phase 3 — `apps/api` Skeleton + OTel Bootstrap — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-3--appsapi-skeleton--otel-bootstrap) §Phase 3
> **Total tasks:** 6
> **Progress:** 🔴 0 / 6 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                         | Status | Priority | Size | Depends on                   |
| ---- | ---------------------------------------------------------------------------- | ------ | -------- | ---- | ---------------------------- |
| P3-1 | `apps/api` NestJS 11 app (Express adapter) + `nest-cli.json` + tsconfig(s)   | 🔴     | High     | M    | —                            |
| P3-2 | `src/instrumentation.ts` — OTel `NodeSDK` bootstrap (`export const otelSdk`) | 🔴     | High     | M    | P3-1                         |
| P3-3 | `src/main.ts` — instrumentation-first, `bufferLogs`, bridge, ordered SIGTERM | 🔴     | High     | M    | P3-1, P3-2                   |
| P3-4 | `src/app.module.ts` — minimal (`ConfigModule.forRoot` global)                | 🔴     | High     | S    | P3-1                         |
| P3-5 | `src/config/env.schema.ts` — Zod-validated env + ConfigModule integration    | 🔴     | High     | S    | P3-4                         |
| P3-6 | `src/health/` (`/health`, `/metrics`) + boot/health/trace verification gate  | 🔴     | High     | M    | P3-1, P3-2, P3-3, P3-4, P3-5 |

---

## P3-1 — `apps/api` NestJS 11 App (Express Adapter) + `nest-cli.json` + tsconfig(s)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `—`

### Description

Scaffold the `apps/api` package as a NestJS 11 service on the **Express** HTTP adapter (the library is Express-first; Fastify is a v0.2 concern — see `docs/OVERVIEW.md` §4). This task lays down the package manifest, the Nest CLI descriptor, and the per-app tsconfig(s) that extend the workspace `tsconfig.base.json` from Phase 0. Because NestJS relies on decorator metadata, the **api** tsconfig may add `emitDecoratorMetadata`/`experimentalDecorators` (these belong to the app, never to the base — the Next.js app must not inherit them, per `docs/DEVELOPMENT_PLAN.md` §2 / Phase 0 P0-3). The runtime logger/OTel wiring lands in P3-2..P3-6; this task only proves the package exists and typechecks.

### Acceptance Criteria

- [ ] `apps/api/package.json` exists with `"name": "@nest-logger-example/api"`, `"private": true`, `"type": "module"`, and scripts `dev` (`nest start --watch`), `build` (`nest build`), `start` (`node dist/main.js`), `typecheck` (`tsc --noEmit`).
- [ ] Runtime deps declared: `@nestjs/common@^11`, `@nestjs/core@^11`, `@nestjs/platform-express@^11`, `@nestjs/config@^4`, `express@^5`, `reflect-metadata@^0.2`, `rxjs@^7.8`.
- [ ] Dev deps declared: `@nestjs/cli@^11`, `typescript@^5.9` (root-provided), `@types/node`, `@types/express`.
- [ ] `apps/api/nest-cli.json` sets `"collection": "@nestjs/schematics"`, `"sourceRoot": "src"`, and `"compilerOptions": { "deleteOutDir": true }`.
- [ ] `apps/api/tsconfig.json` extends `../../tsconfig.base.json`, sets `outDir: "./dist"`, `rootDir: "./src"`, `emitDecoratorMetadata: true`, `experimentalDecorators: true`, and `include: ["src/**/*.ts"]`.
- [ ] `apps/api/tsconfig.build.json` extends `./tsconfig.json` and excludes tests (`**/*.spec.ts`, `test`, `dist`).
- [ ] `pnpm install` links the workspace and `pnpm --filter api typecheck` exits 0.

### Files to create / modify

- `apps/api/package.json` — app manifest.
- `apps/api/nest-cli.json` — Nest CLI descriptor.
- `apps/api/tsconfig.json` — app TS config (extends base, decorator metadata).
- `apps/api/tsconfig.build.json` — build-only TS config.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS 11 engineer scaffolding a service in a pnpm workspace.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see `docs/DEVELOPMENT_PLAN.md` §Phase 3 + §2 Global Conventions and `docs/OVERVIEW.md` §5 Repository Layout + §9 Configuration & Environment). This is task P3-1. Phase 0 already produced `/tsconfig.base.json` (strict, ESM, no decorator options) and Phase 2 already declared `@bymax-one/nest-logger` + peer deps in `apps/api`. The library is Express-first (`docs/OVERVIEW.md` §4); use `@nestjs/platform-express`.
> Objective: Create the `apps/api` package skeleton (manifest, Nest CLI descriptor, tsconfigs) so it installs and typechecks. Do NOT add `instrumentation.ts` / `main.ts` / modules yet — later tasks own those.
> Steps:
>
> 1. Create `apps/api/package.json`:
>    ```jsonc
>    {
>      "name": "@nest-logger-example/api",
>      "private": true,
>      "type": "module",
>      "scripts": {
>        "dev": "nest start --watch",
>        "build": "nest build",
>        "start": "node dist/main.js",
>        "typecheck": "tsc --noEmit",
>      },
>      "dependencies": {
>        "@nestjs/common": "^11.0.0",
>        "@nestjs/config": "^4.0.0",
>        "@nestjs/core": "^11.0.0",
>        "@nestjs/platform-express": "^11.0.0",
>        "express": "^5.0.0",
>        "reflect-metadata": "^0.2.0",
>        "rxjs": "^7.8.0",
>      },
>      "devDependencies": {
>        "@nestjs/cli": "^11.0.0",
>        "@types/express": "^5.0.0",
>        "@types/node": "^24.0.0",
>      },
>    }
>    ```
>    Keep the `@bymax-one/nest-logger` + OTel/`pino` entries that Phase 2 added — do NOT remove them; merge the blocks above into the existing `dependencies`/`optionalDependencies`.
> 2. Create `apps/api/nest-cli.json`:
>    ```json
>    {
>      "$schema": "https://json.schemastore.org/nest-cli",
>      "collection": "@nestjs/schematics",
>      "sourceRoot": "src",
>      "compilerOptions": { "deleteOutDir": true }
>    }
>    ```
> 3. Create `apps/api/tsconfig.json` extending the workspace base and adding the decorator options NestJS needs (these live ONLY here, never in `tsconfig.base.json`):
>    ```json
>    {
>      "extends": "../../tsconfig.base.json",
>      "compilerOptions": {
>        "outDir": "./dist",
>        "rootDir": "./src",
>        "module": "NodeNext",
>        "moduleResolution": "NodeNext",
>        "emitDecoratorMetadata": true,
>        "experimentalDecorators": true,
>        "types": ["node"]
>      },
>      "include": ["src/**/*.ts"],
>      "exclude": ["node_modules", "dist"]
>    }
>    ```
> 4. Create `apps/api/tsconfig.build.json`:
>    ```json
>    {
>      "extends": "./tsconfig.json",
>      "exclude": ["node_modules", "dist", "test", "**/*.spec.ts", "**/*.e2e-spec.ts"]
>    }
>    ```
> 5. Run `pnpm install` from the repo root, then `pnpm --filter api typecheck`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions (Node >=24, pnpm 10.8.0, ESM-only, TypeScript 5.9 strict).
> - Express adapter ONLY (`@nestjs/platform-express`); do NOT install `@nestjs/platform-fastify` (that is a v0.2 concern).
> - Do NOT add `emitDecoratorMetadata`/`experimentalDecorators` to `/tsconfig.base.json` — they belong to this app's tsconfig only.
> - Do NOT create `src/main.ts`, `src/instrumentation.ts`, `src/app.module.ts`, or any feature module here; those are P3-2..P3-6.
>   Verification:
> - `pnpm install` — expected: exits 0, links `@nest-logger-example/api` into the workspace.
> - `node -p "require('./apps/api/package.json').name"` — expected: `@nest-logger-example/api`.
> - `pnpm --filter api typecheck` — expected: exits 0 (no source files yet → clean).
> - `pnpm --filter api exec tsc --showConfig -p tsconfig.json` — expected: resolved config shows `experimentalDecorators: true`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P3-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P3-2 — `src/instrumentation.ts` — OTel `NodeSDK` Bootstrap (`export const otelSdk`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P3-1`

### Description

Create `apps/api/src/instrumentation.ts`, the side-effecting OTel bootstrap that **starts the `NodeSDK` before any NestJS code loads** (`docs/OVERVIEW.md` §14 hard rule: if the SDK starts after NestJS is imported, auto-instrumentation cannot patch HTTP/Express/pg and `traceId` silently never appears). The OTel SDK packages are the **consumer's own deps** (`@opentelemetry/sdk-node`, `exporter-trace-otlp-http`, `auto-instrumentations-node`, `resources`, `semantic-conventions`) — the library only **reads** `@opentelemetry/api`. The module exports `otelSdk` so `main.ts` can flush it during the single ordered shutdown, disables the noisy `@opentelemetry/instrumentation-fs`, and deliberately registers **no** `process.exit` / `SIGTERM` handler here (NestJS owns termination — a `process.exit(0)` here would race app shutdown and cut off the final `LokiDestination` flush). Use the §9 `instrumentation.ts` block verbatim as the code basis.

### Acceptance Criteria

- [ ] `apps/api/src/instrumentation.ts` exists and `export const otelSdk` is a `new NodeSDK({ ... })`.
- [ ] Imports come from the consumer-owned OTel SDK packages only: `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`.
- [ ] `resource` built via `resourceFromAttributes` with `ATTR_SERVICE_NAME` ← `OTEL_SERVICE_NAME` (default `nest-logger-example-api`), `ATTR_SERVICE_VERSION` ← `RELEASE_SHA` (default `dev`), and `deployment.environment` ← `NODE_ENV` (default `development`).
- [ ] `traceExporter` is an `OTLPTraceExporter({ url: process.env.OTLP_TRACE_ENDPOINT })`.
- [ ] `instrumentations` uses `getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })`.
- [ ] `otelSdk.start()` is called at module top level (side effect on import).
- [ ] NO `process.exit`, NO `SIGTERM`/`SIGINT` handler, and NO `sdk.shutdown()` call inside this file — a comment documents that NestJS owns termination (shutdown happens in `main.ts`).
- [ ] No `@bymax-one/nest-logger` import in this file (it must load before NestJS).
- [ ] `pnpm --filter api typecheck` exits 0.

### Files to create / modify

- `apps/api/src/instrumentation.ts` — OTel `NodeSDK` bootstrap.

### Agent Execution Prompt

> Role: Senior TypeScript / OpenTelemetry engineer.
> Context: Task P3-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 3. The canonical bootstrap is `docs/OVERVIEW.md` §9 (`apps/api/src/instrumentation.ts` block) and the §14 hard rule ("The OTel SDK must `start()` before any NestJS code loads"). The OTel SDK is the CONSUMER's dependency — the library only reads `@opentelemetry/api`. Phase 2 already installed `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions` in `apps/api`.
> Objective: Create `apps/api/src/instrumentation.ts` exactly as the §9 block, starting the SDK on import and exporting `otelSdk`, with NO termination logic here.
> Steps:
>
> 1. Create `apps/api/src/instrumentation.ts`:
>
>    ```typescript
>    // instrumentation.ts — the FIRST import in main.ts (side-effecting)
>    import { NodeSDK } from '@opentelemetry/sdk-node'
>    import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
>    import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
>    import { resourceFromAttributes } from '@opentelemetry/resources'
>    import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
>
>    export const otelSdk = new NodeSDK({
>      resource: resourceFromAttributes({
>        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-api',
>        [ATTR_SERVICE_VERSION]: process.env.RELEASE_SHA ?? 'dev',
>        'deployment.environment': process.env.NODE_ENV ?? 'development',
>      }),
>      traceExporter: new OTLPTraceExporter({ url: process.env.OTLP_TRACE_ENDPOINT }),
>      instrumentations: [
>        getNodeAutoInstrumentations({
>          '@opentelemetry/instrumentation-fs': { enabled: false }, // noisy in dev
>        }),
>      ],
>    })
>
>    otelSdk.start()
>    // NOTE: no SIGTERM/process.exit here. NestJS owns termination (see main.ts); the SDK
>    // is flushed in an onApplicationShutdown hook so spans drain AFTER the log destinations.
>    // A standalone process.exit(0) here would race app shutdown and cut off the final
>    // LokiDestination flush.
>    ```
>
> 2. Run `pnpm --filter api typecheck`.
>    Constraints:
>
> - Follow `docs/OVERVIEW.md` §9 + §14 verbatim — this is the copy-paste reference users will lift.
> - Use ONLY the consumer-owned OTel SDK packages above. Do NOT import `@bymax-one/nest-logger` or any NestJS symbol here — this file must execute before NestJS loads.
> - Do NOT register a `SIGTERM`/`SIGINT` listener or call `process.exit` or `otelSdk.shutdown()` in this file; `main.ts` (P3-3) is the SINGLE ordered shutdown owner.
> - Do NOT enable `@opentelemetry/instrumentation-fs` (keep it `{ enabled: false }`).
> - Do NOT invent OTel options beyond those shown.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exits 0.
> - `grep -c "process.exit" apps/api/src/instrumentation.ts` — expected: `0`.
> - `grep -c "SIGTERM\|sdk.shutdown\|otelSdk.shutdown" apps/api/src/instrumentation.ts` — expected: `0`.
> - `grep -c "export const otelSdk" apps/api/src/instrumentation.ts` — expected: `1`.
> - `node --input-type=module -e "await import('./apps/api/dist/instrumentation.js')"` (after `pnpm --filter api build`) — expected: starts the SDK without throwing (connection-refused export warnings are acceptable when the Collector is down).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P3-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P3-3 — `src/main.ts` — Instrumentation-First, `bufferLogs`, Logger Bridge, Ordered SIGTERM

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P3-1`, `P3-2`

### Description

Create `apps/api/src/main.ts`, the application entrypoint. `import './instrumentation'` MUST be the **literal first line** so the OTel SDK starts before NestJS loads (`docs/OVERVIEW.md` §14 hard rule). It then creates the app with `{ bufferLogs: true }`, bridges NestJS's internal logger to the library via `app.useLogger(app.get(PinoLoggerService))` (the library also self-bridges when the module option `shouldUseAsNestLogger` is true — its default — so this line is optional but kept for explicitness/portability), enables shutdown hooks, and installs a **single coordinated** `SIGTERM` handler: `app.close()` (drains the library destinations via `onApplicationShutdown`) → `otelSdk.shutdown()` (flush spans) → `process.exit(0)`. There is exactly one shutdown owner — no competing handler in `instrumentation.ts`. Use the §9 `main.ts` block verbatim as the code basis.

### Acceptance Criteria

- [ ] `apps/api/src/main.ts` exists; its **first line** is `import './instrumentation'` (before any NestJS / library import).
- [ ] `import { otelSdk } from './instrumentation'` is present (for the ordered shutdown).
- [ ] App created via `NestFactory.create(AppModule, { bufferLogs: true })`.
- [ ] Logger bridged with `app.useLogger(app.get(PinoLoggerService))` (imported from `@bymax-one/nest-logger`).
- [ ] `app.enableShutdownHooks()` is called.
- [ ] A single `process.once('SIGTERM', …)` handler runs `app.close()` → `.then(() => otelSdk.shutdown())` → `.finally(() => process.exit(0))` — in that order.
- [ ] App listens on `process.env.PORT ?? 3001`.
- [ ] Only `PinoLoggerService` is imported from `@bymax-one/nest-logger` (no invented exports).
- [ ] `pnpm --filter api typecheck` exits 0.

### Files to create / modify

- `apps/api/src/main.ts` — bootstrap entrypoint.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS 11 engineer.
> Context: Task P3-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 3. The canonical entrypoint is `docs/OVERVIEW.md` §9 (`apps/api/src/main.ts` block); the §14 hard rule mandates `import './instrumentation'` as the literal first line. `instrumentation.ts` (P3-2) exports `otelSdk`. `AppModule` (P3-4) and `@bymax-one/nest-logger`'s `PinoLoggerService` are available. The library's only public bridge idiom is `app.useLogger(app.get(PinoLoggerService))` plus the module option `shouldUseAsNestLogger` (default true) — there is NO `BymaxLoggerModule.useNestLogger(app)` helper.
> Objective: Create `apps/api/src/main.ts` exactly as the §9 block: instrumentation-first import, `bufferLogs`, the `PinoLoggerService` bridge, shutdown hooks, and the single ordered `SIGTERM` handler.
> Steps:
>
> 1. Create `apps/api/src/main.ts`:
>
>    ```typescript
>    import './instrumentation' // MUST be first — starts the OTel SDK before NestJS loads
>    import { otelSdk } from './instrumentation'
>    import { NestFactory } from '@nestjs/core'
>    import { PinoLoggerService } from '@bymax-one/nest-logger'
>    import { AppModule } from './app.module'
>
>    async function bootstrap() {
>      const app = await NestFactory.create(AppModule, { bufferLogs: true })
>
>      // Bridge NestJS's internal logger to the library. The standard NestJS idiom below
>      // is guaranteed to work and auto-flushes the buffered logs. The library ALSO
>      // self-bridges when the module option `shouldUseAsNestLogger` is true (its default),
>      // making this line optional — keep it for explicitness/portability.
>      app.useLogger(app.get(PinoLoggerService))
>
>      // SINGLE coordinated shutdown owner (no competing handler in instrumentation.ts):
>      // app.close() runs NestJS onApplicationShutdown hooks (the library drains its
>      // destinations there) → THEN flush the OTel SDK → THEN exit. Ordered, no race.
>      app.enableShutdownHooks() // also drains destinations if the platform calls close() for us
>      process.once('SIGTERM', () => {
>        void app
>          .close()
>          .then(() => otelSdk.shutdown())
>          .finally(() => process.exit(0))
>      })
>
>      await app.listen(process.env.PORT ?? 3001)
>    }
>
>    void bootstrap()
>    ```
>
> 2. Run `pnpm --filter api typecheck`.
>    Constraints:
>
> - Follow `docs/OVERVIEW.md` §9 + §14 verbatim. `import './instrumentation'` MUST stay the literal first line — do NOT reorder it below any other import.
> - From `@bymax-one/nest-logger` import ONLY `PinoLoggerService`. Do NOT invent `BymaxLoggerModule.useNestLogger(app)` or any other helper — the bridge idiom is `app.useLogger(app.get(PinoLoggerService))`.
> - Keep exactly ONE `SIGTERM` handler and ONE `process.exit(0)`, in the order `app.close()` → `otelSdk.shutdown()` → exit. Do NOT add a second handler in `instrumentation.ts`.
> - Do NOT call `app.useGlobalPipes`/interceptors/filters here — logger interceptor + exception filter wiring lands in Phase 4.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exits 0.
> - `head -1 apps/api/src/main.ts` — expected: `import './instrumentation' // MUST be first — starts the OTel SDK before NestJS loads`.
> - `grep -c "process.once('SIGTERM'" apps/api/src/main.ts` — expected: `1`.
> - `grep -c "useLogger(app.get(PinoLoggerService))" apps/api/src/main.ts` — expected: `1`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P3-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P3-4 — `src/app.module.ts` — Minimal (`ConfigModule.forRoot` Global)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P3-1`

### Description

Create a **minimal** `apps/api/src/app.module.ts` that imports `ConfigModule.forRoot({ isGlobal: true })` and the Phase-3 `HealthModule` (P3-6). This is intentionally the bare skeleton: the **full `BymaxLoggerModule.forRootAsync({ ... })` wiring, the `RequestIdMiddleware` `configure()` hook, and the destinations land in Phase 4** (`docs/DEVELOPMENT_PLAN.md` §Phase 4). Keeping logger wiring out of this task lets `/health` boot and a span reach Tempo (the Phase 3 DoD) without depending on the logger options factory. The Zod env validation (P3-5) plugs into this `ConfigModule`.

### Acceptance Criteria

- [ ] `apps/api/src/app.module.ts` exists and exports `class AppModule`.
- [ ] `imports` contains `ConfigModule.forRoot({ isGlobal: true, validate })` where `validate` is the Zod validator from P3-5 (`./config/env.schema`).
- [ ] `imports` contains `HealthModule` (from `./health/health.module`, created in P3-6).
- [ ] NO `BymaxLoggerModule` import and NO `RequestIdMiddleware` / `configure()` here — a code comment notes those land in Phase 4.
- [ ] The module is decorated with `@Module({ ... })` from `@nestjs/common`.
- [ ] `pnpm --filter api typecheck` exits 0.

### Files to create / modify

- `apps/api/src/app.module.ts` — minimal root module.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS 11 engineer.
> Context: Task P3-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 3. The §9 `app.module.ts` block shows the FINAL shape (with `BymaxLoggerModule.forRootAsync` + `configure(consumer)` + `RequestIdMiddleware`) — but that logger wiring is **Phase 4**, not now. Phase 3 needs only a minimal module that boots `/health`. `ConfigModule.forRoot` must be global and use the Zod `validate` function from P3-5; `HealthModule` is created in P3-6.
> Objective: Create a minimal `apps/api/src/app.module.ts` wiring only `ConfigModule.forRoot({ isGlobal: true, validate })` + `HealthModule`.
> Steps:
>
> 1. Create `apps/api/src/app.module.ts`:
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { ConfigModule } from '@nestjs/config'
>    import { validateEnv } from './config/env.schema'
>    import { HealthModule } from './health/health.module'
>
>    // NOTE: minimal Phase-3 skeleton. The full BymaxLoggerModule.forRootAsync({ ... })
>    // wiring + RequestIdMiddleware `configure()` hook land in Phase 4 (see OVERVIEW.md §9).
>    @Module({
>      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), HealthModule],
>    })
>    export class AppModule {}
>    ```
>
> 2. Run `pnpm --filter api typecheck` (it will fail until P3-5 + P3-6 exist; that's expected — finish those, then re-run as part of P3-6's gate).
>    Constraints:
>
> - Follow `docs/OVERVIEW.md` §9 for import style, but keep this module MINIMAL — do NOT add `BymaxLoggerModule`, `RequestIdMiddleware`, `OrdersModule`, `PaymentsModule`, or `PiiDemoModule` here. Those belong to Phase 4 / Phase 6.
> - `ConfigModule.forRoot` MUST be `isGlobal: true` and use the `validate` hook from `./config/env.schema` (P3-5).
> - Do NOT implement `NestModule`/`configure()` in this task (that is the Phase-4 request-id middleware step).
>   Verification:
> - `grep -c "BymaxLoggerModule\|RequestIdMiddleware" apps/api/src/app.module.ts` — expected: `0`.
> - `grep -c "isGlobal: true" apps/api/src/app.module.ts` — expected: `1`.
> - `pnpm --filter api typecheck` — expected: exits 0 once P3-5 + P3-6 are present.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P3-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P3-5 — `src/config/env.schema.ts` — Zod-Validated Env + ConfigModule Integration

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P3-4`

### Description

Create `apps/api/src/config/env.schema.ts`, the **Zod** schema that validates `process.env` at startup and the `validateEnv` function `ConfigModule.forRoot` calls (`docs/OVERVIEW.md` §9: "validated at startup with a Zod schema (`apps/api/src/config/env.schema.ts`)"; `docs/DEVELOPMENT_PLAN.md` Appendix A). For Phase 3 the schema covers the variables this skeleton actually reads — `NODE_ENV`, `PORT`, `LOG_LEVEL`, `OTEL_SERVICE_NAME`, `RELEASE_SHA`, `OTLP_TRACE_ENDPOINT` — with sensible defaults; the remaining Appendix-A variables (`LOKI_URL`, `DATABASE_URL`, etc.) are added in their owning phases (4/5/7). A parse failure must throw with a readable, aggregated message so a misconfigured deploy fails fast.

### Acceptance Criteria

- [ ] `apps/api/src/config/env.schema.ts` exists; `zod` is declared in `apps/api/package.json` dependencies.
- [ ] Exports an `envSchema` (Zod object) and a `validateEnv(config: Record<string, unknown>): Env` function used by `ConfigModule.forRoot({ validate })`.
- [ ] Exports an `Env` type via `z.infer<typeof envSchema>`.
- [ ] Schema fields: `NODE_ENV` (`enum ['development','test','production']`, default `development`), `PORT` (coerced number, default `3001`), `LOG_LEVEL` (`enum ['fatal','error','warn','info','debug','trace']`, default `info`), `OTEL_SERVICE_NAME` (string, default `nest-logger-example-api`), `RELEASE_SHA` (string, default `dev`), `OTLP_TRACE_ENDPOINT` (url string, default `http://localhost:4318/v1/traces`).
- [ ] `validateEnv` throws (non-zero startup) on an invalid value, with an aggregated message naming the offending key(s).
- [ ] `pnpm --filter api typecheck` exits 0.

### Files to create / modify

- `apps/api/src/config/env.schema.ts` — Zod env schema + `validateEnv`.
- `apps/api/package.json` — add `zod` to dependencies.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer.
> Context: Task P3-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 3 (+ Appendix A — Environment Variable Registry) and `docs/OVERVIEW.md` §9. Env is Zod-validated at startup; `ConfigModule.forRoot({ validate })` (P3-4) calls this function. For Phase 3, validate ONLY the variables the skeleton reads (NODE_ENV, PORT, LOG_LEVEL, OTEL_SERVICE_NAME, RELEASE_SHA, OTLP_TRACE_ENDPOINT) — later phases extend the schema.
> Objective: Create `apps/api/src/config/env.schema.ts` with a Zod `envSchema`, an inferred `Env` type, and a throwing `validateEnv` wired into `ConfigModule`.
> Steps:
>
> 1. Add `zod` to `apps/api/package.json` dependencies: `pnpm --filter api add zod`.
> 2. Create `apps/api/src/config/env.schema.ts`:
>
>    ```typescript
>    import { z } from 'zod'
>
>    export const envSchema = z.object({
>      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
>      PORT: z.coerce.number().int().positive().default(3001),
>      LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
>      OTEL_SERVICE_NAME: z.string().min(1).default('nest-logger-example-api'),
>      RELEASE_SHA: z.string().min(1).default('dev'),
>      OTLP_TRACE_ENDPOINT: z.string().url().default('http://localhost:4318/v1/traces'),
>    })
>
>    export type Env = z.infer<typeof envSchema>
>
>    /**
>     * ConfigModule.forRoot({ validate }) entrypoint. Throws on the first invalid env so a
>     * misconfigured deploy fails fast at boot with a readable, aggregated message.
>     */
>    export function validateEnv(config: Record<string, unknown>): Env {
>      const parsed = envSchema.safeParse(config)
>      if (!parsed.success) {
>        const issues = parsed.error.issues
>          .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
>          .join('\n')
>        throw new Error(`Invalid environment variables:\n${issues}`)
>      }
>      return parsed.data
>    }
>    ```
>
> 3. Run `pnpm --filter api typecheck`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` Appendix A for variable names; standardize on the OTel-aligned names (`OTEL_SERVICE_NAME`, `RELEASE_SHA`) per `docs/OVERVIEW.md` §9.
> - Scope to the Phase-3 variables ONLY — do NOT add `LOKI_URL`, `DATABASE_URL`, `LOG_DB_MIN_LEVEL`, etc. here (those belong to Phases 4/5/7).
> - `validateEnv` MUST throw on invalid input (do NOT swallow + return defaults) so startup fails loudly.
> - Use the `zod` API as written; do NOT pull in `@nestjs/config`'s `Joi` path.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exits 0.
> - `node --input-type=module -e "const {validateEnv}=await import('./apps/api/dist/config/env.schema.js'); console.log(validateEnv({}).PORT)"` (after `pnpm --filter api build`) — expected: prints `3001` (defaults applied).
> - `node --input-type=module -e "const {validateEnv}=await import('./apps/api/dist/config/env.schema.js'); try{validateEnv({PORT:'-1'})}catch(e){console.log('threw')}"` — expected: prints `threw`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P3-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P3-6 — `src/health/` (`/health`, `/metrics`) + Boot / Health / Trace Verification Gate

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P3-1`, `P3-2`, `P3-3`, `P3-4`, `P3-5`

### Description

Create the `apps/api/src/health/` module exposing `GET /health` and `GET /metrics`, then run the **Phase 3 Definition of Done** gate: `pnpm --filter api dev` boots, `GET /health` returns `200`, and a span reaches Tempo. These two routes are the ones `http.excludePaths` will silence in Phase 4 (`docs/OVERVIEW.md` §9/§10) — so they exist now and produce a span on first request (proving the OTel SDK from P3-2 patched Express). This task closes the phase: it ships the health module and verifies the whole skeleton end to end against the local stack (`pnpm infra:up` from Phase 1).

### Acceptance Criteria

- [ ] `apps/api/src/health/health.module.ts` exports `class HealthModule` declaring `HealthController`.
- [ ] `apps/api/src/health/health.controller.ts` exposes `GET /health` → `{ status: 'ok' }` (200) and `GET /metrics` → a minimal text/JSON payload (200).
- [ ] `HealthModule` is imported by `AppModule` (P3-4); no logger dependency is required for these routes to respond.
- [ ] `pnpm --filter api build` exits 0 and `pnpm --filter api typecheck` exits 0.
- [ ] With `pnpm infra:up` running, `pnpm --filter api dev` boots without unhandled errors.
- [ ] `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/health` returns `200`.
- [ ] After one or more requests, a span for the `api` service is visible in Tempo (via Grafana Explore → Tempo, or the Tempo API) — confirming `instrumentation.ts` patched Express before NestJS loaded.

### Files to create / modify

- `apps/api/src/health/health.module.ts` — health module.
- `apps/api/src/health/health.controller.ts` — `/health` + `/metrics` routes.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS 11 engineer.
> Context: Task P3-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 3 — the phase's Definition of Done ("`pnpm --filter api dev` boots; `GET /health` returns 200; a span reaches Tempo"). `/health` + `/metrics` are the two routes Phase 4 excludes via `http.excludePaths: [/^\/health$/, /^\/metrics$/]` (`docs/OVERVIEW.md` §9). The OTel SDK from P3-2 auto-instruments Express, so the first request to `/health` emits a span the Collector forwards to Tempo (Phase 1 stack). This task creates the health module AND runs the end-to-end verification that closes the phase.
> Objective: Create `apps/api/src/health/` (`/health`, `/metrics`) and prove boot + 200 + span-in-Tempo.
> Steps:
>
> 1. Create `apps/api/src/health/health.controller.ts`:
>
>    ```typescript
>    import { Controller, Get } from '@nestjs/common'
>
>    @Controller()
>    export class HealthController {
>      // GET /health — liveness probe; excluded from HTTP access logging in Phase 4.
>      @Get('health')
>      health(): { status: 'ok' } {
>        return { status: 'ok' }
>      }
>
>      // GET /metrics — placeholder metrics endpoint; also excluded from access logging.
>      @Get('metrics')
>      metrics(): { uptimeSeconds: number } {
>        return { uptimeSeconds: Math.floor(process.uptime()) }
>      }
>    }
>    ```
>
> 2. Create `apps/api/src/health/health.module.ts`:
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { HealthController } from './health.controller'
>
>    @Module({ controllers: [HealthController] })
>    export class HealthModule {}
>    ```
>
> 3. Confirm `AppModule` (P3-4) imports `HealthModule`. Then `pnpm --filter api build` and `pnpm --filter api typecheck`.
> 4. Bring up the stack and boot the app:
>    - `pnpm infra:up` (Phase 1 — Postgres/Loki/Tempo/OTel-Collector/Grafana).
>    - `pnpm --filter api dev` (leave running).
> 5. Verify the route + the trace:
>    - `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/health` → expect `200`.
>    - Hit `/health` a few times, then open Grafana (`http://localhost:3000` Grafana, NOT the API) → Explore → **Tempo** → search by `service.name = nest-logger-example-api` and confirm a span for `GET /health` exists. (Equivalently query the Tempo API: `curl -s "http://localhost:3200/api/search?tags=service.name%3Dnest-logger-example-api" | head`.)
>      Constraints:
>
> - Follow `docs/OVERVIEW.md` §9/§10. Keep the controller minimal — no logger injection (Phase 4 wires the logger; these routes must respond without it).
> - Do NOT register these routes under a global prefix that would break the `http.excludePaths` regexes (`/^\/health$/`, `/^\/metrics$/`) Phase 4 relies on — keep them at `/health` and `/metrics`.
> - Do NOT add `@nestjs/terminus` or any health-check library; a plain controller is sufficient for this skeleton.
> - If the span does NOT appear, the most likely cause is import order — confirm `import './instrumentation'` is the literal first line of `main.ts` (P3-3) before debugging the Collector.
>   Verification:
> - `pnpm --filter api build` — expected: exits 0.
> - `pnpm --filter api typecheck` — expected: exits 0.
> - `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/health` — expected: `200`.
> - Tempo shows at least one `nest-logger-example-api` span for `GET /health` (Grafana Explore → Tempo, or the Tempo `/api/search` query above).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P3-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 3 is 6/6 — switch the Phase 3 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
