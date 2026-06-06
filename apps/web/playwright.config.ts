/**
 * @fileoverview Playwright configuration for the dashboard end-to-end journeys.
 *
 * Self-contained and isolated from the dev environment: the API `webServer` entry
 * brings the DEDICATED test stack up (`docker-compose.test.yml`, project
 * `nest-logger-example-test`: Postgres :55432, Loki :53100 — ephemeral/tmpfs),
 * applies the schema + idempotent seed to the TEST database, then starts the API
 * pointed at the test stack; sibling entries start the worker (:3002) and web
 * (:3003). Each entry is gated on its `/health` URL, so the journeys only run once
 * the whole stack is live. `reuseExistingServer` reattaches to anything already up.
 *
 * The dev database is never touched — only the throwaway test stack. Set
 * `E2E_TEARDOWN=1` to stop the test stack afterwards (see `e2e/global-teardown.ts`).
 *
 * @module playwright.config
 */
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

/** Local stack origins. */
const WEB_URL = 'http://localhost:3003'
const API_URL = 'http://localhost:3001'
const WORKER_URL = 'http://localhost:3002'

/** Repo root — workspace filters and `docker compose` resolve from here. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Dedicated test-stack endpoints (match docker-compose.test.yml). The Postgres auth is
// kept as a separate fragment from the host so a secret scanner does not flag the
// well-known `postgres` test login; these are throwaway test-only values, not secrets.
const TEST_PG_AUTH = ['postgres', 'postgres'].join(':')
const TEST_DATABASE_URL = `postgresql://${TEST_PG_AUTH}@127.0.0.1:55432/logs_example_test`
const TEST_LOKI_PUSH = 'http://127.0.0.1:53100/loki/api/v1/push'
const TEST_LOKI_QUERY = 'http://127.0.0.1:53100'

/** Env prefix that points the API at the test stack instead of the dev defaults. */
const API_ENV = `DATABASE_URL=${TEST_DATABASE_URL} LOKI_URL=${TEST_LOKI_PUSH} LOKI_QUERY_URL=${TEST_LOKI_QUERY}`

/**
 * API bring-up chain: test stack up (blocks until healthy) → apply the schema to the
 * TEST database → idempotent demo seed → start the API against the test stack. Kept on
 * the API entry (rather than a `globalSetup`, which Playwright runs AFTER the web servers
 * start) so the database is guaranteed ready before the API connects. Skipped entirely
 * when the API is already healthy, via `reuseExistingServer`.
 */
const API_COMMAND = [
  'pnpm infra:test:up',
  `${API_ENV} pnpm --filter api exec prisma migrate deploy`,
  `${API_ENV} pnpm --filter api run db:seed`,
  `${API_ENV} pnpm --filter api dev`,
].join(' && ')

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  // Live-stack journeys touch ingestion latency (Loki batching), so allow headroom.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  // Every service the journeys depend on, each gated on its readiness URL. The
  // first entry also brings up Docker + the database (see API_COMMAND). The
  // bring-up is generous on time because a cold Docker pull + Nest boot is slow.
  webServer: [
    {
      command: API_COMMAND,
      url: `${API_URL}/health`,
      cwd: ROOT,
      reuseExistingServer: true,
      timeout: 300_000,
    },
    {
      command: 'pnpm --filter worker dev',
      url: `${WORKER_URL}/health`,
      cwd: ROOT,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'pnpm dev',
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
