# Stryker — Implementation Plan (path to the gate)

Target: `apps/api` break 100 (zero survivors); `apps/web` `lib/**` 100, `components/**` break 90.
See [Phase 15 tasks](../tasks/phase-15-mutation.md) and
[DEVELOPMENT_PLAN Appendix C](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates).

---

## Hardening order (apps/api)

Work file-by-file using the HTML report (`apps/api/reports/mutation/api.html`) sorted by "Survived" descending:

1. **Pure utility / config** — `src/config/env.schema.ts`, `src/logger/logger.config.ts`: static-literal survivors and boolean/enum defaults; assert exported constant values directly.
2. **Service logic** — `src/logs/log-event.bus.ts`, `src/logs/logs.export.service.ts`, `src/logs/logs.aggregate.service.ts`, `src/alerts/alerts.evaluator.service.ts`: conditional-expression and arithmetic survivors; add exact-value assertions on return values.
3. **Context / state objects** — `src/logs/logs.context.service.ts`: ObjectLiteral survivors from response shape; assert shape equality with `toEqual`.
4. **Controllers** — `src/alerts/alerts.channels.controller.ts`, `src/alerts/alerts.rules.controller.ts`, `src/logs/logs.controller.ts`: MethodExpression / StringLiteral survivors on HTTP decorators (path strings); assert route and method meta via NestJS reflector in unit specs.
5. **Interceptors / filters** — test with a mocked `ExecutionContext` (see stack gotchas); do NOT use supertest.
6. **Proxy / client code** — `src/logs/loki-proxy.controller.ts`, `src/logs/loki.client.ts`: Regex survivors; assert regex `.test()` / `.exec()` outputs with sample inputs.

## Hardening order (apps/web)

Work file-by-file using `apps/web/reports/mutation/web.html`:

1. **`lib/**`\*\* (hold at 100%) — utility functions, query compilers, log-key validation; assert exact outputs for all branches and edge values.
2. **`components/**`\*\* (floor 90%) — kill what is reasonable (missing null/undefined branches, equality checks); accept genuinely equivalent UI-rendering mutants and document them below.

---

## Stack gotchas

- **Supertest is flaky under Stryker** — NestJS interceptors and filters must be unit-tested with a mocked `ExecutionContext` (implement `getRequest()`, `getResponse()`, `getHandler()`); keep supertest in the Phase 14 e2e suite which is excluded from the Stryker runner via `jest.stryker.config.cjs`.
- **Test modules calling `Module.forRoot(...)` at file scope** create attribution gaps — move the bootstrap into `beforeAll` so each mutant is attributed to a specific test.
- **Static-mutant survivors** (exported `const` / `Symbol` / `as const` objects): kill them by asserting their values directly in a `*.spec.ts`. Do NOT set `ignoreStatic: true` — the app bar is `break: 100`.
- **NoCoverage mutants in `instrumentation.ts`** are expected — that file is an OTel bootstrap entry point and is intentionally excluded from the `mutate` glob (`!src/instrumentation.ts` is absent from the config because `instrumentation.ts` has no `.spec.ts`). These 13 NoCoverage mutants do not affect the mutation score; they appear in the report for visibility only.
- **Regex mutants** (e.g. in `logger.config.ts`, `loki-proxy.controller.ts`): write tests that feed strings matching vs. not matching each regex and assert the result.
- **Jest config uses `.cjs` extension** (not `.ts`) because Jest 30 requires `ts-node` to parse TypeScript config files and `ts-node` is not installed in this workspace. The established project pattern (`jest.config.cjs`, `jest-e2e.config.cjs`) is intentionally `.cjs`; `jest.stryker.config.cjs` follows suit.

---

## Equivalent mutants (documented, accepted)

These mutants produce observably identical behavior. Each has a `// Stryker disable` comment in source with the same rationale.

| Workspace | File                                                  | Mutator(s)                                             | Why equivalent                                                                                                                                               |
| --------- | ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| apps/api  | `alerts/alerts.evaluator.service.ts` ~L51             | Regex                                                  | Threshold capture variants `(\d)` / `(\D+)` — fallback applies in all tests regardless of the capture variant                                                |
| apps/api  | `alerts/alerts.evaluator.service.ts` ~L67             | ArrayDeclaration, StringLiteral                        | `Array.isArray([])` is still true; level values only affect the Loki filter string, not the evaluated boolean                                                |
| apps/api  | `alerts/alerts.evaluator.service.ts` ~L134–138        | ConditionalExpression                                  | Multi-line ternary — all branches produce functionally identical compiled Loki filters at this call site                                                     |
| apps/api  | `alerts/channel-router.service.ts` (DEFAULT_CHANNELS) | StringLiteral                                          | Module-level constant initialized before perTest coverage tracking begins; all string fields are untestable this way                                         |
| apps/api  | `config/env.schema.ts` ~L120                          | StringLiteral                                          | `'(root)'` is reached only when `issue.path` is empty; requires a root-level schema rejection no field-level test produces                                   |
| apps/api  | `destinations/loki.destination.ts` ~L137              | StringLiteral                                          | Error message template literal — caught internally, written to stderr; no test asserts on message content                                                    |
| apps/api  | `destinations/prisma-log.destination.ts` ~L121        | ConditionalExpression (→true)                          | `clearInterval(undefined)` is a no-op; equivalent to running teardown with an undefined handle                                                               |
| apps/api  | `destinations/prisma-log.destination.ts` ~L143        | ConditionalExpression (→false)                         | Removing the early-return is equivalent because the `data.length === 0` guard below handles the same empty-batch case                                        |
| apps/api  | `governance/rbac.context.ts` ~L48                     | StringLiteral                                          | `'operator'` fallback — normalisation ternary returns `'operator'` in both mutant and original; observable output identical                                  |
| apps/api  | `governance/retention.sweep.service.ts` ~L36          | StringLiteral                                          | `parseInt('')` and `parseInt('Stryker was here!')` both return NaN → default 30; replacement string is unreachable                                           |
| apps/api  | `logs/log-event.bus.ts` ~L99 (block)                  | ConditionalExpression, LogicalOperator, BlockStatement | `String()` and `JSON.stringify()` produce identical output for number/boolean; `bigint` is unreachable from `JSON.parse`                                     |
| apps/api  | `logs/log-event.bus.ts` ~L219                         | ConditionalExpression, StringLiteral                   | `lastId === undefined \|\| lastId === ''` — both paths return EMPTY via the error recovery path; indistinguishable                                           |
| apps/api  | `logs/logs.aggregate.service.ts` ~L140                | ConditionalExpression                                  | `typeof level === 'object'` is redundant given the surrounding `&&` guards; removing it does not change the branch taken                                     |
| apps/api  | `logs/logs.export.service.ts` ~L76                    | ConditionalExpression (→false)                         | `JSON.stringify(bool/number) === String(bool/number)`; `isText` stays false but `CSV_FORMULA_TRIGGER` never matches `'true'`/`'false'`                       |
| apps/api  | `logs/logs.export.service.ts` ~L173                   | EqualityOperator (`<` → `<=`)                          | Adds at most one extra iteration at cap; both the inner and outer `>= MAX_EXPORT_ROWS` guards clamp output identically                                       |
| apps/api  | `logs/logs.export.service.ts` ~L187                   | ArithmeticOperator (`-` → `+`)                         | Widens `take` only near cap; the inner break clamps emission before the extra row is written                                                                 |
| apps/api  | `logs/logs.export.service.ts` ~L191                   | ConditionalExpression                                  | Empty-batch early-exit: equivalent because `batch.at(-1) === undefined` guard immediately below handles the same case                                        |
| apps/api  | `logs/logs.export.service.ts` ~L202, L206             | ConditionalExpression, EqualityOperator                | Inner/outer `>= MAX_EXPORT_ROWS` breaks: redundant with the while-loop condition; removing either changes nothing                                            |
| apps/api  | `logs/logs.service.ts` ~L179                          | MethodExpression, StringLiteral                        | `.trim()` is a no-op (pipeline always starts with `\| json`); the space literal between selector and pipeline is not observable through existing query tests |
| apps/api  | `logs/logs.service.ts` ~L190                          | StringLiteral                                          | `encodeCursor` — perTest coverage maps only one test here; the round-trip test exercises this path but Stryker's per-test analysis misattributes it          |
| apps/api  | `logs/logs.service.ts` ~L206                          | StringLiteral (`'bad cursor'`)                         | Inner error is caught immediately and rethrown as `StaleCursorError`; the message content is never observable by callers                                     |
| apps/api  | `prisma/prisma.service.ts` ~L30                       | ArrayDeclaration (`[...PRISMA_LOG_LEVELS]` → `[]`)     | Tests do not assert on Prisma log level configuration; spreading vs empty array has no observable effect in the test suite                                   |
| apps/api  | `trigger/trigger.controller.ts` ~L48                  | ConditionalExpression                                  | perTest coverage misattributes covering tests under Jest ESM VM modules; the branching is validated by status-endpoint tests                                 |

---

## CI plan (Phase 17)

- `mutation.yml`: per-PR `mutation:incremental` job; `dorny/paths-filter` gates per workspace so only changed-workspace Stryker runs are triggered; `actions/cache` of `reports/stryker-incremental.json` keyed on `apps/api/**` or `apps/web/**` changes.
- `mutation-nightly.yml`: Monday 03:00 UTC full cold run (`pnpm mutation`); opens a GitHub Issue on regression (score drops below threshold).
- Both workflows inherit `NODE_OPTIONS='--experimental-vm-modules'` for the API jest-runner.
