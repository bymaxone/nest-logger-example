/**
 * @fileoverview Mutation-killing tests for the feature-info registry.
 *
 * The registry is a module-level `const`, and the mutation runner uses
 * `ignoreStatic`, so a top-level `import` would read the ORIGINAL values once —
 * before the per-test mutant is activated — and never observe the mutation. To
 * actually exercise each mutant, every test re-evaluates the module with
 * `vi.resetModules()` + a dynamic `import()`, then asserts the concrete title,
 * summary and fully-rendered body text of each entry. Exact string equality
 * kills the title/summary string-literal mutants and (because real props are
 * read) the entry object-literal mutants; full body-text equality kills every
 * prose string-literal mutant since dropping any paragraph changes the
 * concatenated text.
 *
 * @module components/common/feature-info-content.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import type { FeatureInfoId } from '@/components/common/feature-info-content'

beforeEach(() => {
  // Force a fresh module evaluation so the active mutant is observed.
  vi.resetModules()
})

afterEach(() => {
  cleanup()
})

/** Re-import the registry under the active mutant rather than reading a cached copy. */
async function loadRegistry() {
  return (await import('@/components/common/feature-info-content')).FEATURE_INFO
}

/** Render an entry's body and return its normalized concatenated text. */
function bodyText(node: React.ReactNode): string {
  const { container } = render(<>{node}</>)
  return container.textContent ?? ''
}

/** The exact title, summary and full body text for every registered entry. */
const EXPECTED: Record<FeatureInfoId, { title: string; summary: string; body: string }> = {
  traffic: {
    title: 'Traffic',
    summary: 'Requests per minute over the selected window.',
    body:
      `Throughput — the "Rate" in the RED method. It is the total count of HTTP request logs divided by the window length, so the number stays comparable whether you look at 5 minutes or 24 hours.` +
      `The sparkline is the per-bucket request count; the Δ badge compares the recent half of the window against the earlier half to show the direction of travel.`,
  },
  errors: {
    title: 'Errors',
    summary: 'Share of requests that failed (4xx + 5xx).',
    body:
      `The "Errors" signal in RED: (4xx + 5xx) responses divided by total requests across the window. It is a ratio, not a raw count, so a traffic spike can't hide a rising failure rate.` +
      `The tile turns red above the 1% threshold. Split client vs server errors in the Error-rate panel below.`,
  },
  latency: {
    title: 'Latency',
    summary: 'Tail latency — the mean p95 across the window.',
    body:
      `The "Duration" signal in RED, reported as a percentile rather than an average — an average hides the slow tail that users actually feel.` +
      `This tile shows the mean of each bucket's p95 (≈p95). The panel below breaks latency out into p50 / p95 / p99 so you can see the whole distribution.`,
  },
  fatalError: {
    title: 'Fatal + Error',
    summary: 'Count of error- and fatal-level records in the window.',
    body:
      `How many error+ and fatal log records landed in the window. Any non-zero value turns the tile red — these are the records an on-call engineer should look at first.` +
      `Use the Levels donut or the Explorer to see which logKeys drove the count.`,
  },
  slo: {
    title: 'SLO & error budget',
    summary: 'Budget remaining against a 99.9% target.',
    body:
      `A 30-day availability SLO of 99.9% permits a 0.1% error budget. Burn rate = the current error rate ÷ that budget; the bar shows how much budget is left.` +
      `The badges (14.4×, 6×, 1×) are the standard multi-window burn-rate alert thresholds — a sustained 14.4× burn would exhaust a month's budget in about two days. They light up when breached.`,
  },
  logVolume: {
    title: 'Log volume',
    summary: 'Every record over time, stacked by level.',
    body:
      `The signature panel: log volume per time bucket, stacked and coloured by level (trace at the base up to fatal). It answers "how much, of what severity, when".` +
      `Drag the brush along the bottom to set a time range. That selection lifts to the URL and re-scopes every other panel and the Explorer — the core "brush to filter" move.`,
  },
  requests: {
    title: 'Requests / min (RED — Rate)',
    summary: 'HTTP request throughput per bucket.',
    body:
      `Request volume per time bucket, derived server-side from the status-class mix — the sum of 2xx/3xx/4xx/5xx equals the count of HTTP request logs, so no raw rows are crunched in the browser.` +
      `The Traffic tile normalises this same series to requests per minute.`,
  },
  errorRate: {
    title: 'Error rate (RED — Errors)',
    summary: '4xx vs 5xx as a percentage of requests.',
    body:
      `Two lines: client errors (4xx) and server errors (5xx), each as a percentage of the requests in that bucket. The dashed line marks the 1% threshold.` +
      `Separating them matters: 5xx is your service failing, 4xx is the caller sending bad requests — different owners, different fixes.`,
  },
  latencyDuration: {
    title: 'Latency p50 / p95 / p99 (RED — Duration)',
    summary: 'Latency percentiles per bucket, in milliseconds.',
    body:
      `Computed server-side with percentile_cont — never an average. p50 is the typical request, p95 the slow ones, p99 the tail your unhappiest users hit.` +
      `When the lines spread apart, latency is becoming inconsistent even if the median looks fine.`,
  },
  latencyHeatmap: {
    title: 'Latency heatmap',
    summary: 'Where latency concentrates, plus slow-method count.',
    body:
      `The aggregate API exposes percentiles, not a raw histogram, so this is a percentile-band heatmap: three rows (p50 / p95 / p99), one cell per bucket, redder where the value is high relative to the window's maximum.` +
      `"Slow reqs" counts the ` +
      `METHOD_SLOW_EXECUTION` +
      ` logKey the library emits whenever a @LogPerformance-decorated method runs past its threshold.`,
  },
  levels: {
    title: 'Levels',
    summary: 'Log count by level — click a slice to filter.',
    body:
      `A donut of the volume aggregate grouped by level, coloured with the shared severity scale. It shows the severity mix at a glance.` +
      `Click any slice to pivot the whole dashboard (and the Explorer) to that level via the URL.`,
  },
  topLogKeys: {
    title: 'Top logKeys',
    summary: 'The busiest event types — click to filter.',
    body:
      `logKey is the library's stable, machine-readable event identifier (for example ` +
      `HTTP_REQUEST_SUCCESS` +
      `) — far more useful than free-text messages for grouping.` +
      `This ranks the most frequent keys in the window from server-side facet counts. Click a bar to filter to it.`,
  },
  topErrors: {
    title: 'Top errors',
    summary: 'The most frequent error-level events.',
    body: `The same facet ranking as Top logKeys, but scoped to error+ severity — the quickest way to see what is actually failing. Click a bar to open those records in the Explorer.`,
  },
  statusMix: {
    title: 'Status mix',
    summary: 'HTTP responses by status class.',
    body:
      `Stacked 2xx / 3xx / 4xx / 5xx counts per bucket. A healthy service is mostly green (2xx); widening amber and red bands are client and server errors.` +
      `This is the raw source the Requests and Error-rate panels are derived from.`,
  },
  topTenants: {
    title: 'Top tenants',
    summary: 'Busiest tenants in a multi-tenant deployment.',
    body: `Ranks log volume by tenantId, with the long tail rolled into an "other" bar. It surfaces noisy-neighbour tenants; click one to scope the dashboard to it. Every read is tenant-aware through the shared query builder.`,
  },
  pipelineHealth: {
    title: 'Pipeline health',
    summary: 'Is the logger itself healthy? (fail-soft saturation)',
    body:
      `The library never throws on a logging failure — it degrades gracefully and increments a counter instead. Three of those counters are surfaced here, straight from the library's reserved logKeys:` +
      `LOGGER_DESTINATION_WRITE_FAILED — a destination rejected a write.` +
      `LOGGER_DESTINATION_INIT_FAILED — a destination failed to start.` +
      `LOGGER_ENTRY_TRUNCATED — an oversized entry was capped.` +
      `Zero is healthy. The Trigger Center's fault-inject card makes them climb so you can watch the signal move.`,
  },
  facets: {
    title: 'Facets',
    summary: 'Server-computed value counts — click to filter.',
    body:
      `Counts for level, service, logKey and tenant, computed on the server (never in the browser). Click a value to add a filter; Alt/⌥-click clears that field.` +
      `Counts come from the durable Postgres warn+ tier, so when the source is Loki they describe the warn+ subset of the info+ rows shown in the table.`,
  },
  queryDsl: {
    title: 'Query language',
    summary: 'A compact filter syntax, compiled server-side.',
    body:
      `Filter with a small DSL — for example ` +
      `level:error logKey:PAYMENT_* tenantId:acme msg ~ "refund"` +
      `. It compiles on the server to both SQL (Postgres) and LogQL (Loki); the "generated SQL / LogQL" links show exactly what runs.` +
      `Results page with keyset cursors rather than OFFSET, so deep paging stays fast no matter how far you scroll.`,
  },
  volumeBrush: {
    title: 'Volume & time range',
    summary: 'Drag the brush to set the window.',
    body: `The same stacked-volume timeseries as the Overview. Drag the brush to select a window; the selection lifts to the URL and re-scopes the facets, the table and every metric on the page.`,
  },
  logTable: {
    title: 'Log table',
    summary: 'The raw records, virtualized.',
    body:
      `A windowed (virtualized) table so tens of thousands of rows scroll smoothly. Columns are time, level, logKey, service and message; sorting and paging happen server-side.` +
      `Click any row to open the full structured record — every field, trace id and tenant — in the detail drawer.`,
  },
  liveTail: {
    title: 'Live tail',
    summary: 'Real-time streaming over Server-Sent Events.',
    body:
      `Turn on Live to stream new records as they arrive. The API's event-bus destination publishes each line to an @Sse endpoint, proxied same-origin at ` +
      `/api/logs/stream` +
      ` and consumed by the browser's EventSource.` +
      `Follow mode auto-scrolls; pause to inspect without losing your place. On reconnect it resumes from the last event id, so nothing is dropped.`,
  },
  triggerCenter: {
    title: 'Trigger Center',
    summary: 'Fire real library features on demand.',
    body:
      `Each card calls a backend endpoint that exercises one logger capability, then deep-links to the Explorer so you can see exactly what landed.` +
      `Covered: level mapping, structured success, error-with-stack, PII redaction (flat and deep), header redaction, oversized-entry truncation, slow-method timing, HTTP status mapping, cross-service correlation, fault injection and load bursts.`,
  },
  alertRules: {
    title: 'Alert rules',
    summary: 'Log-based alerting, authored against the query layer.',
    body:
      `Define a rule with a metric (count or rate), a severity, the levels to match, an optional logKey pattern, and comparator / threshold / window / for. The panel compiles it to the equivalent Loki ruler YAML shown alongside.` +
      `Scoped demo: here a NestJS cron evaluates the rule over the /logs layer; in production you would run the Loki ruler into Alertmanager.`,
  },
  channels: {
    title: 'Notification channels',
    summary: 'Where a firing rule is delivered.',
    body: `Delivery targets — Slack, email or webhook — bound to a rule's severity. Mockable in the demo so you can see the routing without wiring real secrets.`,
  },
  incidents: {
    title: 'Incidents',
    summary: 'The alert lifecycle and on-call surface.',
    body: `When a rule fires it opens an incident you can acknowledge, snooze or resolve, with a timeline of every state change. This is the human side of alerting: who saw it, who silenced it, and when it cleared.`,
  },
  retention: {
    title: 'Postgres TTL sweep',
    summary: 'Time-based retention of the durable tier.',
    body:
      `The durable warn+ tier is swept on a TTL (operator/admin only). The panel shows the current window, the next sweep time and how many rows are pending deletion.` +
      `Two tiers by design: Postgres holds the durable audit tier swept here, while Loki holds the full-fidelity aggregation tier with its own retention.`,
  },
  lokiRetention: {
    title: 'Loki retention',
    summary: 'Read-only echo of the Loki policy.',
    body: `Reflects Loki's configured retention_period. The compactor runs with retention_enabled and a delete-request store, so this is a real, enforced policy — not a placeholder no-op.`,
  },
  export: {
    title: 'Export',
    summary: 'Download the current result set.',
    body:
      `Exports exactly what the Explorer query currently matches, scoped to the active tenant, as JSON or CSV (columns: time, level, logKey, service, requestId, traceId, tenantId, msg).` +
      `Capped at 100,000 rows — beyond that the export is truncated and flagged, the same shape as Datadog's export limit. Production tools stream larger exports to object storage.`,
  },
  rbac: {
    title: 'Role-based access',
    summary: 'Header-driven roles and grants (demo).',
    body:
      `Three roles — viewer, operator, admin — gate reads, exports, incident actions and governance. Switching tenant injects a tenantId restriction into the shared /logs query builder.` +
      `Demo only: the role rides in a request header and is meant to hard-fail closed in production. Wire real authentication before relying on it.`,
  },
  redaction: {
    title: 'Redaction at source',
    summary: 'Secrets are scrubbed before they are stored.',
    body:
      `The library redacts in-process with fast-redact (113 default paths) before a line ever leaves the service, so sensitive values are never written to either store. The hero shows the same record in Postgres and Loki — both already [REDACTED].` +
      `Unlike Datadog SDS or OTel-collector redaction, which scrub after ingest, there is no window where the raw value exists at rest.`,
  },
  audit: {
    title: 'Audit trail',
    summary: 'Who did what, recorded.',
    body: `An append-only trail of privileged actions — actor, action, resource and result — so retention changes, exports and incident actions stay accountable. Viewers can read it; admins see everything.`,
  },
  endpoints: {
    title: 'Backend endpoints',
    summary: 'How the dashboard is wired.',
    body: `The services this UI talks to: the Logs read-API, the Grafana instance for traces and dashboards, and the live-tail SSE stream (same-origin proxied). All configured through environment variables.`,
  },
  logTiers: {
    title: 'Log tiers',
    summary: 'Two storage tiers, on purpose.',
    body:
      `Loki keeps the full info+ stream for high-fidelity aggregation; Postgres keeps a durable warn+ tier for audit and TTL-based retention.` +
      `The volumes differ by design — switch the source in the top bar to compare what each tier answers.`,
  },
  accessRoles: {
    title: 'Access roles',
    summary: 'What each role can do.',
    body: `viewer reads logs and aggregates; operator adds redaction governance; admin adds the audit trail and maintenance. The active role is chosen in the top bar for the demo — in production these map to your identity provider.`,
  },
}

describe('FEATURE_INFO registry (re-imported per test)', () => {
  const ids = Object.keys(EXPECTED) as FeatureInfoId[]

  for (const id of ids) {
    // Each entry's title, summary (kills string + object-literal mutants) and
    // full body text (kills every prose string-literal mutant) must match exactly.
    it(`entry "${id}" exposes the exact title, summary and body text`, async () => {
      const reg = await loadRegistry()
      const entry = reg[id]
      const expected = EXPECTED[id]
      expect(entry.title).toBe(expected.title)
      expect(entry.summary).toBe(expected.summary)
      expect(bodyText(entry.body)).toBe(expected.body)
    })
  }

  // The registry must register exactly the documented set of ids — no more, no fewer.
  it('registers exactly the expected set of feature ids', async () => {
    const reg = await loadRegistry()
    expect(Object.keys(reg).sort()).toEqual([...ids].sort())
  })

  // Entries whose body uses the inline <Code> component must render their token
  // inside a <code> element, exercising the Code render path directly.
  it('renders inline <Code> tokens inside a <code> element', async () => {
    const reg = await loadRegistry()
    const codeTokens: Array<[FeatureInfoId, string]> = [
      ['latencyHeatmap', 'METHOD_SLOW_EXECUTION'],
      ['topLogKeys', 'HTTP_REQUEST_SUCCESS'],
      ['queryDsl', 'level:error logKey:PAYMENT_* tenantId:acme msg ~ "refund"'],
      ['liveTail', '/api/logs/stream'],
      ['pipelineHealth', 'LOGGER_DESTINATION_WRITE_FAILED'],
      ['pipelineHealth', 'LOGGER_DESTINATION_INIT_FAILED'],
      ['pipelineHealth', 'LOGGER_ENTRY_TRUNCATED'],
    ]
    for (const [id, token] of codeTokens) {
      const { container } = render(<>{reg[id].body}</>)
      const codes = Array.from(container.querySelectorAll('code')).map((el) => el.textContent)
      expect(codes).toContain(token)
    }
  })
})
