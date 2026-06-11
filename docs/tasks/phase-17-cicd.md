# Phase 17 — CI/CD & Release Automation — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-17--cicd--release-automation) §Phase 17
> **Total tasks:** 7
> **Progress:** 🟡 4 / 7 done (57%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Execution notes (2026-06-10)

All deliverable files were authored and statically verified (YAML parses, `docker compose -f docker-compose.prod.yml config` validates, Prettier + ESLint clean, the RELEASES.md append logic dry-runs correctly and is idempotent). Three real blockers prevent the phase's runtime "Definition of done" (green PR + published images) and gate P17-5/P17-6/P17-7:

1. **Images cannot build until the library publishes.** `@bymax-one/nest-logger` is consumed via a `file:`/`link:` spec pointing at the sibling `../../../nest-logger` checkout, which lives **outside** the Docker build context (the context is this repo root). `pnpm install --frozen-lockfile` inside either Dockerfile therefore cannot resolve it. The Dockerfiles are correct for the post-publish world; `docker build` can only be exercised once the library is on npm and the app dependency switches to a registry range. → blocks the `docker build` acceptance box on P17-5 and P17-6, and image publishing on P17-7.
2. **`export-usage-check` depends on a Phase 18 artifact.** `ci.yml`'s `export-usage-check` job runs `pnpm audit:exports` → `node scripts/audit-library-exports.mjs`, but that script is a **Phase 18 (P18-1)** deliverable that does not exist yet. The job is wired correctly but will fail until Phase 18 lands the script. → blocks a green CI run (P17-7).
3. **P17-7 is outward-facing.** It requires opening a real PR, pushing a `v*` tag, publishing GHCR images, and a bot commit to `main` — irreversible/outward-facing actions that the task runner does not perform autonomously. It awaits explicit owner action.

**Deviations from the task spec (justified by this repo's reality):**

- Web workspace filter is `web`, not `@nest-logger-example/web` (the package is named `web`); api Prisma generate is `db:generate` (there is no `prisma:generate`).
- API port is **3001** (not 4000) and web is **3003** per `.env.example`/Appendix A; the prod compose keeps Grafana on 3000 with web on 3003 (no collision).
- `mutation-nightly.yml` uses `stryker run --force` (the registered flag that runs all mutants / rebuilds the incremental file) instead of the spec's `--incremental false`, which Stryker's Commander CLI parses as a no-op.
- `release.yml`'s RELEASES.md append targets the repo's actual "Tested-version log" table (columns `Date | Example version | Library version | Notes`, `_pending_` placeholder row), inserting newest-on-top; the spec's `| \`v` first-row assumption does not match the file.
- Prisma-generate placeholder URLs are credential-free (`postgresql://localhost:5432/ci_placeholder`) to avoid tripping the environment's secret scanner; `prisma generate` never connects.
- `docker-compose.prod.yml` omits `apps/worker` (no published worker image — `release.yml` builds api + web only) and reads all runtime config from `.env` (no hardcoded secrets), every port loopback-bound.

## Task index

| ID    | Task                                                                 | Status | Priority | Size | Depends on          |
| ----- | -------------------------------------------------------------------- | ------ | -------- | ---- | ------------------- |
| P17-1 | `ci.yml` — install → lint/typecheck/unit/export-check, e2e, coverage | 🟢     | High     | L    | —                   |
| P17-2 | `mutation.yml` — per-PR incremental Stryker (`dorny/paths-filter`)   | 🟢     | High     | M    | P17-1               |
| P17-3 | `mutation-nightly.yml` — Monday 03:00 UTC full cold run + issue      | 🟢     | Medium   | M    | P17-2               |
| P17-4 | `release.yml` — `v*` tags → GHCR images → bot-append `RELEASES.md`   | 🟢     | High     | L    | P17-1, P17-5, P17-6 |
| P17-5 | `apps/api/Dockerfile` (multi-stage Node 24 alpine, source-maps)      | 🔵     | High     | M    | —                   |
| P17-6 | `apps/web/Dockerfile` + `docker-compose.prod.yml`                    | 🔵     | High     | M    | P17-5               |
| P17-7 | Verification gate — green PR + `v*` tag publishes images & RELEASES  | ⚪     | High     | M    | P17-1..P17-6        |

---

## P17-1 — `ci.yml` — install → lint/typecheck/unit/export-check, e2e, coverage

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** L (half-day)
- **Depends on:** `—`

### Description

Create the primary CI pipeline `.github/workflows/ci.yml`. It runs on every push and pull request targeting `main` / `next` and is the gate that branch protection requires. The job graph fans out from a single `install` job into the parallel quality jobs (`lint`, `typecheck`, `unit`, `export-usage-check`), runs the e2e suites in series (`e2e-api → e2e-web`), and aggregates with `coverage-report (needs: [unit, e2e-api, e2e-web])`. Per §2 Global Conventions and Appendix C, every job pins Node 24 + pnpm 10.8.0, installs with `--frozen-lockfile`, and the workflow declares `concurrency` with `cancel-in-progress: true` so only the latest commit on a ref runs. The **critical toolchain order** (Appendix C audit) is `pnpm/action-setup@v4` **before** `actions/setup-node@v5` with `cache: pnpm` — `setup-node` v5 errors if pnpm is not on `PATH` first (`actions/setup-node#1357`). This mirrors `nest-auth-example/.github/workflows/ci.yml` 1:1, adapted to this repo's package names (`@nest-logger-example/api`, `@nest-logger-example/web`) and the logger library.

### Acceptance Criteria

- [x] `.github/workflows/ci.yml` exists with `name: CI`.
- [x] Triggers: `push` + `pull_request` on branches `main` and `next`.
- [x] `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
- [x] Top-level `permissions: { contents: read }`.
- [x] Job `install` (needs nothing) runs checkout → `pnpm/action-setup@v4` (version `10.8.0`) → `actions/setup-node@v5` (`node-version: '24'`, `cache: pnpm`) → `pnpm install --frozen-lockfile`. The action order is setup-pnpm **before** setup-node in every job.
- [x] Jobs `lint`, `typecheck`, `unit`, `export-usage-check` each declare `needs: install`.
- [x] Job `lint` runs `pnpm lint`; `typecheck` runs `pnpm typecheck`; `unit` runs `pnpm test:cov` and uploads `apps/api/coverage/` + `apps/web/coverage/` as artifacts.
- [x] Job `e2e-api` (`needs: install`) brings up `docker-compose.test.yml` (`up -d --wait`), runs `pnpm --filter @nest-logger-example/api run test:e2e`, then tears down with `if: always()`.
- [x] Job `e2e-web` declares `needs: e2e-api`, runs Playwright in the `mcr.microsoft.com/playwright` container, builds api + web, runs `pnpm --filter @nest-logger-example/web run test:e2e`.
- [x] Job `export-usage-check` (`needs: install`) runs `node scripts/audit-library-exports.mjs`.
- [x] Job `coverage-report` declares `needs: [unit, e2e-api, e2e-web]`, `if: always()`, downloads the coverage artifacts and uploads a combined report.
- [x] `actionlint` (or GitHub's workflow parser) reports no syntax errors.

### Files to create / modify

- `.github/workflows/ci.yml` — primary CI pipeline.

### Agent Execution Prompt

> Role: Senior DevOps / TypeScript engineer wiring GitHub Actions for a pnpm monorepo.
> Context: Task P17-1 of `docs/DEVELOPMENT_PLAN.md` §Phase 17 (+ §2 Global Conventions + Appendix C — Quality Gates). This repo is the reference app for `@bymax-one/nest-logger`. Mirror the proven `nest-auth-example/.github/workflows/ci.yml` 1:1, adapting only the package names (`@nest-logger-example/api`, `@nest-logger-example/web`), library name, and DB name. Prereqs Phases 14–15 provide `pnpm test:cov` / `test:e2e` / coverage. The `install` job order encodes the Appendix C rule: `pnpm/action-setup@v4` BEFORE `actions/setup-node@v5` with `cache: pnpm`.
> Objective: Produce `/.github/workflows/ci.yml` with the full job graph.
> Steps:
>
> 1. Create `/.github/workflows/ci.yml`. Header + triggers + concurrency + permissions:
>
>    ```yaml
>    name: CI
>
>    on:
>      push:
>        branches: [main, next]
>      pull_request:
>        branches: [main, next]
>
>    concurrency:
>      group: ci-${{ github.ref }}
>      cancel-in-progress: true
>
>    permissions:
>      contents: read
>    ```
>
> 2. Add the `install` job — this is the canonical setup block reused (verbatim) in every other job. Note the action order:
>    ```yaml
>    jobs:
>      install:
>        name: Install dependencies
>        runs-on: ubuntu-latest
>        timeout-minutes: 10
>        steps:
>          - uses: actions/checkout@v5
>          - uses: pnpm/action-setup@v4
>            with:
>              version: 10.8.0
>          - uses: actions/setup-node@v5
>            with:
>              node-version: '24'
>              cache: pnpm
>          - run: pnpm install --frozen-lockfile
>    ```
> 3. Add `lint`, `typecheck` (both `needs: install`) — same setup block, then `- run: pnpm lint` / `- run: pnpm typecheck` respectively.
> 4. Add `unit` (`needs: install`) — same setup block, then:
>    ```yaml
>    - name: Run unit tests with coverage
>      run: pnpm test:cov
>    - name: Upload API coverage
>      if: always()
>      uses: actions/upload-artifact@v4
>      with:
>        name: coverage-unit-api
>        path: apps/api/coverage/
>        retention-days: 7
>    - name: Upload web coverage
>      if: always()
>      uses: actions/upload-artifact@v4
>      with:
>        name: coverage-unit-web
>        path: apps/web/coverage/
>        retention-days: 7
>    ```
> 5. Add `e2e-api` (`needs: install`) — same setup block, then bring up the test stack, run the suite, tear down:
>    ```yaml
>    - name: Start test infrastructure
>      run: docker compose -f docker-compose.test.yml up -d --wait
>    - name: Run API e2e tests
>      run: pnpm --filter @nest-logger-example/api run test:e2e
>    - name: Stop test infrastructure
>      if: always()
>      run: docker compose -f docker-compose.test.yml down -v
>    ```
> 6. Add `e2e-web` with `needs: e2e-api`, running inside the Playwright container (`container: { image: mcr.microsoft.com/playwright:v1.59.1-noble, options: --user root }`), the same setup block, `pnpm --filter @nest-logger-example/api run build`, `pnpm --filter @nest-logger-example/web run build`, then `pnpm --filter @nest-logger-example/web run test:e2e`. Upload `apps/web/test-results/` on failure.
> 7. Add `export-usage-check` (`needs: install`) — same setup block, then `- run: node scripts/audit-library-exports.mjs`.
> 8. Add `coverage-report`:
>    ```yaml
>    coverage-report:
>      name: Coverage report
>      needs: [unit, e2e-api, e2e-web]
>      if: always()
>      runs-on: ubuntu-latest
>      timeout-minutes: 5
>      steps:
>        - name: Download API coverage
>          uses: actions/download-artifact@v4
>          with: { name: coverage-unit-api, path: coverage/api }
>          continue-on-error: true
>        - name: Download web coverage
>          uses: actions/download-artifact@v4
>          with: { name: coverage-unit-web, path: coverage/web }
>          continue-on-error: true
>        - name: Upload combined coverage
>          uses: actions/upload-artifact@v4
>          with: { name: coverage-combined, path: coverage/, retention-days: 30 }
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions + Appendix C.
> - `pnpm/action-setup@v4` MUST precede `actions/setup-node@v5` in EVERY job (Appendix C: `actions/setup-node#1357`). Never reorder.
> - Pin `version: 10.8.0` for pnpm and `node-version: '24'` everywhere; always `--frozen-lockfile`.
> - Job names are contractual (branch-protection + the export audit reference them) — do NOT rename `install`/`lint`/`typecheck`/`unit`/`e2e-api`/`e2e-web`/`export-usage-check`/`coverage-report`.
> - Do NOT add a release/publish job here — that is P17-4.
>   Verification:
> - `actionlint .github/workflows/ci.yml` — expected: no errors (or `npx --yes @action-validator/cli .github/workflows/ci.yml`).
> - `node -e "const y=require('js-yaml');y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));console.log('ok')"` — expected: `ok`.
> - `grep -n "cancel-in-progress: true" .github/workflows/ci.yml` — expected: match.
> - Confirm in the file that `pnpm/action-setup@v4` appears before `actions/setup-node@v5` in each job block.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P17-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P17-2 — `mutation.yml` — per-PR incremental Stryker (`dorny/paths-filter`)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (2–4 h)
- **Depends on:** `P17-1`

### Description

Create `.github/workflows/mutation.yml`, the per-PR mutation-testing gate. A `detect` job uses `dorny/paths-filter@v3` to decide which workspace(s) changed (`apps/api`, `apps/web`); the `mutation-api` / `mutation-web` jobs run only when their filter is `true`. Each job restores the Stryker **incremental cache** (`reports/stryker-incremental.json`) via `actions/cache@v4` — keyed on `${{ github.ref }}-${{ github.sha }}` with `restore-keys` falling back to the ref then `main` — so most PRs finish in under two minutes. Per Appendix C the Stryker `break` threshold is `100` in both workspaces, so any surviving mutant fails the job and blocks merge. The mutation jobs check out with `fetch-depth: 0` so Stryker's incremental diff can compare against the base on the first PR run. This mirrors `nest-auth-example/.github/workflows/mutation.yml` 1:1, adapted to this repo (the api filter also watches `apps/worker/**` because the worker shares the api Stryker surface per §Phase 9).

### Acceptance Criteria

- [x] `.github/workflows/mutation.yml` exists with `name: Mutation Testing (PR)`.
- [x] Triggers on `pull_request` with a `paths:` allow-list covering `apps/api/**`, `apps/worker/**`, `apps/web/**`, `pnpm-lock.yaml`, `.github/workflows/mutation.yml`.
- [x] `concurrency: { group: mutation-${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`.
- [x] `permissions: { contents: read, pull-requests: read }`.
- [x] Job `detect` runs `dorny/paths-filter@v3` (id `filter`) and exposes `outputs.api` + `outputs.web`.
- [x] Job `mutation-api` declares `needs: detect`, `if: needs.detect.outputs.api == 'true'`, checks out with `fetch-depth: 0`, uses the canonical setup block (`pnpm/action-setup@v4` → `actions/setup-node@v5` `node-version: '24'` `cache: pnpm`), restores cache `apps/api/reports/stryker-incremental.json`, and runs `pnpm mutation:incremental --filter @nest-logger-example/api` (or the repo's api-scoped incremental mutation script).
- [x] Job `mutation-web` is the symmetric web variant gated on `outputs.web`, caching `apps/web/reports/stryker-incremental.json`.
- [x] Both jobs upload `apps/<ws>/reports/mutation/` as an artifact with `if: always()`.

### Files to create / modify

- `.github/workflows/mutation.yml` — per-PR mutation gate.

### Agent Execution Prompt

> Role: Senior DevOps / TypeScript engineer.
> Context: Task P17-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 17 (+ Appendix C). Mirror `nest-auth-example/.github/workflows/mutation.yml` 1:1. Stryker thresholds are `{ high: 100, low: 100, break: 100 }` (Phase 15). The api change-filter must also watch `apps/worker/**` (the worker is part of the api mutation surface, §Phase 9). Use this repo's mutation scripts from §2 — the root exposes `mutation:incremental`; invoke it per-workspace with `--filter`.
> Objective: Produce `/.github/workflows/mutation.yml`.
> Steps:
>
> 1. Header + triggers + concurrency + permissions:
>
>    ```yaml
>    name: Mutation Testing (PR)
>
>    on:
>      pull_request:
>        paths:
>          - 'apps/api/src/**'
>          - 'apps/api/test/**'
>          - 'apps/api/stryker.config.json'
>          - 'apps/api/jest.stryker.config.ts'
>          - 'apps/api/package.json'
>          - 'apps/api/tsconfig*.json'
>          - 'apps/api/prisma/schema.prisma'
>          - 'apps/worker/src/**'
>          - 'apps/worker/test/**'
>          - 'apps/web/app/**'
>          - 'apps/web/lib/**'
>          - 'apps/web/components/**'
>          - 'apps/web/stryker.config.json'
>          - 'apps/web/package.json'
>          - 'apps/web/tsconfig*.json'
>          - 'apps/web/vitest.config.ts'
>          - 'pnpm-lock.yaml'
>          - '.github/workflows/mutation.yml'
>
>    concurrency:
>      group: mutation-${{ github.workflow }}-${{ github.ref }}
>      cancel-in-progress: true
>
>    permissions:
>      contents: read
>      pull-requests: read
>    ```
>
> 2. `detect` job — the same `paths` expressed as `dorny/paths-filter` filters, exposing two outputs:
>    ```yaml
>    jobs:
>      detect:
>        name: Detect changed workspaces
>        runs-on: ubuntu-latest
>        timeout-minutes: 5
>        outputs:
>          api: ${{ steps.filter.outputs.api }}
>          web: ${{ steps.filter.outputs.web }}
>        steps:
>          - uses: actions/checkout@v5
>          - uses: dorny/paths-filter@v3
>            id: filter
>            with:
>              filters: |
>                api:
>                  - 'apps/api/src/**'
>                  - 'apps/api/test/**'
>                  - 'apps/api/stryker.config.json'
>                  - 'apps/worker/src/**'
>                  - 'apps/worker/test/**'
>                  - 'pnpm-lock.yaml'
>                  - '.github/workflows/mutation.yml'
>                web:
>                  - 'apps/web/app/**'
>                  - 'apps/web/lib/**'
>                  - 'apps/web/components/**'
>                  - 'apps/web/stryker.config.json'
>                  - 'pnpm-lock.yaml'
>                  - '.github/workflows/mutation.yml'
>    ```
> 3. `mutation-api` job:
>    ```yaml
>    mutation-api:
>      name: Mutation — apps/api
>      needs: detect
>      if: needs.detect.outputs.api == 'true'
>      runs-on: ubuntu-latest
>      timeout-minutes: 30
>      steps:
>        - uses: actions/checkout@v5
>          with:
>            fetch-depth: 0
>        - uses: pnpm/action-setup@v4
>          with:
>            version: 10.8.0
>        - uses: actions/setup-node@v5
>          with:
>            node-version: '24'
>            cache: pnpm
>        - run: pnpm install --frozen-lockfile
>        - name: Generate Prisma client
>          working-directory: apps/api
>          run: pnpm prisma:generate
>          env:
>            DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ci_placeholder
>        - name: Restore Stryker incremental cache (api)
>          uses: actions/cache@v4
>          with:
>            path: apps/api/reports/stryker-incremental.json
>            key: stryker-incremental-api-${{ github.ref }}-${{ github.sha }}
>            restore-keys: |
>              stryker-incremental-api-${{ github.ref }}-
>              stryker-incremental-api-refs/heads/main-
>        - name: Run mutation testing (api)
>          run: pnpm mutation:incremental --filter @nest-logger-example/api
>        - name: Upload mutation HTML report (api)
>          if: always()
>          uses: actions/upload-artifact@v4
>          with:
>            name: mutation-report-api
>            path: apps/api/reports/mutation/
>            retention-days: 30
>    ```
> 4. `mutation-web` job — the symmetric copy: `if: needs.detect.outputs.web == 'true'`, no Prisma step, cache path `apps/web/reports/stryker-incremental.json` (key prefix `stryker-incremental-web-`), run `pnpm mutation:incremental --filter @nest-logger-example/web`, upload `apps/web/reports/mutation/`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + Appendix C.
> - `pnpm/action-setup@v4` BEFORE `actions/setup-node@v5` (Appendix C), `cache: pnpm`, Node 24, pnpm 10.8.0, `--frozen-lockfile`.
> - `fetch-depth: 0` is REQUIRED on the mutation jobs (Stryker incremental diff vs base).
> - Do NOT run a cold full run here — that is the nightly job (P17-3).
>   Verification:
> - `actionlint .github/workflows/mutation.yml` — expected: no errors.
> - `grep -n "dorny/paths-filter@v3" .github/workflows/mutation.yml` — expected: match.
> - `grep -n "fetch-depth: 0" .github/workflows/mutation.yml` — expected: two matches (api + web).
> - `grep -n "stryker-incremental.json" .github/workflows/mutation.yml` — expected: two matches.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P17-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P17-3 — `mutation-nightly.yml` — Monday 03:00 UTC full cold run + issue

- **Status:** 🟢 Done
- **Priority:** Medium
- **Size:** M (2–4 h)
- **Depends on:** `P17-2`

### Description

Create `.github/workflows/mutation-nightly.yml`, the weekly full (non-incremental) Stryker run that catches drift the per-PR incremental cache might mask (cross-file refactors, stale-baseline corruption). It runs on a `schedule` cron of `0 3 * * 1` (Mondays 03:00 UTC) and is also `workflow_dispatch`-able. Both `full-api` and `full-web` jobs run `stryker run --incremental false` to force a true cold baseline (no cache file consulted). Per Appendix C "Mutation drift" this workflow's job is to **report and open an issue on regression** — on failure it creates (or reuses) a GitHub issue labelled `mutation-drift` via the `gh` CLI so the team is alerted before the next PR merges. Mirrors `nest-auth-example/.github/workflows/mutation-nightly.yml`, adding the issue-on-regression step (the requested deliverable).

### Acceptance Criteria

- [x] `.github/workflows/mutation-nightly.yml` exists with `name: Mutation Testing (Nightly Full)`.
- [x] Triggers: `schedule` with `cron: '0 3 * * 1'` (Monday 03:00 UTC) **and** `workflow_dispatch`.
- [x] `permissions` include `contents: read` and `issues: write` (for the issue-on-regression step).
- [x] Job `full-api` checks out `fetch-depth: 0`, uses the canonical setup block (Node 24, pnpm 10.8.0, `cache: pnpm`, setup-pnpm before setup-node), generates the Prisma client, and runs `pnpm exec stryker run --incremental false` in `apps/api`.
- [x] Job `full-web` is the symmetric web variant (no Prisma step) running `pnpm exec stryker run --incremental false` in `apps/web`.
- [x] Both jobs upload `apps/<ws>/reports/mutation/` (`if: always()`, `retention-days: 90`).
- [x] On failure, a step opens/updates a GitHub issue labelled `mutation-drift` (using `gh issue create` / `gh issue list`, `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`) — gated with `if: failure()`.

### Files to create / modify

- `.github/workflows/mutation-nightly.yml` — weekly full mutation run + drift alert.

### Agent Execution Prompt

> Role: Senior DevOps / TypeScript engineer.
> Context: Task P17-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 17 (+ Appendix C "Mutation drift: report; issue on regression"). Mirror `nest-auth-example/.github/workflows/mutation-nightly.yml` and ADD the issue-on-regression step. `--incremental false` overrides the JSON config to force a cold baseline.
> Objective: Produce `/.github/workflows/mutation-nightly.yml`.
> Steps:
>
> 1. Header + triggers + permissions:
>
>    ```yaml
>    name: Mutation Testing (Nightly Full)
>
>    on:
>      schedule:
>        - cron: '0 3 * * 1' # Mondays at 03:00 UTC
>      workflow_dispatch:
>
>    permissions:
>      contents: read
>      issues: write
>    ```
>
> 2. `full-api` job:
>    ```yaml
>    jobs:
>      full-api:
>        name: Mutation full — apps/api
>        runs-on: ubuntu-latest
>        timeout-minutes: 45
>        steps:
>          - uses: actions/checkout@v5
>            with:
>              fetch-depth: 0
>          - uses: pnpm/action-setup@v4
>            with:
>              version: 10.8.0
>          - uses: actions/setup-node@v5
>            with:
>              node-version: '24'
>              cache: pnpm
>          - run: pnpm install --frozen-lockfile
>          - name: Generate Prisma client
>            working-directory: apps/api
>            run: pnpm prisma:generate
>            env:
>              DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ci_placeholder
>          - name: Run full mutation testing (api)
>            working-directory: apps/api
>            run: pnpm exec stryker run --incremental false
>          - name: Upload full mutation HTML report (api)
>            if: always()
>            uses: actions/upload-artifact@v4
>            with:
>              name: mutation-report-api-full
>              path: apps/api/reports/mutation/
>              retention-days: 90
>          - name: Open drift issue on regression (api)
>            if: failure()
>            env:
>              GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
>            run: |
>              TITLE="Mutation drift detected (api) — $(date -u +%Y-%m-%d)"
>              if gh issue list --label mutation-drift --state open \
>                   --search "in:title (api)" | grep -q .; then
>                echo "Open mutation-drift issue already exists — skipping."
>                exit 0
>              fi
>              gh issue create \
>                --title "${TITLE}" \
>                --label mutation-drift \
>                --body "The weekly full Stryker run on \`apps/api\` regressed below \`break: 100\`. Run \`pnpm mutation:incremental --filter @nest-logger-example/api\` locally to investigate. Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
>    ```
> 3. `full-web` job — symmetric copy: no Prisma step, `working-directory: apps/web`, run `pnpm exec stryker run --incremental false`, upload `mutation-report-web-full`, and the same `if: failure()` `gh issue create` step (title/body say `web`, search `in:title (web)`).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + Appendix C.
> - `pnpm/action-setup@v4` BEFORE `actions/setup-node@v5` (Appendix C), `cache: pnpm`, Node 24, pnpm 10.8.0, `--frozen-lockfile`.
> - `--incremental false` is REQUIRED (this is the cold safety-net run).
> - The PR gate in `mutation.yml` remains primary enforcement; this is the safety net — do NOT make it block merges.
>   Verification:
> - `actionlint .github/workflows/mutation-nightly.yml` — expected: no errors.
> - `grep -n "cron: '0 3 \* \* 1'" .github/workflows/mutation-nightly.yml` — expected: match.
> - `grep -n "incremental false" .github/workflows/mutation-nightly.yml` — expected: two matches.
> - `grep -n "mutation-drift" .github/workflows/mutation-nightly.yml` — expected: matches in both jobs.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P17-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P17-4 — `release.yml` — `v*` tags → GHCR images → bot-append `RELEASES.md`

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** L (half-day)
- **Depends on:** `P17-1`, `P17-5`, `P17-6`

### Description

Create `.github/workflows/release.yml`, the release pipeline triggered by `v*` tags. The `build-and-push` job builds the production images for `apps/api` and `apps/web` and pushes them to GHCR as `ghcr.io/bymaxone/nest-logger-example-{api,web}:<tag>`. It authenticates to GHCR with **OIDC** (`permissions.id-token: write` scoped to the job) plus `packages: write`, and guards each image with an idempotent `docker manifest inspect` existence check so a partial failure (api pushed, web failed) can be retried without overwriting the api image. A second `update-releases-doc` job (`needs: build-and-push`, `permissions.contents: write`) bot-appends a row to `docs/RELEASES.md`. **Anti-injection:** the tag and any release-note text are passed to the append script via **environment variables**, never interpolated directly into the shell/script body (`${{ github.event.head_commit.message }}` and friends must never be inlined into a `run:` string). Mirrors `nest-auth-example/.github/workflows/release.yml`, adapted to this repo's image names and library `@bymax-one/nest-logger`.

### Acceptance Criteria

- [x] `.github/workflows/release.yml` exists with `name: Release`.
- [x] Trigger: `push` on `tags: ['v*']`.
- [x] Top-level `permissions: { contents: read }`; the `build-and-push` job adds `packages: write` + `id-token: write` (OIDC).
- [x] `build-and-push` runs an idempotent `docker manifest inspect` check per image, logs in to GHCR via `docker/login-action@v3`, builds + pushes `ghcr.io/bymaxone/nest-logger-example-api` (from `apps/api/Dockerfile`) and `ghcr.io/bymaxone/nest-logger-example-web` (from `apps/web/Dockerfile`) using `docker/metadata-action@v5` + `docker/build-push-action@v6`.
- [x] Each build step is gated `if: steps.<img>-exists.outputs.exists != 'true'`.
- [x] The web image build passes `NEXT_PUBLIC_*` via `build-args` from repository `vars` with safe fallbacks.
- [x] `update-releases-doc` (`needs: build-and-push`, `permissions.contents: write`) checks out `main`, appends a row to `docs/RELEASES.md` only if the tag is not already present, and pushes a bot commit via `stefanzweifel/git-auto-commit-action@v5` with `[skip ci]` in the message.
- [x] The tag + release-note values are passed to the append step as **env vars** (`TAG: ${{ github.ref_name }}`, etc.); no untrusted `${{ ... }}` is interpolated inside a `run:` script body.

### Files to create / modify

- `.github/workflows/release.yml` — `v*` → GHCR + RELEASES.md.

### Agent Execution Prompt

> Role: Senior DevOps engineer wiring container release automation.
> Context: Task P17-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 17. Mirror `nest-auth-example/.github/workflows/release.yml`. Images: `ghcr.io/bymaxone/nest-logger-example-{api,web}`. The library tracked in `RELEASES.md` is `@bymax-one/nest-logger`. Requires P17-5 (`apps/api/Dockerfile`) and P17-6 (`apps/web/Dockerfile`). SECURITY: GHCR auth via OIDC (`id-token: write`); release-note text via env vars only (script-injection hardening).
> Objective: Produce `/.github/workflows/release.yml`.
> Steps:
>
> 1. Header + trigger + top-level permissions:
>
>    ```yaml
>    name: Release
>
>    on:
>      push:
>        tags:
>          - 'v*'
>
>    permissions:
>      contents: read
>    ```
>
> 2. `build-and-push` job with job-scoped OIDC permissions and per-image idempotency guards:
>    ```yaml
>    jobs:
>      build-and-push:
>        name: Build and push Docker images
>        runs-on: ubuntu-latest
>        timeout-minutes: 30
>        permissions:
>          contents: read
>          packages: write
>          id-token: write
>        steps:
>          - uses: actions/checkout@v5
>          - uses: pnpm/action-setup@v4
>            with:
>              version: 10.8.0
>          - uses: actions/setup-node@v5
>            with:
>              node-version: '24'
>          - name: Check if API image already exists
>            id: api-exists
>            run: |
>              if docker manifest inspect "ghcr.io/bymaxone/nest-logger-example-api:${{ github.ref_name }}" > /dev/null 2>&1; then
>                echo "exists=true" >> "${GITHUB_OUTPUT}"
>              else
>                echo "exists=false" >> "${GITHUB_OUTPUT}"
>              fi
>          - name: Check if web image already exists
>            id: web-exists
>            run: |
>              if docker manifest inspect "ghcr.io/bymaxone/nest-logger-example-web:${{ github.ref_name }}" > /dev/null 2>&1; then
>                echo "exists=true" >> "${GITHUB_OUTPUT}"
>              else
>                echo "exists=false" >> "${GITHUB_OUTPUT}"
>              fi
>          - name: Log in to GHCR
>            if: >-
>              steps.api-exists.outputs.exists != 'true' ||
>              steps.web-exists.outputs.exists != 'true'
>            uses: docker/login-action@v3
>            with:
>              registry: ghcr.io
>              username: ${{ github.actor }}
>              password: ${{ secrets.GITHUB_TOKEN }}
>    ```
> 3. API image steps (gated on `api-exists`): `docker/metadata-action@v5` (`images: ghcr.io/bymaxone/nest-logger-example-api`, `flavor: latest=auto`, semver tags) then `docker/build-push-action@v6` (`context: .`, `file: apps/api/Dockerfile`, `push: true`, tags/labels from metadata).
> 4. Web image steps (gated on `web-exists`): same pattern with `images: ghcr.io/bymaxone/nest-logger-example-web`, `file: apps/web/Dockerfile`, plus:
>    ```yaml
>    build-args: |
>      NEXT_PUBLIC_API_URL=${{ vars.NEXT_PUBLIC_API_URL || 'https://example.com/api' }}
>      NEXT_PUBLIC_GRAFANA_URL=${{ vars.NEXT_PUBLIC_GRAFANA_URL || 'https://example.com/grafana' }}
>    ```
> 5. `update-releases-doc` job — pass values via env, harden against injection:
>    ```yaml
>    update-releases-doc:
>      name: Update RELEASES.md
>      needs: build-and-push
>      runs-on: ubuntu-latest
>      timeout-minutes: 10
>      permissions:
>        contents: write
>      steps:
>        - uses: actions/checkout@v5
>          with:
>            ref: main
>            token: ${{ secrets.GITHUB_TOKEN }}
>        - name: Append row to RELEASES.md
>          env:
>            TAG: ${{ github.ref_name }}
>          run: |
>            # Idempotency: skip if this tag is already recorded.
>            if grep -qF "| \`${TAG}\`" docs/RELEASES.md; then
>              echo "Tag ${TAG} already present — skipping."
>              exit 0
>            fi
>            LIB_VERSION=$(jq -r '.dependencies["@bymax-one/nest-logger"] // ""' apps/api/package.json | sed 's/^[^0-9]*//')
>            DATE=$(date -u +%Y-%m-%d)
>            python3 - "$TAG" "$LIB_VERSION" "$DATE" << 'PYEOF'
>            import sys, re, pathlib
>            tag, lib, date = sys.argv[1], sys.argv[2], sys.argv[3]
>            path = pathlib.Path('docs/RELEASES.md')
>            content = path.read_text()
>            new_row = f'| `{tag}` | `@bymax-one/nest-logger@{lib}` | {date} | | [CHANGELOG](../CHANGELOG.md) |\n'
>            content = re.sub(r'(?m)(^\| `v)', new_row + r'\1', content, count=1)
>            path.write_text(content)
>            PYEOF
>        - name: Push bot commit
>          uses: stefanzweifel/git-auto-commit-action@v5
>          with:
>            commit_message: 'chore(release): record ${{ github.ref_name }} in RELEASES.md [skip ci]'
>            commit_user_name: github-actions[bot]
>            commit_user_email: github-actions[bot]@users.noreply.github.com
>            file_pattern: docs/RELEASES.md
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + Appendix C. `pnpm/action-setup@v4` BEFORE `actions/setup-node@v5`.
> - SECURITY — pass the tag / any release-note text through `env:` and reference `${VAR}` inside the script; NEVER inline untrusted `${{ github.event.* }}` into a `run:` body (GitHub script-injection class).
> - OIDC: keep `id-token: write` scoped to `build-and-push` only; top-level stays `contents: read`.
> - If `docs/RELEASES.md` does not yet exist, it is created by Phase 16 — the append regex assumes the table's first data row begins `| \`v`.
> - Do NOT push the images on non-tag events; the trigger is `tags: ['v*']` only.
>   Verification:
> - `actionlint .github/workflows/release.yml` — expected: no errors.
> - `grep -n "id-token: write" .github/workflows/release.yml` — expected: match (job-scoped).
> - `grep -n "ghcr.io/bymaxone/nest-logger-example-" .github/workflows/release.yml` — expected: api + web matches.
> - `grep -n "TAG: \${{ github.ref_name }}" .github/workflows/release.yml` — expected: match (env-var pass-through).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P17-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P17-5 — `apps/api/Dockerfile` (multi-stage Node 24 alpine, source-maps)

- **Status:** 🔵 In Review — authored; `docker build` blocked until the library publishes (see note)
- **Priority:** High
- **Size:** M (2–4 h)
- **Depends on:** `—`

### Description

Create `apps/api/Dockerfile`, the production image for the NestJS API consumed by `release.yml` (P17-4). It is a multi-stage build on `node:24-alpine`: a `deps` stage installs with `pnpm install --frozen-lockfile`, a `build` stage compiles (`pnpm --filter @nest-logger-example/api run build` + `prisma generate`), and a slim `runner` stage copies only `dist/` + production `node_modules` and runs as a non-root user. The default `CMD` runs Node with source maps enabled — `node --enable-source-maps dist/main.js` — so OTel/stack traces map back to TypeScript (matches the logger's diagnostic posture). The image also exposes a `start:instrumented` variant entrypoint that pre-loads the OTel instrumentation (`node --enable-source-maps --import ./dist/instrumentation.js dist/main.js`) for environments that want the SDK started via `--import` rather than the in-process bootstrap. Build context is the repo root (so the workspace lockfile + library link resolve).

### Acceptance Criteria

- [ ] `apps/api/Dockerfile` exists, multi-stage, all stages `FROM node:24-alpine` (pinned major 24).
- [ ] `corepack enable` + `pnpm@10.8.0` pinned; deps installed with `pnpm install --frozen-lockfile`.
- [ ] A build stage runs `prisma generate` + `pnpm --filter @nest-logger-example/api run build` producing `dist/`.
- [ ] The `runner` stage copies only `dist/` + production deps, sets `NODE_ENV=production`, creates/uses a non-root user, and `EXPOSE`s the API port.
- [ ] Default `CMD` is `["node", "--enable-source-maps", "dist/main.js"]`.
- [ ] A documented `start:instrumented` variant is present (commented alternate `CMD`/`ENTRYPOINT` or a build `ARG`) using `--import ./dist/instrumentation.js`.
- [ ] `.dockerignore` (repo root or `apps/api`) excludes `node_modules`, `.git`, `coverage`, `reports`, `.stryker-tmp`, `dist`, `.next`.
- [ ] `docker build -f apps/api/Dockerfile -t nest-logger-example-api:local .` succeeds locally.

### Files to create / modify

- `apps/api/Dockerfile` — production API image.
- `.dockerignore` — build-context excludes (create if missing).

### Agent Execution Prompt

> Role: Senior DevOps engineer authoring production Dockerfiles for a pnpm monorepo.
> Context: Task P17-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 17. This image is built/pushed by `release.yml` (P17-4) as `ghcr.io/bymaxone/nest-logger-example-api`. Node `>=24`, pnpm `10.8.0`, ESM. The runtime must enable source maps (`node --enable-source-maps`) so OTel traces map to TS. Build context is the REPO ROOT (workspace lockfile + `@bymax-one/nest-logger` link).
> Objective: Produce `/apps/api/Dockerfile` (+ a root `.dockerignore` if absent).
> Steps:
>
> 1. Create `/apps/api/Dockerfile`:
>
>    ```dockerfile
>    # syntax=docker/dockerfile:1
>
>    # ── deps ─────────────────────────────────────────────────────────────────
>    FROM node:24-alpine AS deps
>    RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
>    WORKDIR /app
>    COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
>    COPY apps/api/package.json apps/api/package.json
>    RUN pnpm install --frozen-lockfile
>
>    # ── build ────────────────────────────────────────────────────────────────
>    FROM node:24-alpine AS build
>    RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
>    WORKDIR /app
>    COPY --from=deps /app/node_modules ./node_modules
>    COPY . .
>    RUN pnpm --filter @nest-logger-example/api run prisma:generate \
>     && pnpm --filter @nest-logger-example/api run build
>
>    # ── runner ───────────────────────────────────────────────────────────────
>    FROM node:24-alpine AS runner
>    WORKDIR /app
>    ENV NODE_ENV=production
>    # Non-root runtime.
>    RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
>    COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./dist
>    COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
>    USER nestjs
>    EXPOSE 4000
>    # Source maps map OTel/stack traces back to TypeScript.
>    CMD ["node", "--enable-source-maps", "dist/main.js"]
>    # start:instrumented variant — preload the OTel SDK via --import:
>    #   CMD ["node", "--enable-source-maps", "--import", "./dist/instrumentation.js", "dist/main.js"]
>    ```
>
> 2. If `/.dockerignore` does not exist, create it:
>    ```
>    **/node_modules
>    **/dist
>    **/.next
>    **/coverage
>    **/reports
>    **/.stryker-tmp
>    .git
>    .github
>    **/*.log
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2. Pin `node:24-alpine` and `pnpm@10.8.0`; install with `--frozen-lockfile`.
> - Run as a non-root user in the final stage; copy ONLY `dist/` + `node_modules` (no source/tests in the image).
> - Keep `--enable-source-maps` in the default `CMD` (do not strip it for size).
> - Adjust `EXPOSE` to the API's actual `PORT` (Appendix A) if it differs from `4000`.
>   Verification:
> - `docker build -f apps/api/Dockerfile -t nest-logger-example-api:local .` — expected: build succeeds.
> - `docker run --rm nest-logger-example-api:local node -e "console.log(process.version)"` — expected: `v24.*`.
> - `grep -n "enable-source-maps" apps/api/Dockerfile` — expected: match in the default CMD.
> - `hadolint apps/api/Dockerfile` — expected: no errors (warnings acceptable).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P17-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P17-6 — `apps/web/Dockerfile` + `docker-compose.prod.yml`

- **Status:** 🔵 In Review — compose validates; `docker build` blocked until the library publishes (see note)
- **Priority:** High
- **Size:** M (2–4 h)
- **Depends on:** `P17-5`

### Description

Create `apps/web/Dockerfile`, the production image for the Next.js 16 dashboard consumed by `release.yml` (P17-4), plus `docker-compose.prod.yml`, which composes the full production-shaped stack (api + web + worker + Postgres + the observability backend) from the published GHCR images. The web Dockerfile is a multi-stage `node:24-alpine` build that produces Next.js **standalone** output (`output: 'standalone'`) so the runner stage is minimal; `NEXT_PUBLIC_*` values are baked at **build time** via `ARG`/`ENV` (they are inlined into the client bundle) and must therefore be passed as `build-args` from `release.yml`. `docker-compose.prod.yml` references `ghcr.io/bymaxone/nest-logger-example-{api,web}:${TAG:-latest}`, wires healthchecks + named volumes, binds host ports to `127.0.0.1`, and reads runtime config from `.env`.

### Acceptance Criteria

- [ ] `apps/web/Dockerfile` exists, multi-stage, all stages `FROM node:24-alpine`.
- [ ] `corepack enable` + `pnpm@10.8.0`; install with `pnpm install --frozen-lockfile`.
- [ ] Build stage declares `ARG NEXT_PUBLIC_API_URL` + `ARG NEXT_PUBLIC_GRAFANA_URL`, promotes them to `ENV`, then runs `pnpm --filter @nest-logger-example/web run build`.
- [ ] Web build uses Next.js standalone output; the `runner` stage copies `.next/standalone`, `.next/static`, and `public/`, runs as non-root, `EXPOSE`s the web port, and `CMD ["node", "server.js"]`.
- [ ] `docker-compose.prod.yml` exists referencing `ghcr.io/bymaxone/nest-logger-example-api` + `-web` images (tag via `${TAG:-latest}`), plus `postgres:18-alpine` and the observability services, with healthchecks, named volumes, and `127.0.0.1`-bound ports.
- [ ] `docker-compose.prod.yml` reads env from `.env` (`env_file:` or `${VAR}` interpolation) and does NOT hardcode secrets.
- [ ] `docker build -f apps/web/Dockerfile -t nest-logger-example-web:local .` succeeds; `docker compose -f docker-compose.prod.yml config` validates.

### Files to create / modify

- `apps/web/Dockerfile` — production web image.
- `docker-compose.prod.yml` — production-shaped compose stack.

### Agent Execution Prompt

> Role: Senior DevOps engineer authoring a Next.js production image + a prod compose file.
> Context: Task P17-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 17. Built/pushed by `release.yml` (P17-4) as `ghcr.io/bymaxone/nest-logger-example-web`. Next.js 16 standalone output; `NEXT_PUBLIC_*` are baked at build time (passed as `build-args` from the release workflow). Mirror the structure of `nest-auth-example`'s web Dockerfile + prod compose. Requires P17-5 (api image) for the compose stack.
> Objective: Produce `/apps/web/Dockerfile` and `/docker-compose.prod.yml`.
> Steps:
>
> 1. Create `/apps/web/Dockerfile`:
>
>    ```dockerfile
>    # syntax=docker/dockerfile:1
>
>    FROM node:24-alpine AS deps
>    RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
>    WORKDIR /app
>    COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
>    COPY apps/web/package.json apps/web/package.json
>    RUN pnpm install --frozen-lockfile
>
>    FROM node:24-alpine AS build
>    RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
>    WORKDIR /app
>    # NEXT_PUBLIC_* are inlined into the client bundle at build time.
>    ARG NEXT_PUBLIC_API_URL
>    ARG NEXT_PUBLIC_GRAFANA_URL
>    ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
>    ENV NEXT_PUBLIC_GRAFANA_URL=${NEXT_PUBLIC_GRAFANA_URL}
>    COPY --from=deps /app/node_modules ./node_modules
>    COPY . .
>    RUN pnpm --filter @nest-logger-example/web run build
>
>    FROM node:24-alpine AS runner
>    WORKDIR /app
>    ENV NODE_ENV=production
>    RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
>    # Next.js standalone server bundle (requires output: 'standalone').
>    COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
>    COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
>    COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
>    USER nextjs
>    EXPOSE 3000
>    CMD ["node", "apps/web/server.js"]
>    ```
>
> 2. Ensure `apps/web/next.config.*` sets `output: 'standalone'` (note it in the task; the Phase 11 config should already do this — if not, add it).
> 3. Create `/docker-compose.prod.yml` composing the published images + backing services:
>    ```yaml
>    services:
>      api:
>        image: ghcr.io/bymaxone/nest-logger-example-api:${TAG:-latest}
>        env_file: .env
>        depends_on:
>          postgres:
>            condition: service_healthy
>        ports:
>          - '127.0.0.1:4000:4000'
>        restart: unless-stopped
>      web:
>        image: ghcr.io/bymaxone/nest-logger-example-web:${TAG:-latest}
>        env_file: .env
>        depends_on:
>          - api
>        ports:
>          - '127.0.0.1:3000:3000'
>        restart: unless-stopped
>      postgres:
>        image: postgres:18-alpine
>        environment:
>          POSTGRES_USER: ${POSTGRES_USER:-postgres}
>          POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
>          POSTGRES_DB: ${POSTGRES_DB:-logger_example}
>        healthcheck:
>          test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-postgres}']
>          interval: 5s
>          timeout: 3s
>          retries: 10
>        volumes:
>          - pgdata:/var/lib/postgresql/data
>        ports:
>          - '127.0.0.1:5432:5432'
>    volumes:
>      pgdata:
>    ```
>    Extend with the worker + observability services (`loki`, `tempo`, `otel-collector`, `grafana`) mirroring `docker-compose.yml` from Phase 1, all `127.0.0.1`-bound with healthchecks + named volumes.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2. Pin `node:24-alpine`, `pnpm@10.8.0`, `postgres:18-alpine`; install `--frozen-lockfile`.
> - `NEXT_PUBLIC_*` MUST be `ARG`/`ENV` at build time (they are inlined into the client bundle) — do NOT expect them to work as runtime-only env.
> - Run the web runner as non-root; ship ONLY the standalone output (no source/tests).
> - `docker-compose.prod.yml` must NOT hardcode secrets — read from `.env`; bind host ports to `127.0.0.1` only.
>   Verification:
> - `docker build -f apps/web/Dockerfile -t nest-logger-example-web:local --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 .` — expected: build succeeds.
> - `docker compose -f docker-compose.prod.yml config` — expected: validates without error.
> - `grep -n "output: 'standalone'" apps/web/next.config.*` — expected: match.
> - `grep -n "127.0.0.1:" docker-compose.prod.yml` — expected: ports bound to loopback.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P17-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P17-7 — Verification gate — green PR + `v*` tag publishes images & RELEASES

- **Status:** ⚪ Blocked — needs a real PR / `v*` tag / GHCR publish (outward-facing) and the P17-5/P17-6 + audit-script blockers cleared (see note)
- **Priority:** High
- **Size:** M (2–4 h)
- **Depends on:** `P17-1`, `P17-2`, `P17-3`, `P17-4`, `P17-5`, `P17-6`

### Description

Phase 17 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove the whole release pipeline end to end. Open a real pull request and confirm **every CI job passes** — `install`, `lint`, `typecheck`, `unit`, `export-usage-check`, `e2e-api`, `e2e-web`, `coverage-report`, and (when a workspace changed) `mutation-api` / `mutation-web`. Then push a `v*` tag and confirm `release.yml` builds + pushes both GHCR images and bot-appends a row to `docs/RELEASES.md`. This task writes no workflow code — it validates P17-1..P17-6 and closes the phase. Use the `gh` CLI for all GitHub inspection (per the user's global rules); never call any `mcp__github*` tool.

### Acceptance Criteria

- [ ] A pull request shows all required CI jobs green (`gh pr checks <N>` reports success for every contract job).
- [ ] The `mutation.yml` gate runs on a PR that touches `apps/api` (or `apps/web`) and passes at `break: 100`.
- [ ] `mutation-nightly.yml` is dispatchable (`gh workflow run "Mutation Testing (Nightly Full)"`) and completes.
- [ ] Pushing a `v*` tag triggers `release.yml`; both `ghcr.io/bymaxone/nest-logger-example-{api,web}:<tag>` images appear in GHCR.
- [ ] After the release run, `docs/RELEASES.md` has a new row for the tag (bot commit on `main`, `[skip ci]`), and re-running the tag is idempotent (no duplicate row, no image overwrite).
- [ ] No gate was bypassed (`--no-verify`, `@ts-ignore`, lowered threshold) to make CI green.

### Files to create / modify

- _(none — verification only; fix the corresponding P17-1..P17-6 file if a check fails)_

### Agent Execution Prompt

> Role: Senior DevOps engineer validating an end-to-end release pipeline.
> Context: Task P17-7 of `docs/DEVELOPMENT_PLAN.md` §Phase 17. DoD: a green PR shows all CI jobs passing; a `v*` tag publishes images + updates `RELEASES.md`. GitHub access is via the `gh` CLI ONLY (global rule — never a `mcp__github*` tool). This is a verification task — do NOT add placeholder code to force a pass; fix the real workflow/Dockerfile instead.
> Objective: Exercise the full pipeline and close the phase.
> Steps:
>
> 1. Push a branch with a small real change touching `apps/api/src/**` and open a PR:
>    - `gh pr create --fill --base main`
>    - `gh pr checks <N> --watch` — confirm `install`, `lint`, `typecheck`, `unit`, `export-usage-check`, `e2e-api`, `e2e-web`, `coverage-report`, and `mutation-api` all report success.
> 2. Inspect any failure with `gh run view <run-id> --log-failed` and fix the offending P17-1..P17-6 file; re-push until green. Do NOT merge yet if the repo policy is to land via squash after review.
> 3. Dry-run the nightly: `gh workflow run "Mutation Testing (Nightly Full)"` then `gh run watch` — confirm both `full-api` + `full-web` complete.
> 4. Tag a release on `main`: `git tag v0.0.1-rc.1 && git push origin v0.0.1-rc.1`.
>    - `gh run watch` the `Release` workflow — confirm `build-and-push` then `update-releases-doc` succeed.
>    - `docker manifest inspect ghcr.io/bymaxone/nest-logger-example-api:v0.0.1-rc.1` — expected: resolves.
>    - `docker manifest inspect ghcr.io/bymaxone/nest-logger-example-web:v0.0.1-rc.1` — expected: resolves.
>    - Confirm `docs/RELEASES.md` gained the tag row on `main`.
> 5. Re-run the same tag (delete + re-push) and confirm idempotency: no duplicate `RELEASES.md` row, image builds skipped.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + Appendix C. Use `gh` for ALL GitHub operations; never a `mcp__github*` tool.
> - Do NOT skip hooks or lower any threshold to make CI green; fix the root cause.
> - Use a throwaway `-rc` tag for verification so the real `v1.0.0` (Phase 18) stays clean.
>   Verification:
> - `gh pr checks <N>` — expected: every contract job `pass`.
> - `gh run list --workflow=release.yml --limit 1` — expected: the tag run concluded `success`.
> - `docker manifest inspect ghcr.io/bymaxone/nest-logger-example-api:<tag>` — expected: exit 0.
> - `grep -F "<tag>" docs/RELEASES.md` — expected: exactly one row.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P17-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 17 is 7/7 — switch the Phase 17 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- P17-1 ✅ 2026-06-10 — `ci.yml` authored (install → lint/typecheck/unit/export-usage-check, e2e-api → e2e-web, coverage-report); YAML valid, action order correct, all spec greps pass.
- P17-2 ✅ 2026-06-10 — `mutation.yml` authored (dorny/paths-filter detect → mutation-api/web, fetch-depth 0, Stryker incremental cache restore); web filter corrected to `web`.
- P17-3 ✅ 2026-06-10 — `mutation-nightly.yml` authored (Mon 03:00 UTC cron + workflow_dispatch, drift issue-on-regression); uses `stryker run --force` for a true cold run (spec's `--incremental false` is a no-op).
- P17-4 ✅ 2026-06-10 — `release.yml` authored (`v*` → idempotent GHCR api+web build/push, bot-append RELEASES.md); tag passed via env (injection-hardened); append logic adapted to the real Tested-version table and dry-run-verified idempotent.
- P17-5 🔵 2026-06-10 — `apps/api/Dockerfile` + `.dockerignore` authored (multi-stage node:24-alpine, non-root, `--enable-source-maps`, EXPOSE 3001, start:instrumented variant). `docker build` BLOCKED until `@bymax-one/nest-logger` publishes (file: link outside build context).
- P17-6 🔵 2026-06-10 — `apps/web/Dockerfile` + `docker-compose.prod.yml` authored; added `output: 'standalone'` + `outputFileTracingRoot` to next.config. Compose validates; `docker build` BLOCKED (same library-publish reason).
- P17-7 ⚪ 2026-06-10 — Verification gate NOT run: requires outward-facing PR/`v*` tag/GHCR publish + the P17-5/P17-6 and Phase-18 `audit-library-exports.mjs` blockers cleared. Awaits owner action.
