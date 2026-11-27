# Plan: skip the weekly full mutation run when main has no new commit (#48)

> **Date:** 2026-11-27 · **Scope:** `.github/workflows/mutation-nightly.yml`

## Problem

`main` has not changed since 2026-08-07 (`e682016`), yet `mutation-nightly.yml` ran every Monday since then on that same commit: 16 runs, about 23 to 38 runner minutes each, every one measuring the code it measured the week before. The repository is public, so these minutes do not count against the organization's Actions quota, but the runs give no new information.

## Change

- A new `changed` job, with `actions: read` only, compares the commit of a scheduled run with the commit of the last run of this workflow on `main` that finished with a verdict (success or failure). When they are equal it sets `run=false` and both `full-api` and `full-web` are skipped.
- A manual dispatch always measures.
- The comparison counts a failed run, not only a successful one. A full cold run of the same commit gives the same verdict, so measuring an unchanged failure again every week adds nothing; a manual run re-measures when needed (a flaky runner, an infrastructure error).
- Prose: `CHANGELOG.md` and `docs/stryker/IMPLEMENTATION_PLAN.md`.

## Out of scope (reported separately)

- `full-api` has failed in about 30 seconds every week since 2026-08-10 with `SyntaxError: Cannot use import statement outside a module` in Stryker's dry run, while `mutation.yml` passed on the same commit.
- The drift-issue step fails too, because the `mutation-drift` label does not exist in the repository, so no drift issue was ever opened.

## Risks

- A failure caused by something outside the repository (a runner image change) is not retried on the next Monday. Mitigation: the first commit on `main` or a manual dispatch runs it again.

## Estimated saving

About 37 runner minutes per Monday while `main` stays unchanged.
