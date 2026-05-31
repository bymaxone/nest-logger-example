# Phase 2 — Library Consumption & Workspace Bootstrap — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-2--library-consumption--workspace-bootstrap) §Phase 2
> **Total tasks:** 4
> **Progress:** 🟢 4 / 4 done (100%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                        | Status | Priority | Size | Depends on |
| ---- | --------------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| P2-1 | Scaffold `apps/api` + `apps/worker` package.json (local link) + tsconfigs   | 🟢     | High     | S    | Phase 0    |
| P2-2 | Install required + optional peers + consumer OTel SDK deps in both apps     | 🟢     | High     | S    | P2-1       |
| P2-3 | Typed subpath probe (`.` + `/shared`) proving both subpaths type-resolve    | 🟢     | High     | S    | P2-1, P2-2 |
| P2-4 | Verification gate — `pnpm install` + `pnpm typecheck` resolve both subpaths | 🟢     | High     | S    | P2-1..P2-3 |

---

## P2-1 — Scaffold `apps/api` + `apps/worker` package.json (local link) + tsconfigs

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `Phase 0`

### Description

Create the two backend workspace packages — `apps/api` and `apps/worker` — that consume `@bymax-one/nest-logger`. Each gets a minimal `package.json` declaring the library via a **local link** (`link:../../../nest-logger`, ≈ `npm link`; `file:` resolves identically) because the library is **not on npm yet** (switch to `^0.1.0` after publish). Each app also gets a `tsconfig.json` that **extends the root `tsconfig.base.json`** (P0-3) so example code inherits the exact strict discipline of the library. This task wires the consumption plumbing only — no `src/` app code yet (that lands in Phase 3+). The `apps/*` glob is already registered in `pnpm-workspace.yaml` (P0-1), so pnpm picks these up automatically.

### Acceptance Criteria

- [x] `apps/api/package.json` exists with `"name": "api"`, `"private": true`, `"type": "module"` and declares `"@bymax-one/nest-logger": "link:../../../nest-logger"` under `dependencies`.
- [x] `apps/worker/package.json` exists with `"name": "worker"`, `"private": true`, `"type": "module"` and declares `"@bymax-one/nest-logger": "link:../../../nest-logger"` under `dependencies`.
- [x] Each app declares a `"typecheck": "tsc --noEmit"` script (consumed by the root `pnpm -r typecheck` fan-out from P0-1).
- [x] `apps/api/tsconfig.json` and `apps/worker/tsconfig.json` each `"extends": "../../tsconfig.base.json"` and add a local `include` (e.g. `["src/**/*.ts"]`).
- [x] Each app tsconfig sets `compilerOptions.outDir` (e.g. `dist`) and the NestJS decorator pair `experimentalDecorators: true` + `emitDecoratorMetadata: true` (the base intentionally omits them — see P0-3).
- [x] The local link path is **three levels up** (`../../../nest-logger`) — correct relative to `apps/{api,worker}/`.
- [x] No `paths` aliases are added (Phase 2 consumes the library as a real package, never a monorepo path alias).

### Files to create / modify

- `apps/api/package.json` — api workspace manifest with the local link.
- `apps/api/tsconfig.json` — extends `../../tsconfig.base.json` + Nest decorator options.
- `apps/worker/package.json` — worker workspace manifest with the local link.
- `apps/worker/tsconfig.json` — extends `../../tsconfig.base.json` + Nest decorator options.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer wiring two pnpm workspace packages to consume a local library.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-2--library-consumption--workspace-bootstrap) §Phase 2 + §2 Global Conventions, and `docs/OVERVIEW.md` §7 Library Consumption). This is task P2-1. The library is **not published to npm yet**, so the example consumes it via a local link; `pnpm-workspace.yaml` already registers `apps/*` (Phase 0). Both repos are siblings under `…/bymax-one/`, so from `apps/api` the library is three levels up: `../../../nest-logger`. The library is ESM (`"type": "module"`) with a dual ESM+CJS `exports` map (`.` and `./shared`) and a prebuilt `dist/` — the link resolves both types and runtime through that map.
> Objective: Create `apps/api` + `apps/worker` package manifests (declaring the local link) and their tsconfigs (extending `tsconfig.base.json`). No application source yet.
> Steps:
>
> 1. Create `apps/api/package.json`:
>    ```jsonc
>    {
>      "name": "api",
>      "version": "0.0.0",
>      "private": true,
>      "type": "module",
>      "scripts": {
>        "typecheck": "tsc --noEmit",
>      },
>      "dependencies": {
>        // pnpm symlink to the sibling checkout (≈ `npm link`); `file:` resolves identically.
>        // After the library publishes, switch this to "^0.1.0".
>        "@bymax-one/nest-logger": "link:../../../nest-logger",
>      },
>    }
>    ```
> 2. Create `apps/worker/package.json` identically, with `"name": "worker"` (same `link:../../../nest-logger` — the relative depth is the same from `apps/worker/`).
> 3. Create `apps/api/tsconfig.json`:
>    ```json
>    {
>      "extends": "../../tsconfig.base.json",
>      "compilerOptions": {
>        "outDir": "dist",
>        "experimentalDecorators": true,
>        "emitDecoratorMetadata": true
>      },
>      "include": ["src/**/*.ts"]
>    }
>    ```
> 4. Create `apps/worker/tsconfig.json` identically (same body).
> 5. Do NOT create `src/` files, a `nest-cli.json`, or any Nest bootstrap yet — those belong to Phase 3. This task is consumption plumbing only.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (pnpm 10.8.0 workspaces `apps/*`, ESM everywhere, TS 5.9 strict).
> - Use `link:../../../nest-logger` (NOT a published version, NOT a `workspace:` protocol — the library lives in a **separate repo**, not this workspace). `file:../../../nest-logger` is an acceptable equivalent.
> - Do NOT add `paths` aliases or `references` — the library is consumed as a real package through its `exports` map.
> - Decorator options (`experimentalDecorators`/`emitDecoratorMetadata`) go in the **app** tsconfigs only, never in `tsconfig.base.json` (the future Next.js app must not inherit them — see P0-3).
> - Do NOT run `pnpm install` here (that is P2-4's gate); P2-2 adds the peers first.
>   Verification:
> - `node -p "require('./apps/api/package.json').dependencies['@bymax-one/nest-logger']"` — expected: `link:../../../nest-logger`.
> - `node -p "require('./apps/worker/package.json').dependencies['@bymax-one/nest-logger']"` — expected: `link:../../../nest-logger`.
> - `node -p "require('./apps/api/tsconfig.json').extends"` — expected: `../../tsconfig.base.json`.
> - `ls ../nest-logger/dist/server/index.d.ts` (from repo root) — expected: file exists (the link target's built types).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P2-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P2-2 — Install required + optional peers + consumer OTel SDK deps in both apps

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P2-1`

### Description

Install the library's peer dependencies plus the consumer-owned OpenTelemetry SDK stack into both `apps/api` and `apps/worker`. `@bymax-one/nest-logger` declares **required peers** (`@nestjs/common` & `@nestjs/core` `^11`, `pino` `^10`, `reflect-metadata` `^0.2`, `rxjs` `^7.8`) and **optional peers** (`pino-pretty`, `@opentelemetry/api`); installing the optional ones lights up `PrettyDevDestination` and trace-context injection. `pino-roll` is **example-only** (not a library peer) — it backs this repo's own `RollingFileDestination`. The OTel **SDK** packages are likewise the consumer's own deps (the library only reads `@opentelemetry/api`), and the version cap (`@opentelemetry/api` `<1.10`) is dictated by `sdk-node` peering. ⚠️ Mind the **two distinct OTel version lines**: the core experimental packages are on `0.2xx` (`sdk-node`, `exporter-trace-otlp-http` → `^0.218`) while `auto-instrumentations-node` is on the separate `0.7x` line (`^0.76`).

### Acceptance Criteria

- [x] Both `apps/api` and `apps/worker` declare the **required peers** as `dependencies`: `@nestjs/common@^11`, `@nestjs/core@^11`, `pino@^10`, `reflect-metadata@^0.2`, `rxjs@^7.8`.
- [x] Both apps declare the consumer OTel SDK deps: `@opentelemetry/sdk-node@^0.218`, `@opentelemetry/exporter-trace-otlp-http@^0.218`, `@opentelemetry/auto-instrumentations-node@^0.76`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`.
- [x] Both apps declare the **optional peers / example-only** deps: `pino-pretty@^13`, `@opentelemetry/api@^1.9` (with the `<1.10` cap respected), `pino-roll@^3`.
- [x] `@opentelemetry/auto-instrumentations-node` resolves on the `0.7x` line, distinct from the `0.2xx` core packages (no accidental `^0.218` on it).
- [x] `@bymax-one/nest-logger` stays `link:../../../nest-logger` (P2-1) — these peer installs do not replace it.
- [x] `pnpm install` completes with **zero unmet-peer-dependency errors** for `@bymax-one/nest-logger`.

### Files to create / modify

- `apps/api/package.json` — add the peer + OTel SDK + example-only deps.
- `apps/worker/package.json` — add the same deps.
- `pnpm-lock.yaml` — regenerated by the install (committed).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer installing peer dependencies for a locally-linked library.
> Context: Task P2-2 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-2--library-consumption--workspace-bootstrap) §Phase 2; see `docs/OVERVIEW.md` §7 Library Consumption (the canonical dep list + §4 Tech Stack for versions). `@bymax-one/nest-logger@0.1.0` declares required peers (`@nestjs/common`/`@nestjs/core` `^11`, `pino` `^10`, `reflect-metadata` `^0.2`, `rxjs` `^7.8`) and optional peers (`pino-pretty`, `@opentelemetry/api`). The OTel **SDK** is the consumer's dependency — the library only reads `@opentelemetry/api`. `pino-roll` is example-only (this repo's `RollingFileDestination`), NOT a library peer.
> Objective: Install all peer + optional + consumer-OTel + example-only deps into BOTH `apps/api` and `apps/worker`.
> Steps:
>
> 1. Install the required peers + consumer OTel SDK into both apps:
>    ```bash
>    pnpm --filter api --filter worker add \
>      @nestjs/common@^11 @nestjs/core@^11 pino@^10 reflect-metadata@^0.2 rxjs@^7.8 \
>      @opentelemetry/sdk-node@^0.218 @opentelemetry/exporter-trace-otlp-http@^0.218 \
>      @opentelemetry/auto-instrumentations-node@^0.76 \
>      @opentelemetry/resources @opentelemetry/semantic-conventions
>    ```
> 2. Install the optional peers + the example-only `pino-roll`:
>    ```bash
>    pnpm --filter api --filter worker add \
>      pino-pretty@^13 @opentelemetry/api@^1.9 pino-roll@^3
>    ```
> 3. After resolution, confirm `@opentelemetry/api` resolved **below 1.10** (the cap `sdk-node` enforces). If pnpm picks up a `>=1.10`, pin it explicitly: `pnpm --filter api --filter worker add @opentelemetry/api@"^1.9.0 <1.10"`.
> 4. Confirm `@opentelemetry/auto-instrumentations-node` resolved on the `0.7x` line (≈ `0.76.x`), NOT `0.2xx` — these are different release trains (see `docs/OVERVIEW.md` §4 ⚠️ note).
> 5. Leave `@bymax-one/nest-logger` as `link:../../../nest-logger`; do NOT pin a published version yet (the library is unpublished — see P2-1).
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (pnpm 10.8.0, `--frozen-lockfile` in CI; here you mutate the lockfile, so run a plain `pnpm install`/`add` to update it, then commit `pnpm-lock.yaml`).
> - Do NOT add NestJS app-runtime packages beyond the peers (`@nestjs/platform-express`, `@nestjs/config`, Prisma, Zod, etc. belong to Phase 3+). This task installs only what Phase 2 needs to type-resolve the library + its OTel bootstrap surface.
> - Keep `pino-roll` clearly example-only — do NOT add it to any "library peer" grouping; it is a normal app dependency here.
> - Respect the `@opentelemetry/api` `<1.10` upper bound (it is the version cap the SDK peers on — see `docs/OVERVIEW.md` §4).
>   Verification:
> - `pnpm install` — expected: exits 0 with no unmet-peer warnings naming `@bymax-one/nest-logger`.
> - `node -p "require('./apps/api/package.json').dependencies['@opentelemetry/sdk-node']"` — expected: a `^0.218`-compatible range.
> - `node -p "require('./apps/api/package.json').dependencies['@opentelemetry/auto-instrumentations-node']"` — expected: a `^0.76`-compatible range (0.7x line).
> - `node -p "require('./apps/worker/package.json').dependencies['rxjs']"` — expected: a `^7.8`-compatible range.
> - `pnpm --filter api exec node -e "require('reflect-metadata'); require('pino'); console.log('peers resolve')"` — expected: prints `peers resolve`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P2-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P2-3 — Typed subpath probe (`.` + `/shared`) proving both subpaths type-resolve

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P2-1`, `P2-2`

### Description

Add a single typed **subpath probe** file to `apps/api` that imports from **both** library subpaths — `.` (the full NestJS server surface) and `/shared` (the zero-dependency isomorphic surface) — and uses each import in a way that forces the type-checker to resolve it. This is the Phase 2 proof that the local link wires up **both** entries of the package `exports` map at the type level. The probe imports a runtime value + a class from `.` (`BymaxLoggerModule`, `PinoLoggerService`) and a value + a type from `/shared` (`LOG_KEYS_CONVENTION_REGEX`, `LogLevel`), then exercises them so nothing is an unused import that lint/`verbatimModuleSyntax` would strip. It is plain TypeScript (no Nest runtime, no `@nestjs/testing`) so it compiles under `tsc --noEmit` without any app bootstrap — Phase 3 owns the real wiring.

### Acceptance Criteria

- [x] A probe file exists at `apps/api/src/library-probe.ts`.
- [x] It imports `BymaxLoggerModule` and `PinoLoggerService` from `'@bymax-one/nest-logger'` (the `.` subpath).
- [x] It imports the value `LOG_KEYS_CONVENTION_REGEX` and the **type** `LogLevel` from `'@bymax-one/nest-logger/shared'` (the `/shared` subpath), using a `type`-modifier import for `LogLevel` (satisfies `verbatimModuleSyntax`).
- [x] Every import is **used** (no unused-symbol errors): e.g. reference `BymaxLoggerModule.name`, reference `PinoLoggerService` in a type position, call `LOG_KEYS_CONVENTION_REGEX.test(...)`, and annotate a value with `LogLevel`.
- [x] The file exports at least one symbol (so it is not treated as a side-effect-only module) and contains a brief comment stating it is a Phase 2 type-resolution probe (replaced/removed once real wiring lands).
- [x] `pnpm --filter api typecheck` passes with the probe present (no `@ts-ignore`, no `eslint-disable`).

### Files to create / modify

- `apps/api/src/library-probe.ts` — the typed dual-subpath probe.

### Agent Execution Prompt

> Role: Senior TypeScript engineer writing a compile-time resolution probe for a dual-subpath ESM package.
> Context: Task P2-3 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-2--library-consumption--workspace-bootstrap) §Phase 2; see `docs/OVERVIEW.md` §7 (Subpath imports). The library exposes two entries in its `exports` map: `.` (full server API — `BymaxLoggerModule`, `PinoLoggerService`, …) and `./shared` (isomorphic, zero-dep — `LogLevel`, `LogEntry`, `ServiceMetadata`, `LOG_KEYS_CONVENTION_REGEX`, `RESERVED_LOG_KEYS`, `ReservedLogKey`). This probe proves BOTH resolve at the type level via the local link, independent of any Nest bootstrap.
> Objective: Create `apps/api/src/library-probe.ts` importing from both subpaths and using each symbol so `tsc --noEmit` exercises real resolution.
> Steps:
>
> 1. Create `apps/api/src/library-probe.ts`:
>
>    ```typescript
>    /**
>     * Phase 2 subpath probe — proves both `@bymax-one/nest-logger` subpaths
>     * (`.` server API + `/shared` isomorphic API) type-resolve via the local link.
>     * Temporary: superseded by the real wiring in Phase 3+; safe to delete then.
>     */
>    // `.` subpath — the full NestJS server surface
>    import { BymaxLoggerModule, PinoLoggerService } from '@bymax-one/nest-logger'
>    // `/shared` subpath — isomorphic, zero-dependency (value + type)
>    import { LOG_KEYS_CONVENTION_REGEX } from '@bymax-one/nest-logger/shared'
>    import type { LogLevel } from '@bymax-one/nest-logger/shared'
>
>    // Use the `.` imports so they are not stripped (verbatimModuleSyntax):
>    export const serverModuleName: string = BymaxLoggerModule.name
>    export type ServerLogger = PinoLoggerService
>
>    // Use the `/shared` imports — a value call + a type annotation:
>    const sampleLevel: LogLevel = 'info'
>    export const isWellFormedKey: boolean = LOG_KEYS_CONVENTION_REGEX.test('ORDER_CREATE_SUCCESS')
>
>    /** A trivial probe result proving both subpaths resolved at type-check time. */
>    export const probe = {
>      serverModuleName,
>      sampleLevel,
>      isWellFormedKey,
>    } as const
>    ```
>
> 2. Confirm `apps/api/tsconfig.json` (P2-1) `include` covers `src/**/*.ts` so `tsc --noEmit` picks up the probe.
> 3. Do NOT import anything from `'@nestjs/*'` or instantiate Nest providers here — keep it a pure type/value probe so it compiles without a Nest container.
> 4. Keep `LogLevel` on a `import type` line (it is a type-only symbol; `verbatimModuleSyntax` requires the `type` modifier).
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (English-only; no `@ts-ignore`; no `eslint-disable`).
> - Import **only** the documented public symbols of each subpath (`.`: `BymaxLoggerModule`/`PinoLoggerService`; `/shared`: `LOG_KEYS_CONVENTION_REGEX`/`LogLevel`). Do NOT reach into internal paths or `dist/`.
> - The probe must reference both a **runtime value** and a **type** from `/shared` to prove the `types` + `import` map entries both resolve.
> - Do NOT add a `.spec.ts` for the probe — it is a typecheck-only artifact (it carries no behavior to test and is excluded from coverage in Phase 14).
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0 (the probe resolves both subpaths).
> - `pnpm --filter api exec tsc --noEmit --traceResolution src/library-probe.ts 2>/dev/null | grep -E "nest-logger/(dist/server|dist/shared)" | head` — expected: shows resolution hitting both `dist/server/index.d.ts` and `dist/shared/index.d.ts`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P2-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P2-4 — Verification gate — `pnpm install` + `pnpm typecheck` resolve both subpaths

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P2-1`, `P2-2`, `P2-3`

### Description

Phase 2 "Definition of done" gate (per `DEVELOPMENT_PLAN.md` §Phase 2): prove the workspace installs cleanly with the local link in place and that `pnpm typecheck` resolves **both** library subpaths through the probe. This confirms the example genuinely consumes `@bymax-one/nest-logger@0.1.0` — types **and** runtime resolution — via the package `exports` map, with no path aliases and no published version. Closes the phase. Requires the sibling library's `dist/` to exist (built once in the sibling checkout — see `docs/OVERVIEW.md` §7).

### Acceptance Criteria

- [x] The sibling library is built (`../nest-logger/dist/server/index.d.ts` and `../nest-logger/dist/shared/index.d.ts` exist) so the link resolves types + runtime.
- [x] `pnpm install` (or `pnpm install --frozen-lockfile` on the committed lockfile) exits 0 with the `link:` resolved and no unmet-peer errors for `@bymax-one/nest-logger`.
- [x] `pnpm typecheck` exits 0 across the workspace (the `apps/api` probe compiles, resolving both `.` and `/shared`).
- [x] `apps/worker` typechecks too (its tsconfig + linked library + peers resolve), even though its `src/` is still empty.
- [x] No `@ts-ignore`, `eslint-disable`, `--no-verify`, or lowered threshold was used to make any check pass.

### Files to create / modify

- _(none — verification only; fix the earlier task files P2-1..P2-3 if a check fails)_

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer closing the Phase 2 consumption gate.
> Context: Task P2-4 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-2--library-consumption--workspace-bootstrap) §Phase 2. DoD: `pnpm typecheck` resolves both `@bymax-one/nest-logger` subpaths and the probe compiles. The library is ESM (`"type": "module"`) with a dual ESM+CJS `exports` map and a prebuilt `dist/`; the local link (`link:../../../nest-logger` from each app) resolves types + runtime via that map. The library must be built in the sibling checkout first (see `docs/OVERVIEW.md` §7: `cd ../nest-logger && pnpm install && pnpm build`).
> Objective: Confirm install + typecheck are green with both subpaths resolving, and close the phase.
> Steps:
>
> 1. Ensure the sibling library `dist/` exists (build it once if missing):
>    ```bash
>    # from this repo root; the library is one level up (siblings under …/bymax-one/)
>    ls ../nest-logger/dist/server/index.d.ts ../nest-logger/dist/shared/index.d.ts \
>      || (cd ../nest-logger && pnpm install && pnpm build)
>    ```
> 2. Install and typecheck the example workspace:
>    ```bash
>    pnpm install
>    pnpm typecheck
>    ```
>    Both must exit 0. `pnpm typecheck` fans out via `pnpm -r --if-present run typecheck` (P0-1) to `apps/api` + `apps/worker`.
> 3. If `typecheck` reports `Cannot find module '@bymax-one/nest-logger'` or `.../shared`, the link or the library build is the cause — confirm step 1's `dist/` exists, the link path is `../../../nest-logger`, and re-run `pnpm install` to re-materialize the symlink. Fix in P2-1/P2-2 (not here), then return.
> 4. Do NOT add placeholder `src/` files to `apps/worker` to force a pass — an empty `src/` with a valid tsconfig typechecks as a no-op; the probe in `apps/api` is the actual subpath proof.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (pnpm 10.8.0, `--frozen-lockfile` reproducibility; commit `pnpm-lock.yaml`).
> - Do NOT switch `@bymax-one/nest-logger` to a published semver range — it is unpublished; the `link:` is the only resolver until first publish.
> - Do NOT skip or weaken any gate; diagnose failures in the originating task file.
>   Verification:
> - `pnpm install` — expected: exit 0, `link:` resolved.
> - `pnpm typecheck` — expected: exit 0 (probe resolves `.` + `/shared`).
> - `pnpm --filter api typecheck` — expected: exit 0 (the probe file compiles).
> - `pnpm --filter worker typecheck` — expected: exit 0.
> - `test -L node_modules/@bymax-one/nest-logger && echo linked` (or per-app `apps/api/node_modules/...`) — expected: prints `linked` (the dependency is a symlink to the sibling checkout).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P2-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 2 is 4/4 — switch the Phase 2 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- P2-1 ✅ 2026-05-31 — Scaffolded `apps/api` + `apps/worker` (private ESM manifests, `typecheck` script, `link:../../../nest-logger`) and tsconfigs extending `tsconfig.base.json` with Nest decorator options; no `paths`/`references`.
- P2-2 ✅ 2026-05-31 — Installed required peers (`@nestjs/common`/`@nestjs/core` `^11`, `pino` `^10`, `reflect-metadata` `^0.2`, `rxjs` `^7.8`) + consumer OTel SDK (`sdk-node`/`exporter-trace-otlp-http` `^0.218`, `auto-instrumentations-node` `^0.76`, `resources` `^2`, `semantic-conventions` `^1`) under `dependencies`, and the optional library peers + example-only dep (`pino-pretty` `^13`, `@opentelemetry/api` pinned `>=1.9.0 <1.10`, `pino-roll` `^3`) under `optionalDependencies` — matching the `docs/OVERVIEW.md` §7 canonical block (they install by default; the split only documents that they are not hard runtime requirements of the consumer). Both apps also declare `engines.node >=24`. Zero unmet peers.
- P2-3 ✅ 2026-05-31 — Added `apps/api/src/library-probe.ts` importing from both subpaths (`.`: `BymaxLoggerModule`/`PinoLoggerService`; `/shared`: `LOG_KEYS_CONVENTION_REGEX` value + `LogLevel` type); `--traceResolution` confirms hits on `dist/server` and `dist/shared`.
- P2-4 ✅ 2026-05-31 — Closed the gate: `pnpm install --frozen-lockfile` + `pnpm typecheck` exit 0 across the workspace, both subpaths resolve through the `link:` symlink to the sibling checkout; `apps/worker` typechecks as a no-op via explicit `files: []`.
