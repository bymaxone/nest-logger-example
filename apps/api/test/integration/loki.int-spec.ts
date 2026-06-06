/**
 * @fileoverview Optional integration tier — a real Loki round-trip.
 *
 * Points the `LokiDestination` at the dedicated test-stack Loki (the `loki` service
 * in `docker-compose.test.yml`, project `nest-logger-example-test`, exposed on
 * 127.0.0.1:53100), pushes one line, and asserts the line is queryable back through
 * Loki's LogQL `query_range` API. This proves end-to-end log delivery against a real
 * aggregator without the ephemeral-container overhead of Testcontainers.
 *
 * This tier is OPT-IN and excluded from the hermetic default suites (it matches the
 * `*.int-spec.ts` pattern, run only by `pnpm --filter api test:int`). Bring the test
 * stack up first with `pnpm infra:test:up` (the root `pnpm test:int:api` does this for
 * you); when it is not running the default `test` / `test:cov` / `test:e2e` runs are
 * unaffected.
 *
 * @module test/integration/loki.int-spec
 */
import { describe, expect, it } from '@jest/globals'

import { LokiDestination } from '../../src/destinations/loki.destination.js'

/** Dedicated test-stack Loki base URL (matches docker-compose.test.yml). */
const LOKI_BASE_URL = 'http://127.0.0.1:53100'

/**
 * The stream label the destination pushes under. Derived the SAME way
 * `LokiDestination.flush()` derives it (`OTEL_SERVICE_NAME` with the same default)
 * so a set `OTEL_SERVICE_NAME` in the test process can't make the LogQL query miss.
 */
const SERVICE_LABEL = process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-api'

describe('LokiDestination → real Loki round-trip', () => {
  it('pushes a line and reads it back via LogQL query_range', async () => {
    /**
     * The destination's batched push must land in Loki such that a LogQL
     * `query_range` for its `service` stream returns the exact line — proving
     * the nanosecond-string timestamps and stream shape are wire-compatible
     * with a real aggregator, not just a mocked `fetch`.
     */
    const dest = new LokiDestination({ url: `${LOKI_BASE_URL}/loki/api/v1/push`, batchSize: 1 })
    dest.onInit()
    const line = '{"level":30,"logKey":"INT_LOKI_OK","msg":"hello loki"}'
    dest.write(`${line}\n`)
    await dest.onShutdown() // force the final flush

    const end = BigInt(Date.now()) * 1_000_000n
    const start = end - 60n * 1_000_000_000n // last 60s
    const query = encodeURIComponent(`{service="${SERVICE_LABEL}"}`)

    // Loki indexes asynchronously; poll a few times before asserting.
    let found = false
    for (let attempt = 0; attempt < 20 && !found; attempt++) {
      const res = await fetch(
        `${LOKI_BASE_URL}/loki/api/v1/query_range?query=${query}&start=${start}&end=${end}&limit=100`,
      )
      const body = (await res.json()) as {
        data?: { result?: Array<{ values?: Array<[string, string]> }> }
      }
      const values = body.data?.result?.flatMap((r) => r.values ?? []) ?? []
      found = values.some(([, value]) => value.includes('INT_LOKI_OK'))
      if (!found) await new Promise((r) => setTimeout(r, 500))
    }

    expect(found).toBe(true)
  }, 60_000)
})
