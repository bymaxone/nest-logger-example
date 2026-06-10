# Stryker — Run History

Append-only. Newest run on top. One row per `pnpm mutation` (or incremental) run.

See [BASELINE.md](./BASELINE.md) for the pre-hardening snapshot and
[DEVELOPMENT_PLAN Appendix C](../DEVELOPMENT_PLAN.md#appendix-c--quality-gates) for threshold rationale.

| Date       | Workspace | Score   | Killed | Survived | Timeout | No-cov | Ignored | Note                                                    |
| ---------- | --------- | ------- | ------ | -------- | ------- | ------ | ------- | ------------------------------------------------------- |
| 2026-06-09 | apps/api  | 100.00% | 1258   | 0        | 9       | 0      | 85      | final green run — P15-6 hardening complete (break: 100) |
| 2026-06-09 | apps/web  | 90.24%  | 2857   | 307      | 0       | 2      | 0       | stable baseline — meets break: 90                       |
| 2026-06-09 | apps/api  | 96.57%  | 1284   | 46       | 12      | 0      | 0       | baseline (pre-hardening)                                |
| 2026-06-09 | apps/web  | 90.24%  | 2857   | 307      | 0       | 2      | 0       | baseline (pre-hardening)                                |
