# Phase 18 — Audit & Hardening + v1.0.0 — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-18--audit--hardening--v100) §Phase 18
> **Total tasks:** 6
> **Progress:** 🔴 0 / 6 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                                       | Status | Priority | Size | Depends on             |
| ----- | -------------------------------------------------------------------------- | ------ | -------- | ---- | ---------------------- |
| P18-1 | Export-usage audit (`scripts/audit-library-exports.mjs` + `.audit-ignore.json`) | 🔴     | High     | M    | Phase 17               |
| P18-2 | Regenerate OVERVIEW §6 Feature Coverage Matrix from the audit               | 🔴     | High     | S    | P18-1                  |
| P18-3 | Log-key audit (`scripts/audit-log-keys.mjs`)                               | 🔴     | High     | M    | P18-1                  |
| P18-4 | Security pass — `helmet` + dependency/security review                      | 🔴     | High     | M    | P18-1, P18-3           |
| P18-5 | `CHANGELOG.md` `1.0.0` entry + local annotated `v1.0.0` tag                | 🔴     | Medium   | S    | P18-1..P18-4           |
| P18-6 | Verification gate — `audit:exports` green, all CI gates, §6 100%           | 🔴     | High     | S    | P18-1..P18-5           |

---

## P18-1 — Export-Usage Audit (`scripts/audit-library-exports.mjs` + `.audit-ignore.json`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `Phase 17`

### Description

Build the **export-usage audit** — the CI-enforced proof that every public export of `@bymax-one/nest-logger` is actually referenced in `apps/`. This is Guiding Principle #1 ("Library-faithful") made executable and the heart of [Appendix B](../DEVELOPMENT_PLAN.md#appendix-b--library-export--example-file-map): the script parses the package's shipped type declarations at `node_modules/@bymax-one/nest-logger/dist/server/index.d.ts` (the `.` subpath) and `node_modules/@bymax-one/nest-logger/dist/shared/index.d.ts` (the `/shared` subpath), extracts every exported symbol, then word-boundary-searches the `apps/` corpus. Any export that appears nowhere fails the build unless it is listed in `.audit-ignore.json` with a `reason` + issue link. The script is wired as the `audit:exports` root script (already declared in P0-1) and as the `export-usage-check` CI job (already declared in P17 `ci.yml`); this task fills both in. The full surface to satisfy is the §6 Feature Coverage Matrix — every one of its 48 rows must resolve to a referenced export.

### Acceptance Criteria

- [ ] `scripts/audit-library-exports.mjs` exists (Node ESM, zero runtime deps, shebang `#!/usr/bin/env node`).
- [ ] It resolves both declaration files from `node_modules/@bymax-one/nest-logger/dist/{server,shared}/index.d.ts` and exits non-zero with a clear message if either is missing (the library must be linked/installed first).
- [ ] It extracts every exported symbol from both files — value exports **and** `export type` / re-exported types (`export { … }`, `export declare …`, `export type { … }`).
- [ ] It word-boundary-searches (`\b<name>\b`) the `apps/**` source corpus (`apps/api`, `apps/worker`, `apps/web`), excluding `node_modules`, `dist`, `.next`, `coverage`, `*.d.ts`.
- [ ] Every export in this list is found in `apps/`: server `.` → `BymaxLoggerModule`, `PinoLoggerService`, `LogContextService`, `DefaultStdoutDestination`, `PrettyDevDestination`, `HttpExceptionFilter`, `HttpLoggingInterceptor`, `RequestIdMiddleware`, `applyRequestIdMiddleware`, `InjectLogger`, `LogContext`, `LogPerformance`, `LOG_CONTEXT_METADATA_KEY`, `DEFAULT_REDACT_PATHS`, `LOGGER_OPTIONS_TOKEN`, `LOGGER_PINO_INSTANCE_TOKEN`, `LOGGER_DESTINATIONS_TOKEN`, `LOG_CONTEXT_TOKEN`, and types `ILogDestination`, `BymaxLoggerModuleOptions`, `BymaxLoggerModuleAsyncOptions`, `BymaxLoggerModuleOptionsFactory`, `HttpOptions`, `OtelOptions`; `/shared` → types `LogLevel`, `LogEntry`, `ServiceMetadata`, `ReservedLogKey`, plus values `LOG_KEYS_CONVENTION_REGEX`, `RESERVED_LOG_KEYS`.
- [ ] `.audit-ignore.json` exists at repo root with a documented schema (`{ "ignored": [{ "symbol": "...", "reason": "...", "issue": "..." }] }`); it is empty (`"ignored": []`) unless a genuinely-internal symbol leaks into the public `.d.ts` (e.g. `TraceContextMixin`, `REDACT_MAX_DEPTH`, `LOGGER_ERROR_CODES` are internal per OVERVIEW §intro and, if surfaced, are ignored with a reason).
- [ ] The script prints a per-subpath report (`✓ used` / `✗ UNUSED` / `– ignored`) and a final summary line, then exits `0` only when every non-ignored export is used.
- [ ] `pnpm audit:exports` (root) runs the script and exits `0`.

### Files to create / modify

- `scripts/audit-library-exports.mjs` — the auditor.
- `.audit-ignore.json` — allow-list with reasons.
- `.github/workflows/ci.yml` — fill the `export-usage-check` job body (declared in P17) to run `pnpm audit:exports`.

### Agent Execution Prompt

> Role: Senior TypeScript / security engineer building a CI guard.
> Context: Task P18-1 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-18--audit--hardening--v100) §Phase 18 + [Appendix B](../DEVELOPMENT_PLAN.md#appendix-b--library-export--example-file-map). The `audit:exports` script target and the `export-usage-check` CI job already exist as names (P0-1, P17) — this task provides the implementation. The export surface to satisfy is the full §6 Feature Coverage Matrix in `docs/OVERVIEW.md`. `@bymax-one/nest-logger@0.1.0` is consumed via local `link:` (OVERVIEW §7) so `dist/` must be built and linked before this runs.
> Objective: Implement `scripts/audit-library-exports.mjs` + `.audit-ignore.json` and wire the CI job so any unused library export fails the build.
> Steps:
>
> 1. Create `/scripts/audit-library-exports.mjs`. Resolve the two declaration files and read them as text:
>    ```js
>    #!/usr/bin/env node
>    import { readFileSync, existsSync } from 'node:fs'
>    import { readdirSync, statSync } from 'node:fs'
>    import { join, extname } from 'node:path'
>
>    const PKG = 'node_modules/@bymax-one/nest-logger/dist'
>    const SUBPATHS = [
>      { name: '.', dts: join(PKG, 'server', 'index.d.ts') },
>      { name: '/shared', dts: join(PKG, 'shared', 'index.d.ts') },
>    ]
>    const APP_ROOTS = ['apps/api', 'apps/worker', 'apps/web']
>    const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage'])
>    const SRC_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs'])
>    ```
> 2. Extract exported symbols from a `.d.ts` string. Handle `export declare …`, `export { A, B as C }`, `export type { … }`, and `export type X =`. Strip `import(...)` paths first so they don't pollute the name set:
>    ```js
>    function extractExports(dts) {
>      const names = new Set()
>      const add = (n) => n && /^[A-Za-z_$][\w$]*$/.test(n) && names.add(n)
>      // export declare const/class/function/enum/abstract class NAME
>      for (const m of dts.matchAll(
>        /export\s+declare\s+(?:abstract\s+)?(?:const|let|var|class|function|enum|interface|type|namespace)\s+([A-Za-z_$][\w$]*)/g,
>      ))
>        add(m[1])
>      // export type NAME = ...  /  export interface NAME
>      for (const m of dts.matchAll(/export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g)) add(m[1])
>      // export { A, B as C, type D } [from '...']
>      for (const block of dts.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
>        for (const part of block[1].split(',')) {
>          const seg = part.trim().replace(/^type\s+/, '')
>          const exported = seg.split(/\s+as\s+/).pop().trim() // the OUTWARD name
>          add(exported)
>        }
>      }
>      return names
>    }
>    ```
> 3. Walk the `apps/` corpus into one searchable string (or search file-by-file for a better "found in" report):
>    ```js
>    function collectSources(root) {
>      const files = []
>      const walk = (dir) => {
>        for (const entry of readdirSync(dir)) {
>          if (SKIP_DIRS.has(entry)) continue
>          const full = join(dir, entry)
>          const st = statSync(full)
>          if (st.isDirectory()) walk(full)
>          else if (SRC_EXT.has(extname(entry)) && !full.endsWith('.d.ts')) files.push(full)
>        }
>      }
>      if (existsSync(root)) walk(root)
>      return files
>    }
>    const corpus = APP_ROOTS.flatMap(collectSources).map((f) => ({ f, text: readFileSync(f, 'utf8') }))
>    const isUsed = (name) => {
>      const re = new RegExp(`\\b${name}\\b`)
>      return corpus.some(({ text }) => re.test(text))
>    }
>    ```
> 4. Load `.audit-ignore.json`, then report per subpath and compute the exit code:
>    ```js
>    const ignore = new Set(
>      (JSON.parse(readFileSync('.audit-ignore.json', 'utf8')).ignored ?? []).map((e) => e.symbol),
>    )
>    let unused = 0
>    for (const { name: subpath, dts } of SUBPATHS) {
>      if (!existsSync(dts)) {
>        console.error(`✗ missing declaration file: ${dts} — build & link the library first`)
>        process.exit(2)
>      }
>      const exports = [...extractExports(readFileSync(dts, 'utf8'))].sort()
>      console.log(`\n# @bymax-one/nest-logger '${subpath}' — ${exports.length} exports`)
>      for (const name of exports) {
>        if (ignore.has(name)) console.log(`  – ignored  ${name}`)
>        else if (isUsed(name)) console.log(`  ✓ used     ${name}`)
>        else {
>          console.log(`  ✗ UNUSED   ${name}`)
>          unused++
>        }
>      }
>    }
>    console.log(`\n${unused === 0 ? '✓ all exports referenced in apps/' : `✗ ${unused} unused export(s)`}`)
>    process.exit(unused === 0 ? 0 : 1)
>    ```
> 5. Create `/.audit-ignore.json`:
>    ```json
>    {
>      "$comment": "Public exports intentionally NOT demonstrated in apps/. Each entry needs a reason + issue link. Keep empty unless a genuinely-internal symbol leaks into the published .d.ts.",
>      "ignored": []
>    }
>    ```
>    If the auditor flags an internal symbol that the shipped `.d.ts` re-exports by accident (per OVERVIEW §intro: `TraceContextMixin`, `REDACT_MAX_DEPTH`, the composed mixin, `LOGGER_ERROR_CODES`), add it here with `reason: "internal-only; behavior demonstrated, not imported"` and an upstream issue URL — do NOT add a fake reference in `apps/` to silence it.
> 6. Fill the `export-usage-check` job in `/.github/workflows/ci.yml` (the job name already exists from P17): check out, set up pnpm 10.8.0 then Node 24 (in that order — Appendix C toolchain caveat), `pnpm install --frozen-lockfile`, build/link the library, then `pnpm audit:exports`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions + §0 Guiding Principle #1.
> - The script is **dependency-free** ESM (Node ≥24 built-ins only) — no `ts-morph`/`typescript` import; regex extraction over the `.d.ts` text is sufficient and fast.
> - Word-boundary search only (`\b<name>\b`); a substring match would let `LogContext` mask `LogContextService`. Each export is matched independently.
> - Do NOT relax the gate by ignoring a real export — `.audit-ignore.json` is for genuinely-internal leaked symbols only, never to make CI green.
> - Do NOT parse `apps/web` JSX as anything special; plain text search over `.tsx` is correct (it finds the `/shared` type/const imports).
>   Verification:
>
> - `node scripts/audit-library-exports.mjs` — expected: prints both subpath reports; exits 0 once every listed export is referenced.
> - `pnpm audit:exports` — expected: exit 0.
> - `node -e "JSON.parse(require('fs').readFileSync('.audit-ignore.json','utf8'))"` — expected: parses without error.
> - Temporarily delete a known-used import (e.g. `applyRequestIdMiddleware`) → expected: script prints `✗ UNUSED applyRequestIdMiddleware` and exits 1 (restore afterwards).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P18-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P18-2 — Regenerate OVERVIEW §6 Feature Coverage Matrix From the Audit

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P18-1`

### Description

Reconcile the §6 **Feature Coverage Matrix** in `docs/OVERVIEW.md` with the live output of `pnpm audit:exports` (P18-1). The coverage rule (`OVERVIEW.md` §6, final blockquote) states the matrix is *regenerated from that script* and that every public export — server `.` + `./shared` — is referenced from at least one file. This task makes the doc match reality: every export the auditor reports as `✓ used` has a matrix row pointing at the real `apps/**` file that references it, and the "Demonstrated in" column uses accurate, current paths. No export may be `✗ UNUSED`, and no matrix row may point at a file/symbol that no longer exists.

### Acceptance Criteria

- [ ] `pnpm audit:exports` reports **zero** `✗ UNUSED` exports across both subpaths before editing the matrix.
- [ ] Every export from P18-1's list (server `.` + `/shared`) maps to at least one §6 matrix row whose "Demonstrated in" path exists in `apps/**`.
- [ ] Each "Library surface" cell names the actual exported symbol (or its documented behavior, for internal-only items like the trace-context mixin) — consistent with the shipped `0.1.0` types.
- [ ] No matrix row references a removed/renamed file or a non-existent export (every path is spot-checked against the tree).
- [ ] The §6 coverage-rule blockquote still asserts the CI-enforced rule and now matches the implemented `scripts/audit-library-exports.mjs`.
- [ ] `markdown-link-check` (Phase 16) still passes on `OVERVIEW.md` after the edits.

### Files to create / modify

- `docs/OVERVIEW.md` — update §6 rows + the coverage-rule blockquote.

### Agent Execution Prompt

> Role: Senior TypeScript engineer / technical writer.
> Context: Task P18-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 18. The §6 Feature Coverage Matrix in `docs/OVERVIEW.md` (rows 1–48 plus the "Coverage rule" blockquote) is the human-readable face of the P18-1 auditor. It must mirror the auditor's `✓ used` set exactly.
> Objective: Bring the §6 matrix and coverage-rule note into exact agreement with `pnpm audit:exports`.
> Steps:
>
> 1. Run `pnpm audit:exports` and capture the per-subpath `✓ used` list. This is the source of truth.
> 2. Open `docs/OVERVIEW.md` §6. For each used export, confirm a matrix row exists whose **Demonstrated in** column points at a real file. Where the auditor found a symbol in a file the matrix doesn't cite (or cites a stale path), correct the **Demonstrated in** path. Verify each cited path with `test -f <path>`.
> 3. Ensure the `/shared` exports (`LogLevel`, `LogEntry`, `ServiceMetadata`, `ReservedLogKey`, `LOG_KEYS_CONVENTION_REGEX`, `RESERVED_LOG_KEYS`) each have a row pointing at `apps/web/lib/log-keys.ts` (regex/reserved usage), `apps/api/.../dto/log-query.dto.ts`, and/or the `PrismaLogDestination` typing — wherever the auditor actually located them.
> 4. Confirm the internal-only behaviors called out in OVERVIEW §intro (trace-context mixin, `REDACT_MAX_DEPTH`, `LOGGER_ERROR_CODES`) remain described as **behaviors** (not importable exports) — and that they are NOT in the auditor's export list (they're not public). If P18-1 had to ignore any of them, mirror that here as a behavior row.
> 5. Update the final **Coverage rule** blockquote so its description of the script (parses `dist/{server,shared}/index.d.ts`, word-boundary search, fails CI, `.audit-ignore.json` escape hatch) matches the implemented P18-1 behavior precisely.
> 6. Re-run `markdown-link-check docs/OVERVIEW.md` (or the Phase 16 link checker) to confirm no anchors/links broke.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §0 Guiding Principle #1.
> - Do NOT invent coverage — every row must correspond to a real reference the auditor found. If the auditor says an export is unused, the fix is a real demonstration in `apps/` (loop back to the owning feature phase), NOT a fabricated matrix row.
> - English only; preserve the existing table structure and surrounding prose.
>   Verification:
>
> - `pnpm audit:exports` — expected: exit 0, zero `✗ UNUSED`.
> - For each §6 "Demonstrated in" path: `test -f <path>` — expected: exit 0.
> - `markdown-link-check docs/OVERVIEW.md` — expected: no dead links.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P18-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P18-3 — Log-Key Audit (`scripts/audit-log-keys.mjs`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P18-1`

### Description

Build the **log-key convention audit** — the second CI gate from [Appendix C](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates). §2 Global Conventions mandates that every application log key follows `MODULE_ACTION_RESULT`, is validated against `LOG_KEYS_CONVENTION_REGEX`, and **never reuses one of the 16 `RESERVED_LOG_KEYS`** (both imported from the `/shared` subpath). This script statically discovers the `logKey` argument of every structured log call in `apps/` (`info` / `warnStructured` / `errorStructured` / `fatal` and the `@LogPerformance` / `HTTP_REQUEST_*` constants), asserts each matches the regex, and fails if any collides with a reserved key. It runs as `audit:log-keys` and as a CI gate (the Appendix C "Log-key convention" row).

### Acceptance Criteria

- [ ] `scripts/audit-log-keys.mjs` exists (Node ESM, shebang, zero runtime deps beyond Node built-ins + the `/shared` subpath import).
- [ ] It imports the **live** `LOG_KEYS_CONVENTION_REGEX` and `RESERVED_LOG_KEYS` from `@bymax-one/nest-logger/shared` (single source of truth — never re-declares them).
- [ ] It extracts each app-defined `logKey` literal — the first string arg of `.info(` / `.warnStructured(` / `.errorStructured(` / `.fatal(` calls and any `const … = 'MODULE_ACTION_RESULT'` log-key constants — across `apps/api` + `apps/worker`.
- [ ] Every discovered app key matches `LOG_KEYS_CONVENTION_REGEX.test(key)`.
- [ ] No discovered app key is a member of `RESERVED_LOG_KEYS` (the 16 reserved values, e.g. the `HTTP_REQUEST_*` / `LOGGER_*` framework keys) — reserved keys may be *referenced* (the framework emits them) but never *re-defined* by app code as a new business key.
- [ ] It prints a report (`✓ <key>` / `✗ <key> — fails regex` / `✗ <key> — reserved`) and a summary, exiting `0` only when all app keys are valid and non-reserved.
- [ ] Root `package.json` gains `"audit:log-keys": "node scripts/audit-log-keys.mjs"`; `pnpm audit:log-keys` exits 0.
- [ ] `.github/workflows/ci.yml` runs `pnpm audit:log-keys` (the Appendix C "Log-key convention" gate).

### Files to create / modify

- `scripts/audit-log-keys.mjs` — the auditor.
- `package.json` — add `audit:log-keys` script.
- `.github/workflows/ci.yml` — add the log-key CI gate step.

### Agent Execution Prompt

> Role: Senior TypeScript / security engineer.
> Context: Task P18-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 18 + §2 ("Log keys: `MODULE_ACTION_RESULT`; validated vs `LOG_KEYS_CONVENTION_REGEX`; never reuse a `RESERVED_LOG_KEYS`") + [Appendix C](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates) ("Log-key convention" gate). The regex + reserved set ship in `@bymax-one/nest-logger/shared` — import them, never copy them. There are **16** reserved keys.
> Objective: Implement `scripts/audit-log-keys.mjs` proving every app log key is convention-clean and non-reserved, and wire it as a CI gate.
> Steps:
>
> 1. Create `/scripts/audit-log-keys.mjs`. Import the live convention surface from the `/shared` subpath and set up the corpus walk (reuse the same dir/ext filters as P18-1):
>    ```js
>    #!/usr/bin/env node
>    import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
>    import { join, extname } from 'node:path'
>    import { LOG_KEYS_CONVENTION_REGEX, RESERVED_LOG_KEYS } from '@bymax-one/nest-logger/shared'
>
>    const APP_ROOTS = ['apps/api', 'apps/worker'] // server-side log emitters
>    const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage'])
>    const SRC_EXT = new Set(['.ts', '.mts', '.cts'])
>    const reserved = new Set(RESERVED_LOG_KEYS)
>    ```
> 2. Collect candidate log keys. Match the first string literal passed to the structured methods, plus `MODULE_ACTION_RESULT`-shaped constant declarations:
>    ```js
>    const CALL_KEY = /\.(?:info|warnStructured|errorStructured|fatal)\(\s*['"]([A-Z0-9_]+)['"]/g
>    const CONST_KEY = /\b(?:const|readonly)\s+[A-Za-z_$][\w$]*\s*[:=]\s*['"]([A-Z][A-Z0-9_]*_[A-Z0-9_]+)['"]/g
>
>    function collect(root, keys) {
>      const walk = (dir) => {
>        for (const entry of readdirSync(dir)) {
>          if (SKIP_DIRS.has(entry)) continue
>          const full = join(dir, entry)
>          if (statSync(full).isDirectory()) walk(full)
>          else if (SRC_EXT.has(extname(entry)) && !full.endsWith('.d.ts')) {
>            const text = readFileSync(full, 'utf8')
>            for (const re of [CALL_KEY, CONST_KEY])
>              for (const m of text.matchAll(re)) keys.set(m[1], full)
>          }
>        }
>      }
>      if (existsSync(root)) walk(root)
>    }
>    const keys = new Map()
>    for (const r of APP_ROOTS) collect(r, keys)
>    ```
> 3. Validate every discovered key against the imported regex + reserved set, report, and exit:
>    ```js
>    let bad = 0
>    for (const [key, file] of [...keys].sort()) {
>      if (reserved.has(key)) {
>        console.log(`  ✗ ${key} — RESERVED (${file})`)
>        bad++
>      } else if (!LOG_KEYS_CONVENTION_REGEX.test(key)) {
>        console.log(`  ✗ ${key} — fails LOG_KEYS_CONVENTION_REGEX (${file})`)
>        bad++
>      } else {
>        console.log(`  ✓ ${key}`)
>      }
>    }
>    console.log(`\n${keys.size} app log key(s); ${bad === 0 ? 'all valid + non-reserved' : `${bad} violation(s)`}`)
>    process.exit(bad === 0 ? 0 : 1)
>    ```
> 4. Add to root `package.json` scripts: `"audit:log-keys": "node scripts/audit-log-keys.mjs"`.
> 5. Add a step to `.github/workflows/ci.yml` (in the existing audit/lint job) running `pnpm audit:log-keys`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + Appendix C.
> - Import the regex + reserved list from `/shared` — **never** hard-code the 16 reserved keys or the regex source (they must track the library).
> - Distinguish *reference* from *redefinition*: an app may pass a framework `HTTP_REQUEST_*` constant through (the interceptor emits it) — the script targets **app-authored** keys, so a bare reserved-string literal used as the *defined* key of an `.info(...)` call is the violation to catch.
> - This script imports an ESM-only package subpath — it must run under Node ≥24 with `"type": "module"` resolution (the repo is ESM-only per §2).
> - Do NOT lower or special-case the gate to pass; fix the offending log key in its feature module instead.
>   Verification:
>
> - `pnpm audit:log-keys` — expected: exit 0; every app key printed `✓`.
> - Temporarily add `this.logger.info('badkey', 'x')` in a service → expected: `✗ badkey — fails LOG_KEYS_CONVENTION_REGEX` and exit 1 (remove afterwards).
> - Temporarily define a key equal to a reserved value → expected: `✗ … — RESERVED` and exit 1 (remove afterwards).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P18-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P18-4 — Security Pass — `helmet` + Dependency/Security Review

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P18-1`, `P18-3`

### Description

Harden the API and run a dependency/security review before tagging. Add `helmet` to `apps/api` (and `apps/worker` if it exposes HTTP) for secure default headers, run `pnpm audit` across the workspace, and close any coverage/mutation gaps the hardening surfaces (the 100% coverage + `break: 100` mutation bars from Appendix C must hold after the new middleware lands — `helmet` wiring and any new branch must be tested). Because adding middleware touches the request pipeline, re-confirm the redaction + double-log behaviors still hold. This is the "Security pass" deliverable of Phase 18.

### Acceptance Criteria

- [ ] `helmet` is a dependency of `apps/api`; `app.use(helmet())` (or the Nest middleware form) is wired in `apps/api/src/main.ts` **after** the logger bridge and before `app.listen`.
- [ ] Helmet's defaults are applied; any relaxation (e.g. CSP off for a local-only demo) is explicitly commented with the reason.
- [ ] `GET /health` response carries baseline security headers (e.g. `x-content-type-options: nosniff`, `x-dns-prefetch-control`) — asserted in an e2e test.
- [ ] `pnpm audit --audit-level=high` is run; any high/critical advisory is either remediated (bump) or recorded with a justification (and an issue link) — no silent ignores.
- [ ] No new lint/type errors; `helmet` import respects ESM + the strict tsconfig.
- [ ] Coverage stays **100%** (b/l/f/s) in `apps/api` and mutation stays at **`break: 100`** after the helmet wiring — any newly-introduced branch is covered + mutation-killed (loop into Phase 14/15 configs if the new code needs tests).
- [ ] Redaction-at-source and double-log-avoidance e2e assertions still pass with helmet in the pipeline.

### Files to create / modify

- `apps/api/package.json` — add `helmet`.
- `apps/api/src/main.ts` — wire `helmet()`.
- `apps/api/test/**` — security-header e2e assertion (+ any coverage/mutation top-up).
- `docs/TROUBLESHOOTING.md` or `docs/DEPLOYMENT.md` — one note on the security headers (optional, if a gap is documented).

### Agent Execution Prompt

> Role: Senior TypeScript / application-security engineer.
> Context: Task P18-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 18 ("Security pass — `helmet` on the API; close any coverage/mutation gaps surfaced"). The non-negotiable bars are Appendix C: 100% coverage (b/l/f/s) + Stryker `break: 100`. Adding middleware must not breach them, and must not disturb the redaction / double-log behaviors proven in earlier phases.
> Objective: Add `helmet` to the API, run a dependency/security review, and keep every quality gate green.
> Steps:
>
> 1. `pnpm add helmet --filter api`.
> 2. Wire it in `apps/api/src/main.ts` (after `app.useLogger(...)`, before `app.listen`):
>    ```typescript
>    import helmet from 'helmet'
>    // …after the logger bridge:
>    app.use(helmet()) // secure default headers; CSP defaults are fine for the JSON API
>    ```
>    If a header breaks the local demo (e.g. cross-origin for the dashboard), relax the **minimum** needed and comment why (`// CSP disabled: local-only demo, dashboard is a separate origin`).
> 3. Add an e2e assertion in `apps/api/test/` that `GET /health` returns the expected helmet headers:
>    ```typescript
>    const res = await request(app.getHttpServer()).get('/health').expect(200)
>    expect(res.headers['x-content-type-options']).toBe('nosniff')
>    ```
> 4. Run the dependency review: `pnpm audit --audit-level=high`. For each high/critical finding, bump the dependency if a fix exists; otherwise record it (issue link + justification) — never silently suppress.
> 5. Re-run the quality gates and close any gap the new code opened:
>    - `pnpm --filter api test:cov` → must report 100% on all four metrics. If helmet wiring added an uncovered branch, add the test.
>    - `pnpm --filter api mutation` → must stay `break: 100`. Kill any survivor.
>    - `pnpm --filter api test:e2e` → redaction (`[REDACTED]`) + double-log-avoidance assertions still green.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §0 Guiding Principle #6 (no `@ts-ignore`, no `eslint-disable`, no `--no-verify`, no lowering a threshold).
> - Do NOT weaken helmet beyond the documented minimum; every relaxation is commented with a concrete reason.
> - Do NOT mask an audit advisory with an ignore flag to make the command exit 0 — remediate or record with justification.
> - Keep the change small and within `apps/api` (and `apps/worker` only if it serves HTTP).
>   Verification:
>
> - `pnpm --filter api test:e2e` — expected: security-header assertion + redaction/double-log assertions all pass.
> - `pnpm --filter api test:cov` — expected: 100% statements/branches/functions/lines.
> - `pnpm --filter api mutation` — expected: passes at `break: 100` (zero survivors).
> - `pnpm audit --audit-level=high` — expected: clean, or every finding remediated/justified.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P18-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P18-5 — `CHANGELOG.md` `1.0.0` Entry + Local Annotated `v1.0.0` Tag

- **Status:** 🔴 Not Started
- **Priority:** Medium
- **Size:** S (30–90 min)
- **Depends on:** `P18-1`, `P18-2`, `P18-3`, `P18-4`

### Description

Cut the first release of the example. Convert the `CHANGELOG.md` `## [Unreleased]` section (seeded in P0-7) into a dated `## [1.0.0]` entry summarizing the whole build, then create a **local annotated `v1.0.0` tag**. Per the plan, the tag is **pushed only when `@bymax-one/nest-logger` reaches GA on npm** — until then the example stays on the local `link:` / `^0.1.0` (OVERVIEW §7 / §18), so this task creates the tag locally and does **not** push it. The Phase 17 `release.yml` (which builds GHCR images on `v*` tags) is wired but intentionally not triggered yet.

### Acceptance Criteria

- [ ] `CHANGELOG.md` has a `## [1.0.0] - YYYY-MM-DD` entry (Keep-a-Changelog) with `### Added` covering the apps (`api` / `worker` / `web`), the observability stack, redaction, OTel correlation, destinations, the dashboard, and the audit/quality gates.
- [ ] A fresh, empty `## [Unreleased]` section is left above `1.0.0` for future work.
- [ ] The entry notes the **library status**: consumed via local `link:` / `^0.1.0` (pre-GA); the example tag is **not pushed** until the library publishes.
- [ ] A local **annotated** tag `v1.0.0` exists (`git tag -a v1.0.0 -m "…"`) — annotated, not lightweight.
- [ ] The tag is **not pushed** to any remote (verified: it exists locally only).
- [ ] `CHANGELOG.md` reference links (if used) resolve; `markdown-link-check` passes.

### Files to create / modify

- `CHANGELOG.md` — promote `[Unreleased]` → `[1.0.0]`, add a fresh `[Unreleased]`.
- _(git tag — local only, no file change)_

### Agent Execution Prompt

> Role: Senior TypeScript engineer / release manager.
> Context: Task P18-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 18 ("`CHANGELOG.md` `1.0.0` entry + a local annotated `v1.0.0` tag (pushed only when the library hits GA)"). Library status per OVERVIEW §7/§18: `@bymax-one/nest-logger@0.1.0` is **not on npm yet**, consumed via local `link:`; the example pins `^0.1.0`. Do NOT push the tag.
> Objective: Write the `1.0.0` changelog entry and create the local annotated `v1.0.0` tag without pushing it.
> Steps:
>
> 1. Edit `/CHANGELOG.md`: rename the existing `## [Unreleased]` to `## [1.0.0] - <today>` and flesh out `### Added` with the shipped surface, e.g.:
>    ```markdown
>    ## [Unreleased]
>
>    ## [1.0.0] - 2026-05-30
>
>    ### Added
>
>    - `apps/api` — NestJS 11 reference service wiring `@bymax-one/nest-logger` via `forRootAsync`, OTel bootstrap, request-id middleware, HTTP logging interceptor + exception filter.
>    - `apps/worker` — second service proving cross-service `traceId` correlation (snake_case field format).
>    - `apps/web` — Next.js 16 Log Explorer + Trigger Playground dashboard.
>    - Destinations: stdout, pretty-dev, Loki (batched push), Prisma (`warn`+ durable tier), rolling-file.
>    - PII redaction proofs (97 default paths + app extensions), OTel trace correlation, two-tier persistence.
>    - Local observability stack (Postgres / Loki / Tempo / OTel Collector / Grafana).
>    - Quality gates: 100% test coverage, Stryker `break: 100`, export-usage audit, log-key audit, `helmet` hardening, CI/CD workflows.
>
>    > **Library status:** consumes `@bymax-one/nest-logger@^0.1.0` via local `link:` (pre-GA, not yet on npm). The `v1.0.0` tag is created locally and **not pushed** until the library publishes.
>    ```
> 2. Verify the working tree is committed (this task assumes the prior P18 tasks are merged). Create the annotated tag:
>    ```bash
>    git tag -a v1.0.0 -m "nest-logger-example v1.0.0 — reference app for @bymax-one/nest-logger (pre-GA, local link)"
>    ```
> 3. Confirm the tag is annotated and local-only:
>    ```bash
>    git cat-file -t v1.0.0          # → tag (annotated, not 'commit')
>    git ls-remote --tags origin | grep v1.0.0 || echo "not pushed (expected)"
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §0 Guiding Principle #8 (Conventional Commits) + OVERVIEW §18.
> - Do **NOT** `git push --tags` or `git push origin v1.0.0` — the tag stays local until the library GAs on npm.
> - Do NOT change the dependency range to a published npm version — the repo still consumes the local `link:` / `^0.1.0`.
> - Annotated tag only (`-a`); a lightweight tag is not acceptable.
>   Verification:
>
> - `git cat-file -t v1.0.0` — expected: `tag` (annotated).
> - `git tag --list v1.0.0` — expected: `v1.0.0`.
> - `git ls-remote --tags origin` — expected: does **not** contain `v1.0.0`.
> - `grep -n "## \[1.0.0\]" CHANGELOG.md` — expected: match.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P18-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P18-6 — Verification Gate — `audit:exports` Green, All CI Gates, §6 100%

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P18-1`, `P18-2`, `P18-3`, `P18-4`, `P18-5`

### Description

Phase 18 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove `pnpm audit:exports` exits 0, every CI gate is green, and the §6 Feature Coverage Matrix is 100% demonstrated. Closes Phase 18 — the final phase — and confirms the whole 133-task plan is complete and shippable.

### Acceptance Criteria

- [ ] `pnpm audit:exports` exits 0 (every library export referenced in `apps/`).
- [ ] `pnpm audit:log-keys` exits 0 (every app log key convention-clean, no reserved reuse).
- [ ] All CI gates green: lint, typecheck, unit (100% cov), e2e (api + web), mutation (`break: 100`), `export-usage-check`, log-key convention.
- [ ] The `OVERVIEW.md` §6 matrix is 100% demonstrated — no `✗ UNUSED` export; every "Demonstrated in" path exists.
- [ ] `helmet` is active and the security-header e2e assertion passes (P18-4).
- [ ] The local annotated `v1.0.0` tag exists and is **not** pushed (P18-5).
- [ ] `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:cov && pnpm test:e2e && pnpm mutation` all exit 0 on a clean checkout.

### Files to create / modify

- _(none — verification only; fix the corresponding P18 task file if a check fails)_

### Agent Execution Prompt

> Role: Senior TypeScript / security engineer closing the project.
> Context: Task P18-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 18. DoD: `pnpm audit:exports` exits 0; all CI gates green; the `OVERVIEW.md` §6 matrix is 100% demonstrated. This is the last task of the last phase.
> Objective: Run the full gate suite, confirm Phase 18 (and the whole plan) is complete, and close the phase.
> Steps:
>
> 1. From a clean checkout, run in order — all must exit 0:
>    ```bash
>    pnpm install --frozen-lockfile
>    pnpm typecheck
>    pnpm lint
>    pnpm format:check
>    pnpm test:cov          # 100% b/l/f/s in api + web
>    pnpm test:e2e          # api supertest (stdout capture) + web Playwright
>    pnpm mutation          # Stryker break: 100 in api + web
>    pnpm audit:exports     # every library export used
>    pnpm audit:log-keys    # convention-clean, no reserved reuse
>    ```
> 2. Spot-check the §6 matrix: every "Demonstrated in" path exists (`test -f`) and the auditor reports zero `✗ UNUSED`.
> 3. Confirm `helmet` headers (P18-4) and the local-only `v1.0.0` tag (P18-5): `git cat-file -t v1.0.0` → `tag`; `git ls-remote --tags origin | grep v1.0.0` → empty.
> 4. If any check fails, diagnose and fix in the corresponding P18 task file (P18-1..P18-5), then return here. Do NOT bypass a gate, lower a threshold, add `@ts-ignore`/`eslint-disable`, or use `--no-verify`.
> 5. When everything is green, flip the Phase 18 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done and confirm Overall progress reads `133 / 133`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §0 Guiding Principle #6 (no shortcuts).
> - Do NOT push the `v1.0.0` tag (it stays local until the library GAs — P18-5).
> - Do NOT mark done with any failing check.
>   Verification:
>
> - `pnpm audit:exports` — expected: exit 0.
> - `pnpm audit:log-keys` — expected: exit 0.
> - `pnpm test:cov` — expected: 100% coverage, exit 0.
> - `pnpm mutation` — expected: `break: 100`, exit 0.
> - `pnpm test:e2e` — expected: all pass (incl. security-header + redaction assertions).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P18-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 18 is 6/6 — switch the Phase 18 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done. This completes all 133 tasks.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
