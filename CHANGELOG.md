# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-06-10

### Added

- `apps/api` — NestJS 11 reference service wiring `@bymax-one/nest-logger` via `forRootAsync`, the OTel bootstrap (`instrumentation.ts`), request-id middleware (AsyncLocalStorage scope), the HTTP logging interceptor, and a global exception filter.
- `apps/worker` — second NestJS service proving cross-service `traceId` correlation over W3C `traceparent`, configured with `snake_case` field format to contrast with the API.
- `apps/web` — Next.js 16 dashboard: Log Explorer (facets, virtualized table, detail drawer, trace deep-links), Overview (golden-signals / RED charts), real-time Live Tail (SSE), Trigger Center, Alerts & Incidents, Maintenance, RBAC, and saved views.
- Destinations: default stdout, pretty-dev, Loki (batched HTTP push), Prisma (durable `warn`+ tier), rolling-file (dev), and an SSE event-bus fan-out — all fail-soft.
- PII redaction proofs (97 default paths + app extensions, bracket-syntax header redaction, oversized-entry truncation) and a `LogAuditService` listing the active redaction surface.
- OpenTelemetry correlation (`traceId`/`spanId` injected into every log when the SDK is active) and cross-service propagation API → worker.
- Local observability stack via Docker Compose (Postgres, Loki, Tempo, OTel Collector, Grafana) plus a dedicated ephemeral test stack.
- Two-tier persistence (`warn`+ to Postgres, `info`+ to Loki) and the `logs/` read-API (query, aggregate, facets, context, export, live-tail).
- Quality gates: 100% test coverage (Jest + Vitest), Stryker mutation `break: 100`, the export-usage audit (`scripts/audit-library-exports.mjs`), the log-key convention audit (`scripts/audit-log-keys.mjs`), and `helmet` security headers on the API.
- CI/CD: `ci.yml` (lint / typecheck / unit / e2e / coverage / audits), per-PR + nightly Stryker mutation workflows, a `v*`-tag release pipeline (GHCR images + `RELEASES.md`), and production Dockerfiles + `docker-compose.prod.yml`.
- The full reference documentation set under `docs/` (OVERVIEW, DASHBOARD, OTEL, TROUBLESHOOTING, DEPLOYMENT, RELEASES, and the phased development plan).

> **Library status:** consumes `@bymax-one/nest-logger@^0.1.0` via a local `link:` (pre-GA, not yet on npm — see `docs/OVERVIEW.md` §7). The `v1.0.0` tag is created locally and **not pushed** until the library publishes.
