/**
 * @fileoverview Unit tests for the pure ruler-YAML helpers — the persisted `expr`
 * string, the LogQL expression (count vs rate), and the rendered ruler group.
 *
 * @module lib/ruler-yaml.test
 */
import { describe, expect, it, vi } from 'vitest'

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

  /**
   * With neither a level filter nor a logKey the subject collapses to `*` ("any
   * log"), so a draft that filters nothing still renders a valid expression.
   */
  it('renders a wildcard subject when no levels and no logKey are set', () => {
    // Omit `logKey` so the subject has neither levels nor a key (the `*` wildcard).
    const draft: RuleDraft = { ...preset('any-fatal'), levels: [] }
    expect(buildExpr(draft)).toBe('count(*) over 1m >= 1')
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

describe('buildLogQlExpr — stream selector and pipeline', () => {
  /** The Loki stream selector `{service="api"}` must appear verbatim in every expr. */
  it('includes the exact stream selector in the LogQL expression', () => {
    expect(buildLogQlExpr(preset('error-spike'))).toContain('{service="api"}')
  })

  /** The `| json` pipeline stage is always emitted so Loki parses structured logs. */
  it('includes | json in the LogQL pipeline', () => {
    expect(buildLogQlExpr(preset('any-fatal'))).toContain('| json')
  })

  /** The heartbeat preset uses count_over_time with the exact key filter and == 0 threshold. */
  it('builds the heartbeat LogQL with count_over_time, the exact logKey, and == 0', () => {
    const expr = buildLogQlExpr(preset('heartbeat'))
    expect(expr).toContain('count_over_time(')
    expect(expr).toContain('logKey="HTTP_REQUEST_SUCCESS"')
    expect(expr).toContain('[10m]')
    expect(expr.endsWith('== 0')).toBe(true)
  })

  /** The specific-failure preset uses rate() with the exact logKey and > 1 threshold. */
  it('builds the specific-failure LogQL with rate, the exact logKey, and > 1', () => {
    const expr = buildLogQlExpr(preset('specific-failure'))
    expect(expr).toContain('rate(')
    expect(expr).toContain('logKey="PAYMENT_CHARGE_FAILED"')
    expect(expr).toContain('[5m]')
    expect(expr.endsWith('> 1')).toBe(true)
  })

  /** No `by (logKey)` aggregation appears when `shouldGroupByLogKey` is false. */
  it('omits the sum-by-logKey aggregation for non-grouped presets', () => {
    expect(buildLogQlExpr(preset('any-fatal'))).not.toContain('sum by (logKey)')
    expect(buildLogQlExpr(preset('specific-failure'))).not.toContain('sum by (logKey)')
  })
})

describe('ruleToRulerYaml — structure', () => {
  /** The YAML document always begins with the `groups:` key. */
  it('emits a groups: document root', () => {
    expect(ruleToRulerYaml(preset('any-fatal'))).toContain('groups:')
  })

  /** The ruler group is always named `nest-logger-example`. */
  it('uses the exact ruler group name nest-logger-example', () => {
    expect(ruleToRulerYaml(preset('error-spike'))).toContain('name: nest-logger-example')
  })

  /** The `expr` field uses a YAML block scalar (`expr: |`) so multi-line is safe. */
  it('renders the expr field as a YAML block scalar (expr: |)', () => {
    expect(ruleToRulerYaml(preset('any-fatal'))).toContain('expr: |')
  })

  /** The annotations object always includes the summary key. */
  it('includes an annotations: { summary: ... } line', () => {
    expect(ruleToRulerYaml(preset('heartbeat'))).toContain('annotations:')
  })

  /** A grouped rule uses the per-logKey summary template. */
  it('uses the logKey template in the summary for a grouped rule', () => {
    const yaml = ruleToRulerYaml(preset('error-spike'))
    expect(yaml).toContain('{{ $labels.logKey }}')
  })

  /** The heartbeat preset renders with the == comparator and 0 threshold. */
  it('renders the heartbeat rule with == 0 in the expr', () => {
    const yaml = ruleToRulerYaml(preset('heartbeat'))
    expect(yaml).toContain('== 0')
    expect(yaml).toContain('alert: SuccessHeartbeatAbsence')
  })

  /** The specific-failure preset uses warning severity. */
  it('renders warning severity for the specific-failure preset', () => {
    expect(ruleToRulerYaml(preset('specific-failure'))).toContain('severity: warning')
  })
})

describe('buildExpr — empty logKey guard', () => {
  /**
   * An empty-string logKey must be treated the same as no logKey.
   * Asserting `*` as subject kills both ConditionalExpression→true and
   * StringLiteral mutations on the `draft.logKey !== ''` guard.
   */
  it('treats an empty-string logKey as absent (wildcard subject)', () => {
    const draft: RuleDraft = { ...preset('specific-failure'), logKey: '' }
    // Empty logKey must not push '' to subjectParts → subject collapses to '*'.
    expect(buildExpr(draft)).toBe('rate(*) over 5m > 1')
  })
})

describe('buildLogQlExpr — guard conditions', () => {
  /**
   * An empty levels array must NOT emit a level filter.
   * Asserting the absence of `level=~` kills the ConditionalExpression→true and
   * EqualityOperator mutations on `draft.levels.length > 0`.
   */
  it('omits the level filter when levels is empty', () => {
    const expr = buildLogQlExpr(preset('specific-failure'))
    // specific-failure has levels: [] — no level filter should appear.
    expect(expr).not.toContain('level=~')
  })

  /**
   * An empty-string logKey must not emit a logKey filter.
   * Asserting absence kills the ConditionalExpression→true and StringLiteral
   * mutations on the `draft.logKey !== ''` guard in buildLogQlPipeline.
   */
  it('omits the logKey filter when logKey is an empty string', () => {
    const draft: RuleDraft = { ...preset('specific-failure'), logKey: '' }
    expect(buildLogQlExpr(draft)).not.toContain('logKey=')
  })
})

describe('ruleToRulerYaml — YAML structure', () => {
  /**
   * The `    rules:` key must appear verbatim in the YAML output.
   * Asserting this kills the StringLiteral mutation that replaces it with `''`.
   */
  it('includes the rules: key in the YAML output', () => {
    expect(ruleToRulerYaml(preset('any-fatal'))).toContain('    rules:')
  })

  /**
   * The document must end with a newline (the trailing empty element in the
   * join array). Asserting this kills the StringLiteral mutation that replaces
   * `''` (the trailing newline emitter) with `'Stryker was here!'`.
   */
  it('terminates the YAML document with a newline', () => {
    expect(ruleToRulerYaml(preset('any-fatal'))).toMatch(/\n$/)
  })

  /**
   * The YAML output must contain a newline separator between lines.
   * Asserting this kills the StringLiteral mutation that replaces `'\n'` in
   * the join call with `''` (collapsing everything to one line).
   */
  it('separates YAML lines with newline characters', () => {
    const yaml = ruleToRulerYaml(preset('any-fatal'))
    expect(yaml).toContain('groups:\n')
  })
})

describe('RULE_PRESETS — label fields and per-preset YAML content', () => {
  /**
   * The `label` field of each preset is shown in the UI selector. Asserting the
   * exact strings kills StringLiteral→"" mutations on the label values for
   * error-spike, specific-failure, and heartbeat (any-fatal is covered elsewhere).
   */
  it('declares the correct label for each preset', () => {
    expect(RULE_PRESETS.find((p) => p.id === 'error-spike')?.label).toBe('Error spike')
    expect(RULE_PRESETS.find((p) => p.id === 'specific-failure')?.label).toBe('Specific failure')
    expect(RULE_PRESETS.find((p) => p.id === 'heartbeat')?.label).toBe('Heartbeat / absence')
  })

  /**
   * The specific-failure preset's `name` field must round-trip through
   * `toAlertId` to produce `PaymentChargeFailures`. Asserting the alert
   * identifier and `for: 2m` kills the StringLiteral→"" mutations on both
   * the `name` ('Payment charge failures') and the `forDuration` ('2m')
   * fields of that preset.
   */
  it('encodes the specific-failure rule name and forDuration in the ruler YAML', () => {
    const yaml = ruleToRulerYaml(preset('specific-failure'))
    expect(yaml).toContain('alert: PaymentChargeFailures')
    expect(yaml).toContain('for: 2m')
  })

  /**
   * The heartbeat preset's `forDuration` ('1m') and `severity` ('critical')
   * must appear verbatim in the YAML output. Asserting both kills the
   * StringLiteral→"" mutations on those two fields.
   */
  it('encodes the heartbeat forDuration and severity in the ruler YAML', () => {
    const yaml = ruleToRulerYaml(preset('heartbeat'))
    expect(yaml).toContain('for: 1m')
    expect(yaml).toContain('severity: critical')
  })
})

describe('RULE_PRESETS — exact shape', () => {
  /** Every preset has a non-empty label string used in the UI picker. */
  it('has the documented label for each preset', () => {
    expect(RULE_PRESETS.find((p) => p.id === 'error-spike')?.label).toBe('Error spike')
    expect(RULE_PRESETS.find((p) => p.id === 'any-fatal')?.label).toBe('Any FATAL')
    expect(RULE_PRESETS.find((p) => p.id === 'specific-failure')?.label).toBe('Specific failure')
    expect(RULE_PRESETS.find((p) => p.id === 'heartbeat')?.label).toBe('Heartbeat / absence')
  })

  /** The error-spike draft has the documented threshold and window. */
  it('error-spike draft has threshold 10, window 5m, forDuration 2m', () => {
    const d = preset('error-spike')
    expect(d.threshold).toBe(10)
    expect(d.window).toBe('5m')
    expect(d.forDuration).toBe('2m')
    expect(d.metric).toBe('count')
    expect(d.severity).toBe('critical')
    expect(d.shouldGroupByLogKey).toBe(true)
  })

  /** The any-fatal draft has the documented threshold, window, and level filter. */
  it('any-fatal draft has threshold 1, window 1m, forDuration 1m, level=fatal', () => {
    const d = preset('any-fatal')
    expect(d.threshold).toBe(1)
    expect(d.window).toBe('1m')
    expect(d.forDuration).toBe('1m')
    expect(d.levels).toEqual(['fatal'])
    expect(d.severity).toBe('critical')
  })

  /** The specific-failure draft carries the exact logKey and rate metric. */
  it('specific-failure draft has the exact logKey and rate metric', () => {
    const d = preset('specific-failure')
    expect(d.logKey).toBe('PAYMENT_CHARGE_FAILED')
    expect(d.metric).toBe('rate')
    expect(d.severity).toBe('warning')
  })

  /** The heartbeat draft uses == 0 over a 10-minute window. */
  it('heartbeat draft has threshold 0, window 10m, comparator ==', () => {
    const d = preset('heartbeat')
    expect(d.threshold).toBe(0)
    expect(d.window).toBe('10m')
    expect(d.comparator).toBe('==')
    expect(d.logKey).toBe('HTTP_REQUEST_SUCCESS')
  })
})

describe('toAlertId — non-alphanumeric separators and join behavior', () => {
  /**
   * Hyphens and underscores are non-alphanumeric chars; the regex must treat them as
   * separators (negation kills this) and parts must be joined with NO separator between them
   * (removing or changing .join('') would produce a different result).
   */
  it('splits on hyphens and underscores and joins PascalCase parts with no separator', () => {
    expect(toAlertId('error-type_42')).toBe('ErrorType42')
  })

  /** A name with consecutive non-alphanumeric chars must still produce clean PascalCase output. */
  it('handles consecutive separators by collapsing them to a single word boundary', () => {
    expect(toAlertId('auth--login__test')).toBe('AuthLoginTest')
  })
})

describe('ruler-yaml — module-level re-import (kill STREAM_SELECTOR, RULER_GROUP, RULE_PRESETS mutations)', () => {
  /**
   * Re-importing the module inside the test body forces STREAM_SELECTOR,
   * RULER_GROUP, and every RULE_PRESETS string to be evaluated with Stryker's
   * active mutation injected. These constants have `coveredBy: []` in the static
   * import case because Istanbul attributes their initialization to module load
   * time, not to any specific test. Forcing a re-import inside the test body
   * attributes coverage to this test and lets Stryker run its mutation against it.
   *
   * - STREAM_SELECTOR = '{service="api"}' → '' makes the selector disappear from
   *   every LogQL expression.
   * - RULER_GROUP = 'nest-logger-example' → '' removes the group name from YAML.
   * - RULE_PRESETS id/label/name/logKey string mutations change what the UI shows.
   */
  it('re-imports and verifies STREAM_SELECTOR and RULER_GROUP appear in function outputs', async () => {
    vi.resetModules()
    const {
      buildLogQlExpr: freshBuildLogQlExpr,
      ruleToRulerYaml: freshRuleToRulerYaml,
      RULE_PRESETS: freshPresets,
    } = await import('./ruler-yaml')
    const errorSpike = freshPresets.find((p) => p.id === 'error-spike')!.draft
    expect(freshBuildLogQlExpr(errorSpike)).toContain('{service="api"}')
    expect(freshRuleToRulerYaml(errorSpike)).toContain('name: nest-logger-example')
    vi.resetModules()
  })

  it('re-imports and verifies all four RULE_PRESETS ids and labels', async () => {
    vi.resetModules()
    const { RULE_PRESETS: freshPresets } = await import('./ruler-yaml')
    expect(freshPresets.find((p) => p.id === 'error-spike')?.label).toBe('Error spike')
    expect(freshPresets.find((p) => p.id === 'any-fatal')?.label).toBe('Any FATAL')
    expect(freshPresets.find((p) => p.id === 'specific-failure')?.label).toBe('Specific failure')
    expect(freshPresets.find((p) => p.id === 'heartbeat')?.label).toBe('Heartbeat / absence')
    vi.resetModules()
  })

  it('re-imports and verifies RULE_PRESETS draft names and logKey strings', async () => {
    vi.resetModules()
    const { RULE_PRESETS: freshPresets } = await import('./ruler-yaml')
    const errorSpike = freshPresets.find((p) => p.id === 'error-spike')!.draft
    const anyFatal = freshPresets.find((p) => p.id === 'any-fatal')!.draft
    const specificFailure = freshPresets.find((p) => p.id === 'specific-failure')!.draft
    const heartbeat = freshPresets.find((p) => p.id === 'heartbeat')!.draft
    expect(errorSpike.name).toBe('Error spike by logKey')
    expect(anyFatal.name).toBe('Any fatal log')
    expect(specificFailure.name).toBe('Payment charge failures')
    expect(specificFailure.logKey).toBe('PAYMENT_CHARGE_FAILED')
    expect(heartbeat.name).toBe('Success heartbeat absence')
    expect(heartbeat.logKey).toBe('HTTP_REQUEST_SUCCESS')
    vi.resetModules()
  })
})
