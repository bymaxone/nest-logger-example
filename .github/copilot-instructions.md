# nest-logger-example — Repository Instructions

`nest-logger-example` is the **reference/demo app** for `@bymax-one/nest-logger` (consumed via local `link:`/`file:`, never modified here). A `pnpm` monorepo of three apps that emit, persist, trace-correlate, and visualize structured logs end to end. Runtime: Node `>=24`. Package manager: `pnpm@10.8.0` (`--frozen-lockfile`).

## Apps

- **`apps/api`** — NestJS 11 + Express 5 + Prisma 7 (PostgreSQL). OTel SDK starts before NestJS. Hosts the `logs/` read-API (keyset `/logs`, `/logs/aggregate`, `/logs/facets`, `/logs/context`, SSE `/logs/stream`, Loki proxy, `/logs/export`) plus the demo domain, destinations (Loki / Prisma / rolling-file), governance (RBAC / audit / retention) and alerts.
- **`apps/worker`** — second NestJS service; proves cross-service `traceId` correlation (`otel.fieldFormat: 'snake_case'`).
- **`apps/web`** — Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn + TanStack Query/Table/Virtual + nuqs + Recharts; the observability dashboard. Reads everything via the `logs/` API.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm typecheck             # tsc --noEmit across every package (-r)
pnpm lint                  # eslint . (flat config, recommendedTypeChecked)
pnpm format:check          # prettier --check .
pnpm test / test:cov       # Jest (apps/api, apps/worker)
pnpm test:e2e              # Jest e2e (real NestFactory + supertest)
pnpm infra:up / infra:down # docker compose (Postgres/Loki/Tempo/Grafana)
pnpm --filter api db:migrate | db:seed | db:generate
```

Scope a single package with `pnpm --filter <api|web|worker> <script>`. Planned (defined but not yet wired): `pnpm mutation` (Stryker is not configured yet) and `pnpm audit:exports` (the audit script is not present yet).

## Non-negotiable rules

1. **TypeScript 5.9 strict** + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`; ESM only. **Zero suppression comments** (`@ts-ignore`, `@ts-expect-error`, `eslint-disable*`, `as any`).
2. **Never import the `@bymax-one/nest-logger` `.` root in `apps/web`** — it pulls in Pino/Nest/Node and breaks the browser bundle. Use the isomorphic `@bymax-one/nest-logger/shared` subpath for `LogLevel`, `LogEntry`, `LOG_KEYS_CONVENTION_REGEX`.
3. **Log keys follow `MODULE_ACTION_RESULT`** (validated against `LOG_KEYS_CONVENTION_REGEX`); never reuse a `RESERVED_LOG_KEYS` value for an application event.
4. **Two-tier persistence**: Loki = `info`+ (full fidelity); Postgres = `warn`+ (`LOG_DB_MIN_LEVEL`, durable/audit). Charts are fed by `/logs/aggregate` server-side — the browser **never** aggregates raw rows, and never groups by high-cardinality fields (`requestId` / `traceId` / `spanId` / `userId`).
5. **Query-based RBAC** via `x-role` + `x-tenant-id` headers, threaded into every read query — never a second auth path. (Scoped demo, not real auth.)
6. **Quality targets** (`DEVELOPMENT_PLAN.md` §2; enforced in CI per the roadmap, not yet wired locally — write code as if they are): **100% coverage** (statements/branches/functions/lines), **Stryker `break: 100`**, and every `@bymax-one/nest-logger` export referenced in `apps/` (`audit:exports`).
7. **Conventional Commits**; English-only comments; JSDoc on file headers + every export; boolean naming `is`/`has`/`should`/`can`; config via the Zod env schema; secrets only via env, never logged.

## Architecture

- Context (`requestId`/`tenantId`/`traceId`/`spanId`) flows via `AsyncLocalStorage` — never as function arguments.
- `instrumentation.ts` (OTel `NodeSDK`) is imported **first** in `main.ts`, before any NestJS module loads.
- `LogsService` compiles one `LogQuery` into **both** a Prisma `where` and a LogQL string; raw SQL uses `Prisma.sql` tagged templates — never string-interpolate user input.
