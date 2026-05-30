# Phase 0 — Repository Foundation & Tooling — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-0--repository-foundation--tooling) §Phase 0
> **Total tasks:** 8
> **Progress:** 🔴 0 / 8 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                                  | Status | Priority | Size | Depends on             |
| ----- | --------------------------------------------------------------------- | ------ | -------- | ---- | ---------------------- |
| P0-1  | Root `package.json` + `pnpm-workspace.yaml` (full script set)         | 🔴     | High     | S    | —                      |
| P0-2  | Node/pnpm pinning (`.nvmrc`, `.npmrc`, `engines`)                     | 🔴     | High     | XS   | P0-1                   |
| P0-3  | Root `tsconfig.base.json` (strict)                                    | 🔴     | High     | S    | P0-1                   |
| P0-4  | ESLint 9 flat config (`eslint.config.mjs`)                            | 🔴     | High     | S    | P0-1, P0-3             |
| P0-5  | Prettier 3 (`.prettierrc.mjs`, `.prettierignore`)                     | 🔴     | High     | XS   | P0-1                   |
| P0-6  | Husky + lint-staged + commitlint                                      | 🔴     | High     | S    | P0-1, P0-4, P0-5       |
| P0-7  | Governance + automation files (`.gitignore`, `renovate.json`, etc.)  | 🔴     | Medium   | S    | P0-1                   |
| P0-8  | Verification gate (`install` + `typecheck` + `lint` + `format:check`) | 🔴     | High     | S    | P0-1..P0-7             |

---

## P0-1 — Root `package.json` + `pnpm-workspace.yaml` (full script set)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `—`

### Description

Create the workspace-root `package.json` and `pnpm-workspace.yaml` that register `apps/*`. This manifest is the anchor for every later phase; quality/infra scripts declared here are dispatched via `pnpm -r` / `pnpm --filter` and consumed by CI (Phase 17). The full script surface is defined now (even though the targets land later) so the contract is stable and CI never references a missing script.

### Acceptance Criteria

- [ ] Root `package.json` exists with `"name": "nest-logger-example"`, `"private": true`, `"type": "module"`.
- [ ] Declares `"packageManager": "pnpm@10.8.0"`.
- [ ] Scripts defined: `dev`, `build`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:cov`, `test:e2e`, `mutation`, `mutation:incremental`, `mutation:dry-run`, `audit:exports`, `infra:up`, `infra:down`, `infra:nuke`, `infra:logs`, `infra:test:up`, `infra:test:down`, `prepare`.
- [ ] `pnpm-workspace.yaml` registers `apps/*`.
- [ ] `pnpm install` completes with zero errors on the empty workspace.

### Files to create / modify

- `package.json` — workspace-root manifest.
- `pnpm-workspace.yaml` — workspace globs.

### Agent Execution Prompt

> Role: Senior TypeScript / Node engineer setting up a pnpm workspace.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger` (see `docs/DEVELOPMENT_PLAN.md` §Phase 0 + §2 Global Conventions and `docs/OVERVIEW.md` §5 Repository Layout). This is task P0-1. The example mirrors the proven structure of the sibling `nest-auth-example`.
> Objective: Produce the workspace-root `package.json` + `pnpm-workspace.yaml`.
> Steps:
>
> 1. Create `/package.json` with `"name": "nest-logger-example"`, `"private": true`, `"type": "module"`, `"packageManager": "pnpm@10.8.0"`, and a `scripts` block using `pnpm -r` fan-out:
>    ```jsonc
>    {
>      "scripts": {
>        "dev": "pnpm -r --parallel --if-present run dev",
>        "build": "pnpm -r --if-present run build",
>        "typecheck": "pnpm -r --if-present run typecheck",
>        "lint": "eslint .",
>        "format": "prettier --write .",
>        "format:check": "prettier --check .",
>        "test": "pnpm -r --if-present run test",
>        "test:cov": "pnpm -r --if-present run test:cov",
>        "test:e2e": "pnpm -r --if-present run test:e2e",
>        "mutation": "pnpm -r --if-present run mutation",
>        "mutation:incremental": "pnpm -r --if-present run mutation:incremental",
>        "mutation:dry-run": "pnpm -r --if-present run mutation:dry-run",
>        "audit:exports": "node scripts/audit-library-exports.mjs",
>        "infra:up": "docker compose up -d --wait",
>        "infra:down": "docker compose down",
>        "infra:nuke": "docker compose down -v",
>        "infra:logs": "docker compose logs -f",
>        "infra:test:up": "docker compose -f docker-compose.test.yml up -d --wait",
>        "infra:test:down": "docker compose -f docker-compose.test.yml down -v",
>        "prepare": "husky"
>      }
>    }
>    ```
> 2. Create `/pnpm-workspace.yaml`:
>    ```yaml
>    packages:
>      - 'apps/*'
>    ```
> 3. Do NOT add runtime dependencies yet; `devDependencies` may be empty at this step (tooling is installed by P0-3..P0-6). The `audit:exports` / `infra:*` script targets are created in later phases (Phase 18 / Phase 1) — `--if-present` and the standalone script path keep this safe.
> 4. Run `pnpm install` to materialize `pnpm-lock.yaml`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions (pnpm 10.8.0, ESM-only, Node >=24 pinned in P0-2).
> - Do NOT add NestJS/Next/Prisma/OTel deps here; they belong to app packages in later phases.
> - Do NOT register `packages/*` — this repo only ships `apps/*`.
>   Verification:
>
> - `pnpm install` — expected: exits 0, creates `pnpm-lock.yaml`.
> - `node -p "require('./package.json').name"` — expected: `nest-logger-example`.
> - `pnpm -v` — expected: `>=10.8.0`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P0-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P0-2 — Node/pnpm Pinning (`.nvmrc`, `.npmrc`, `engines`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** XS (<30 min)
- **Depends on:** `P0-1`

### Description

Pin the Node.js major to `24` and enforce frozen-lockfile installs. `@bymax-one/nest-logger` requires Node >=24; pinning prevents silent drift on contributor machines and in CI. `.npmrc` with `frozen-lockfile=true` makes every install reproducible (matches the library + `nest-auth-example`).

### Acceptance Criteria

- [ ] `.nvmrc` exists and contains exactly `24` (no trailing `.x`).
- [ ] `.npmrc` exists with `frozen-lockfile=true`.
- [ ] Root `package.json` has `"engines": { "node": ">=24", "pnpm": ">=10.8" }`.
- [ ] `nvm use` in the repo root selects Node 24.

### Files to create / modify

- `.nvmrc` — single line `24`.
- `.npmrc` — `frozen-lockfile=true`.
- `package.json` — add `engines`.

### Agent Execution Prompt

> Role: Senior TypeScript / Node engineer.
> Context: Task P0-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 0 + §2. The library requires Node >=24; CI uses `pnpm install --frozen-lockfile`.
> Objective: Pin the Node runtime + pnpm version and enforce frozen installs.
> Steps:
>
> 1. Create `/.nvmrc` with the single line `24`.
> 2. Create `/.npmrc` with:
>    ```ini
>    frozen-lockfile=true
>    ```
> 3. Edit `/package.json` — add:
>    ```json
>    "engines": { "node": ">=24", "pnpm": ">=10.8" }
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Do NOT set `engine-strict` in `.npmrc` (keep installs portable); the `engines` field is advisory + CI-checked.
>   Verification:
>
> - `cat .nvmrc` — expected: `24`.
> - `node -p "require('./package.json').engines.node"` — expected: `>=24`.
> - `grep frozen-lockfile .npmrc` — expected: `frozen-lockfile=true`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P0-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P0-3 — Root `tsconfig.base.json` (strict)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P0-1`

### Description

Create the canonical TypeScript base config inherited by every app `tsconfig.json`. `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are mandated by §2 Global Conventions and match the library's own discipline (so example code reads like library code).

### Acceptance Criteria

- [ ] `tsconfig.base.json` at repo root.
- [ ] `compilerOptions` sets `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`, `target: "ES2023"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `esModuleInterop: true`, `resolveJsonModule: true`, `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`, `isolatedModules: true`, `verbatimModuleSyntax: true`.
- [ ] No `include`/`exclude` (base config is pure options).
- [ ] Root `package.json` adds `devDependencies: { "typescript": "^5.9.0" }`.

### Files to create / modify

- `tsconfig.base.json` — shared compiler options.
- `package.json` — add `typescript` to devDependencies.

### Agent Execution Prompt

> Role: Senior TypeScript engineer.
> Context: Task P0-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 0. All apps extend this base; see §2 Global Conventions (TypeScript 5.9 strict, ESM everywhere).
> Objective: Produce `/tsconfig.base.json` with the strict settings listed.
> Steps:
>
> 1. Install TypeScript at the workspace root: `pnpm add -D -w typescript@^5.9.0`.
> 2. Create `/tsconfig.base.json`:
>    ```json
>    {
>      "compilerOptions": {
>        "target": "ES2023",
>        "module": "ESNext",
>        "moduleResolution": "Bundler",
>        "lib": ["ES2023"],
>        "esModuleInterop": true,
>        "resolveJsonModule": true,
>        "isolatedModules": true,
>        "verbatimModuleSyntax": true,
>        "skipLibCheck": true,
>        "forceConsistentCasingInFileNames": true,
>        "strict": true,
>        "noUncheckedIndexedAccess": true,
>        "exactOptionalPropertyTypes": true,
>        "noImplicitOverride": true,
>        "noImplicitReturns": true,
>        "noFallthroughCasesInSwitch": true
>      }
>    }
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Do NOT set `paths` aliases here; Phase 2 forbids monorepo path aliases (the example consumes the library as a real package via local link).
> - `apps/api` (NestJS) may need `emitDecoratorMetadata`/`experimentalDecorators` in its OWN tsconfig — do NOT add them to the base (the Next.js app must not inherit them).
>   Verification:
>
> - `pnpm exec tsc --showConfig -p tsconfig.base.json` — expected: emits the resolved config without error.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P0-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P0-4 — ESLint 9 Flat Config (`eslint.config.mjs`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P0-1`, `P0-3`

### Description

Wire ESLint v9 flat config. Extends `@typescript-eslint/recommended-type-checked` per §2, integrates Prettier compatibility, relaxes type-checked rules for test files, and globally ignores generated dirs **including `.stryker-tmp` and `reports`** (Stryker artifacts) so lint never trips on mutant copies.

### Acceptance Criteria

- [ ] `eslint.config.mjs` at repo root using flat config.
- [ ] Integrates `@eslint/js`, `typescript-eslint` (`recommendedTypeChecked`), `eslint-config-prettier`, `globals`.
- [ ] Ignores `**/dist`, `**/.next`, `**/coverage`, `**/node_modules`, `**/*.d.ts`, `**/.stryker-tmp`, `**/reports`.
- [ ] Test files (`**/*.spec.ts`, `**/*.e2e-spec.ts`, `**/test/**`) relax `@typescript-eslint/no-unsafe-*` + `no-explicit-any`.
- [ ] Root `package.json` has `"lint": "eslint ."` (added in P0-1) and the ESLint devDependencies.
- [ ] `pnpm lint` exits 0 on the empty workspace.

### Files to create / modify

- `eslint.config.mjs` — flat config entry point.
- `package.json` — add ESLint devDependencies.

### Agent Execution Prompt

> Role: Senior TypeScript engineer.
> Context: Task P0-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 0. §2 mandates ESLint 9 flat config (`recommendedTypeChecked`) + Prettier 3. Stryker writes to `.stryker-tmp/` + `reports/` (Phase 15) — both must be lint-ignored.
> Objective: Produce `/eslint.config.mjs` and install ESLint tooling.
> Steps:
>
> 1. Install devDependencies at the workspace root:
>    `pnpm add -D -w eslint@^9 @eslint/js typescript-eslint eslint-config-prettier globals`.
> 2. Create `/eslint.config.mjs`:
>    ```js
>    import js from '@eslint/js';
>    import tseslint from 'typescript-eslint';
>    import prettier from 'eslint-config-prettier';
>    import globals from 'globals';
>
>    export default tseslint.config(
>      {
>        ignores: [
>          '**/dist',
>          '**/.next',
>          '**/coverage',
>          '**/node_modules',
>          '**/*.d.ts',
>          '**/.stryker-tmp',
>          '**/reports',
>        ],
>      },
>      js.configs.recommended,
>      ...tseslint.configs.recommendedTypeChecked,
>      {
>        languageOptions: {
>          globals: { ...globals.node },
>          parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
>        },
>      },
>      {
>        files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**'],
>        rules: {
>          '@typescript-eslint/no-explicit-any': 'off',
>          '@typescript-eslint/no-unsafe-assignment': 'off',
>          '@typescript-eslint/no-unsafe-member-access': 'off',
>          '@typescript-eslint/no-unsafe-call': 'off',
>        },
>      },
>      prettier,
>    );
>    ```
> 3. Confirm `"lint": "eslint ."` exists in root `package.json` (from P0-1).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Flat config only; do NOT create a legacy `.eslintrc*`.
> - Do NOT disable type-checked rules globally — only inside the test-files override.
>   Verification:
>
> - `pnpm lint` — expected: exits 0 (no source files yet → clean).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P0-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P0-5 — Prettier 3 (`.prettierrc.mjs` + `.prettierignore`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** XS (<30 min)
- **Depends on:** `P0-1`

### Description

Add Prettier 3 with an ESM config and matching ignore file — the single source of formatting truth. Integrates with ESLint via `eslint-config-prettier` (installed in P0-4). Settings match §2 (`printWidth 100`, `singleQuote`, `trailingComma: all`).

### Acceptance Criteria

- [ ] `.prettierrc.mjs` exports a config object via `export default`.
- [ ] Settings: `printWidth: 100`, `singleQuote: true`, `trailingComma: 'all'`, `semi: false`, `arrowParens: 'always'`, `endOfLine: 'lf'`.
- [ ] `.prettierignore` covers `dist`, `.next`, `coverage`, `node_modules`, `pnpm-lock.yaml`, `.stryker-tmp`, `reports`.
- [ ] Root `package.json` has `format` + `format:check` scripts (from P0-1).
- [ ] `pnpm format:check` exits 0.

### Files to create / modify

- `.prettierrc.mjs` — config.
- `.prettierignore` — ignore list.

### Agent Execution Prompt

> Role: Senior TypeScript engineer.
> Context: Task P0-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 0. §2 mandates Prettier 3 with `printWidth 100` + `singleQuote`. Note `semi: false` matches the library + `nest-auth-example` house style.
> Objective: Install Prettier 3 and configure it repo-wide.
> Steps:
>
> 1. `pnpm add -D -w prettier@^3`.
> 2. Create `/.prettierrc.mjs`:
>    ```js
>    /** @type {import("prettier").Config} */
>    export default {
>      printWidth: 100,
>      singleQuote: true,
>      trailingComma: 'all',
>      semi: false,
>      arrowParens: 'always',
>      endOfLine: 'lf',
>    }
>    ```
> 3. Create `/.prettierignore`:
>    ```
>    dist
>    .next
>    coverage
>    node_modules
>    pnpm-lock.yaml
>    .stryker-tmp
>    reports
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Confirm `format` + `format:check` already exist in root `package.json` (from P0-1); do not duplicate.
>   Verification:
>
> - `pnpm format:check` — expected: exits 0 on the empty workspace.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P0-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P0-6 — Husky + lint-staged + commitlint

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P0-1`, `P0-4`, `P0-5`

### Description

Wire Git hooks so every commit runs `lint-staged` (pre-commit) and `commitlint` (commit-msg). Enforces Conventional Commits per §2 and keeps unformatted/unlinted code off `main`.

### Acceptance Criteria

- [ ] `husky` installed; `.husky/pre-commit` runs `pnpm exec lint-staged`.
- [ ] `.husky/commit-msg` runs `pnpm exec commitlint --edit "$1"`.
- [ ] `commitlint.config.mjs` extends `@commitlint/config-conventional`.
- [ ] `lint-staged.config.mjs` runs `prettier --write` + `eslint --fix` on staged `*.{ts,tsx,js,jsx,mjs,cjs}` and `prettier --write` on `*.{json,md,yml,yaml}`.
- [ ] Root `package.json` has `"prepare": "husky"` (from P0-1); `pnpm install` creates `.husky/_/`.
- [ ] `echo "chore: bootstrap" | pnpm exec commitlint` exits 0; `echo "bad message" | pnpm exec commitlint` exits non-zero.

### Files to create / modify

- `commitlint.config.mjs`
- `lint-staged.config.mjs`
- `.husky/pre-commit`
- `.husky/commit-msg`
- `package.json` — devDependencies.

### Agent Execution Prompt

> Role: Senior TypeScript engineer.
> Context: Task P0-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 0. §2 mandates Conventional Commits via commitlint + Husky + lint-staged.
> Objective: Wire pre-commit and commit-msg Git hooks.
> Steps:
>
> 1. Install devDependencies:
>    `pnpm add -D -w husky lint-staged @commitlint/cli @commitlint/config-conventional`.
> 2. Confirm root `package.json` has `"prepare": "husky"` (from P0-1).
> 3. Run `pnpm exec husky init`, then overwrite the generated hooks:
>    - `.husky/pre-commit` → `pnpm exec lint-staged`
>    - `.husky/commit-msg` → `pnpm exec commitlint --edit "$1"`
> 4. `chmod +x .husky/pre-commit .husky/commit-msg`.
> 5. Create `/commitlint.config.mjs`:
>    ```js
>    export default { extends: ['@commitlint/config-conventional'] }
>    ```
> 6. Create `/lint-staged.config.mjs`:
>    ```js
>    export default {
>      '*.{ts,tsx,js,jsx,mjs,cjs}': ['prettier --write', 'eslint --fix'],
>      '*.{json,md,yml,yaml}': ['prettier --write'],
>    }
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Do NOT use `--no-verify` anywhere in verification.
>   Verification:
>
> - `echo "chore: bootstrap" | pnpm exec commitlint` — expected: exit 0.
> - `echo "bad message" | pnpm exec commitlint` — expected: exit non-zero.
> - `ls -la .husky/pre-commit .husky/commit-msg` — expected: both exist and are executable.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P0-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P0-7 — Governance + Automation Files

- **Status:** 🔴 Not Started
- **Priority:** Medium
- **Size:** S (30–90 min)
- **Depends on:** `P0-1`

### Description

Create the repo-wide ignore/editor/automation/governance files: `.gitignore`, `.editorconfig`, `renovate.json` (weekend schedule; pins `@bymax-one/nest-logger`, groups docker/actions), `LICENSE` (MIT © Bymax One), a `README.md` stub, and `CHANGELOG.md`. `pnpm-lock.yaml` is deliberately NOT ignored.

### Acceptance Criteria

- [ ] `.gitignore` covers `node_modules/`, `dist/`, `.next/`, `coverage/`, `*.tsbuildinfo`, `.stryker-tmp/`, `reports/`, `logs/`, `.env`, `.env.*` (but allow-lists `!.env.example`), `*.log`, `.DS_Store`; does NOT ignore `pnpm-lock.yaml`.
- [ ] `.editorconfig` sets LF, UTF-8, 2-space indent, final newline, trim trailing whitespace (except `*.md`).
- [ ] `renovate.json` extends `config:recommended`, schedules on weekends, and pins/groups `@bymax-one/nest-logger` + docker + github-actions.
- [ ] `LICENSE` is MIT with `Copyright (c) <year> Bymax One`.
- [ ] `README.md` stub links to `docs/OVERVIEW.md` + `docs/DEVELOPMENT_PLAN.md` and states the repo is in scaffolding.
- [ ] `CHANGELOG.md` is Keep-a-Changelog with an empty `## [Unreleased]`.

### Files to create / modify

- `.gitignore`, `.editorconfig`, `renovate.json`, `LICENSE`, `README.md`, `CHANGELOG.md`.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / technical writer.
> Context: Task P0-7 of `docs/DEVELOPMENT_PLAN.md` §Phase 0. Renovate is configured per §2 (weekend schedule; pin `@bymax-one/nest-logger`, group docker/actions). The README links into the existing `docs/`.
> Objective: Create the six governance/automation files.
> Steps:
>
> 1. `/.editorconfig`:
>    ```ini
>    root = true
>
>    [*]
>    charset = utf-8
>    end_of_line = lf
>    indent_style = space
>    indent_size = 2
>    insert_final_newline = true
>    trim_trailing_whitespace = true
>
>    [*.md]
>    trim_trailing_whitespace = false
>    ```
> 2. `/.gitignore` covering: `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `*.tsbuildinfo`, `.stryker-tmp/`, `reports/`, `logs/`, `.turbo/`, `.env`, `.env.*`, `!.env.example`, `*.log`, `.DS_Store`, `Thumbs.db`. Do NOT ignore `pnpm-lock.yaml`.
> 3. `/renovate.json`:
>    ```json
>    {
>      "$schema": "https://docs.renovatebot.com/renovate-schema.json",
>      "extends": ["config:recommended", ":semanticCommits"],
>      "schedule": ["every weekend"],
>      "packageRules": [
>        { "matchPackageNames": ["@bymax-one/nest-logger"], "rangeStrategy": "pin", "groupName": "bymax-one" },
>        { "matchManagers": ["dockerfile", "docker-compose"], "groupName": "docker" },
>        { "matchManagers": ["github-actions"], "groupName": "github-actions" }
>      ]
>    }
>    ```
> 4. `/LICENSE`: standard MIT text, `Copyright (c) <current-year> Bymax One`.
> 5. `/README.md`: H1 `# nest-logger-example`, one-paragraph intro (reference app for `@bymax-one/nest-logger`), a "Documentation" section linking `docs/OVERVIEW.md` + `docs/DEVELOPMENT_PLAN.md` + `docs/DASHBOARD.md`, and a "Status" line (scaffolding, Phase 0). Phase 16 replaces this with the full README.
> 6. `/CHANGELOG.md`: Keep-a-Changelog header + `## [Unreleased]` with `- Initial scaffolding.` under `### Added`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Keep README/CHANGELOG concise — these are stubs fleshed out in Phase 16.
>   Verification:
>
> - `git check-ignore -v pnpm-lock.yaml` — expected: no output, exit 1 (not ignored).
> - `git check-ignore -v node_modules/x` — expected: matches `.gitignore`.
> - `node -e "JSON.parse(require('fs').readFileSync('renovate.json','utf8'))"` — expected: parses without error.
> - `grep -l "Bymax One" LICENSE` — expected: match.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P0-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P0-8 — Verification Gate (`install` + `typecheck` + `lint` + `format:check`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P0-1`, `P0-2`, `P0-3`, `P0-4`, `P0-5`, `P0-6`, `P0-7`

### Description

Phase 0 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove the scaffolded workspace installs, typechecks, lints, and format-checks cleanly on an empty source tree. Closes the phase.

### Acceptance Criteria

- [ ] `pnpm install --frozen-lockfile` exits 0 (lockfile committed).
- [ ] `pnpm typecheck` exits 0 (no app packages yet → no-op via `--if-present`).
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm format:check` exits 0.
- [ ] A `chore:`-prefixed commit succeeds through the Husky hooks (no `--no-verify`).

### Files to create / modify

- _(none — verification only; fix earlier task files if a check fails)_

### Agent Execution Prompt

> Role: Senior TypeScript engineer.
> Context: Task P0-8 of `docs/DEVELOPMENT_PLAN.md` §Phase 0. DoD: `pnpm install && pnpm typecheck && pnpm lint && pnpm format:check` all green on a clean checkout.
> Objective: Confirm all Phase 0 tooling is operational and close the phase.
> Steps:
>
> 1. Run `pnpm install --frozen-lockfile`, then the four verification commands below. All must exit 0.
> 2. Make one real commit (`chore: scaffold phase 0 foundation`) to confirm the pre-commit + commit-msg hooks pass without `--no-verify`.
> 3. If any check fails, diagnose and fix in the corresponding earlier task file (P0-1..P0-7), then return here. Do NOT add placeholder source files to make `typecheck` pass artificially.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Do NOT skip hooks; do NOT lower any threshold.
>   Verification:
>
> - `pnpm install --frozen-lockfile` — expected: exit 0.
> - `pnpm typecheck` — expected: exit 0.
> - `pnpm lint` — expected: exit 0.
> - `pnpm format:check` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P0-8 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 0 is 8/8 — switch the Phase 0 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
