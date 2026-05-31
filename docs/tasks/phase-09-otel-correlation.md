# Phase 9 — OpenTelemetry Correlation + `apps/worker` — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-9--opentelemetry-correlation--appsworker) §Phase 9
> **Total tasks:** 6
> **Progress:** 🔴 0 / 6 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                    | Status | Priority | Size | Depends on |
| ---- | ----------------------------------------------------------------------- | ------ | -------- | ---- | ---------- |
| P9-1 | Verify `traceId`/`spanId`/`traceFlags` injected on every log            | 🔴     | High     | M    | —          |
| P9-2 | Grafana derived field — Loki `traceId` → Tempo trace click-through      | 🔴     | High     | S    | P9-1       |
| P9-3 | Scaffold `apps/worker` (2nd NestJS svc, `snake_case` field format)      | 🔴     | High     | L    | P9-1       |
| P9-4 | Worker extracts inbound W3C `traceparent` → same `traceId`              | 🔴     | High     | M    | P9-3       |
| P9-5 | `apps/api/downstream` → worker hop (auto + manual `propagation.inject`) | 🔴     | High     | M    | P9-3, P9-4 |
| P9-6 | Verification — interleaved api+worker logs share a `traceId` in Grafana | 🔴     | High     | M    | P9-1..P9-5 |

---

## P9-1 — Verify `traceId`/`spanId`/`traceFlags` Injected on Every Log

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90 min – 3 h)
- **Depends on:** `—`

### Description

Prove the library's automatic trace-context injection works on `apps/api`. With the OTel `NodeSDK` started before NestJS (Phase 3) and `BymaxLoggerModule` wired (Phase 4), every log emitted inside an active span must carry `traceId` / `spanId` / `traceFlags` (the default `camelCase` field names). This is the hard guarantee that lets Loki ↔ Tempo correlation work later in this phase. The library only **reads** the ambient span via `@opentelemetry/api` (`getActiveSpan()`); the consumer owns the SDK — see `OVERVIEW.md` §14 "What the library does vs. what the consumer does". This task adds e2e/unit coverage that asserts the fields appear on real request logs **and** the documented edge cases: a no-op / zeroed (`00000000000000000000000000000000`) `traceId` is **skipped** (no field emitted), while a valid-but-**unsampled** span (`traceFlags: '00'`) is still **kept** (the IDs are emitted regardless of the sampling bit). Injection is governed by `otel.shouldAutoInjectTraceContext` (default `true` — **not** `autoInjectTraceContext`).

### Acceptance Criteria

- [ ] An e2e test fires a real request (e.g. `POST /orders`) with `process.stdout.write` spied and asserts the emitted JSON log line contains non-empty `traceId` (32 hex chars), `spanId` (16 hex chars), and `traceFlags`.
- [ ] The same test asserts `traceId` on the request-start, domain, and request-success log lines are **identical** (one trace per request).
- [ ] A unit/e2e test proves a **zeroed/no-op** `traceId` (all-zero, emitted when no real span is active) results in **no** `traceId`/`spanId`/`traceFlags` keys on the line (the field is skipped, not written as zeros).
- [ ] A unit/e2e test proves an **unsampled** span (sampled-out, `traceFlags` ends in `00`) **still emits** `traceId`/`spanId` (unsampled spans are kept — correlation must not depend on the sampling decision).
- [ ] The `apps/api` field names are the default `camelCase` (`traceId`/`spanId`/`traceFlags`) — confirmed against the running config (`otel.fieldFormat` unset or `'camelCase'`).
- [ ] `pnpm --filter api test:cov` stays at 100% on all four metrics with the new tests.

### Files to create / modify

- `apps/api/test/otel-correlation.e2e-spec.ts` — stdout-capture assertions for the trace fields (happy path + identical-traceId-per-request).
- `apps/api/src/logger/*.spec.ts` (or a focused `otel` spec) — zeroed-traceId-skipped + unsampled-span-kept unit coverage.
- `apps/api/src/logger/logger.config.ts` — **read-only confirmation** that `otel.shouldAutoInjectTraceContext: true` and the default `camelCase` format are in effect (modify only if a gap is found).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer instrumenting OpenTelemetry trace correlation.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (consumed via local `link:` — see `docs/OVERVIEW.md` §7). This is task P9-1 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-9--opentelemetry-correlation--appsworker) §Phase 9. Read `docs/OVERVIEW.md` §14 (OpenTelemetry Correlation — the hard rule, the library-vs-consumer table, field-format contrast) and §3 (architecture). Prereq Phase 4 is 🟢 (logger wired). The OTel SDK is started in `apps/api/src/instrumentation.ts` (imported FIRST in `main.ts`); the library auto-injects trace context when `@opentelemetry/api` is present and a span is active, controlled by `otel.shouldAutoInjectTraceContext` (default `true` — NOT `autoInjectTraceContext`). The library only READS the span; it never starts/owns the SDK.
> Objective: Add tests that prove `traceId`/`spanId`/`traceFlags` are injected on every log line during an active span, and that the two documented edge cases behave correctly (zeroed traceId skipped; unsampled span kept).
> Steps:
>
> 1. Confirm the running config in `apps/api/src/logger/logger.config.ts` keeps the default camelCase field names. The `otel` block is (do NOT add `fieldFormat: 'snake_case'` here — that is the worker's job in P9-3):
>    ```typescript
>    otel: {
>      shouldAutoInjectTraceContext: true, // detect @opentelemetry/api → inject traceId/spanId/traceFlags (default true)
>      fieldFormat: config.get('OTEL_FIELD_FORMAT') === 'snake_case' ? 'snake_case' : 'camelCase',
>    },
>    ```
>    For `apps/api`, `OTEL_FIELD_FORMAT` is unset/`camelCase`, so the emitted keys are `traceId` / `spanId` / `traceFlags`.
> 2. Create `apps/api/test/otel-correlation.e2e-spec.ts`. Boot the Nest app (the same way the other e2e specs do), spy `process.stdout.write`, fire `POST /orders`, parse the captured JSON lines, and assert:
>    ```typescript
>    const HEX32 = /^[0-9a-f]{32}$/
>    const HEX16 = /^[0-9a-f]{16}$/
>    const lines = writes.map((w) => JSON.parse(w)).filter((l) => typeof l.traceId === 'string')
>    expect(lines.length).toBeGreaterThan(0)
>    for (const line of lines) {
>      expect(line.traceId).toMatch(HEX32)
>      expect(line.spanId).toMatch(HEX16)
>      expect(line.traceFlags).toBeDefined()
>    }
>    // one trace per request: every trace-bearing line shares the same id
>    const ids = new Set(lines.map((l) => l.traceId))
>    expect(ids.size).toBe(1)
>    ```
> 3. Add unit coverage for the no-op / zeroed case. When no real span is active (the SDK returns an invalid span context whose traceId is all-zero `00000000000000000000000000000000`), the library MUST omit the fields rather than write zeros. Drive this by emitting a log with **no** active span (or with an explicitly invalid context) and assert the parsed line has **no** `traceId`/`spanId`/`traceFlags` keys:
>    ```typescript
>    expect(line).not.toHaveProperty('traceId')
>    expect(line).not.toHaveProperty('spanId')
>    expect(line).not.toHaveProperty('traceFlags')
>    ```
> 4. Add coverage for the unsampled case. Start a span whose sampling decision is "drop" (`traceFlags` low bit `0` → string `'00'`) using `@opentelemetry/api` (e.g. wrap the emit in a context with a manually-built `SpanContext` carrying `traceFlags: TraceFlags.NONE` and a valid non-zero `traceId`). Assert the IDs are STILL emitted — correlation must not hinge on the sampling bit:
>    ```typescript
>    expect(line.traceId).toMatch(HEX32)
>    expect(line.spanId).toMatch(HEX16)
>    expect(line.traceFlags).toBe('00')
>    ```
> 5. Run `pnpm --filter api test:cov`; keep 100% on all four metrics. If a branch is newly uncovered, cover it — do NOT add `/* istanbul ignore */` or lower a threshold.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions and §0 Guiding Principles (no `@ts-ignore`, no `eslint-disable`, no `--no-verify`, English-only).
> - Use ONLY the `@bymax-one/nest-logger@0.1.0` public API. The trace mixin is INTERNAL — assert the observable behavior (fields on the line), never import the mixin.
> - The flag is `otel.shouldAutoInjectTraceContext` (default `true`). Do NOT write `autoInjectTraceContext` anywhere.
> - Do NOT add `@opentelemetry/instrumentation-pino` — the library already injects; adding it double-injects the trace fields (see §14 "Do not double-inject").
> - This task does NOT touch the worker or downstream — it only hardens `apps/api`.
>   Verification:
> - `pnpm --filter api test -- otel-correlation` — expected: the e2e spec passes (fields present, single traceId per request).
> - `pnpm --filter api test:cov` — expected: 100% coverage, exit 0.
> - `pnpm --filter api typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P9-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P9-2 — Grafana Derived Field — Loki `traceId` → Tempo Trace Click-Through

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P9-1`

### Description

Verify the Grafana **derived field** provisioned in Phase 1 turns the `traceId` in every Loki log line into a clickable link that jumps to the correlated trace in Tempo. This is the payoff that proves end-to-end correlation (`OVERVIEW.md` §8: "a derived field on the Loki datasource that turns the `traceId` in every log line into a clickable link to the Tempo trace"). Phase 1 already ships `docker/grafana/provisioning/`; this task confirms the derived field's regex matches the **camelCase** `traceId` JSON field this app emits and that the linked Tempo datasource UID resolves. No new service — this is a provisioning verification (and a minimal fix to the existing provisioning file if the regex or datasource UID is wrong).

### Acceptance Criteria

- [ ] The Loki datasource provisioning (`docker/grafana/provisioning/datasources/*.y*ml`) defines a `derivedFields` entry whose `matcherRegex` extracts the `traceId` value from a JSON log line (e.g. `"traceId":"([a-f0-9]{32})"`).
- [ ] The derived field's `datasourceUid` points at the provisioned **Tempo** datasource UID, and `url` is `${__value.raw}` (the captured trace id).
- [ ] The derived field `name` is `traceId` (or documented equivalent) so it surfaces as a labeled link in the Loki log detail.
- [ ] `pnpm infra:up` brings Grafana up healthy and the Loki + Tempo datasources both load without provisioning errors (checked in Grafana logs).
- [ ] A short note in `docs/OTEL.md` (or the existing Grafana section) records how to click `traceId` → Tempo, referenced from this phase.

### Files to create / modify

- `docker/grafana/provisioning/datasources/*.y*ml` — confirm/repair the Loki `derivedFields` block (camelCase `traceId`, correct Tempo UID).
- `docs/OTEL.md` — short "click-through" note (append only; do not rewrite the file).

### Agent Execution Prompt

> Role: Senior observability engineer wiring Grafana log↔trace correlation.
> Context: Task P9-2 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-9--opentelemetry-correlation--appsworker) §Phase 9. Read `docs/OVERVIEW.md` §8 (Local Stack — "derived field" payoff) and §14 (cross-service correlation: "filter Loki by that `traceId` and … click through to the unified trace in Tempo"). Phase 1 provisioned `docker/grafana/provisioning/` with Loki + Tempo datasources and a `traceId` derived field. `apps/api` emits the default **camelCase** `traceId` (P9-1). This task verifies — and minimally repairs — that the derived field actually links Loki → Tempo.
> Objective: Confirm the provisioned derived field matches this app's `traceId` field and links to the Tempo datasource; fix the regex/UID if it does not.
> Steps:
>
> 1. Open the Loki datasource provisioning YAML under `docker/grafana/provisioning/datasources/`. Confirm a `jsonData.derivedFields` entry like:
>    ```yaml
>    jsonData:
>      derivedFields:
>        - name: traceId
>          matcherRegex: '"traceId":"([a-f0-9]{32})"'
>          url: '${__value.raw}'
>          datasourceUid: tempo # must equal the Tempo datasource `uid`
>    ```
>    The `matcherRegex` MUST target the **camelCase** `traceId` JSON key (this is `apps/api`'s format). The worker uses `trace_id` (snake_case, P9-3) — note in `docs/OTEL.md` that a second derived field (`"trace_id":"([a-f0-9]{32})"`) can be added if worker lines are queried directly in Loki, but the canonical correlation key for click-through is `apps/api`'s `traceId`.
> 2. Confirm the Tempo datasource YAML sets a stable `uid` (e.g. `uid: tempo`) and that the Loki derived field's `datasourceUid` matches it exactly.
> 3. `pnpm infra:up`. Then check Grafana started cleanly with no provisioning errors:
>    ```bash
>    docker compose logs grafana | grep -iE "provisioning|datasource|error" | tail -n 40
>    ```
>    Expect the Loki + Tempo datasources to register with no `error` lines about the derived field.
> 4. Append a short "Click `traceId` → Tempo" note to `docs/OTEL.md` (how a user opens a Loki log line in Grafana Explore and clicks the `traceId` link to land on the Tempo trace). Keep it to a few lines; the full guide is Phase 16.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions. English-only.
> - Do NOT redesign the Phase 1 provisioning — only fix the derived field regex / datasource UID if broken. Preserve every other datasource setting.
> - Do NOT hardcode a host port into the Tempo link — use `datasourceUid` so Grafana resolves it internally.
>   Verification:
> - `pnpm infra:up` — expected: Grafana healthy; `docker compose logs grafana` shows Loki + Tempo provisioned, no derived-field errors.
> - `grep -R "derivedFields" docker/grafana/provisioning` — expected: the Loki datasource matches `traceId`.
> - Manual (documented): in Grafana Explore → Loki → expand a log line → the `traceId` shows a "tempo" link that opens the trace. (Full end-to-end click is re-checked in P9-6.)

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P9-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P9-3 — Scaffold `apps/worker` (Second NestJS Service, `snake_case` Field Format)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P9-1`

### Description

Scaffold `apps/worker` — the second NestJS service whose only reason to exist is to prove the one logging feature a single service cannot show: **distributed trace correlation across a service boundary** (`OVERVIEW.md` §3 / §5). It gets its **own** `instrumentation.ts` (its own `NodeSDK`, started before NestJS), its own `main.ts`, and `BymaxLoggerModule.forRoot(...)` registered **synchronously** (in contrast to `apps/api`'s `forRootAsync`). Its logger is configured with `otel.fieldFormat: 'snake_case'` so its trace fields print as `trace_id` / `span_id` / `trace_flags` — the **field-format contrast** teaching device from `OVERVIEW.md` §14 (camelCase for Pino-native tooling; snake_case for the OTel Logs Data Model). It also sets `otel.traceIdField: 'trace_id'` explicitly to demonstrate the per-field override. The worker exposes a tiny HTTP endpoint (`POST /tasks/process`) that P9-4 will use to receive the inbound `traceparent`. This task is the skeleton + logger wiring + a booting `/health`; trace extraction is P9-4.

### Acceptance Criteria

- [ ] `apps/worker` exists as a NestJS 11 + Express 5 app: `package.json`, `tsconfig.json` (extends `tsconfig.base.json` + decorator metadata), `nest-cli.json`, `src/main.ts`, `src/app.module.ts`.
- [ ] `apps/worker/package.json` declares `@bymax-one/nest-logger` via the same local `link:` mechanism as `apps/api`, plus the required peers (`@nestjs/common`, `@nestjs/core`, `pino`, `reflect-metadata`, `rxjs`) and the consumer-owned OTel SDK deps (`@opentelemetry/sdk-node`, `-exporter-trace-otlp-http`, `-auto-instrumentations-node`, `-resources`, `-semantic-conventions`, optional-peer `@opentelemetry/api`).
- [ ] `src/instrumentation.ts` exports `otelSdk`, starts a `NodeSDK` **before any NestJS import**, ships spans to `OTLP_TRACE_ENDPOINT`, disables `@opentelemetry/instrumentation-fs`, and has **no** `process.exit` (NestJS owns termination).
- [ ] `src/main.ts` imports `./instrumentation` on the **first line**, creates the app with `{ bufferLogs: true }`, bridges `app.useLogger(app.get(PinoLoggerService))`, calls `app.enableShutdownHooks()`, registers a single `SIGTERM` handler → `app.close()` → `otelSdk.shutdown()` → exit, and listens on `PORT` (default `3002`).
- [ ] `src/app.module.ts` registers `BymaxLoggerModule.forRoot({ ... })` **synchronously** with `service`, `level`, and an `otel` block: `shouldAutoInjectTraceContext: true`, `fieldFormat: 'snake_case'`, `traceIdField: 'trace_id'`.
- [ ] A worker log emitted inside an active span prints `trace_id` / `span_id` / `trace_flags` (snake_case) — asserted by a worker unit/e2e test with stdout capture; `pnpm --filter worker test:cov` is 100%.
- [ ] `pnpm --filter worker dev` boots; `GET /health` returns 200. Root `dev`/`build`/`typecheck` fan-out (`pnpm -r`) now includes the worker.

### Files to create / modify

- `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/nest-cli.json`.
- `apps/worker/src/instrumentation.ts`, `apps/worker/src/main.ts`, `apps/worker/src/app.module.ts`.
- `apps/worker/src/health/health.controller.ts` (+ module) — `GET /health`.
- `apps/worker/src/tasks/tasks.controller.ts` (+ `tasks.module.ts`, `tasks.service.ts`) — stub `POST /tasks/process` returning 202/200 (trace extraction lands in P9-4).
- `apps/worker/test/worker.e2e-spec.ts` — boot + `/health` + snake_case trace-field assertion.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer scaffolding a second microservice.
> Context: Task P9-3 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-9--opentelemetry-correlation--appsworker) §Phase 9. Read `docs/OVERVIEW.md` §5 (Repository Layout — the `apps/worker` tree), §14 (field-format contrast + the hard rule that the SDK starts before NestJS), §7 (Library Consumption — local `link:`), and §9 (the canonical `instrumentation.ts` / `main.ts` wiring). `apps/api` already exists (Phases 3–4) and registers the logger via `forRootAsync`. The worker is intentionally simpler: synchronous `forRoot`, snake_case OTel fields, a tiny HTTP surface. The library only READS the active span (it never owns the SDK); the worker owns its own `NodeSDK`.
> Objective: Create a booting second NestJS service with its own OTel bootstrap and `BymaxLoggerModule.forRoot` configured for snake_case trace fields.
> Steps:
>
> 1. Create `apps/worker/package.json`. Mirror `apps/api`'s dependency strategy (local link to the library, consumer-owned OTel SDK):
>    ```jsonc
>    {
>      "name": "worker",
>      "private": true,
>      "type": "module",
>      "scripts": {
>        "dev": "nest start --watch",
>        "build": "nest build",
>        "typecheck": "tsc --noEmit",
>        "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
>        "test:cov": "node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage",
>        "test:e2e": "node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json",
>      },
>      "dependencies": {
>        "@bymax-one/nest-logger": "link:../../../nest-logger",
>        "@nestjs/common": "^11.0.0",
>        "@nestjs/core": "^11.0.0",
>        "@nestjs/platform-express": "^11.0.0",
>        "pino": "^10.0.0",
>        "reflect-metadata": "^0.2.0",
>        "rxjs": "^7.8.0",
>        "@opentelemetry/sdk-node": "^0.218.0",
>        "@opentelemetry/exporter-trace-otlp-http": "^0.218.0",
>        "@opentelemetry/auto-instrumentations-node": "^0.76.0",
>        "@opentelemetry/resources": "^2.0.0",
>        "@opentelemetry/semantic-conventions": "^1.30.0",
>      },
>      "optionalDependencies": {
>        "@opentelemetry/api": "^1.9.0",
>      },
>    }
>    ```
>    (Match the exact versions `apps/api` resolved; the `@opentelemetry/api` cap is `<1.10` per §4.)
> 2. Create `apps/worker/src/instrumentation.ts` — a trimmed copy of `apps/api`'s. It MUST start the SDK and export it, with NO `process.exit`:
>
>    ```typescript
>    import { NodeSDK } from '@opentelemetry/sdk-node'
>    import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
>    import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
>    import { resourceFromAttributes } from '@opentelemetry/resources'
>    import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
>
>    export const otelSdk = new NodeSDK({
>      resource: resourceFromAttributes({
>        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-worker',
>        [ATTR_SERVICE_VERSION]: process.env.RELEASE_SHA ?? 'dev',
>        'deployment.environment': process.env.NODE_ENV ?? 'development',
>      }),
>      traceExporter: new OTLPTraceExporter({ url: process.env.OTLP_TRACE_ENDPOINT }),
>      instrumentations: [
>        getNodeAutoInstrumentations({
>          '@opentelemetry/instrumentation-fs': { enabled: false },
>        }),
>      ],
>    })
>
>    otelSdk.start()
>    ```
>
> 3. Create `apps/worker/src/main.ts` — `./instrumentation` MUST be the first import (the hard rule from §14):
>
>    ```typescript
>    import './instrumentation'
>    import { otelSdk } from './instrumentation'
>    import { NestFactory } from '@nestjs/core'
>    import { PinoLoggerService } from '@bymax-one/nest-logger'
>    import { AppModule } from './app.module'
>
>    async function bootstrap() {
>      const app = await NestFactory.create(AppModule, { bufferLogs: true })
>      app.useLogger(app.get(PinoLoggerService))
>      app.enableShutdownHooks()
>      process.once('SIGTERM', () => {
>        void app
>          .close()
>          .then(() => otelSdk.shutdown())
>          .finally(() => process.exit(0))
>      })
>      await app.listen(process.env.PORT ?? 3002)
>    }
>
>    void bootstrap()
>    ```
>
> 4. Create `apps/worker/src/app.module.ts` — register the logger **synchronously** with `forRoot`, snake_case OTel fields, and the explicit per-field override:
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { BymaxLoggerModule } from '@bymax-one/nest-logger'
>    import { HealthModule } from './health/health.module'
>    import { TasksModule } from './tasks/tasks.module'
>
>    @Module({
>      imports: [
>        BymaxLoggerModule.forRoot({
>          service: {
>            name: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-worker',
>            version: process.env.RELEASE_SHA ?? 'dev',
>          },
>          level: process.env.LOG_LEVEL ?? 'info',
>          isGlobal: true,
>          otel: {
>            shouldAutoInjectTraceContext: true, // default true; explicit for the demo
>            fieldFormat: 'snake_case', // contrast with apps/api's camelCase (§14)
>            traceIdField: 'trace_id', // explicit per-field override demonstration
>          },
>        }),
>        HealthModule,
>        TasksModule,
>      ],
>    })
>    export class AppModule {}
>    ```
>
> 5. Create `src/health/` (`GET /health` → `{ status: 'ok' }`) and a `src/tasks/` stub: `POST /tasks/process` for now just logs one structured line (a valid `MODULE_ACTION_RESULT` key, e.g. `WORKER_TASK_RECEIVED`, via the injected `PinoLoggerService`) and returns `202`. The actual `traceparent` extraction is P9-4 — leave a `// P9-4: extract inbound traceparent here` marker.
> 6. Create `apps/worker/tsconfig.json` (extends `../../tsconfig.base.json`; add `emitDecoratorMetadata` + `experimentalDecorators` which the base deliberately omits) and `nest-cli.json`. Confirm the worker is picked up by the root `pnpm -r` fan-out (it lives under `apps/*`, already globbed in `pnpm-workspace.yaml`).
> 7. Add `apps/worker/test/worker.e2e-spec.ts`: boot the app, assert `GET /health` is 200, then spy `process.stdout.write`, hit `POST /tasks/process`, and assert the captured line carries **snake_case** `trace_id` (32 hex) / `span_id` (16 hex) / `trace_flags` — NOT the camelCase names:
>    ```typescript
>    expect(line).toHaveProperty('trace_id')
>    expect(line).not.toHaveProperty('traceId')
>    expect(line.trace_id).toMatch(/^[0-9a-f]{32}$/)
>    ```
> 8. `pnpm install` (resolves the new workspace + link), then run the verification commands.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions + §0 (no `@ts-ignore`/`eslint-disable`/`--no-verify`; English-only; boolean prefixes `is`/`has`/`should`).
> - Use ONLY `@bymax-one/nest-logger@0.1.0` public API: `BymaxLoggerModule.forRoot`, `PinoLoggerService`, `@InjectLogger`. The flag is `shouldAutoInjectTraceContext` (NOT `autoInjectTraceContext`).
> - Do NOT add `@opentelemetry/instrumentation-pino` — double-inject (§14).
> - `forRoot` here is deliberate (sync registration demo, Feature Matrix row 1); do NOT convert it to `forRootAsync`.
> - Keep the worker minimal — no Prisma, no destinations beyond stdout. Its job is trace propagation, not the full pipeline.
>   Verification:
> - `pnpm install` — expected: exit 0; the `link:` to the library resolves.
> - `pnpm --filter worker build` — expected: exit 0.
> - `pnpm --filter worker test:cov` — expected: 100% coverage; the snake_case assertion passes.
> - `pnpm --filter worker dev` then `curl -s localhost:3002/health` — expected: `200` `{"status":"ok"}` (manual smoke).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P9-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P9-4 — Worker Extracts Inbound W3C `traceparent` → Same `traceId`

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90 min – 3 h)
- **Depends on:** `P9-3`

### Description

Make the worker continue the **caller's** trace. When `apps/api` calls the worker over HTTP, the W3C `traceparent` header carries the trace context; the worker's HTTP auto-instrumentation should already extract it and make it the active span. This task proves it: a request arriving at `POST /tasks/process` with a valid `traceparent` produces worker log lines whose `trace_id` equals the **`trace-id` segment of the inbound header** (same trace as the caller). It also covers the manual extraction path with `propagation.extract` from `@opentelemetry/api` for non-instrumented entry points, so the behavior is provable in a unit test without standing up the full api→worker hop (that integration is P9-5/P9-6).

### Acceptance Criteria

- [ ] An e2e test sends `POST /tasks/process` with a hand-crafted W3C header `traceparent: 00-<32hex>-<16hex>-01` and asserts the worker's emitted log line carries `trace_id` == the `<32hex>` trace-id segment of that header.
- [ ] The worker logs the inbound handling with a valid `MODULE_ACTION_RESULT` log key (e.g. `WORKER_TASK_RECEIVED` / `WORKER_TASK_PROCESSED`) and the snake_case trace fields from P9-3.
- [ ] A unit test demonstrates the **manual** extraction path: `propagation.extract(context.active(), carrier)` from `@opentelemetry/api` over a carrier holding a `traceparent`, then code run inside that context logs the same `trace_id` (covers non-auto-instrumented callers).
- [ ] A request with **no** `traceparent` still succeeds (the worker starts its own root span; its `trace_id` is a fresh non-zero id, not the all-zero value).
- [ ] `pnpm --filter worker test:cov` stays at 100% on all four metrics.

### Files to create / modify

- `apps/worker/src/tasks/tasks.controller.ts` / `tasks.service.ts` — log inbound handling under the (auto-extracted) active span; remove the P9-3 `// P9-4` marker.
- `apps/worker/src/tasks/trace-extract.util.ts` (or inline in the service) — the manual `propagation.extract` example, exercised by the unit test.
- `apps/worker/test/worker-traceparent.e2e-spec.ts` — inbound-header → same-`trace_id` assertion + no-header root-span case.
- `apps/worker/src/tasks/*.spec.ts` — manual-extract unit coverage.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer wiring W3C trace-context propagation on the receiving side.
> Context: Task P9-4 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-9--opentelemetry-correlation--appsworker) §Phase 9. Read `docs/OVERVIEW.md` §14 ("The HTTP auto-instrumentation injects a W3C `traceparent` … so calling `apps/worker` propagates the trace with zero manual code. For non-instrumented clients … the example shows the manual path"). P9-3 scaffolded the worker with snake_case OTel fields and a stub `POST /tasks/process`. The worker's `@opentelemetry/auto-instrumentations-node` already includes HTTP server instrumentation, which extracts the inbound `traceparent` and sets the active span — so logs emitted in the handler inherit the caller's `trace_id` automatically. This task proves that, and adds the explicit `propagation.extract` example for callers that are not auto-instrumented.
> Objective: Prove an inbound `traceparent` makes the worker log the SAME `trace_id` as the caller, both via auto-instrumentation and via a manual `propagation.extract`.
> Steps:
>
> 1. In `apps/worker/src/tasks/tasks.service.ts` (called from the controller), log the inbound handling with the injected `PinoLoggerService`:
>    ```typescript
>    this.logger.info('WORKER_TASK_RECEIVED', 'Worker received task from upstream')
>    // … process …
>    this.logger.info('WORKER_TASK_PROCESSED', 'Worker finished task')
>    ```
>    Because the HTTP server auto-instrumentation already activated the extracted span, these lines carry the caller's `trace_id` with no extra code. Remove the `// P9-4: extract inbound traceparent here` marker from P9-3.
> 2. Add the **manual** extraction example (for non-instrumented entry points) in `trace-extract.util.ts`:
>
>    ```typescript
>    import { propagation, context, trace } from '@opentelemetry/api'
>
>    /** Run `fn` inside the trace context carried by a W3C `traceparent` carrier. */
>    export function runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T {
>      const ctx = propagation.extract(context.active(), carrier)
>      return context.with(ctx, fn)
>    }
>    ```
>
>    (Use `trace.getSpan(ctx)` in the test to read back the extracted `traceId` if needed.)
>
> 3. Create `apps/worker/test/worker-traceparent.e2e-spec.ts`. Build a valid header and assert the worker echoes the same trace id into its logs:
>    ```typescript
>    const traceId = 'a1b2c3d4e5f6071829304a5b6c7d8e9f'
>    const traceparent = `00-${traceId}-00f067aa0ba902b7-01`
>    const writes: string[] = []
>    jest
>      .spyOn(process.stdout, 'write')
>      .mockImplementation((c: any) => (writes.push(String(c)), true))
>    await request(app.getHttpServer())
>      .post('/tasks/process')
>      .set('traceparent', traceparent)
>      .send({})
>      .expect(202)
>    const line = writes.map((w) => JSON.parse(w)).find((l) => l.logKey === 'WORKER_TASK_RECEIVED')
>    expect(line.trace_id).toBe(traceId) // SAME trace as the caller
>    ```
> 4. Add the no-header case: POST without `traceparent` still returns 2xx, and the logged `trace_id` is a fresh 32-hex value that is NOT all zeros (a real root span was created):
>    ```typescript
>    expect(line.trace_id).toMatch(/^[0-9a-f]{32}$/)
>    expect(line.trace_id).not.toBe('00000000000000000000000000000000')
>    ```
> 5. Add a unit spec for `runWithExtractedContext`: pass `{ traceparent: '00-<id>-<span>-01' }`, run a closure that reads the active span context, and assert its `traceId` equals `<id>`.
> 6. Run `pnpm --filter worker test:cov`; keep 100%.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §0 (English-only; no suppressions; no `--no-verify`).
> - Extraction uses ONLY `@opentelemetry/api` (`propagation.extract` / `context.with`). Do NOT add new propagators or `@opentelemetry/instrumentation-pino`.
> - Log keys MUST match `LOG_KEYS_CONVENTION_REGEX` (`MODULE_ACTION_RESULT`) and must NOT reuse a `RESERVED_LOG_KEYS` value.
> - Do NOT manually parse the `traceparent` string with a regex in production code — let auto-instrumentation / `propagation.extract` own that. (A regex is fine in the TEST only, to build the header.)
>   Verification:
> - `pnpm --filter worker test -- worker-traceparent` — expected: same-`trace_id` + no-header cases pass.
> - `pnpm --filter worker test:cov` — expected: 100%, exit 0.
> - `pnpm --filter worker typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P9-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P9-5 — `apps/api/downstream` → Worker Hop (Auto-Instrumented + Manual `propagation.inject`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90 min – 3 h)
- **Depends on:** `P9-3`, `P9-4`

### Description

Wire the **caller** side: `apps/api`'s `downstream` module makes the HTTP hop to `apps/worker`, propagating the trace. Two paths are shown, exactly as `OVERVIEW.md` §14 prescribes: (a) the **auto-instrumented** path — a plain outbound HTTP call where `@opentelemetry/auto-instrumentations-node` injects the W3C `traceparent` with zero manual code; and (b) the **manual** path — `propagation.inject(context.active(), headers)` from `@opentelemetry/api`, for custom fetch wrappers / vendor SDKs the auto-instrumentation does not patch. The `downstream` service also uses `@LogContext(name)` (class label) + ctor `setContext()` per the Feature Matrix (rows 10/12) and §6. A `POST /downstream/dispatch` request must result in the api log lines and the worker log lines sharing one `traceId` (camelCase on the api side, `trace_id` on the worker side — same underlying value).

### Acceptance Criteria

- [ ] `apps/api/src/downstream/downstream.service.ts` makes an outbound `POST` to the worker's `POST /tasks/process`, reading the worker base URL from config (e.g. `WORKER_URL`, default `http://localhost:3002`).
- [ ] **Auto path:** a plain outbound HTTP call (no hand-set trace header) propagates `traceparent` via auto-instrumentation — asserted by capturing the request the worker receives (or by asserting the shared id in the integration test).
- [ ] **Manual path:** a second, clearly-labeled code path builds a headers object and calls `propagation.inject(context.active(), headers)` from `@opentelemetry/api` before sending, demonstrating the non-instrumented client case.
- [ ] `downstream.service.ts` is annotated `@LogContext('DownstreamService')` (or the class name) and calls `setContext(...)` in its constructor; `@InjectLogger(DownstreamService.name)` is used.
- [ ] A test asserts the `traceparent` produced by the manual `propagation.inject` is a well-formed W3C header (`00-<32hex>-<16hex>-<2hex>`) carrying the **active** span's trace id.
- [ ] `pnpm --filter api test:cov` stays at 100%; `WORKER_URL` is added to `apps/api/src/config/env.schema.ts` (Zod) and to `.env.example`.

### Files to create / modify

- `apps/api/src/downstream/downstream.service.ts` — outbound hop (auto path) + manual `propagation.inject` path + `@LogContext` / `setContext`.
- `apps/api/src/downstream/downstream.controller.ts` / `downstream.module.ts` — `POST /downstream/dispatch` (create or extend if Phase 6 stubbed it).
- `apps/api/src/config/env.schema.ts` — add `WORKER_URL` (Zod, default `http://localhost:3002`).
- `.env.example` — document `WORKER_URL`.
- `apps/api/src/downstream/*.spec.ts` — manual-inject header-shape assertion + service unit coverage.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer wiring cross-service trace propagation on the sending side.
> Context: Task P9-5 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-9--opentelemetry-correlation--appsworker) §Phase 9. Read `docs/OVERVIEW.md` §14 ("Cross-service correlation" — the auto path AND the manual `propagation.inject` snippet) and §6 (Feature Matrix rows 10/12/23 — `@LogContext`, `setContext`, W3C propagation). P9-3/P9-4 built the worker (snake_case fields) which already extracts an inbound `traceparent` and logs the same `trace_id`. `apps/api`'s `downstream` module may have a Phase 6 stub. This task makes `downstream` actually call the worker and propagate the trace BOTH ways the doc shows.
> Objective: Implement the api→worker hop with an auto-instrumented call and a manual `propagation.inject` example, sharing one trace id across both services.
> Steps:
>
> 1. Add `WORKER_URL` to `apps/api/src/config/env.schema.ts` (Zod): `WORKER_URL: z.string().url().default('http://localhost:3002')`. Document it in `.env.example` (`WORKER_URL=http://localhost:3002  # apps/api → apps/worker hop`).
> 2. In `apps/api/src/downstream/downstream.service.ts`, decorate the class and set context in the ctor (Feature Matrix rows 10/12):
>
>    ```typescript
>    import { Injectable } from '@nestjs/common'
>    import { InjectLogger, PinoLoggerService, LogContext } from '@bymax-one/nest-logger'
>    import { propagation, context } from '@opentelemetry/api'
>
>    @Injectable()
>    @LogContext('DownstreamService')
>    export class DownstreamService {
>      constructor(
>        @InjectLogger(DownstreamService.name) private readonly logger: PinoLoggerService,
>      ) {
>        this.logger.setContext('DownstreamService')
>      }
>    }
>    ```
>
> 3. **Auto path** — a plain outbound call. Auto-instrumentation patches the HTTP client, so just sending injects `traceparent` automatically (no manual header):
>    ```typescript
>    this.logger.info('DOWNSTREAM_DISPATCH_START', 'Calling worker (auto-instrumented)')
>    await fetch(`${this.workerUrl}/tasks/process`, {
>      method: 'POST',
>      headers: { 'content-type': 'application/json' },
>      body: JSON.stringify({ mode: 'auto' }),
>    })
>    ```
>    (If the repo standardized on `undici`/`axios`, use that client — the point is "no hand-set trace header".)
> 4. **Manual path** — the §14 snippet verbatim, for non-instrumented clients:
>    ```typescript
>    const headers: Record<string, string> = { 'content-type': 'application/json' }
>    propagation.inject(context.active(), headers) // adds `traceparent` (+ `tracestate`)
>    this.logger.info('DOWNSTREAM_DISPATCH_MANUAL', 'Calling worker (manual propagation.inject)')
>    await fetch(`${this.workerUrl}/tasks/process`, {
>      method: 'POST',
>      headers,
>      body: JSON.stringify({ mode: 'manual' }),
>    })
>    ```
>    Expose both via `POST /downstream/dispatch` (e.g. a `?mode=auto|manual` query, default runs both).
> 5. In `downstream.controller.ts`, log a line and delegate to the service; ensure `DownstreamModule` is imported by `AppModule`.
> 6. Add a unit spec asserting the **manual** path produces a valid W3C header. Start a real span (via `@opentelemetry/api` `trace.getTracer(...).startActiveSpan`), call `propagation.inject` into a carrier, and assert:
>    ```typescript
>    expect(carrier.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/)
>    // and the trace-id segment equals the active span's traceId
>    ```
>    Mock `fetch` so the unit test never needs the worker running. Keep `pnpm --filter api test:cov` at 100%.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §0 (English-only; no `@ts-ignore`/`eslint-disable`/`--no-verify`; boolean prefixes).
> - Propagation uses ONLY `@opentelemetry/api` (`propagation.inject` / `context.active`). Do NOT hand-format the `traceparent` string yourself in production code — `propagation.inject` owns it.
> - Use ONLY `@bymax-one/nest-logger@0.1.0` public API: `@InjectLogger`, `PinoLoggerService`, `@LogContext(name)` (class decorator), `setContext`. `@LogContext` is a CLASS decorator that records a label; `setContext()` applies it — do NOT use the README's wrong `@LogContext(store)` method-decorator form.
> - Log keys MUST match `LOG_KEYS_CONVENTION_REGEX`; never reuse a `RESERVED_LOG_KEYS`.
> - The real api→worker integration (both services live, shared id end to end) is asserted in P9-6 — here, unit-test the header shape with `fetch` mocked.
>   Verification:
> - `pnpm --filter api test -- downstream` — expected: manual-inject header-shape test passes.
> - `pnpm --filter api test:cov` — expected: 100%, exit 0.
> - `pnpm --filter api typecheck` — expected: exit 0 (`WORKER_URL` typed in the env schema).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P9-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P9-6 — Verification — Interleaved api + worker Logs Share a `traceId` in Grafana

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90 min – 3 h)
- **Depends on:** `P9-1`, `P9-2`, `P9-3`, `P9-4`, `P9-5`

### Description

Phase 9 "Definition of done" gate (`DEVELOPMENT_PLAN.md` §Phase 9): **one request produces interleaved `apps/api` + `apps/worker` logs sharing a `traceId`, visible in Grafana Explore (Loki) and clickable through to the Tempo trace.** This task closes the phase with (1) an automated cross-service e2e that boots both apps and asserts the shared id, and (2) a documented manual Grafana walkthrough. It also documents the **optional Sentry integration** (gated by `SENTRY_DSN`) so the phase's observability story is complete: `@sentry/node` ≥10.18 `Sentry.pinoIntegration()` + `@sentry/opentelemetry` `SentryPropagator` (no separate `@sentry/pino` package). This is verification + documentation — no new feature code beyond the test harness and the Sentry note.

### Acceptance Criteria

- [ ] A cross-service e2e (both `apps/api` and `apps/worker` running, real HTTP hop) fires `POST /downstream/dispatch` and asserts: the api lines carry `traceId` and the worker lines carry `trace_id`, and the **value is identical** across both services (one trace spans the hop).
- [ ] The test proves the logs are **interleaved/correlatable** by that single id — e.g. collect both services' captured lines, group by the trace value, and assert the group contains at least one `apps/api` line and one `apps/worker` line.
- [ ] A manual, copy-pasteable Grafana walkthrough is documented (in `docs/OTEL.md` or `docs/GETTING_STARTED.md`): `pnpm infra:up` → fire `POST /downstream/dispatch` → Grafana Explore → Loki query (e.g. `{service=~"nest-logger-example-.*"} | json | traceId="<id>"`) shows both services → click the `traceId` derived field → land on the Tempo trace.
- [ ] The **optional Sentry integration** is documented as part of this task: gated by `SENTRY_DSN`, `Sentry.init({ dsn, enableLogs: true, integrations: [Sentry.pinoIntegration({ error: { levels: ['error','fatal'] } })] })` **before** `new NodeSDK(...)`, with `new SentryPropagator()` registered as the SDK `textMapPropagator`; requires `@sentry/node` ≥10.18 + `@sentry/opentelemetry`; **no** separate `@sentry/pino` package.
- [ ] `pnpm --filter api test:e2e` (or the workspace e2e target) passes with the cross-service spec; coverage gates in both apps remain 100%.
- [ ] Every Phase 9 acceptance criterion (P9-1..P9-5) is re-confirmed green; the Phase 9 row in `DEVELOPMENT_PLAN.md` flips to 🟢 when this task completes.

### Files to create / modify

- `apps/api/test/cross-service-trace.e2e-spec.ts` — boot both apps (or start the worker as a child process / second Nest app), fire `/downstream/dispatch`, assert the shared trace id across api (`traceId`) + worker (`trace_id`) lines.
- `docs/OTEL.md` — the manual Grafana walkthrough + the optional Sentry integration section (append; the full guide is Phase 16).
- `.env.example` — confirm `SENTRY_DSN` documented as optional (no-op when unset).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer closing out the OpenTelemetry correlation phase.
> Context: Task P9-6 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-9--opentelemetry-correlation--appsworker) §Phase 9. This is the phase DoD gate. Read `docs/OVERVIEW.md` §14 (the whole section — hard rule, cross-service correlation, field-format contrast, "Do not double-inject", and "Optional Sentry integration") and §3/§15 (journey 6: "both `apps/api` and `apps/worker` logs joined on one `traceId`"). P9-1..P9-5 are 🟢: api injects camelCase trace fields, the Grafana derived field links Loki→Tempo, the worker extracts the inbound `traceparent` and logs the same `trace_id` (snake_case), and `downstream` calls the worker (auto + manual `propagation.inject`). Now prove the end-to-end shared id and document the Grafana walkthrough + the optional Sentry integration.
> Objective: Add a cross-service e2e proving one request yields api + worker logs sharing a single trace id, document the Grafana click-through, and document the Sentry integration. Then close the phase.
> Steps:
>
> 1. Create `apps/api/test/cross-service-trace.e2e-spec.ts`. Bring up BOTH services in-process (create the worker's Nest app from `apps/worker`'s `AppModule` on a test port, and the api app from its `AppModule`), or start the worker via a child process if cross-package imports are awkward — pick the approach the repo's existing e2e harness supports. Spy stdout for BOTH apps (or read the worker's stdout from the child process), fire `POST /downstream/dispatch`, then:
>    ```typescript
>    const apiLines = apiWrites.map((w) => JSON.parse(w)).filter((l) => l.traceId)
>    const workerLines = workerWrites.map((w) => JSON.parse(w)).filter((l) => l.trace_id)
>    const apiTrace = apiLines.find((l) => l.logKey === 'DOWNSTREAM_DISPATCH_START')?.traceId
>    const workerTrace = workerLines.find((l) => l.logKey === 'WORKER_TASK_RECEIVED')?.trace_id
>    expect(apiTrace).toBeDefined()
>    expect(workerTrace).toBe(apiTrace) // SAME id across the hop — camelCase ↔ snake_case, one value
>    ```
> 2. Assert correlatability: group all captured lines by the shared trace value and assert the group spans both services (≥1 api line by `service` name + ≥1 worker line). This is the automated stand-in for "interleaved in Grafana Explore".
> 3. Document the manual Grafana walkthrough in `docs/OTEL.md` (append a "Cross-service correlation in Grafana" subsection):
>    ````markdown
>    1. `pnpm infra:up && pnpm dev` (api on :3001, worker on :3002).
>    2. `curl -XPOST localhost:3001/downstream/dispatch` — note the `traceId` printed on stdout.
>    3. Grafana → Explore → Loki, query:
>       ```logql
>       {service=~"nest-logger-example-.*"} | json | traceId="<that-id>"
>       ```
>       → both api and worker lines appear, interleaved.
>    4. Expand any line → click the **traceId** derived field (P9-2) → Tempo opens the unified trace spanning both services.
>    ````
>    (Note for the reader: the worker emits `trace_id`; query it with `| json | trace_id="<id>"` when looking at worker lines directly — the derived-field click-through keys off the api's `traceId`.)
> 4. Document the **optional Sentry integration** in `docs/OTEL.md` (append "Optional: Sentry + OpenTelemetry"). State exactly (from §14):
>    - Gated behind `SENTRY_DSN` (unset → fully no-op).
>    - In `instrumentation.ts`, BEFORE `new NodeSDK(...)`:
>
>      ```typescript
>      import * as Sentry from '@sentry/node'
>      import { SentryPropagator } from '@sentry/opentelemetry'
>
>      if (process.env.SENTRY_DSN) {
>        Sentry.init({
>          dsn: process.env.SENTRY_DSN,
>          enableLogs: true,
>          integrations: [Sentry.pinoIntegration({ error: { levels: ['error', 'fatal'] } })],
>        })
>      }
>      ```
>
>      and pass `textMapPropagator: new SentryPropagator()` in the `NodeSDK` options when the DSN is set.
>
>    - Requires `@sentry/node` ≥ 10.18 + `@sentry/opentelemetry`. The capture mechanism is the **built-in `Sentry.pinoIntegration()`** exported from `@sentry/node` — there is **no** separate `@sentry/pino` package, and the legacy `@sentry/opentelemetry-node` is NOT used.
>
> 5. Confirm `.env.example` lists `SENTRY_DSN=` (commented/empty) with a one-line "optional — enables Sentry + OTel" note.
> 6. Run the verification commands. Re-confirm P9-1..P9-5 acceptance criteria are still green, then execute this file's Completion Protocol and flip the Phase 9 row in `DEVELOPMENT_PLAN.md` to 🟢.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + §0 (English-only; no `@ts-ignore`/`eslint-disable`/`--no-verify`; do not lower any threshold to pass).
> - Do NOT add `@opentelemetry/instrumentation-pino` (double-inject — §14). Keep the library's mixin as the single injector.
> - Sentry is DOCUMENTATION-only in this task (gated, optional). Do NOT make `@sentry/*` a hard dependency of the apps or break boot when `SENTRY_DSN` is unset.
> - If the cross-service e2e is flaky in CI (two live servers), gate it behind the e2e target / a tag rather than the unit run — but it MUST pass locally and in the e2e job; do not delete it to go green.
>   Verification:
> - `pnpm --filter api test:e2e -- cross-service-trace` — expected: api+worker share one trace id; the spec passes.
> - `pnpm --filter api test:cov` and `pnpm --filter worker test:cov` — expected: 100% in both.
> - `pnpm typecheck && pnpm lint` — expected: exit 0.
> - Manual (documented): `pnpm infra:up`, fire `/downstream/dispatch`, Grafana Explore shows both services for one `traceId` and the link opens the Tempo trace.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P9-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 9 is 6/6 — switch the Phase 9 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
