/**
 * @fileoverview Pure helpers that turn an alert-rule draft into (a) the readable
 * `expr` string persisted on `AlertRule.expr` and (b) the equivalent Loki ruler
 * YAML shown beside the form as a teaching device ("verify in Grafana").
 *
 * No I/O — every function is deterministic so it is trivially unit- and
 * mutation-testable. The rule shapes mirror `DASHBOARD.md` §9 (error spike / any
 * FATAL / specific failure / heartbeat-absence).
 *
 * @module lib/ruler-yaml
 */

import type { LogLevel } from '@bymax-one/nest-logger/shared'

/** Aggregation metric — raw count over a window or per-second rate. */
export type AlertMetric = 'count' | 'rate'

/** Threshold comparison operator. */
export type AlertComparator = '>' | '>=' | '==' | '<'

/** Alert severity — drives notification routing. */
export type AlertSeverity = 'critical' | 'warning'

/**
 * The editable rule shape behind the form. `levels` + `logKey` are the subject
 * filters; `shouldGroupByLogKey` adds a `by (logKey)` aggregation (error-spike shape).
 */
export interface RuleDraft {
  /** Human-readable rule name (also the basis of the ruler `alert:` id). */
  name: string
  /** Count over a window, or per-second rate. */
  metric: AlertMetric
  /** Level filter — empty means "any level". */
  levels: LogLevel[]
  /** Optional `logKey` filter (exact `FOO_BAR_BAZ` or `PREFIX_*` wildcard). */
  logKey?: string
  /** Aggregate `by (logKey)` so each key spikes independently. */
  shouldGroupByLogKey: boolean
  /** Comparison operator against the threshold. */
  comparator: AlertComparator
  /** Numeric threshold. */
  threshold: number
  /** Evaluation window (e.g. `5m`). */
  window: string
  /** Sustain duration before firing (e.g. `2m`). */
  forDuration: string
  /** Severity label. */
  severity: AlertSeverity
}

/**
 * Prometheus/Loki duration literal — one or more digits followed by a single
 * unit (`ms`, `s`, `m`, `h`, `d`, `w`, `y`). Mirrors the `window` / `for`
 * grammar the ruler accepts, so an invalid value never reaches the server.
 */
const DURATION_REGEX = /^\d+(ms|s|m|h|d|w|y)$/

/**
 * Validate a Prometheus/Loki duration literal used for the evaluation `window`
 * and the `for` sustain duration (e.g. `5m`, `30s`, `2h`, `500ms`).
 *
 * @param value - The candidate duration string.
 * @returns `true` when `value` is a digit run followed by a single valid unit.
 */
export function isValidDuration(value: string): boolean {
  return DURATION_REGEX.test(value)
}

/** Loki stream selector all rule queries start from (illustrative service label). */
const STREAM_SELECTOR = '{service="api"}'

/** Ruler group name for the example app. */
const RULER_GROUP = 'nest-logger-example'

/**
 * Convert a free-text rule name into a PascalCase ruler `alert:` identifier.
 *
 * @param name - The human rule name.
 * @returns A PascalCase id (falls back to `Alert` when the name has no letters).
 */
export function toAlertId(name: string): string {
  const id = name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return id === '' ? 'Alert' : id
}

/**
 * Build the human-readable `expr` string persisted on `AlertRule.expr`.
 *
 * @param draft - The rule draft.
 * @returns An expression like `count(level in {error,fatal}) by logKey over 5m > 10`.
 */
export function buildExpr(draft: RuleDraft): string {
  const subjectParts: string[] = []
  if (draft.levels.length > 0) subjectParts.push(`level in {${draft.levels.join(',')}}`)
  if (draft.logKey !== undefined && draft.logKey !== '') subjectParts.push(draft.logKey)
  const subject = subjectParts.length > 0 ? subjectParts.join(' and ') : '*'
  const groupBy = draft.shouldGroupByLogKey ? ' by logKey' : ''
  return `${draft.metric}(${subject})${groupBy} over ${draft.window} ${draft.comparator} ${draft.threshold}`
}

/**
 * Build the LogQL pipeline (selector + json + filters) for a draft.
 *
 * @param draft - The rule draft.
 * @returns A LogQL stream pipeline such as `{service="api"} | json | level=~"error|fatal"`.
 */
function buildLogQlPipeline(draft: RuleDraft): string {
  const filters: string[] = [STREAM_SELECTOR, 'json']
  if (draft.levels.length > 0) filters.push(`level=~"${draft.levels.join('|')}"`)
  if (draft.logKey !== undefined && draft.logKey !== '') {
    filters.push(
      draft.logKey.endsWith('*')
        ? `logKey=~"${draft.logKey.slice(0, -1)}.*"`
        : `logKey="${draft.logKey}"`,
    )
  }
  return filters.join(' | ')
}

/**
 * Build the full LogQL alert expression for the ruler YAML.
 *
 * @param draft - The rule draft.
 * @returns A LogQL expression, e.g.
 *   `sum by (logKey) (count_over_time({service="api"} | json | level=~"error|fatal" [5m])) > 10`.
 */
export function buildLogQlExpr(draft: RuleDraft): string {
  const pipeline = buildLogQlPipeline(draft)
  const range = `${pipeline} [${draft.window}]`
  const aggregated = draft.metric === 'rate' ? `rate(${range})` : `count_over_time(${range})`
  const grouped = draft.shouldGroupByLogKey ? `sum by (logKey) (${aggregated})` : aggregated
  return `${grouped} ${draft.comparator} ${draft.threshold}`
}

/**
 * Render the equivalent Loki ruler YAML group for a draft.
 *
 * @param draft - The rule draft.
 * @returns A `groups:` YAML document mirroring the rule (alert/expr/for/labels/annotations).
 */
export function ruleToRulerYaml(draft: RuleDraft): string {
  const alertId = toAlertId(draft.name)
  const expr = buildLogQlExpr(draft)
  const summary = draft.shouldGroupByLogKey
    ? `logKey {{ $labels.logKey }} ${draft.metric} breached`
    : `${draft.name} ${draft.metric} breached`
  // The summary lives inside a single-quoted YAML scalar; `draft.name` is free
  // text, so a literal single quote would terminate the scalar early. Escape it
  // per the YAML spec by doubling each quote.
  const escapedSummary = summary.replace(/'/g, "''")
  return [
    'groups:',
    `  - name: ${RULER_GROUP}`,
    '    rules:',
    `      - alert: ${alertId}`,
    '        expr: |',
    `          ${expr}`,
    `        for: ${draft.forDuration}`,
    `        labels: { severity: ${draft.severity} }`,
    `        annotations: { summary: '${escapedSummary}' }`,
    '',
  ].join('\n')
}

/** The four canonical preset shapes from `DASHBOARD.md` §9. */
export const RULE_PRESETS: ReadonlyArray<{ id: string; label: string; draft: RuleDraft }> = [
  {
    id: 'error-spike',
    label: 'Error spike',
    draft: {
      name: 'Error spike by logKey',
      metric: 'count',
      levels: ['error', 'fatal'],
      shouldGroupByLogKey: true,
      comparator: '>',
      threshold: 10,
      window: '5m',
      forDuration: '2m',
      severity: 'critical',
    },
  },
  {
    id: 'any-fatal',
    label: 'Any FATAL',
    draft: {
      name: 'Any fatal log',
      metric: 'count',
      levels: ['fatal'],
      shouldGroupByLogKey: false,
      comparator: '>=',
      threshold: 1,
      window: '1m',
      forDuration: '1m',
      severity: 'critical',
    },
  },
  {
    id: 'specific-failure',
    label: 'Specific failure',
    draft: {
      name: 'Payment charge failures',
      metric: 'rate',
      levels: [],
      logKey: 'PAYMENT_CHARGE_FAILED',
      shouldGroupByLogKey: false,
      comparator: '>',
      threshold: 1,
      window: '5m',
      forDuration: '2m',
      severity: 'warning',
    },
  },
  {
    id: 'heartbeat',
    label: 'Heartbeat / absence',
    draft: {
      name: 'Success heartbeat absence',
      metric: 'count',
      levels: [],
      logKey: 'HTTP_REQUEST_SUCCESS',
      shouldGroupByLogKey: false,
      comparator: '==',
      threshold: 0,
      window: '10m',
      forDuration: '1m',
      severity: 'critical',
    },
  },
]
