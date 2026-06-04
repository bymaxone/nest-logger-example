---
applyTo: '**/*.spec.ts,**/*.e2e-spec.ts'
---

# Testing standards

## Gates

- **Coverage target 100%** (statements/branches/functions/lines) on touched source — Jest for `apps/api` + `apps/worker` (`pnpm --filter <app> test:cov`; ESM via `NODE_OPTIONS=--experimental-vm-modules` + `ts-jest`, `tsconfig.test.json`). The enforcing `coverageThreshold` is wired with the CI coverage gate — keep touched files at 100% now.
- **Mutation target: Stryker `break: 100`** (`DEVELOPMENT_PLAN.md` §2) — not yet wired. Write mutation-aware assertions now so the score holds when it lands.
- `apps/web` tests (Vitest) are planned — apply the same coverage + structure when added.

## Structure & naming

```
describe('ClassName')
  describe('#method()')              // '.' for a static method
    it('should <outcome> when <condition>')
```

Every `it` states the behaviour — never `it('works')`. Add a block comment to each test: the scenario + the rule it protects.

## Scope

Test through the public / exported API only — never private members or unexported internals.

## Mutation-aware patterns (kill Stryker mutants)

1. Assert the **value**, not existence: `expect(r.level).toBe('error')`, not `toBeDefined()`.
2. Cover **both sides** of every `||` / `&&` (e.g. only `traceId` set, then only `spanId`).
3. Assert the error **path AND message** independently for validation failures.
4. Cover the **acceptance** path of every predicate (`isValidLogKey('PAYMENT_*') === true`), not only rejection.

## NestJS

- `Test.createTestingModule(...)`; override only external I/O (Pino streams, OTel API, Loki `fetch`, Prisma when needed). Keep DI wiring real.
- E2E (`*.e2e-spec.ts`): real `NestFactory.create` + `supertest` (`test/jest-e2e.config.cjs`). Assert the correct `logKey`s, exception-filter capture, and ALS context (`requestId`/`tenantId`/`traceId`) on every entry of the request.

## Mocking logs / OTel / Loki

- Capture log output via a writable stream on the destination — never spy on `console.*`.
- Mock `@opentelemetry/api`; test both **OTel active** and **OTel absent** paths.
- Spy `fetch` for the Loki destination/proxy; use `batchSize: 1` + a short flush settle for cross-sink assertions.
- Restore all mocks in `afterEach` / `afterAll` — never leak module-level mocks across files.

## Log-key assertions

Validate output `logKey`s against the exported `LOG_KEYS_CONVENTION_REGEX` (≥ 2 `UPPER_SNAKE` segments, `MODULE_ACTION_RESULT`). A bare `toContain` underscore check or `toBeTruthy()` is insufficient.
