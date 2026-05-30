# Phase 14 — Testing — Unit + E2E (100% Coverage) — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14
> **Total tasks:** 10
> **Progress:** 🔴 0 / 10 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID     | Task                                                                                                     | Status | Priority | Size | Depends on   |
| ------ | -------------------------------------------------------------------------------------------------------- | ------ | -------- | ---- | ------------ |
| P14-1  | `apps/api` Jest config (native ESM + ts-jest) + 100% coverage gate                                       | 🔴     | High     | M    | Phases 6–13  |
| P14-2  | `apps/api` unit tests — destinations + `logger.config` + `LogAuditService` + guards/decorators           | 🔴     | High     | L    | P14-1        |
| P14-3  | `apps/api` supertest e2e — stdout-capture (logKeys, URL norm, requestId, `[REDACTED]`, double-log)       | 🔴     | High     | L    | P14-1        |
| P14-4  | `apps/api` e2e — `logs/` read-API (paging, aggregate, facets, SSE stream emits)                          | 🔴     | High     | L    | P14-3        |
| P14-5  | `apps/api` e2e — `apps/worker` `traceId` propagation across the HTTP hop                                 | 🔴     | High     | M    | P14-3        |
| P14-6  | Optional `docker-compose.test.yml` + `infra:test:up/down` + Testcontainers Loki                          | 🔴     | Low      | M    | P14-4        |
| P14-7  | `apps/web` Vitest config (jsdom, v8) + 100% thresholds on `lib/**`+`components/**` (pin Vitest major)    | 🔴     | High     | M    | Phases 11–13 |
| P14-8  | `apps/web` unit tests — severity mapping, filters↔URL (`nuqs`), SSE hook ring buffer, log-key validation | 🔴     | High     | L    | P14-7        |
| P14-9  | `apps/web` Playwright journeys (Trigger → live Explorer → trace; brush → filter; RBAC scoping)           | 🔴     | High     | L    | P14-7        |
| P14-10 | Verification gate — `pnpm test:cov` + `pnpm test:e2e` 100% in both workspaces                            | 🔴     | High     | M    | P14-1..P14-9 |

---

## P14-1 — `apps/api` Jest Config (native ESM + ts-jest) + 100% Coverage Gate

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `Phases 6–13`

### Description

Consolidate the `apps/api` Jest setup into one canonical config that runs under **native ESM** (`NODE_OPTIONS=--experimental-vm-modules`) and hardens the coverage gate to **100% on all four metrics**. The whole repo is ESM (`"type": "module"`, P0-1), so Jest must run in VM-modules mode with `ts-jest`'s ESM preset. The NestJS `emitDecoratorMetadata` "phantom branch" is neutralized with **`ignoreCoverageForAllDecorators: true`** in the ts-jest transform (per [`../DEVELOPMENT_PLAN.md` Appendix C — Quality Gates](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates) coverage-shim note) — this is preferred over `nest-auth-example`'s bespoke `jest-ts-transform.cjs`. `collectCoverageFrom` excludes non-executable / framework-glue files so 100% is meaningful, not gamed. This task wires the harness only; the tests that satisfy the gate land in P14-2..P14-5.

### Acceptance Criteria

- [ ] `apps/api/jest.config.ts` (or `.mjs`) exists, configured for ESM via `extensionsToTreatAsEsm: ['.ts']` and the ts-jest ESM transform.
- [ ] The ts-jest transform sets `useESM: true` **and** `ignoreCoverageForAllDecorators: true` (decorator coverage shim).
- [ ] `moduleNameMapper` strips the `.js` specifier suffix for ESM relative imports (`'^(\\.{1,2}/.*)\\.js$': '$1'`).
- [ ] `coverageThreshold.global` = `{ branches: 100, functions: 100, lines: 100, statements: 100 }`.
- [ ] `collectCoverageFrom` includes `src/**/*.ts` and **excludes** `**/*.spec.ts`, `**/*.module.ts`, `**/main.ts`, `**/*.dto.ts`, `**/*.d.ts` (and `**/instrumentation.ts`).
- [ ] `apps/api/package.json` has scripts `test`, `test:cov`, `test:e2e` each exporting `NODE_OPTIONS=--experimental-vm-modules` before `jest`.
- [ ] A separate `apps/api/test/jest-e2e.config.ts` exists for the e2e project (`testRegex: '.e2e-spec.ts$'`, no coverage threshold).
- [ ] `pnpm --filter api test:cov` runs (it may report uncovered files until P14-2..P14-5 land, but the **config** is correct and the runner starts cleanly under ESM).

### Files to create / modify

- `apps/api/jest.config.ts` — unit project config (ESM + ts-jest + 100% threshold).
- `apps/api/test/jest-e2e.config.ts` — e2e project config (no threshold).
- `apps/api/package.json` — `test` / `test:cov` / `test:e2e` scripts with `NODE_OPTIONS`.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS test engineer hardening a Jest coverage gate under native ESM.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14 + §2 Global Conventions + Appendix C, and `docs/OVERVIEW.md` §16 Testing Strategy). This is task P14-1. The whole workspace is ESM (`"type": "module"`); Jest 30 must run with `NODE_OPTIONS=--experimental-vm-modules`. Appendix C mandates `coverageThreshold.global` = 100 on all four metrics and excludes `*.spec`/`*.module`/`main.ts`/`*.dto`/`*.d.ts` from `collectCoverageFrom`; it also mandates the `ignoreCoverageForAllDecorators: true` ts-jest shim for the NestJS `emitDecoratorMetadata` phantom branch.
> Objective: Produce the `apps/api` Jest unit + e2e configs and the package scripts so the runner boots under ESM and enforces 100% coverage.
> Steps:
>
> 1. Install the test toolchain in `apps/api` (if not already present from earlier phases):
>    `pnpm add -D --filter api jest@^30 ts-jest@^29 @types/jest @nestjs/testing supertest @types/supertest pino-test`.
> 2. Create `apps/api/jest.config.ts`:
>
>    ```ts
>    import type { Config } from 'jest'
>
>    const config: Config = {
>      rootDir: '.',
>      testEnvironment: 'node',
>      roots: ['<rootDir>/src'],
>      testRegex: '\\.spec\\.ts$',
>      extensionsToTreatAsEsm: ['.ts'],
>      moduleNameMapper: {
>        // ESM relative imports carry a `.js` suffix at runtime; strip it for resolution.
>        '^(\\.{1,2}/.*)\\.js$': '$1',
>      },
>      transform: {
>        '^.+\\.ts$': [
>          'ts-jest',
>          {
>            useESM: true,
>            // Neutralize the phantom branch NestJS `emitDecoratorMetadata` injects
>            // (known ts-jest issue) — preferred over a bespoke transform shim.
>            ignoreCoverageForAllDecorators: true,
>            tsconfig: '<rootDir>/tsconfig.json',
>          },
>        ],
>      },
>      collectCoverage: true,
>      collectCoverageFrom: [
>        'src/**/*.ts',
>        '!src/**/*.spec.ts',
>        '!src/**/*.module.ts',
>        '!src/main.ts',
>        '!src/instrumentation.ts',
>        '!src/**/*.dto.ts',
>        '!src/**/*.d.ts',
>      ],
>      coverageThreshold: {
>        global: { branches: 100, functions: 100, lines: 100, statements: 100 },
>      },
>      coverageDirectory: '<rootDir>/coverage',
>    }
>
>    export default config
>    ```
>
> 3. Create `apps/api/test/jest-e2e.config.ts` — same ESM transform, but `roots: ['<rootDir>/test']`, `testRegex: '\\.e2e-spec\\.ts$'`, and **no** `coverageThreshold`/`collectCoverage` (e2e measures behavior, not coverage).
> 4. Edit `apps/api/package.json` scripts (note: `--experimental-vm-modules` is required for Jest native ESM):
>    ```jsonc
>    {
>      "scripts": {
>        "test": "NODE_OPTIONS=--experimental-vm-modules jest --config jest.config.ts",
>        "test:cov": "NODE_OPTIONS=--experimental-vm-modules jest --config jest.config.ts --coverage",
>        "test:e2e": "NODE_OPTIONS=--experimental-vm-modules jest --config test/jest-e2e.config.ts --runInBand",
>      },
>    }
>    ```
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 Global Conventions + Appendix C.
> - Do NOT lower any threshold below 100 to make CI green; do NOT add files to `collectCoverageFrom` exclusions beyond the listed `*.spec`/`*.module`/`main.ts`/`instrumentation.ts`/`*.dto`/`*.d.ts` to hide real gaps.
> - Jest native ESM is still flagged experimental as of Jest 30.4 (Appendix C) — keep the `NODE_OPTIONS` flag and a one-line comment noting a CJS-transform fallback exists if an upstream change breaks it. Do NOT silently fall back to CJS.
> - Do NOT use `@ts-ignore` / `eslint-disable` anywhere in the config or tests.
>   Verification:
> - `pnpm --filter api exec jest --config jest.config.ts --showConfig` — expected: prints the resolved config; `coverageThreshold.global` shows all four metrics at 100.
> - `pnpm --filter api test:cov` — expected: the runner boots under ESM (no "Cannot use import statement" / VM-modules error); coverage is enforced at 100 once P14-2..P14-5 land.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-2 — `apps/api` Unit Tests — Destinations + `logger.config` + `LogAuditService` + Guards/Decorators

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P14-1`

### Description

Write the `apps/api` **unit** tests that drive every non-HTTP unit to 100% coverage. Prefer **`pino-test`** (the official Pino helper — attach a sink stream and assert structured entries deterministically) over global `process.stdout` spying for pure unit tests. Cover: the three destinations (`LokiDestination`, `PrismaLogDestination`, `RollingFileDestination`) including lifecycle hooks (`onInit`/`onShutdown`), `minLevel` filtering, batch flush, and fail-soft `try/catch` branches; the `buildLoggerOptions` factory (`isPretty`, merged `redactPaths`, `excludePaths`, `destinations[]`, env branches); `LogAuditService` (effective vs configured redact paths, `hasDefaultRedactionDisabled`); and any guards/decorators the demo domain adds. Every executable branch must be exercised — including the fail-soft `catch` that writes `LOGGER_DESTINATION_WRITE_FAILED` to `stderr`.

### Acceptance Criteria

- [ ] `loki.destination.spec.ts` covers `onInit` (timer set), `write` (buffer + batch-size flush), `onShutdown` (timer cleared + final flush), and the fail-soft `catch` (bad `fetch` URL → `process.stderr.write` of `LOGGER_DESTINATION_WRITE_FAILED`, no throw).
- [ ] `prisma-log.destination.spec.ts` covers `minLevel: 'warn'` filtering, batched `createMany`, the JSON-parse guard branch, and `onShutdown` flush (Prisma client mocked).
- [ ] `rolling-file.destination.spec.ts` covers the async `onInit()` (pino-roll mocked) and `write`.
- [ ] `logger.config.spec.ts` covers both `NODE_ENV` branches (`isPretty` on/off), empty vs populated `LOG_EXTRA_REDACT_PATHS` (merge + trim + filter), and the prod-vs-dev `destinations[]` (`RollingFileDestination` only outside prod).
- [ ] `log-audit.service.spec.ts` covers `listEffectiveRedactPaths` (defaults + extensions), `listConfiguredRedactPaths`, and `hasDefaultRedactionDisabled` (true/false).
- [ ] Unit tests use **`pino-test`** for structured-log assertions (not `process.stdout` spying).
- [ ] `pnpm --filter api test:cov` reports **100%** on every file in scope **except** the HTTP/e2e-only paths covered by P14-3..P14-5 (no regressions; the unit-covered files are at 100).

### Files to create / modify

- `apps/api/src/destinations/loki.destination.spec.ts`
- `apps/api/src/destinations/prisma-log.destination.spec.ts`
- `apps/api/src/destinations/rolling-file.destination.spec.ts`
- `apps/api/src/logger/logger.config.spec.ts`
- `apps/api/src/logger/log-audit.service.spec.ts`
- _(+ any guard/decorator `*.spec.ts` the demo domain introduced in Phases 6–10)_

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS test engineer writing deterministic unit tests to 100% coverage.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14 + Appendix C, and `docs/OVERVIEW.md` §12 Destinations Showcase + §13 PII Redaction + §16 Testing Strategy). This is task P14-2. The Jest ESM + 100% gate is wired in P14-1. The destinations and their fail-soft contract are specified in `OVERVIEW.md` §12 (Loki push to `/loki/api/v1/push`, nanosecond string timestamps, `process.stderr.write` on failure — never log to the logger from inside `write()`); the audit service shape is in §13.
> Objective: Write `*.spec.ts` files that drive the destinations, `logger.config`, `LogAuditService`, and any guards/decorators to 100% coverage using `pino-test` for log assertions.
> Steps:
>
> 1. **`LokiDestination`** — fake timers + a mocked `fetch`:
>
>    ```ts
>    import { jest } from '@jest/globals'
>    import { LokiDestination } from './loki.destination'
>
>    it('flushes a batch and pushes nanosecond-string timestamps to /loki/api/v1/push', async () => {
>      const fetchMock = jest.fn(async () => new Response(null, { status: 204 }))
>      globalThis.fetch = fetchMock as unknown as typeof fetch
>      const dest = new LokiDestination({ url: 'http://loki/loki/api/v1/push', batchSize: 1 })
>      dest.write('{"level":30,"logKey":"X_Y_Z"}\n')
>      await Promise.resolve()
>      expect(fetchMock).toHaveBeenCalledTimes(1)
>      const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))
>      expect(typeof body.streams[0].values[0][0]).toBe('string') // ns epoch as string
>    })
>
>    it('fails soft on a bad URL — writes LOGGER_DESTINATION_WRITE_FAILED to stderr, never throws', async () => {
>      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
>      globalThis.fetch = (async () => {
>        throw new Error('ECONNREFUSED')
>      }) as unknown as typeof fetch
>      const dest = new LokiDestination({ url: 'http://bad', batchSize: 1 })
>      await expect((async () => dest.write('{"a":1}\n'))()).resolves.toBeUndefined()
>      await new Promise((r) => setTimeout(r, 0))
>      expect(String(stderr.mock.calls.flat().join(''))).toContain(
>        'LOGGER_DESTINATION_WRITE_FAILED',
>      )
>      stderr.mockRestore()
>    })
>    ```
>
> 2. **`PrismaLogDestination`** — inject a mock Prisma client (`{ applicationLog: { createMany: jest.fn() } }`); assert a `debug`/`info` line below `minLevel: 'warn'` is dropped, a `warn`+ line is buffered and `createMany`'d on flush, and a non-JSON payload hits the parse-guard branch without throwing.
> 3. **`RollingFileDestination`** — `jest.mock('pino-roll', ...)`; assert `onInit()` awaits the stream factory and `write()` forwards the line.
> 4. **`logger.config`** — call `buildLoggerOptions(configStub, prismaStub)` with `NODE_ENV='production'` and `'development'`; assert `isPretty` flips, `LOG_EXTRA_REDACT_PATHS='a, b ,'` parses to `['a','b']` and merges into `redactPaths`, `http.excludePaths` are the two anchored RegExps, and `RollingFileDestination` is present only when not prod. Use a `ConfigService`-shaped stub (`get`/`getOrThrow`).
> 5. **`LogAuditService`** — instantiate with a stub options object via the Nest testing module or direct `new`; assert `listEffectiveRedactPaths()` returns `DEFAULT_REDACT_PATHS` concatenated with the extensions, and the two booleans toggle.
> 6. For any **structured-log** assertion (e.g. a service that emits via `PinoLoggerService`), prefer `pino-test`:
>    ```ts
>    import pinoTest from 'pino-test'
>    const stream = pinoTest.sink()
>    // attach `stream` to the pino instance under test, emit, then:
>    await pinoTest.once(stream, { level: 30, logKey: 'ORDER_CREATE_SUCCESS' })
>    ```
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C.
> - Prefer `pino-test` over `process.stdout` spying for **unit** tests (stdout-capture is the e2e technique, P14-3).
> - Never log to the logger from inside a destination's `write()` (infinite loop) — assert failures go to `process.stderr` (`OVERVIEW.md` §11/§12).
> - Do NOT use `@ts-ignore` / `eslint-disable` / `--no-verify`; do NOT delete a hard-to-cover branch to reach 100 — test it.
>   Verification:
> - `pnpm --filter api test:cov` — expected: every file covered by these specs reports 100% b/l/f/s; no test is `.skip`/`.todo`.
> - `pnpm --filter api exec jest loki.destination` — expected: the fail-soft `catch` branch is hit (visible in the per-file branch coverage).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-3 — `apps/api` Supertest E2E — Stdout-Capture (logKeys, URL Norm, requestId, `[REDACTED]`, Double-Log)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P14-1`

### Description

Write the core HTTP **e2e** suite using **supertest** against a booted Nest app, asserting on **captured stdout** (`jest.spyOn(process.stdout, 'write')`) — the technique `OVERVIEW.md` §16 prescribes for e2e. The suite proves the library's observable contract end to end: the reserved HTTP `logKey`s (`HTTP_REQUEST_START`/`HTTP_REQUEST_SUCCESS`/`HTTP_REQUEST_CLIENT_ERROR`/`HTTP_REQUEST_REDIRECT`) and app keys (`ORDER_CREATE_SUCCESS`, `USER_SIGNUP_ATTEMPT`, `PAYMENT_*`) are emitted; URL normalization rewrites `/orders/<id>` → `"url":"/orders/:id"`; the `requestId` from `X-Request-Id` propagates into every line of that request; PII is `[REDACTED]` (and raw PII like `p@ss` is absent); and the exception filter ↔ interceptor coordination logs a handled exception **exactly once** (double-log avoidance via `__bymax_logger_handled`).

### Acceptance Criteria

- [ ] `test/http-logging.e2e-spec.ts` boots the real `AppModule` via `@nestjs/testing` (`bufferLogs: true`, `app.useLogger(app.get(PinoLoggerService))`).
- [ ] A stdout spy (`jest.spyOn(process.stdout, 'write').mockImplementation(() => true)`) captures emitted JSON; restored in `afterEach`.
- [ ] `POST /orders` asserts `"logKey":"HTTP_REQUEST_START"` **and** `"logKey":"HTTP_REQUEST_SUCCESS"` **and** `"logKey":"ORDER_CREATE_SUCCESS"` all present.
- [ ] `GET /orders/:id` (a real id value) asserts the emitted line contains `"url":"/orders/:id"` (normalized), not the raw id.
- [ ] A request with header `X-Request-Id: r_test_123` asserts every captured line for that request carries `"requestId":"r_test_123"`.
- [ ] `POST /pii-demo/signup` with `{ email, password, cpf, cardNumber }` asserts the output contains `[REDACTED]` and does **not** contain the raw `password`/`cpf` values.
- [ ] A 4xx route asserts `HTTP_REQUEST_CLIENT_ERROR`; a thrown `HttpException` (`POST /payments` forced failure) asserts `HTTP_EXCEPTION_HANDLED` appears **exactly once** (counted), proving double-log avoidance.
- [ ] `pnpm --filter api test:e2e` passes (all e2e specs green).

### Files to create / modify

- `apps/api/test/http-logging.e2e-spec.ts` — the core stdout-capture suite.
- `apps/api/test/utils/capture-stdout.ts` — a small helper (spy → return `{ lines(): string }` → restore) reused by P14-4/P14-5.
- `apps/api/test/fixtures/` — request bodies / expected-shape fixtures (mirrors the library's e2e harness).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS e2e engineer asserting on captured stdout.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14, and `docs/OVERVIEW.md` §16 Testing Strategy — which gives the exact stdout-capture snippet — plus §6 rows 14–18 for the HTTP keys, URL norm, requestId, and double-log behaviors). This is task P14-3. The reserved keys (`HTTP_REQUEST_*`, `HTTP_EXCEPTION_*`) come from `RESERVED_LOG_KEYS`; app keys (`ORDER_CREATE_SUCCESS`, etc.) follow `LOG_KEYS_CONVENTION_REGEX`. URL norm turns UUID/ULID/nanoid/numeric segments into `:id`.
> Objective: Write `test/http-logging.e2e-spec.ts` (+ a `capture-stdout` helper) that boots the app and asserts the emitted `logKey`s, normalized URL, propagated `requestId`, `[REDACTED]`, and once-only exception logging.
> Steps:
>
> 1. Create `test/utils/capture-stdout.ts`:
>
>    ```ts
>    import { jest } from '@jest/globals'
>
>    export function captureStdout() {
>      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      return {
>        lines: () => spy.mock.calls.map((c) => String(c[0])).join(''),
>        restore: () => spy.mockRestore(),
>      }
>    }
>    ```
>
> 2. Boot the app once per suite:
>
>    ```ts
>    import { Test } from '@nestjs/testing'
>    import { PinoLoggerService } from '@bymax-one/nest-logger'
>    import request from 'supertest'
>    import { AppModule } from '../src/app.module'
>
>    let app: import('@nestjs/common').INestApplication
>    beforeAll(async () => {
>      const mod = await Test.createTestingModule({ imports: [AppModule] }).compile()
>      app = mod.createNestApplication({ bufferLogs: true })
>      app.useLogger(app.get(PinoLoggerService))
>      await app.init()
>    })
>    afterAll(async () => {
>      await app.close()
>    })
>    ```
>
> 3. The canonical redaction + HTTP-keys assertion (from `OVERVIEW.md` §16):
>    ```ts
>    it('logs HTTP_REQUEST_START + HTTP_REQUEST_SUCCESS and redacts the body', async () => {
>      const out = captureStdout()
>      await request(app.getHttpServer())
>        .post('/pii-demo/signup')
>        .send({
>          email: 'a@b.com',
>          password: 'p@ss',
>          cpf: '12345678900',
>          cardNumber: '4111111111111111',
>        })
>        .expect(201)
>      const logs = out.lines()
>      expect(logs).toContain('"logKey":"HTTP_REQUEST_START"')
>      expect(logs).toContain('"logKey":"HTTP_REQUEST_SUCCESS"')
>      expect(logs).toContain('[REDACTED]')
>      expect(logs).not.toContain('p@ss')
>      out.restore()
>    })
>    ```
> 4. URL norm: `GET /orders/clx123abc...` (a real cuid/id) → assert `out.lines()` contains `'"url":"/orders/:id"'` and NOT the raw id.
> 5. requestId propagation: send `.set('X-Request-Id', 'r_test_123')`; parse the captured lines and assert every object that has a `requestId` equals `'r_test_123'`.
> 6. Double-log: force the `POST /payments` failure path; count occurrences of `'"logKey":"HTTP_EXCEPTION_HANDLED"'` in `out.lines()` and assert it equals `1` (the filter↔interceptor `__bymax_logger_handled` coordination prevents a second log).
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C; e2e uses **stdout capture** (not `pino-test`).
> - Always `restore()` the spy (in `afterEach`/at the end of each test) so a failing assertion never leaves stdout muted for later tests.
> - Assert raw PII is **absent** (`not.toContain`) in addition to asserting `[REDACTED]` is present — both directions.
> - Do NOT use `@ts-ignore` / `eslint-disable` / `--no-verify`.
>   Verification:
> - `pnpm --filter api test:e2e` — expected: `http-logging.e2e-spec.ts` passes; the double-log test proves `HTTP_EXCEPTION_HANDLED` count === 1.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-4 — `apps/api` E2E — `logs/` Read-API (Paging, Aggregate, Facets, SSE Stream Emits)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P14-3`

### Description

E2E-cover the `logs/` read-API that powers the dashboard (Phase 10): keyset paging on `GET /logs`, the aggregation math on `GET /logs/aggregate`, the facet counts on `GET /logs/facets`, and the **SSE** live-tail on `GET /logs/stream` (assert it emits a new entry as an event when a request fires). Seed a deterministic set of `ApplicationLog` rows (or run a few demo requests first), then assert the response **shapes** match `DASHBOARD.md` §12–§14. The SSE test subscribes, triggers a log, and asserts the streamed event carries the new entry's `logKey`/`requestId`.

### Acceptance Criteria

- [ ] `test/logs-api.e2e-spec.ts` seeds known rows (via `PrismaService` against a test DB, or by firing demo requests) before asserting.
- [ ] `GET /logs?limit=N` returns ≤ N rows ordered by the keyset (`time DESC, id DESC`) and returns a cursor; a second call with the cursor returns the **next** page with no overlap.
- [ ] `GET /logs/aggregate` returns time-bucketed counts whose totals reconcile with the seeded rows (the aggregation math is asserted, not just the shape).
- [ ] `GET /logs/facets` returns facet counts (by `level`/`logKey`/`service`) matching the seed.
- [ ] `GET /logs/stream` (SSE): the test opens the stream, fires a `POST /trigger/level` (or `/orders`), and asserts a streamed `data:` event arrives carrying the new entry's `logKey`/`requestId` within a timeout; keep-alive does not break parsing.
- [ ] All `logs/` e2e specs pass under `pnpm --filter api test:e2e`.

### Files to create / modify

- `apps/api/test/logs-api.e2e-spec.ts` — paging + aggregate + facets assertions.
- `apps/api/test/logs-sse.e2e-spec.ts` — SSE stream-emit assertion.
- `apps/api/test/utils/sse-client.ts` — a tiny SSE reader (consume the chunked response, yield parsed `data:` events).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS e2e engineer testing a log read-API + SSE stream.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14 + §Phase 10, and `docs/OVERVIEW.md` §10 — the `logs/` endpoint table — with the response shapes in `DASHBOARD.md` §12–§14). This is task P14-4. The read-API compiles a `LogQuery` to a Prisma `where` (and LogQL); `GET /logs` is **keyset**-paged on `(time DESC, id DESC)`; `GET /logs/stream` is SSE with `Last-Event-ID` replay and keep-alive.
> Objective: Write `logs-api.e2e-spec.ts` + `logs-sse.e2e-spec.ts` that seed known rows, assert paging/aggregate/facets shapes + math, and assert the SSE stream emits new entries.
> Steps:
>
> 1. Seed deterministically — either insert rows via `app.get(PrismaService).applicationLog.createMany({ data: [...] })` with fixed `time`/`level`/`logKey`, or fire a known sequence of demo requests and read them back. Prefer direct seeding for the aggregate-math assertions (you control the buckets).
> 2. Keyset paging:
>    ```ts
>    const first = await request(app.getHttpServer()).get('/logs?limit=2').expect(200)
>    expect(first.body.items).toHaveLength(2)
>    const cursor = first.body.nextCursor
>    const second = await request(app.getHttpServer())
>      .get(`/logs?limit=2&cursor=${cursor}`)
>      .expect(200)
>    const firstIds = first.body.items.map((r: { id: string }) => r.id)
>    const secondIds = second.body.items.map((r: { id: string }) => r.id)
>    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false) // no overlap
>    ```
> 3. Aggregate math: seed e.g. 3×`error` + 5×`info` in one bucket; `GET /logs/aggregate?...` → assert the bucket's `error` count is 3 and `info` is 5 (totals reconcile with the seed).
> 4. Facets: `GET /logs/facets` → assert the `level` facet and `logKey` facet counts equal the seed distribution.
> 5. SSE — create `test/utils/sse-client.ts` that reads the streaming response body and parses `data:` frames:
>    ```ts
>    it('streams a new log entry as an SSE event', async () => {
>      const server = app.getHttpServer()
>      const events: string[] = []
>      const req = request(server)
>        .get('/logs/stream')
>        .buffer(false)
>        .parse((res, cb) => {
>          res.on('data', (chunk: Buffer) => events.push(chunk.toString()))
>          res.on('end', () => cb(null, Buffer.from('')))
>        })
>      const pending = req.then(() => {}).catch(() => {})
>      await new Promise((r) => setTimeout(r, 100)) // let the subscription attach
>      await request(server).post('/trigger/level').send({ level: 'info' }).expect(201)
>      await new Promise((r) => setTimeout(r, 300)) // let the event flush
>      expect(events.join('')).toContain('data:')
>      req.abort()
>      await pending
>    })
>    ```
>    (Adjust the endpoint/body to the actual `trigger` contract from Phase 6/13.)
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C.
> - Always `abort()` the SSE request and await its settle so the test never hangs open; keep timeouts generous but bounded.
> - Assert the aggregate **math** (counts), not merely that the route returns 200 — the gate is that the numbers reconcile with the seed.
> - Do NOT use `@ts-ignore` / `eslint-disable` / `--no-verify`.
>   Verification:
> - `pnpm --filter api test:e2e` — expected: `logs-api.e2e-spec.ts` + `logs-sse.e2e-spec.ts` pass; the SSE test observes a `data:` frame after the trigger; the paging test shows zero id overlap across pages.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-5 — `apps/api` E2E — `apps/worker` `traceId` Propagation Across the HTTP Hop

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P14-3`

### Description

E2E-prove **cross-service trace correlation**: a `POST /downstream/dispatch` on `apps/api` calls `apps/worker`, and **both** services emit logs carrying the **same `traceId`** (`OVERVIEW.md` §6 row 23 + §14). Boot both Nest apps (or boot `apps/worker` on a port and point the `downstream` service at it), capture stdout from each, fire the dispatch, then extract the `traceId` from an `apps/api` line and assert an `apps/worker` line carries the identical value. Also assert the worker's `snake_case` field format (`trace_id`) when configured (§14 contrast), and that the `traceparent` header round-trips.

### Acceptance Criteria

- [ ] `test/worker-trace-propagation.e2e-spec.ts` boots both `apps/api` and `apps/worker` (worker on its own port; `downstream` targets it).
- [ ] Stdout is captured from both processes/loggers (api → `traceId`, worker → `trace_id` or `traceId` per its `otel.fieldFormat`).
- [ ] `POST /downstream/dispatch` triggers the hop; the test extracts the `traceId` from an api log line.
- [ ] An `apps/worker` log line is asserted to carry the **same** trace id value (string-equality on the 32-hex id).
- [ ] The worker's `snake_case` contrast is asserted (its line uses `trace_id`, demonstrating `otel.fieldFormat: 'snake_case'` from §14).
- [ ] The suite passes under `pnpm --filter api test:e2e` (or a combined e2e runner that boots the worker).

### Files to create / modify

- `apps/api/test/worker-trace-propagation.e2e-spec.ts` — the cross-service correlation assertion.
- `apps/api/test/utils/boot-worker.ts` — helper to start `apps/worker` (Nest app) on an ephemeral port and return its base URL.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS e2e engineer proving distributed trace correlation.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14 + §Phase 9, and `docs/OVERVIEW.md` §14 OpenTelemetry Correlation + §6 row 23). This is task P14-5. `apps/api` uses default `camelCase` trace fields; `apps/worker` is configured `otel.fieldFormat: 'snake_case'` (`trace_id`) as a teaching contrast. The HTTP auto-instrumentation injects/extracts the W3C `traceparent` automatically; `downstream` also shows the manual `propagation.inject` path. Both services log the SAME `traceId`.
> Objective: Write `worker-trace-propagation.e2e-spec.ts` that boots both apps, fires the downstream hop, and asserts the worker's logs carry the inbound `traceId`.
> Steps:
>
> 1. Create `test/utils/boot-worker.ts` — compile the worker's `AppModule` via `@nestjs/testing`, `app.listen(0)` for an ephemeral port, return `{ url, close }`. Ensure the worker's `instrumentation.ts` SDK starts (or stub it) so trace context is active.
> 2. In the spec, boot the worker, set the env/config the `downstream` service reads (`WORKER_URL` or equivalent) to the worker's URL, then boot `apps/api`.
> 3. Capture both loggers' stdout (reuse `captureStdout` from P14-3, or capture the worker's stream separately if it runs out-of-process).
> 4. Fire and assert:
>    ```ts
>    it('propagates one traceId across the api → worker hop', async () => {
>      const out = captureStdout()
>      await request(app.getHttpServer())
>        .post('/downstream/dispatch')
>        .send({ payload: 'x' })
>        .expect(201)
>      await new Promise((r) => setTimeout(r, 300)) // let the worker log
>      const lines = out.lines()
>      const apiMatch = /"traceId":"([0-9a-f]{32})"/.exec(lines)
>      expect(apiMatch).not.toBeNull()
>      const traceId = apiMatch![1]
>      // worker uses snake_case → trace_id; assert the SAME id value
>      expect(lines).toContain(`"trace_id":"${traceId}"`)
>      out.restore()
>    })
>    ```
>    (If the worker runs out-of-process, collect its stdout via the child handle instead of the shared spy.)
> 5. Add a second assertion that the worker line uses `trace_id` (snake_case), proving the `otel.fieldFormat` contrast.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C.
> - The trace id is a 32-hex lowercase string; assert **string equality** of the two ids, not just "both present".
> - Always close both apps in `afterAll` (and free the ephemeral port); never leave the worker listening.
> - Do NOT use `@ts-ignore` / `eslint-disable` / `--no-verify`.
>   Verification:
> - `pnpm --filter api test:e2e` — expected: `worker-trace-propagation.e2e-spec.ts` passes; the api `traceId` equals the worker `trace_id` value.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-6 — Optional `docker-compose.test.yml` + `infra:test:up/down` + Testcontainers Loki

- **Status:** 🔴 Not Started
- **Priority:** Low
- **Size:** M (90–180 min)
- **Depends on:** `P14-4`

### Description

Add the **optional** integration tier: a `docker-compose.test.yml` wired to the `infra:test:up`/`infra:test:down` scripts (declared in P0-1) plus a **Testcontainers**-driven Loki integration test that spins a real Loki container, lets the `LokiDestination` push to it, and asserts the line is queryable through the `logs/loki` proxy (`OVERVIEW.md` §16 Integration row). This proves end-to-end log delivery against a real aggregator without depending on the long-running dev stack. It is **opt-in** (gated/tagged) so the default `test`/`test:cov` run stays hermetic and fast.

### Acceptance Criteria

- [ ] `docker-compose.test.yml` defines a minimal `loki` service (and any DB the integration needs), `127.0.0.1`-bound, with a healthcheck.
- [ ] Root `infra:test:up` / `infra:test:down` (from P0-1) target `docker-compose.test.yml` and bring the test Loki up/down with `--wait`.
- [ ] `apps/api/test/integration/loki.int-spec.ts` uses Testcontainers to start Loki, configures `LokiDestination` with the container URL, pushes a line, and asserts it is returned by a LogQL `query_range` (directly or via the `logs/loki` proxy).
- [ ] The integration test is **excluded from the default unit/e2e run** (separate `testRegex`/project or a `--group integration` tag) so `pnpm test`/`test:cov` stays hermetic.
- [ ] A documented npm script (e.g. `test:int`) runs only the integration tier.
- [ ] When Docker is available, `pnpm --filter api test:int` passes; when not, the default suites are unaffected.

### Files to create / modify

- `docker-compose.test.yml` — minimal test Loki (+ DB if needed).
- `apps/api/test/integration/loki.int-spec.ts` — Testcontainers Loki round-trip.
- `apps/api/package.json` — add `test:int` (separate project/regex from unit + e2e).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS integration-test engineer using Testcontainers.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14 — "Optional `docker-compose.test.yml` + `infra:test:up/down` if integration (Testcontainers Loki) is used" — and `docs/OVERVIEW.md` §8 Local Stack + §12 Destinations + §16 Testing Strategy Integration row). This is task P14-6 and is **optional/low-priority**: keep it fully isolated from the hermetic default suites. `infra:test:up`/`infra:test:down` script names already exist in the root `package.json` (P0-1) pointing at `docker-compose.test.yml`. The Loki push endpoint is `/loki/api/v1/push`; queries use LogQL `query_range`.
> Objective: Provide `docker-compose.test.yml`, wire the `infra:test:*` scripts to it, and write a Testcontainers Loki round-trip integration test kept out of the default run.
> Steps:
>
> 1. Create `docker-compose.test.yml` with a single `loki` (`grafana/loki:latest`), `127.0.0.1:3100`-bound, healthcheck on `/ready`; add Postgres only if the integration needs durable rows.
> 2. Confirm root `infra:test:up` = `docker compose -f docker-compose.test.yml up -d --wait` and `infra:test:down` = `docker compose -f docker-compose.test.yml down -v` (from P0-1).
> 3. Install Testcontainers in `apps/api`: `pnpm add -D --filter api testcontainers`.
> 4. Write `test/integration/loki.int-spec.ts`:
>
>    ```ts
>    import { GenericContainer, type StartedTestContainer } from 'testcontainers'
>    import { LokiDestination } from '../../src/destinations/loki.destination'
>
>    let loki: StartedTestContainer
>    beforeAll(async () => {
>      loki = await new GenericContainer('grafana/loki:latest').withExposedPorts(3100).start()
>    }, 120_000)
>    afterAll(async () => {
>      await loki.stop()
>    })
>
>    it('pushes a line to a real Loki and queries it back', async () => {
>      const base = `http://${loki.getHost()}:${loki.getMappedPort(3100)}`
>      const dest = new LokiDestination({ url: `${base}/loki/api/v1/push`, batchSize: 1 })
>      dest.onInit?.()
>      dest.write('{"level":30,"logKey":"INT_LOKI_OK","msg":"hi"}\n')
>      await dest.onShutdown?.() // force flush
>      // poll query_range until the line is indexed
>      // expect a LogQL query for {service=...} to return the pushed line
>    })
>    ```
>
> 5. Add `apps/api/package.json` script `test:int` with a regex that matches **only** `*.int-spec.ts` (and ensure the unit/e2e configs exclude `test/integration/**`).
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C.
> - The integration tier MUST NOT run in the default `test`/`test:cov`/`test:e2e` invocation (keep the 100% gate hermetic); gate it behind `test:int` only.
> - Give container startup a generous timeout (Loki cold start); always `stop()` the container in `afterAll`.
> - Do NOT use `@ts-ignore` / `eslint-disable` / `--no-verify`.
>   Verification:
> - `pnpm infra:test:up` then `pnpm --filter api test:int` (Docker available) — expected: the pushed line is queryable; exit 0. `pnpm infra:test:down` tears it down.
> - `pnpm --filter api test` — expected: the integration spec is NOT picked up (default run stays hermetic).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-7 — `apps/web` Vitest Config (jsdom, v8) + 100% Thresholds on `lib/**`+`components/**` (Pin Vitest Major)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `Phases 11–13`

### Description

Set up the `apps/web` **Vitest** test harness with the `jsdom` environment and the **v8** coverage provider, and harden thresholds to **100% on all four metrics** scoped to `lib/**` + `components/**`. **Pin a Vitest major** (e.g. `vitest@^3`, not `latest`) because Stryker 9's `@stryker-mutator/vitest-runner` requires Vitest ≥ 2 (Phase 15 + Appendix C). `coverage.include` is restricted to `lib/**` + `components/**` (the testable surface); shadcn UI primitives and app-router glue are excluded so 100% is meaningful. This wires the harness only; the tests land in P14-8.

### Acceptance Criteria

- [ ] `apps/web/vitest.config.ts` sets `test.environment: 'jsdom'` and `test.globals: true`.
- [ ] `test.coverage.provider: 'v8'` with `thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 }`.
- [ ] `coverage.include` = `['lib/**', 'components/**']`; `coverage.exclude` covers shadcn primitives (`components/ui/**`), `**/*.d.ts`, `**/*.config.*`, and the app-router shell.
- [ ] `apps/web/package.json` **pins** a Vitest major (e.g. `"vitest": "^3"`) and `@vitest/coverage-v8` to the matching major (NOT `latest`).
- [ ] Scripts `test`, `test:cov` run `vitest run` / `vitest run --coverage`; `test:e2e` is reserved for Playwright (P14-9).
- [ ] `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` are dev-deps; a `vitest.setup.ts` imports `@testing-library/jest-dom/vitest`.
- [ ] `pnpm --filter web test:cov` boots the runner cleanly (it may report uncovered until P14-8 lands, but config + provider are correct).

### Files to create / modify

- `apps/web/vitest.config.ts` — jsdom + v8 + 100% thresholds scoped to `lib/**`+`components/**`.
- `apps/web/vitest.setup.ts` — Testing Library matchers.
- `apps/web/package.json` — pinned `vitest` major + `@vitest/coverage-v8`; `test`/`test:cov` scripts.

### Agent Execution Prompt

> Role: Senior TypeScript / React (Next.js) test engineer configuring Vitest with a 100% coverage gate.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14 + Appendix C, and `docs/OVERVIEW.md` §16 Testing Strategy). This is task P14-7. `apps/web` is Next.js 16 + React 19 (Phase 11). Appendix C requires Vitest v8 coverage at 100 on `lib/**` + `components/**` and **pinning a Vitest major** (e.g. `^3`) — `latest` is banned because Stryker 9's vitest-runner needs Vitest ≥ 2 (Phase 15). The `/shared` subpath of the library (`LOG_KEYS_CONVENTION_REGEX`, types) is the browser-relevant surface tested here.
> Objective: Produce `apps/web/vitest.config.ts` (+ setup) and pin the Vitest toolchain so the runner enforces 100% on `lib/**` + `components/**`.
> Steps:
>
> 1. Install pinned dev-deps:
>    `pnpm add -D --filter web vitest@^3 @vitest/coverage-v8@^3 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`.
> 2. Create `apps/web/vitest.config.ts`:
>
>    ```ts
>    import { defineConfig } from 'vitest/config'
>    import react from '@vitejs/plugin-react'
>    import path from 'node:path'
>
>    export default defineConfig({
>      plugins: [react()],
>      resolve: { alias: { '@': path.resolve(__dirname, '.') } }, // match the Next.js `@/*` alias
>      test: {
>        environment: 'jsdom',
>        globals: true,
>        setupFiles: ['./vitest.setup.ts'],
>        coverage: {
>          provider: 'v8',
>          include: ['lib/**', 'components/**'],
>          exclude: ['components/ui/**', '**/*.d.ts', '**/*.config.*', 'app/**'],
>          thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
>        },
>      },
>    })
>    ```
>
> 3. Create `apps/web/vitest.setup.ts`:
>    ```ts
>    import '@testing-library/jest-dom/vitest'
>    ```
> 4. Edit `apps/web/package.json`:
>    ```jsonc
>    {
>      "scripts": {
>        "test": "vitest run",
>        "test:cov": "vitest run --coverage",
>      },
>      "devDependencies": {
>        "vitest": "^3", // PINNED major — Stryker 9 vitest-runner needs Vitest >= 2
>        "@vitest/coverage-v8": "^3",
>      },
>    }
>    ```
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C.
> - Pin the Vitest major explicitly (`^3`) — do NOT use `vitest@latest` (breaks the Stryker 9 vitest-runner contract, Phase 15).
> - Exclude shadcn primitives (`components/ui/**`) from coverage — they are vendored, not authored here; do NOT exclude `lib/**` or your own `components/`.
> - Do NOT use `@ts-ignore` / `eslint-disable` / `--no-verify`.
>   Verification:
> - `pnpm --filter web exec vitest --version` — expected: a `3.x` version (pinned).
> - `pnpm --filter web test:cov` — expected: the runner boots under jsdom with the v8 provider; thresholds show 100 on all four metrics once P14-8 lands.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-8 — `apps/web` Unit Tests — Severity Mapping, Filters↔URL (`nuqs`), SSE Hook Ring Buffer, Log-Key Validation

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P14-7`

### Description

Write the `apps/web` **Vitest** unit suite that drives `lib/**` + `components/**` to 100% coverage. Cover: the **severity mapping** (Pino numeric level / `LogLevel` → UI severity + color/badge); the **filters↔URL** round-trip via `nuqs` (state ⇄ query string is lossless across level/logKey/traceId/time); the **SSE hook** ring buffer (`useLogStream`/`useFollowMode` — follow-mode, rAF batching, bounded ring buffer that evicts oldest, pause-on-scroll); and **log-key validation** against `LOG_KEYS_CONVENTION_REGEX` imported from `@bymax-one/nest-logger/shared` (valid `MODULE_ACTION_RESULT` accepted, malformed rejected, `RESERVED_LOG_KEYS` flagged).

### Acceptance Criteria

- [ ] `lib/severity.spec.ts` (or `.test.ts`) maps every `LogLevel` (`fatal`/`error`/`warn`/`info`/`debug`/`trace`) and the Pino numerics to the correct severity bucket + color/badge; the default/unknown branch is covered.
- [ ] `lib/filters.spec.ts` asserts the `nuqs` serialize → parse round-trip is lossless for level/logKey/traceId/requestId/time-range and that an empty/absent param yields the default.
- [ ] `hooks/use-log-stream.spec.ts` (jsdom + fake timers) asserts the ring buffer caps at its max (oldest evicted), follow-mode appends, pause-on-scroll stops auto-append, and the rAF/batch flush coalesces bursts.
- [ ] `lib/log-keys.spec.ts` asserts `LOG_KEYS_CONVENTION_REGEX` (imported from `/shared`) accepts a valid `ORDER_CREATE_SUCCESS`, rejects `bad-key`/`lowercase`, and that a `RESERVED_LOG_KEYS` member is flagged by the validator.
- [ ] Tests use `@testing-library/react` + `renderHook` for hooks and Testing Library queries for components (no `fakeClassName` assertions — assert real rendered roles/text).
- [ ] `pnpm --filter web test:cov` reports **100%** b/l/f/s on `lib/**` + `components/**`.

### Files to create / modify

- `apps/web/lib/severity.spec.ts`
- `apps/web/lib/filters.spec.ts`
- `apps/web/lib/log-keys.spec.ts`
- `apps/web/hooks/use-log-stream.spec.ts`
- _(+ component specs for any `components/**` not covered above, to reach 100%)_

### Agent Execution Prompt

> Role: Senior TypeScript / React test engineer writing Vitest + Testing Library unit tests to 100% coverage.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14, and `docs/OVERVIEW.md` §16 Testing Strategy + §10/§6 row 41 for the `/shared` `LOG_KEYS_CONVENTION_REGEX` + `LogLevel` surface; the SSE live-tail hook contract is in `DASHBOARD.md` §7/§14 — follow-mode, rAF batching, ring buffer). This is task P14-8. The Vitest jsdom + v8 + 100% gate is wired in P14-7. The web app imports `LOG_KEYS_CONVENTION_REGEX` + `RESERVED_LOG_KEYS` + types from `@bymax-one/nest-logger/shared` (the zero-dependency subpath).
> Objective: Write the Vitest unit specs that cover severity mapping, the `nuqs` filters↔URL round-trip, the SSE hook ring buffer, and log-key validation to 100% on `lib/**` + `components/**`.
> Steps:
>
> 1. **Severity mapping** — table-drive every level:
>
>    ```ts
>    import { describe, it, expect } from 'vitest'
>    import { toSeverity } from '@/lib/severity'
>    import type { LogLevel } from '@bymax-one/nest-logger/shared'
>
>    it.each<[LogLevel, string]>([
>      ['fatal', 'critical'],
>      ['error', 'error'],
>      ['warn', 'warning'],
>      ['info', 'info'],
>      ['debug', 'muted'],
>      ['trace', 'muted'],
>    ])('maps %s → %s', (level, expected) => {
>      expect(toSeverity(level).bucket).toBe(expected)
>    })
>    it('falls back for an unknown level', () => {
>      expect(toSeverity('???' as LogLevel).bucket).toBe('info')
>    })
>    ```
>
> 2. **Filters↔URL** — assert the `nuqs` parsers round-trip; for the hook form, wrap with `NuqsTestingAdapter` (`renderHook(..., { wrapper })`) and assert `setFilters({...})` reflects into the URL search params and back.
> 3. **SSE ring buffer** — `renderHook(() => useLogStream(...))` with `vi.useFakeTimers()`; push more than the cap and assert `result.current.entries.length === MAX` and the oldest id is gone; toggle follow/pause and assert append behavior; advance timers to flush the rAF/interval batch.
> 4. **Log-key validation**:
>
>    ```ts
>    import { LOG_KEYS_CONVENTION_REGEX, RESERVED_LOG_KEYS } from '@bymax-one/nest-logger/shared'
>    import { isValidLogKey } from '@/lib/log-keys'
>
>    it('accepts a valid MODULE_ACTION_RESULT key', () => {
>      expect(isValidLogKey('ORDER_CREATE_SUCCESS')).toBe(true)
>    })
>    it('rejects a malformed key', () => {
>      expect(isValidLogKey('bad-key')).toBe(false)
>    })
>    it('flags a reserved key', () => {
>      expect(isValidLogKey(RESERVED_LOG_KEYS[0]!).isReserved).toBe(true)
>    })
>    ```
>
>    (Adapt to the real `lib/log-keys.ts` API from Phase 11.)
>
> 5. Add component specs for any remaining `components/**` files (render with Testing Library, assert real text/roles) until coverage hits 100.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C.
> - Import `LOG_KEYS_CONVENTION_REGEX`/`RESERVED_LOG_KEYS` from the real `/shared` subpath — do NOT re-declare the regex in the test.
> - Assert real rendered output (roles/text), never fabricated `className` strings; cover every branch (including default/fallback) — do NOT `/* istanbul ignore */` a branch.
> - Do NOT use `@ts-ignore` / `eslint-disable` / `--no-verify`.
>   Verification:
> - `pnpm --filter web test:cov` — expected: 100% b/l/f/s on `lib/**` + `components/**`; no `.skip`/`.todo`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-8 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-9 — `apps/web` Playwright Journeys (Trigger → Live Explorer → Trace; Brush → Filter; RBAC Scoping)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P14-7`

### Description

Write the `apps/web` **Playwright** end-to-end journeys that exercise the dashboard against a running API (`OVERVIEW.md` §16 Playwright row + §15 Journeys). Three journeys: (1) **fire → live Explorer → trace** — click a Trigger Center button, see the new row appear in the live Explorer (SSE), open its detail drawer, and click "view trace"; (2) **brush → filter** — brush the volume chart on Overview and assert the Explorer is filtered to that window; (3) **RBAC tenant scoping** — switch tenant/role and assert the Explorer rows are scoped to that tenant. Use Playwright's web-server orchestration to boot `apps/web` (and assume the API is up via `infra:up` + `pnpm --filter api dev`, or a documented test target).

### Acceptance Criteria

- [ ] `apps/web/playwright.config.ts` configures the `webServer` (boots `apps/web`), `baseURL`, and a single chromium project (headless in CI).
- [ ] `apps/web/e2e/trigger-to-explorer.spec.ts`: clicking a Trigger button produces a new Explorer row (live/SSE), opening its drawer shows the redacted JSON, and "view trace" navigates to the trace deep-link (asserts the target URL/`traceId`).
- [ ] `apps/web/e2e/brush-filter.spec.ts`: brushing the Overview volume chart updates the Explorer query (URL `nuqs` params change + rows reflect the window).
- [ ] `apps/web/e2e/rbac-scoping.spec.ts`: switching tenant/role scopes the Explorer to that tenant (rows from other tenants are absent).
- [ ] `apps/web/package.json` has `test:e2e` running `playwright test`; Playwright browsers are installed in CI before the run.
- [ ] `pnpm --filter web test:e2e` passes against a running stack (documented prerequisites: `infra:up` + API dev server).

### Files to create / modify

- `apps/web/playwright.config.ts` — webServer + baseURL + chromium project.
- `apps/web/e2e/trigger-to-explorer.spec.ts`
- `apps/web/e2e/brush-filter.spec.ts`
- `apps/web/e2e/rbac-scoping.spec.ts`
- `apps/web/package.json` — `test:e2e` script (Playwright).

### Agent Execution Prompt

> Role: Senior TypeScript / Playwright e2e engineer testing an observability dashboard.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14, and `docs/OVERVIEW.md` §15 Demonstrated Journeys + §16 Testing Strategy Playwright row; the dashboard pages — Overview, Explorer, Trigger Center — are specified in `DASHBOARD.md`). This is task P14-9. The journeys mirror the §16 description: fire from Trigger Center → row in live Explorer → view trace; brush chart → filter; RBAC tenant scoping. The Explorer live-tail uses SSE; "view trace" deep-links to Tempo via Grafana (`NEXT_PUBLIC_GRAFANA_URL`).
> Objective: Write `playwright.config.ts` + the three journey specs so the dashboard is exercised end to end against a running API.
> Steps:
>
> 1. `pnpm add -D --filter web @playwright/test` and (in CI) `pnpm --filter web exec playwright install --with-deps chromium`.
> 2. Create `apps/web/playwright.config.ts`:
>
>    ```ts
>    import { defineConfig } from '@playwright/test'
>
>    export default defineConfig({
>      testDir: './e2e',
>      use: { baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3001' },
>      webServer: {
>        command: 'pnpm dev',
>        url: process.env.WEB_BASE_URL ?? 'http://localhost:3001',
>        reuseExistingServer: !process.env.CI,
>        timeout: 120_000,
>      },
>      projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
>    })
>    ```
>
> 3. **Trigger → Explorer → trace** (use stable `data-testid`/roles, not brittle CSS):
>
>    ```ts
>    import { test, expect } from '@playwright/test'
>
>    test('fire a log → row appears in live Explorer → view its trace', async ({ page }) => {
>      await page.goto('/trigger')
>      await page.getByRole('button', { name: /fire info log/i }).click()
>      await page.goto('/explorer')
>      const row = page.getByRole('row').filter({ hasText: 'TRIGGER' }).first()
>      await expect(row).toBeVisible({ timeout: 10_000 }) // SSE live append
>      await row.click()
>      await expect(page.getByText('[REDACTED]')).toBeVisible() // detail drawer, redacted JSON
>      const trace = page.getByRole('link', { name: /view trace/i })
>      await expect(trace).toHaveAttribute('href', /traceId=|\/trace\//)
>    })
>    ```
>
> 4. **Brush → filter**: on `/`, brush the volume chart (mouse down → move → up over the chart region) and assert the URL gains the time-window `nuqs` params and the Explorer rows reflect the window.
> 5. **RBAC scoping**: switch the tenant/role control and assert rows are scoped — e.g. every visible row's tenant cell equals the selected tenant; rows of another tenant are absent.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C.
> - Use role/`data-testid` selectors, never fabricated CSS class names; await SSE-driven UI with explicit `toBeVisible({ timeout })` (no fixed `waitForTimeout` races).
> - Document the run prerequisites (API up via `infra:up` + `pnpm --filter api dev`) in the spec header; do NOT hardcode secrets.
> - Do NOT use `@ts-ignore` / `eslint-disable` / `--no-verify`.
>   Verification:
> - `pnpm --filter web test:e2e` (with the API + web running) — expected: all three journeys pass; the trace link asserts a `traceId`-bearing href.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-9 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P14-10 — Verification Gate — `pnpm test:cov` + `pnpm test:e2e` 100% in Both Workspaces

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P14-1`, `P14-2`, `P14-3`, `P14-4`, `P14-5`, `P14-6`, `P14-7`, `P14-8`, `P14-9`

### Description

Phase 14 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove `pnpm test:cov` and `pnpm test:e2e` pass with **100% coverage in both workspaces** (`apps/api` Jest + `apps/web` Vitest). Run the root fan-out scripts (`pnpm -r`), confirm both coverage gates hold at 100/100/100/100, confirm the e2e suites (supertest stdout-capture, `logs/` API, worker propagation; Playwright journeys) are green, and close the phase. If any metric is below 100, fix the corresponding task's tests (never lower a threshold).

### Acceptance Criteria

- [ ] `pnpm test:cov` (root `pnpm -r`) exits 0 with **100%** branches/functions/lines/statements in **both** `apps/api` (Jest) and `apps/web` (Vitest).
- [ ] `pnpm test:e2e` (root) exits 0: `apps/api` supertest suites (P14-3/P14-4/P14-5) and `apps/web` Playwright journeys (P14-9) all pass.
- [ ] No threshold was lowered, no file was added to coverage exclusions to hide a gap, and no test is `.skip`/`.todo`/`@ts-ignore`'d.
- [ ] `pnpm lint` and `pnpm typecheck` still exit 0 with the new test files present.
- [ ] The `apps/api` Jest config still applies `ignoreCoverageForAllDecorators: true` (the decorator-coverage shim) and the documented Jest-native-ESM `NODE_OPTIONS` flag.
- [ ] The phase is recorded complete: this file at 10/10 and the `DEVELOPMENT_PLAN.md` Phase 14 row flipped to 🟢.

### Files to create / modify

- _(none — verification only; fix earlier task files P14-1..P14-9 if a check fails)_

### Agent Execution Prompt

> Role: Senior TypeScript test engineer closing the testing phase against a 100% coverage gate.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §Phase 14 Definition of done + Appendix C, and `docs/OVERVIEW.md` §16 Testing Strategy). This is task P14-10. DoD: `pnpm test:cov` and `pnpm test:e2e` pass with **100% coverage in both workspaces**. The root scripts fan out via `pnpm -r` (P0-1); `apps/api` uses Jest (native ESM + `ignoreCoverageForAllDecorators`), `apps/web` uses Vitest (jsdom + v8), both gated at 100.
> Objective: Run the workspace-wide coverage + e2e gates, confirm 100% in both apps and all e2e green, fix any shortfall in the owning task, and close the phase.
> Steps:
>
> 1. Run the gates from the repo root:
>    - `pnpm test:cov` — expect 100% b/l/f/s in BOTH `apps/api` (Jest) and `apps/web` (Vitest).
>    - `pnpm test:e2e` — expect all supertest (api) + Playwright (web) suites green.
>    - `pnpm lint` and `pnpm typecheck` — expect exit 0 with the new specs present.
> 2. If a metric is below 100, open the per-file coverage report, find the uncovered line/branch, and add the missing test **in the owning task's file set** (P14-2 for units, P14-3/4/5 for api e2e, P14-8 for web units). Do NOT lower a threshold or exclude a file to pass.
> 3. If an e2e suite is flaky, stabilize the wait (explicit `toBeVisible({ timeout })` / bounded SSE timeouts) rather than retrying blindly.
> 4. Confirm the decorator-coverage shim (`ignoreCoverageForAllDecorators: true`) and the Jest-native-ESM `NODE_OPTIONS=--experimental-vm-modules` flag are still in place (Appendix C) and that no CJS silent fallback crept in.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-14--testing--unit--e2e-100-coverage) §2 + Appendix C.
> - Do NOT lower any coverage threshold; do NOT add `collectCoverageFrom`/`coverage.exclude` entries to mask a real gap; do NOT `--no-verify` / `@ts-ignore` / `.skip` to go green.
> - The 100% bar is on all four metrics in both workspaces — partial is failing.
>   Verification:
> - `pnpm test:cov` — expected: exit 0; both apps report 100% branches/functions/lines/statements.
> - `pnpm test:e2e` — expected: exit 0; api supertest + web Playwright suites pass.
> - `pnpm lint && pnpm typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P14-10 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 14 is 10/10 — switch the Phase 14 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
