# Task Files — Index & Conventions

> Per-phase task breakdowns for [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md). Start at the [Progress Summary](../DEVELOPMENT_PLAN.md#progress-summary). Mirrors the `nest-auth-example` `docs/tasks/` convention.

## Phase files

| Phase | File                              | Scope                                                       |
| ----- | --------------------------------- | ----------------------------------------------------------- |
| 0     | `phase-00-repo-foundation.md`     | pnpm monorepo, tooling, husky/lint-staged, renovate         |
| 1     | `phase-01-observability-stack.md` | docker-compose: postgres/loki/tempo/otel-collector/grafana  |
| 2     | `phase-02-library-consumption.md` | consume `@bymax-one/nest-logger`; subpath probe             |
| 3     | `phase-03-api-skeleton.md`        | NestJS 11, `instrumentation.ts`, `main.ts`, `/health`       |
| 4     | `phase-04-logger-wiring.md`       | `forRootAsync` + `logger.config.ts` + request-id middleware |
| 5     | `phase-05-prisma-persistence.md`  | `ApplicationLog` + domain tables + BRIN/keyset/GIN indexes  |
| 6     | `phase-06-demo-domain.md`         | orders/payments/pii-demo/downstream/trigger/admin           |
| 7     | `phase-07-destinations.md`        | loki / prisma-log / rolling-file + fail-soft                |
| 8     | `phase-08-redaction.md`           | redaction proofs + `LogAuditService`                        |
| 9     | `phase-09-otel-correlation.md`    | traceId in logs + `apps/worker` cross-service               |
| 10    | `phase-10-logs-api.md`            | `logs/` read-API + alerts/governance modules                |
| 11    | `phase-11-web-skeleton.md`        | Next.js 16 + **the copied design system** + app shell       |
| 12    | `phase-12-dashboard-core.md`      | Overview + Explorer + Live Tail                             |
| 13    | `phase-13-dashboard-ops.md`       | Trigger Center + Alerts/Incidents + Maintenance             |
| 14    | `phase-14-testing.md`             | unit + e2e, **100% coverage gate**                          |
| 15    | `phase-15-mutation.md`            | **Stryker 100% mutation** (api + web)                       |
| 16    | `phase-16-documentation.md`       | every `docs/*.md` + README                                  |
| 17    | `phase-17-cicd.md`                | ci.yml + mutation(.nightly).yml + release.yml + Dockerfiles |
| 18    | `phase-18-audit-hardening.md`     | export/log-key audits + security + CHANGELOG + v1.0.0       |

## Task-file conventions

Each `phase-NN-*.md` follows this anatomy (copied from `nest-auth-example`):

1. **Header** — `# Phase NN — Title — Tasks` then a blockquote: source link into the `DEVELOPMENT_PLAN.md` phase anchor · `Total tasks: M` · `Progress: 🔴 0 / M done (0%)` · the status legend.
2. **Task index** — a JIRA-style table: `| ID | Task | Status | Priority | Size | Depends on |`. IDs are `PNN-n` (e.g. `P14-3`). Status ∈ {🔴 🟡 🔵 🟢 ⚪}. Priority ∈ {High, Medium, Low}. Size ∈ {XS, S, M, L}. Depends-on = comma-separated IDs / a phase reference / `—`.
3. **Task blocks** — one `## PNN-n — Title` per task, with bullet metadata (Status/Priority/Size/Depends-on) then `### Description`, `### Acceptance Criteria` (checkboxes), `### Files to create/modify` (path bullets), `### Agent Execution Prompt` (a blockquote: Role · Context · Objective · Steps · Constraints · Verification), and `### Completion Protocol` (numbered).
4. **Completion log** — a bottom `## Completion log` appended one line per finished task (`PNN-n done YYYY-MM-DD — one-liner`).

### Completion Protocol (per task)

1. Set the task's row Status to 🟢 Done.
2. Tick every Acceptance Criteria checkbox.
3. Update the task's row in the Task index.
4. Increment the file header's Progress counter.
5. Update the matching `DEVELOPMENT_PLAN.md` Progress Summary row (Done/Total, %, Status).
6. Recompute Overall progress (sum across all 133 tasks).
7. Append a line to this phase's Completion log.

When a phase reaches 100%, flip its Progress-Summary row to 🟢 Done. **Never** mark a task done with failing verification.

## Status legend

🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

**Rules:** only **one** 🟡 In Progress task per phase at a time; never start a task until every dependency is 🟢 Done.

## Execution order

Follow the [Phase Map](../DEVELOPMENT_PLAN.md#1-phase-map--dependencies). Backend 0→10 is mostly linear; the frontend track (11→13) parallelizes once the `logs/` API (Phase 10) exists; the quality track (14→18) consolidates and hardens the gates after both apps are feature-complete (though every feature ships with its own tests).
