# Phase 15 — Mutation Testing (Stryker 100%) — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-15--mutation-testing-stryker-100) §Phase 15
> **Total tasks:** 6
> **Progress:** 🔴 0 / 6 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                                       | Status | Priority | Size | Depends on             |
| ----- | -------------------------------------------------------------------------- | ------ | -------- | ---- | ---------------------- |
| P15-1 | `apps/api/jest.stryker.config.ts` (coverage gate removed, Stryker env)     | 🔴     | High     | S    | Phase 14               |
| P15-2 | `apps/api/stryker.config.json` (jest-runner + ts-checker, `break: 100`)    | 🔴     | High     | M    | P15-1                  |
| P15-3 | `apps/web/stryker.config.json` (vitest-runner, lib 100 / components 90)    | 🔴     | High     | M    | Phase 14               |
| P15-4 | Wire `mutation` / `mutation:incremental` / `mutation:dry-run` scripts      | 🔴     | High     | S    | P15-2, P15-3           |
| P15-5 | `docs/stryker/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md` (first baseline)   | 🔴     | High     | M    | P15-4                  |
| P15-6 | Verification gate — `pnpm mutation` green both workspaces (zero survivors) | 🔴     | High     | L    | P15-1..P15-5           |

---

## P15-1 — `apps/api/jest.stryker.config.ts` (coverage gate removed, Stryker env)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `Phase 14`

### Description

Stryker's `jest-runner` re-runs the `apps/api` unit suite once per mutant inside `.stryker-tmp/sandbox-*`. It must use a **dedicated** Jest config — a clone of the Phase 14 unit config with the `coverageThreshold` block removed (coverage is meaningless and slows every mutant run) and coverage collection disabled. Reusing the day-to-day `jest.config.ts` would make every mutant fail the 100% coverage gate (a single mutated line drops coverage below 100), producing false "killed" results and wasting runner time. This dedicated runner config is what `stryker.config.json` (P15-2) points at via `jest.configFile`.

### Acceptance Criteria

- [ ] `apps/api/jest.stryker.config.ts` exists and `export default`s a Jest config (ESM, typed via `import type { Config } from 'jest'`).
- [ ] It reuses the Phase 14 unit config's `preset`/`transform`/`moduleNameMapper`/`testEnvironment` (imported or copied) so test resolution is identical.
- [ ] `coverageThreshold` is **absent** and `collectCoverage` is `false` (or omitted) — no coverage work under Stryker.
- [ ] `testMatch` targets only `**/*.spec.ts` (unit specs); `*.e2e-spec.ts` is excluded (supertest e2e is flaky under Stryker — see Constraints).
- [ ] `modulePathIgnorePatterns` includes `<rootDir>/dist/` and `<rootDir>/.stryker-tmp/` (avoids jest-haste-map dup-module collisions when Stryker copies `src/` into the sandbox).
- [ ] Running `pnpm --filter api exec jest --config jest.stryker.config.ts` (outside Stryker, sanity) executes the unit suite green with no coverage threshold failure.

### Files to create / modify

- `apps/api/jest.stryker.config.ts` — Stryker-only Jest runner config.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS test engineer wiring a Stryker `jest-runner` config.
> Context: Task P15-1 of `docs/DEVELOPMENT_PLAN.md` §Phase 15 (see also §2 Global Conventions and [Appendix C — Quality Gates](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates)). The `apps/api` unit suite is Jest native-ESM (Phase 14) with `coverageThreshold.global` at 100. Stryker runs that suite once per mutant — coverage thresholds there would make every mutated line report a false failure, so this config strips them. This example mirrors the **`nest-auth-example` app** quality bar (`break: 100`), not the library's `break: 95`.
> Objective: Produce `apps/api/jest.stryker.config.ts` — a coverage-free clone of the Phase 14 unit config dedicated to Stryker.
> Steps:
>
> 1. Inspect the existing `apps/api/jest.config.ts` (Phase 14). Note its `preset` (e.g. `ts-jest/presets/default-esm` or the ts-jest ESM transform with `ignoreCoverageForAllDecorators: true` per Appendix C's coverage-shim note), `transform`, `moduleNameMapper` (the `@bymax-one/nest-logger` alias + `^(\.{1,2}/.*)\.js$` ESM mapper), `extensionsToTreatAsEsm`, and `testEnvironment: 'node'`.
> 2. Create `apps/api/jest.stryker.config.ts`:
>    ```ts
>    import type { Config } from 'jest'
>    import baseConfig from './jest.config'
>
>    /**
>     * Jest config used ONLY by Stryker's @stryker-mutator/jest-runner.
>     * It re-runs the unit suite once per mutant, so:
>     *  - coverage is disabled (a mutated line would falsely break the 100% gate),
>     *  - e2e specs are excluded (supertest is flaky under Stryker instrumentation).
>     */
>    const config: Config = {
>      ...baseConfig,
>      collectCoverage: false,
>      // strip the 100% gate inherited from the day-to-day unit config
>      coverageThreshold: undefined,
>      testMatch: ['<rootDir>/src/**/*.spec.ts'],
>      modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/.stryker-tmp/'],
>    }
>
>    export default config
>    ```
>    If `jest.config.ts` does not cleanly spread (e.g. it is a function or uses `createDefaultEsmPreset()`), inline the resolved fields instead of spreading — the runner config MUST stand alone.
> 3. Sanity-run **outside** Stryker: `pnpm --filter api exec node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.stryker.config.ts` (or the project's documented native-ESM invocation). Expect green with no coverage-threshold error.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions and §Appendix C.
> - Do NOT include `*.e2e-spec.ts` here — supertest e2e produces flaky kills under Stryker (the socket closes before the assertion is attributed). E2E stays in the separate Phase 14 e2e suite that Stryker never runs. Interceptors/filters are mutation-tested via their **unit** specs using a mocked `ExecutionContext`.
> - Do NOT lower or keep any `coverageThreshold` — remove it entirely (set to `undefined` or delete the key).
> - Do NOT use `@ts-ignore` / `eslint-disable` to make the config typecheck; type it with `import type { Config } from 'jest'`.
>   Verification:
>
> - `pnpm --filter api exec tsc --noEmit -p tsconfig.json` — expected: the new config typechecks.
> - Running the unit suite with this config — expected: exit 0, **no** coverage-threshold failure printed.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P15-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P15-2 — `apps/api/stryker.config.json` (jest-runner + ts-checker, `break: 100`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–3 h)
- **Depends on:** `P15-1`

### Description

Add the Stryker configuration for `apps/api`. It uses the **jest-runner** (pointed at `jest.stryker.config.ts` from P15-1) plus the **typescript-checker** so type-invalid mutants are discarded instead of counted as survivors. `coverageAnalysis: perTest` maps each mutant to only the unit tests that cover it (fast, accurate cross-file attribution). `mutate` targets `src/**/*.ts` minus non-behavioral files (`*.spec`, `*.module`, `main`, `*.dto`, `*.d.ts`, `index.ts`). Thresholds are `{ high: 100, low: 100, break: 100 }` — the **`nest-auth-example` app** bar, not the library's `break: 95` (see [Appendix C — Mutation-bar note](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates)). `incremental: true` lets CI (Phase 17) re-test only changed files via a cached `reports/stryker-incremental.json`. JSON config (not `.mjs`/`.ts`) deliberately avoids Stryker's ESM-loader friction (Appendix C toolchain caveat).

### Acceptance Criteria

- [ ] `apps/api/stryker.config.json` exists with a top `"$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json"`.
- [ ] `packageManager: "pnpm"`; `plugins: ["@stryker-mutator/jest-runner", "@stryker-mutator/typescript-checker"]`.
- [ ] `testRunner: "jest"` with `jest: { projectType: "custom", configFile: "jest.stryker.config.ts" }`; `coverageAnalysis: "perTest"`.
- [ ] `checkers: ["typescript"]`, `tsconfigFile: "tsconfig.json"`, `typescriptChecker: { prioritizePerformanceOverAccuracy: true }`, `disableTypeChecks: "src/**/*.ts"`.
- [ ] `mutate` = `["src/**/*.ts", "!src/**/*.spec.ts", "!src/**/*.module.ts", "!src/main.ts", "!src/**/*.dto.ts", "!src/**/*.d.ts", "!src/**/index.ts"]`.
- [ ] `thresholds: { high: 100, low: 100, break: 100 }`.
- [ ] `incremental: true`; `incrementalFile: "reports/stryker-incremental.json"`; `tempDirName: ".stryker-tmp"`.
- [ ] `reporters: ["progress", "clear-text", "html", "json"]`; `htmlReporter.fileName: "reports/mutation/api.html"`; `jsonReporter.fileName: "reports/mutation/api.json"`.
- [ ] Stryker devDependencies present in `apps/api/package.json`: `@stryker-mutator/core`, `@stryker-mutator/jest-runner`, `@stryker-mutator/typescript-checker`.
- [ ] `pnpm --filter api exec stryker run --dryRunOnly` completes (initial test run + type-check pass) without a config error.

### Files to create / modify

- `apps/api/stryker.config.json` — Stryker config.
- `apps/api/package.json` — Stryker devDependencies.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS test engineer configuring Stryker for a NestJS service.
> Context: Task P15-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 15. `ignoreStatic` is intentionally NOT set to `true` here — the example app targets `break: 100`, so static mutants must be killed by real assertions (the honest starting line). Use the runner config from P15-1. JSON config avoids ESM-loader friction (Appendix C). Thresholds `100/100/100` mirror the `nest-auth-example` app.
> Objective: Produce `apps/api/stryker.config.json` and install the Stryker toolchain.
> Steps:
>
> 1. Install devDependencies in the `apps/api` workspace:
>    `pnpm --filter api add -D @stryker-mutator/core @stryker-mutator/jest-runner @stryker-mutator/typescript-checker`.
> 2. Create `apps/api/stryker.config.json`:
>    ```json
>    {
>      "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
>      "packageManager": "pnpm",
>      "plugins": [
>        "@stryker-mutator/jest-runner",
>        "@stryker-mutator/typescript-checker"
>      ],
>      "testRunner": "jest",
>      "jest": {
>        "projectType": "custom",
>        "configFile": "jest.stryker.config.ts"
>      },
>      "coverageAnalysis": "perTest",
>      "checkers": ["typescript"],
>      "tsconfigFile": "tsconfig.json",
>      "typescriptChecker": { "prioritizePerformanceOverAccuracy": true },
>      "disableTypeChecks": "src/**/*.ts",
>      "mutate": [
>        "src/**/*.ts",
>        "!src/**/*.spec.ts",
>        "!src/**/*.module.ts",
>        "!src/main.ts",
>        "!src/**/*.dto.ts",
>        "!src/**/*.d.ts",
>        "!src/**/index.ts"
>      ],
>      "thresholds": { "high": 100, "low": 100, "break": 100 },
>      "concurrency": 4,
>      "timeoutMS": 60000,
>      "incremental": true,
>      "incrementalFile": "reports/stryker-incremental.json",
>      "reporters": ["progress", "clear-text", "html", "json"],
>      "htmlReporter": { "fileName": "reports/mutation/api.html" },
>      "jsonReporter": { "fileName": "reports/mutation/api.json" },
>      "tempDirName": ".stryker-tmp",
>      "cleanTempDir": true
>    }
>    ```
> 3. Confirm `.stryker-tmp/` and `reports/` are git-ignored (P0-7) and lint-ignored (P0-4) — both already are; do not re-add.
> 4. Smoke the wiring without scoring: `pnpm --filter api exec stryker run --dryRunOnly`. This runs the initial unit suite + the typescript-checker once; expect it to finish without a config/runner error (a non-100 score is fine here — hardening to zero survivors is P15-6).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §Appendix C. Do NOT copy the **library's** config (`break: 95`, `ignoreStatic: true`) — this is the example **app** (`break: 100`).
> - Do NOT add `*.e2e-spec.ts` to `mutate` or to the runner; e2e is excluded by P15-1.
> - Do NOT set `ignoreStatic: true` to dodge static-mutant survivors — kill them with assertions in P15-6 (e.g. assert exported `const`/`Symbol` values and default-option objects).
> - Keep it JSON (no `.mjs`/`.ts` Stryker config) to avoid the pure-ESM loader requirement (Node ≥ 20) noted in Appendix C.
> - Do NOT lower a threshold to make the gate pass.
>   Verification:
>
> - `node -e "JSON.parse(require('fs').readFileSync('apps/api/stryker.config.json','utf8'))"` — expected: parses without error.
> - `pnpm --filter api exec stryker run --dryRunOnly` — expected: initial run + type-check complete without a configuration error.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P15-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P15-3 — `apps/web/stryker.config.json` (vitest-runner, lib 100 / components 90)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–3 h)
- **Depends on:** `Phase 14`

### Description

Add Stryker for `apps/web` using the **vitest-runner** (the Phase 14 web suite is Vitest + jsdom + v8 coverage). Mutate `lib/**/*.ts` and `components/**/*.tsx`, excluding test files and the generated shadcn `new-york` primitives (`components/ui/**` — vendored, not authored here, and a 100% mutation gate on them is pure noise). Per [Appendix C — Mutation-bar note](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates): `lib/**` stays at **100** (real application logic — `cn`, log-key validation, query compilers), while `components/**` may pragmatically use **`break: 90`** because 100% UI mutation is frequently over-engineered. The single config `break` is the floor, so set `break: 90` globally and rely on the per-file expectation (lib at 100) enforced during P15-6 hardening + the HTML report. `incremental: true` for CI parity with `apps/api`.

### Acceptance Criteria

- [ ] `apps/web/stryker.config.json` exists with the `"$schema"` pointing at the installed Stryker core schema.
- [ ] `packageManager: "pnpm"`; `plugins: ["@stryker-mutator/vitest-runner"]`; `testRunner: "vitest"`.
- [ ] `coverageAnalysis: "perTest"`.
- [ ] `mutate` = `["lib/**/*.ts", "components/**/*.tsx", "!**/*.test.ts", "!**/*.test.tsx", "!**/*.spec.ts", "!**/*.spec.tsx", "!components/ui/**", "!lib/**/*.d.ts"]`.
- [ ] `thresholds: { high: 100, low: 95, break: 90 }` — `lib/**` is held to 100 by the P15-6 hardening pass (documented), `components/**` floored at 90 per Appendix C.
- [ ] `incremental: true`; `incrementalFile: "reports/stryker-incremental.json"`; `tempDirName: ".stryker-tmp"`.
- [ ] `reporters: ["progress", "clear-text", "html", "json"]`; `htmlReporter.fileName: "reports/mutation/web.html"`; `jsonReporter.fileName: "reports/mutation/web.json"`.
- [ ] Stryker devDependencies present in `apps/web/package.json`: `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` (Vitest major pinned `^3` per Appendix C, since `vitest-runner` requires Vitest ≥ 2).
- [ ] `pnpm --filter web exec stryker run --dryRunOnly` completes without a config error.

### Files to create / modify

- `apps/web/stryker.config.json` — Stryker config.
- `apps/web/package.json` — Stryker devDependencies.

### Agent Execution Prompt

> Role: Senior TypeScript / React (Next.js) test engineer configuring Stryker with the Vitest runner.
> Context: Task P15-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 15. The web suite is Vitest (jsdom, v8) from Phase 14. `@stryker-mutator/vitest-runner` requires Vitest ≥ 2 — keep Vitest pinned at `^3` (Appendix C), never `latest`. Per Appendix C, 100% UI mutation is over-engineered: hold `lib/**` at 100 but allow `components/**` a pragmatic `break: 90`. The shadcn `components/ui/**` primitives are vendored — exclude them entirely.
> Objective: Produce `apps/web/stryker.config.json` and install the Stryker + vitest-runner toolchain.
> Steps:
>
> 1. Install devDependencies in the `apps/web` workspace:
>    `pnpm --filter web add -D @stryker-mutator/core @stryker-mutator/vitest-runner`. Confirm `vitest` resolves to `^3` (already pinned in Phase 14); if it is `latest`, pin it to `^3`.
> 2. Create `apps/web/stryker.config.json`:
>    ```json
>    {
>      "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
>      "packageManager": "pnpm",
>      "plugins": ["@stryker-mutator/vitest-runner"],
>      "testRunner": "vitest",
>      "coverageAnalysis": "perTest",
>      "mutate": [
>        "lib/**/*.ts",
>        "components/**/*.tsx",
>        "!**/*.test.ts",
>        "!**/*.test.tsx",
>        "!**/*.spec.ts",
>        "!**/*.spec.tsx",
>        "!components/ui/**",
>        "!lib/**/*.d.ts"
>      ],
>      "thresholds": { "high": 100, "low": 95, "break": 90 },
>      "concurrency": 4,
>      "timeoutMS": 60000,
>      "incremental": true,
>      "incrementalFile": "reports/stryker-incremental.json",
>      "reporters": ["progress", "clear-text", "html", "json"],
>      "htmlReporter": { "fileName": "reports/mutation/web.html" },
>      "jsonReporter": { "fileName": "reports/mutation/web.json" },
>      "tempDirName": ".stryker-tmp",
>      "cleanTempDir": true
>    }
>    ```
> 3. The vitest-runner auto-discovers `vitest.config.ts`; do NOT add a `vitest` block unless a custom config path is required. Ensure that config does NOT force `coverage` thresholds that would error under Stryker (Stryker disables coverage collection itself).
> 4. Smoke the wiring: `pnpm --filter web exec stryker run --dryRunOnly`. Expect completion without a config/runner error (score not yet relevant).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §Appendix C. `lib/**` = 100; `components/**` floor = 90.
> - Do NOT mutate `components/ui/**` (vendored shadcn `new-york` primitives) — exclusion is mandatory.
> - Do NOT add the typescript-checker here (vitest-runner path); the web build/typecheck already gates types in CI. Keeping the runner lean avoids ESM-loader friction.
> - Keep the config JSON; do NOT pin Vitest to `latest`.
>   Verification:
>
> - `node -e "JSON.parse(require('fs').readFileSync('apps/web/stryker.config.json','utf8'))"` — expected: parses without error.
> - `pnpm --filter web exec stryker run --dryRunOnly` — expected: completes without a configuration error.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P15-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P15-4 — Wire `mutation` / `mutation:incremental` / `mutation:dry-run` scripts

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P15-2`, `P15-3`

### Description

Expose the three mutation scripts in each app's `package.json` so the root fan-out scripts declared in P0-1 (`pnpm -r --if-present run mutation` etc.) actually dispatch. Each workspace gets `mutation` (full cold run, the gate), `mutation:incremental` (re-tests only changed files via the cached `reports/stryker-incremental.json` — used by the per-PR CI job in Phase 17), and `mutation:dry-run` (initial run only, no mutants — for fast wiring smoke). The root already aggregates them via `pnpm -r`, so no root change is needed beyond confirming P0-1's targets exist.

### Acceptance Criteria

- [ ] `apps/api/package.json` scripts: `"mutation": "stryker run"`, `"mutation:incremental": "stryker run --incremental"`, `"mutation:dry-run": "stryker run --dryRunOnly"`.
- [ ] `apps/web/package.json` scripts: the same three (`stryker run`, `stryker run --incremental`, `stryker run --dryRunOnly`).
- [ ] Root `package.json` already fans out `mutation`, `mutation:incremental`, `mutation:dry-run` via `pnpm -r --if-present run …` (verify P0-1; do **not** duplicate).
- [ ] `pnpm mutation:dry-run` runs both workspaces' dry runs to completion (wiring proof — score not asserted here).
- [ ] `pnpm --filter api run mutation:incremental` produces/reads `apps/api/reports/stryker-incremental.json`.

### Files to create / modify

- `apps/api/package.json` — add the three `mutation*` scripts.
- `apps/web/package.json` — add the three `mutation*` scripts.

### Agent Execution Prompt

> Role: Senior TypeScript engineer wiring workspace scripts.
> Context: Task P15-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 15. The root `package.json` (P0-1) already declares `mutation`, `mutation:incremental`, `mutation:dry-run` as `pnpm -r --if-present run …` fan-outs; this task makes each app provide the underlying targets so `--if-present` resolves. The incremental script powers the per-PR Stryker job in Phase 17 (`mutation.yml`), which caches `reports/stryker-incremental.json`.
> Objective: Add the three `mutation*` scripts to both app `package.json` files.
> Steps:
>
> 1. In `apps/api/package.json`, add to `scripts`:
>    ```jsonc
>    {
>      "scripts": {
>        "mutation": "stryker run",
>        "mutation:incremental": "stryker run --incremental",
>        "mutation:dry-run": "stryker run --dryRunOnly"
>      }
>    }
>    ```
>    (`stryker` resolves to the local `@stryker-mutator/core` bin; `stryker run` auto-loads `stryker.config.json`.)
> 2. Add the identical three scripts to `apps/web/package.json`.
> 3. Confirm the root `package.json` already has:
>    ```jsonc
>    {
>      "scripts": {
>        "mutation": "pnpm -r --if-present run mutation",
>        "mutation:incremental": "pnpm -r --if-present run mutation:incremental",
>        "mutation:dry-run": "pnpm -r --if-present run mutation:dry-run"
>      }
>    }
>    ```
>    If any is missing, add it (it was specified in P0-1) — but do NOT change its shape.
> 4. Wiring smoke: `pnpm mutation:dry-run` (runs both apps' dry runs). Expect both to complete without a config/runner error.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Do NOT inline Stryker flags that belong in `stryker.config.json` (e.g. thresholds, mutate globs) — the only CLI flags are `--incremental` / `--dryRunOnly`.
> - Do NOT add a `mutation` script that targets a single file — file-by-file hardening is done ad-hoc with `stryker run --mutate <glob>` during P15-6, not as a committed script.
>   Verification:
>
> - `pnpm --filter api run mutation:dry-run` — expected: completes without error.
> - `pnpm --filter web run mutation:dry-run` — expected: completes without error.
> - `node -p "require('./apps/api/package.json').scripts.mutation"` — expected: `stryker run`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P15-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P15-5 — `docs/stryker/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md` (first baseline)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–3 h)
- **Depends on:** `P15-4`

### Description

Record the **first** mutation measurement of both workspaces **before** any hardening, then capture the plan to drive survivors to zero. Three docs under `docs/stryker/`: `BASELINE.md` (the first cold-run scores + the survivor inventory, per workspace, per file), `HISTORY.md` (an append-only run log — date, score, killed/survived/timeout/no-coverage, notable changes), and `IMPLEMENTATION_PLAN.md` (the file-by-file hardening strategy, the known Stryker gotchas for this stack, and the CI wiring that Phase 17 will add). This is the honest starting line — capturing the baseline before hardening is an explicit Phase 15 deliverable.

### Acceptance Criteria

- [ ] `docs/stryker/BASELINE.md` records the first `pnpm mutation` run for **both** `apps/api` and `apps/web`: overall score, killed / survived / timeout / no-coverage counts, and a per-file survivor table (file · survived count · mutator(s)). Each entry is dated.
- [ ] `docs/stryker/HISTORY.md` is an append-only run log (newest on top) with a header row per run: `date · workspace · score% · killed · survived · timeout · no-cov · note`. The baseline run is the first entry.
- [ ] `docs/stryker/IMPLEMENTATION_PLAN.md` documents: (a) the path-to-zero-survivors per workspace, (b) the stack gotchas — Supertest flakiness → mock `ExecutionContext`; module fixtures using `forRoot` at file-load → move bootstrap into `beforeAll`; static-mutant survivors killed by asserting exported `const`/`Symbol` values rather than setting `ignoreStatic: true`; equivalent mutants recorded here (not via inline `// Stryker disable`, which would otherwise leak into artifacts), and (c) the Phase 17 CI plan (per-PR `mutation:incremental` with `dorny/paths-filter` + `actions/cache` of `reports/stryker-incremental.json`; Monday-03:00-UTC nightly cold run).
- [ ] All three files are English-only and link back to this phase file and `../DEVELOPMENT_PLAN.md` §Appendix C.
- [ ] `markdown-link-check docs/stryker/*.md` passes (no dead links).

### Files to create / modify

- `docs/stryker/BASELINE.md` — first-measurement scores + survivor inventory.
- `docs/stryker/HISTORY.md` — append-only run log.
- `docs/stryker/IMPLEMENTATION_PLAN.md` — hardening strategy + gotchas + CI plan.

### Agent Execution Prompt

> Role: Senior TypeScript test engineer + technical writer.
> Context: Task P15-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 15. Phase 15 explicitly requires recording the first measurement **before** hardening to 100 (the honest baseline). The library's reference process (mirrored here for the example app) keeps `mutation_testing_*.md`-style docs; this app uses `docs/stryker/{BASELINE,HISTORY,IMPLEMENTATION_PLAN}.md`.
> Objective: Run the first cold measurement and author the three Stryker docs.
> Steps:
>
> 1. Run the baseline cold runs and keep the `reports/mutation/*.html` + `*.json` artifacts:
>    `pnpm --filter api run mutation` then `pnpm --filter web run mutation`. (Expect < 100 / < 90 — this is the pre-hardening baseline; do NOT fix survivors in this task.)
> 2. Create `docs/stryker/BASELINE.md`. Lead with a one-line summary per workspace, then a per-workspace section:
>    ```md
>    # Stryker — Baseline (pre-hardening)
>
>    First mutation measurement, recorded before the P15-6 hardening pass.
>    Source config: `apps/api/stryker.config.json`, `apps/web/stryker.config.json`.
>
>    ## apps/api — YYYY-MM-DD
>
>    | Metric | Value |
>    | ------ | ----- |
>    | Mutation score | NN.NN% |
>    | Killed | … |
>    | Survived | … |
>    | Timeout | … |
>    | No coverage | … |
>
>    ### Survivors by file
>
>    | File | Survived | Mutator(s) |
>    | ---- | -------- | ---------- |
>    | src/… | N | ConditionalExpression, … |
>
>    ## apps/web — YYYY-MM-DD
>    … (same shape; note lib/** vs components/** separately) …
>    ```
>    Fill the numbers from the `reports/mutation/*.json` summary (or the clear-text reporter output).
> 3. Create `docs/stryker/HISTORY.md` — append-only, newest on top:
>    ```md
>    # Stryker — Run History
>
>    Append-only. Newest run on top. One row per `pnpm mutation` (or incremental) run.
>
>    | Date | Workspace | Score | Killed | Survived | Timeout | No-cov | Note |
>    | ---- | --------- | ----- | ------ | -------- | ------- | ------ | ---- |
>    | YYYY-MM-DD | apps/api | NN.NN% | … | … | … | … | baseline (pre-hardening) |
>    | YYYY-MM-DD | apps/web | NN.NN% | … | … | … | … | baseline (pre-hardening) |
>    ```
> 4. Create `docs/stryker/IMPLEMENTATION_PLAN.md` covering the path to zero survivors, the gotchas, and the CI plan:
>    ```md
>    # Stryker — Implementation Plan (path to the gate)
>
>    Target: `apps/api` break 100 (zero survivors); `apps/web` lib/** 100, components/** break 90.
>    See [Phase 15 tasks](./../tasks/phase-15-mutation.md) and
>    [DEVELOPMENT_PLAN Appendix C](./../DEVELOPMENT_PLAN.md#appendix-c--quality-gates).
>
>    ## Hardening order (apps/api)
>    Pure utils → config/validation → services → interceptors/filters (via mocked `ExecutionContext`).
>
>    ## Stack gotchas
>    - Supertest is flaky under Stryker — unit-test interceptors/filters with a mocked `ExecutionContext`; keep supertest in the Phase 14 e2e suite (excluded from Stryker via `jest.stryker.config.ts`).
>    - Test modules that call `Module.forRoot(...)` at file-load create attribution gaps — move the bootstrap into `beforeAll`.
>    - Static-mutant survivors (exported `const` / `Symbol` / `as const`) are killed by asserting their values, NOT by `ignoreStatic: true` (the app bar is 100).
>    - Genuine equivalent mutants are documented HERE (table below), not silenced inline.
>
>    ## Equivalent mutants (documented, accepted)
>    | Workspace | File:line | Mutator | Why equivalent |
>    | --------- | --------- | ------- | -------------- |
>    | _(none yet — fill during P15-6)_ | | | |
>
>    ## CI plan (Phase 17)
>    - `mutation.yml`: per-PR `mutation:incremental`, `dorny/paths-filter` per workspace, `actions/cache` of `reports/stryker-incremental.json`.
>    - `mutation-nightly.yml`: Monday 03:00 UTC full cold run; open an issue on regression.
>    ```
> 5. Run `markdown-link-check docs/stryker/*.md` (or the repo's documented link checker) and fix any dead relative links.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §Appendix C. English-only.
> - Do NOT harden survivors in this task — only **record** the baseline (hardening is P15-6). The point is an honest pre-hardening snapshot.
> - Do NOT invent numbers — copy them from the actual `reports/mutation/*.json` / clear-text output.
>   Verification:
>
> - `ls docs/stryker/BASELINE.md docs/stryker/HISTORY.md docs/stryker/IMPLEMENTATION_PLAN.md` — expected: all three exist.
> - `markdown-link-check docs/stryker/*.md` — expected: no dead links.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P15-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P15-6 — Verification gate — `pnpm mutation` green both workspaces (zero survivors)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (1–2 days)
- **Depends on:** `P15-1`, `P15-2`, `P15-3`, `P15-4`, `P15-5`

### Description

Phase 15 "Definition of done" gate: drive both workspaces to their thresholds with **zero surviving mutants** — `apps/api` at `break: 100`, `apps/web` with `lib/**` at 100 and `components/**` ≥ 90. Hardening is file-by-file via the HTML report: for each survivor, add or sharpen a unit assertion until it dies; genuine equivalents are documented in `docs/stryker/IMPLEMENTATION_PLAN.md` (never silenced with inline `// Stryker disable`). Closes the phase and updates the Stryker history.

### Acceptance Criteria

- [ ] `pnpm --filter api run mutation` exits 0 at `break: 100` (mutation score 100%, zero survivors, zero timeouts counted against the gate).
- [ ] `pnpm --filter web run mutation` exits 0: `lib/**` at 100% and `components/**` ≥ 90% (config `break: 90` satisfied).
- [ ] `pnpm mutation` (root fan-out) exits 0 across both workspaces.
- [ ] Every survivor was killed by a **real assertion** in a unit spec — no threshold lowered, no `ignoreStatic: true` added to dodge static mutants, no `--no-verify`, no inline `// Stryker disable` for a mutant a test could kill.
- [ ] Any genuinely equivalent mutant is listed in `docs/stryker/IMPLEMENTATION_PLAN.md` (Equivalent-mutants table) with file:line + mutator + why.
- [ ] `docs/stryker/HISTORY.md` gets a new top row per workspace for the final green run; `BASELINE.md` is left as the historical pre-hardening record.
- [ ] The unit suites still pass at 100% coverage (Phase 14 gate) after the added assertions — no regression.

### Files to create / modify

- `apps/api/**/*.spec.ts` — added/sharpened unit assertions to kill survivors.
- `apps/web/**/*.test.ts(x)` — added/sharpened unit assertions to kill survivors.
- `docs/stryker/HISTORY.md` — append the final green run rows.
- `docs/stryker/IMPLEMENTATION_PLAN.md` — fill the Equivalent-mutants table (if any).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS + React test engineer running a Stryker hardening session.
> Context: Task P15-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 15. DoD: `pnpm mutation` passes both workspaces with zero surviving mutants — `apps/api` `break: 100`, `apps/web` `lib/**` 100 / `components/**` ≥ 90. This is the example **app** bar (`break: 100`), distinct from the library's `break: 95`. Hardening is file-by-file off the HTML report; equivalents go to docs, never inline.
> Objective: Reach the thresholds with real assertions and close Phase 15.
> Steps:
>
> 1. Cold-run a workspace and open its report: `pnpm --filter api run mutation` → open `apps/api/reports/mutation/api.html`. Sort by "Survived" descending.
> 2. For each survivor: read the mutant diff, ask *"which existing test should have failed?"* — if none, write the unit test; if one exists but doesn't detect it, sharpen the assertion (usually a missing `.toBe(x)` / exact-object match). Re-run only that file fast: `pnpm --filter api exec stryker run --mutate "src/path/to/file.ts" --incremental`.
>    - Interceptors / filters: test with a **mocked `ExecutionContext`**, not supertest (supertest is flaky under Stryker and excluded from the runner).
>    - Test modules using `Module.forRoot(...)` at file scope: move the bootstrap into `beforeAll` so the mutant is attributed to a test.
>    - Static survivors (exported `const` / `Symbol` / `as const`): assert their values directly — do NOT set `ignoreStatic: true` to make them disappear.
> 3. When `apps/api` reports 100% with zero survivors, repeat for `apps/web` (`pnpm --filter web run mutation` → `apps/web/reports/mutation/web.html`). Hold `lib/**` to 100; for `components/**`, kill what is reasonable and rely on the `break: 90` floor — do NOT over-engineer UI mutants.
> 4. For any mutant no test can distinguish (observably identical behavior), record it in `docs/stryker/IMPLEMENTATION_PLAN.md` → Equivalent-mutants table (file:line, mutator, why). Do NOT silence it with an inline `// Stryker disable` comment.
> 5. Re-run the full gate cold to confirm: `pnpm mutation`. Then re-run `pnpm test:cov` to confirm the Phase 14 100% coverage gate still holds after the new assertions.
> 6. Append the final green run rows to `docs/stryker/HISTORY.md` (newest on top).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Guiding Principles (#6 No shortcuts): no `@ts-ignore`, no `eslint-disable`, no `--no-verify`, no lowering a threshold, no `ignoreStatic: true` to dodge the bar.
> - Kill survivors by asserting **observable behavior**, not implementation. Reframing a test around output often kills several survivors at once.
> - `apps/api` must reach exactly `break: 100`; `apps/web` `lib/**` must reach 100 even though the config floor is 90.
>   Verification:
>
> - `pnpm --filter api run mutation` — expected: exit 0, score 100%, zero survivors.
> - `pnpm --filter web run mutation` — expected: exit 0, `lib/**` 100% / `components/**` ≥ 90%.
> - `pnpm mutation` — expected: exit 0 across both workspaces.
> - `pnpm test:cov` — expected: exit 0, 100% coverage retained.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P15-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 15 is 6/6 — switch the Phase 15 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
