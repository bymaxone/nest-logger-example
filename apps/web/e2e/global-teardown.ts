/**
 * @fileoverview Playwright global teardown — optionally stops the Docker stack.
 *
 * The Docker stack is LEFT RUNNING by default so repeated `pnpm test:e2e:web`
 * runs reuse it (fast — the `webServer` entries reattach via `reuseExistingServer`).
 * Set `E2E_TEARDOWN=1` to bring the Docker stack down after the run (e.g. a
 * one-shot CI invocation that should leave nothing behind).
 *
 * @module e2e/global-teardown
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Repo root — where `docker compose` resolves the compose file. */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * Stop the Docker stack only when `E2E_TEARDOWN=1` is set; otherwise leave it up.
 *
 * @returns Nothing.
 */
export default function globalTeardown(): void {
  if (process.env.E2E_TEARDOWN !== '1') return
  // The journeys run against the dedicated test stack — tear that one down, not the dev stack.
  execSync('docker compose -f docker-compose.test.yml down -v', { cwd: ROOT, stdio: 'inherit' })
}
