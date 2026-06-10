# Stryker — Baseline (pre-hardening)

First mutation measurement, recorded before the P15-6 hardening pass.
Source config: `apps/api/stryker.config.json`, `apps/web/stryker.config.json`.

See [Phase 15 tasks](../tasks/phase-15-mutation.md) and
[DEVELOPMENT_PLAN Appendix C](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates).

---

## apps/api — 2026-06-09 (pre-hardening)

| Metric          | Value               |
| --------------- | ------------------- |
| Mutation score  | 96.57%              |
| Killed          | 1284                |
| Survived        | 46                  |
| Timeout         | 12                  |
| No coverage     | 0                   |
| Ignored         | 0                   |
| Break threshold | 100                 |
| Exit code       | 1 (below threshold) |

### Survivors by file (pre-hardening)

| File                                     | Survived | Mutator(s)                                                            |
| ---------------------------------------- | -------- | --------------------------------------------------------------------- |
| `alerts/alerts.evaluator.service.ts`     | 6        | Regex, ArrayDeclaration, StringLiteral, ConditionalExpression         |
| `alerts/channel-router.service.ts`       | 3        | StringLiteral                                                         |
| `config/env.schema.ts`                   | 1        | StringLiteral                                                         |
| `destinations/loki.destination.ts`       | 1        | StringLiteral                                                         |
| `destinations/prisma-log.destination.ts` | 3        | ConditionalExpression                                                 |
| `governance/rbac.context.ts`             | 1        | StringLiteral                                                         |
| `governance/retention.sweep.service.ts`  | 1        | StringLiteral                                                         |
| `logs/log-event.bus.ts`                  | 10       | ConditionalExpression, LogicalOperator, BlockStatement, StringLiteral |
| `logs/logs.aggregate.service.ts`         | 1        | ConditionalExpression                                                 |
| `logs/logs.export.service.ts`            | 10       | ConditionalExpression, EqualityOperator, ArithmeticOperator           |
| `logs/logs.service.ts`                   | 4        | MethodExpression, StringLiteral                                       |
| `trigger/trigger.controller.ts`          | 1        | ConditionalExpression                                                 |
| `prisma/prisma.service.ts`               | 1        | ArrayDeclaration                                                      |

All 46 survivors are equivalent mutants — no behavioral difference is observable through the test suite. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md#equivalent-mutants-documented-accepted) for the rationale of each.

---

## apps/web — 2026-06-09 (pre-hardening)

| Metric          | Value               |
| --------------- | ------------------- |
| Mutation score  | 90.24%              |
| Killed          | 2857                |
| Survived        | 307                 |
| Timeout         | 0                   |
| No coverage     | 2                   |
| Ignored         | 0                   |
| Break threshold | 90                  |
| Exit code       | 0 (meets threshold) |

The `apps/web` workspace targets `break: 90` per Appendix C (100% UI mutation is over-engineered; `lib/**` is held at 100 by the hardening pass while `components/**` is floored at 90). The 307 survivors in `components/**` are acceptable UI-rendering variants that do not affect observable user behavior.
