/**
 * @fileoverview Playwright configuration for the dashboard end-to-end journeys.
 *
 * Targets the local `apps/web` dev server (port 3003) and asserts the
 * acceptance flows against a live stack (`pnpm infra:up` + `apps/api` +
 * `apps/worker` must already be running). The web server is auto-started here and
 * reused if already up; the API/worker are started out-of-band.
 *
 * @module playwright.config
 */
import { defineConfig, devices } from '@playwright/test'

/** Web dashboard origin under test. */
const WEB_URL = 'http://localhost:3003'

export default defineConfig({
  testDir: './e2e',
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
  webServer: {
    command: 'pnpm dev',
    url: WEB_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
