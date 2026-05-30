# nest-logger-example

The canonical reference application for [`@bymax-one/nest-logger`](https://github.com/bymaxone/nest-logger) —
a runnable, production-shaped demo that exercises every public export of the library across a NestJS API, a
second worker service (cross-service `traceId` correlation), and a Next.js observability dashboard, wired to a
local Loki / Tempo / Grafana / OpenTelemetry Collector + PostgreSQL stack.

## Documentation

- [`docs/OVERVIEW.md`](docs/OVERVIEW.md) — product blueprint and repository layout (master spec).
- [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) — the phased build plan (19 phases, 133 tasks) and quality gates.
- [`docs/DASHBOARD.md`](docs/DASHBOARD.md) — the `apps/web` dashboard specification and design system.

## Status

🚧 **Scaffolding (Phase 0 — Repository Foundation & Tooling).** The toolchain (pnpm workspace, strict
TypeScript, ESLint 9, Prettier 3, Husky + commitlint) is in place; application code lands in later phases.
This README is replaced with the full quick-start guide in Phase 16.
