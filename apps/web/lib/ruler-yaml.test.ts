/**
 * @fileoverview Unit tests for the pure ruler-YAML helpers — the persisted `expr`
 * string, the LogQL expression (count vs rate), and the rendered ruler group.
 *
 * @module lib/ruler-yaml.test
 */
import { describe, expect, it } from 'vitest'

import {
  buildExpr,
  buildLogQlExpr,
  isValidDuration,
  RULE_PRESETS,
  ruleToRulerYaml,
  type RuleDraft,
  toAlertId,
} from './ruler-yaml'

/** Look up a preset draft by its id (presets are the canonical §9 shapes). */
function preset(id: string): RuleDraft {
  const found = RULE_PRESETS.find((p) => p.id === id)
  if (!found) throw new Error(`missing preset ${id}`)
  return found.draft
}

describe('buildExpr', () => {
  /** The error-spike shape renders a readable count-by-logKey expression. */
  it('renders the error-spike expr', () => {
    expect(buildExpr(preset('error-spike'))).toBe(
      'count(level in {error,fatal}) by logKey over 5m > 10',
    )
  })

  /** A logKey-only rate shape renders the metric and the key subject. */
  it('renders a rate expr for a specific failure', () => {
    expect(buildExpr(preset('specific-failure'))).toBe('rate(PAYMENT_CHARGE_FAILED) over 5m > 1')
  })

  /** The any-fatal preset filters by level only with no by-logKey grouping. */
  it('renders the any-fatal expr (level filter, no grouping)', () => {
    expect(buildExpr(preset('any-fatal'))).toBe('count(level in {fatal}) over 1m >= 1')
  })

  /** The heartbeat preset asserts a key never appears (count == 0 over a window). */
  it('renders the heartbeat absence expr (count == 0)', () => {
    expect(buildExpr(preset('heartbeat'))).toBe('count(HTTP_REQUEST_SUCCESS) over 10m == 0')
  })
})

describe('buildLogQlExpr', () => {
  /** count metric → `count_over_time(...)`, grouped by logKey when requested. */
  it('emits count_over_time with a by-logKey aggregation', () => {
    const expr = buildLogQlExpr(preset('error-spike'))
    expect(expr).toContain('sum by (logKey) (count_over_time(')
    expect(expr).toContain('level=~"error|fatal"')
    expect(expr).toContain('[5m]')
    expect(expr.endsWith('> 10')).toBe(true)
  })

  /** rate metric → `rate(...)` with the exact logKey filter. */
  it('emits rate() for a rate rule', () => {
    const expr = buildLogQlExpr(preset('specific-failure'))
    expect(expr).toContain('rate(')
    expect(expr).toContain('logKey="PAYMENT_CHARGE_FAILED"')
    expect(expr).not.toContain('count_over_time')
  })

  /** A `PREFIX_*` logKey becomes a regex match on the prefix (wildcard branch). */
  it('emits a regex logKey match for a PREFIX_* wildcard', () => {
    const draft: RuleDraft = { ...preset('specific-failure'), logKey: 'PAYMENT_*' }
    const expr = buildLogQlExpr(draft)
    expect(expr).toContain('logKey=~"PAYMENT_.*"')
    expect(expr).not.toContain('logKey="PAYMENT_*"')
  })
})

describe('ruleToRulerYaml', () => {
  /** The ruler group renders the alert id, `for`, and severity label exactly. */
  it('renders the ruler group with for + severity label', () => {
    const yaml = ruleToRulerYaml(preset('error-spike'))
    expect(yaml).toContain('alert: ErrorSpikeByLogKey')
    expect(yaml).toContain('for: 2m')
    expect(yaml).toContain('labels: { severity: critical }')
    expect(yaml).toContain('count_over_time(')
  })

  /** A non-grouped rule summarises by the rule name, not the per-logKey label. */
  it('renders the non-grouped summary as "<name> <metric> breached"', () => {
    const yaml = ruleToRulerYaml(preset('any-fatal'))
    expect(yaml).toContain("summary: 'Any fatal log count breached'")
    expect(yaml).not.toContain('{{ $labels.logKey }}')
  })

  /** A single quote in the name is doubled so the YAML scalar never breaks. */
  it('escapes a single quote in the summary', () => {
    const draft: RuleDraft = { ...preset('any-fatal'), name: "O'Brien failures" }
    const yaml = ruleToRulerYaml(draft)
    expect(yaml).toContain("summary: 'O''Brien failures count breached'")
  })
})

describe('toAlertId', () => {
  /** Free-text names collapse to a PascalCase ruler identifier. */
  it('PascalCases a free-text name', () => {
    expect(toAlertId('Payment charge failures')).toBe('PaymentChargeFailures')
  })

  /** A name with no letters falls back to a safe default id. */
  it('falls back to Alert for an empty-ish name', () => {
    expect(toAlertId('   ---  ')).toBe('Alert')
  })
})

describe('isValidDuration', () => {
  /** Well-formed Prometheus/Loki durations across every accepted unit pass. */
  it('accepts a digit run followed by a valid unit', () => {
    for (const value of ['500ms', '30s', '5m', '2h', '1d', '1w', '1y']) {
      expect(isValidDuration(value)).toBe(true)
    }
  })

  /** Empty, unit-less, unknown-unit, or compound durations are rejected. */
  it('rejects malformed durations', () => {
    for (const value of ['', '5', 'm', '5x', '5 m', '1h30m', '-5m']) {
      expect(isValidDuration(value)).toBe(false)
    }
  })
})
