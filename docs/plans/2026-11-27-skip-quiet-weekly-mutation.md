# Plan: skip the weekly full mutation run when main has no new commit (#48)

> **Date:** 2026-11-27 · **Scope:** `.github/workflows/mutation-nightly.yml`, `.github/workflows/ci.yml` (job `e2e-web`)

## Problem

`main` has not changed since 2026-08-07 (`e682016`), yet `mutation-nightly.yml` ran every Monday since then on that same commit: 16 runs, about 23 to 38 runner minutes each, every one measuring the code it measured the week before. The repository is public, so these minutes do not count against the organization's Actions quota, but the runs give no new information.

## Change

- A new `changed` job, with `actions: read` only, compares the commit of a scheduled run with the commit of the last run of this workflow on `main` that finished with a verdict (success or failure). When they are equal it sets `run=false` and both `full-api` and `full-web` are skipped.
- A manual dispatch always measures.
- The comparison counts a failed run, not only a successful one. A full cold run of the same commit gives the same verdict, so measuring an unchanged failure again every week adds nothing; a manual run re-measures when needed (a flaky runner, an infrastructure error).
- Prose: `CHANGELOG.md` and `docs/stryker/IMPLEMENTATION_PLAN.md`.

## Fixes in the same change

- `full-api` failed in about 30 seconds every week since 2026-08-10 with `SyntaxError: Cannot use import statement outside a module` in Stryker's dry run, while `mutation.yml` passed on the same commit. Cause: the job called `stryker run` directly and lost the `NODE_OPTIONS=--experimental-vm-modules` that the package script sets for the ESM ts-jest setup. The job now calls `pnpm run mutation --force`, as `mutation.yml` already calls the incremental script.
- The drift-issue step failed too, because the `mutation-drift` label did not exist, so no drift issue was ever opened. The step now creates the label first (`gh label create --force`).
- `E2E — apps/web` in `ci.yml` failed on this pull request because `ubuntu-latest` now resolves to `ubuntu-26.04`, where Playwright 1.60 cannot install Chromium. The job is pinned to `ubuntu-24.04` until a Playwright release supports the new image.

## Risks

- A failure caused by something outside the repository (a runner image change) is not retried on the next Monday. Mitigation: the first commit on `main` or a manual dispatch runs it again.

## Estimated saving

About 37 runner minutes per Monday while `main` stays unchanged.
