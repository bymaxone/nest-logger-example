/**
 * Unit tests for `AlertsEvaluatorService`.
 *
 * Covers the full cron evaluation path: every rule-shape parsed by `parseExpr`
 * (error-spike, any-fatal, specific-rate, heartbeat absence, and the catch-all
 * default), every duration unit parsed by `parseDuration` (s/m/h + the invalid
 * fallback), every comparator branch (`>`, `>=`, `==`), the fail-soft guards on
 * `findMany` and `count`, the incident dedupe + auto-resolve lifecycle (including
 * the non-array timeline guard), `extractLogKey` (match vs null), and the
 * severity-based channel routing in `ChannelRouterService`.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { AlertRule, Incident } from '@prisma/client'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from '../logs/logs.service.js'
import { ChannelRouterService } from './channel-router.service.js'
import { AlertsEvaluatorService } from './alerts.evaluator.service.js'

type MockFn = ReturnType<typeof jest.fn>

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    name: 'Error spike',
    expr: 'count(level ∈ {error,fatal}) by logKey over 5m > 0',
    threshold: 0,
    forDuration: '5m',
    severity: 'critical',
    isEnabled: true,
    channels: [],
    createdAt: new Date(),
    ...overrides,
  }
}

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-1',
    ruleId: 'rule-1',
    status: 'triggered',
    logKey: 'PAYMENT_REFUND_FAILED',
    openedAt: new Date(),
    resolvedAt: null,
    timeline: [],
    ...overrides,
  }
}

describe('AlertsEvaluatorService.evaluate', () => {
  let prisma: PrismaService
  let router: ChannelRouterService
  let svc: AlertsEvaluatorService
  let createMock: MockFn
  let updateMock: MockFn
  let findFirstMock: MockFn
  let findManyMock: MockFn
  let countMock: MockFn
  let notifySpy: jest.SpiedFunction<ChannelRouterService['notify']>

  beforeEach(() => {
    router = new ChannelRouterService()
    notifySpy = jest.spyOn(router, 'notify').mockImplementation(() => undefined)

    createMock = jest.fn<() => Promise<Incident>>().mockResolvedValue(makeIncident())
    updateMock = jest
      .fn<() => Promise<Incident>>()
      .mockResolvedValue(makeIncident({ status: 'resolved' }))
    findFirstMock = jest.fn<() => Promise<Incident | null>>().mockResolvedValue(null)
    countMock = jest.fn<() => Promise<number>>().mockResolvedValue(5)
    findManyMock = jest.fn<() => Promise<AlertRule[]>>().mockResolvedValue([makeRule()])

    prisma = {
      alertRule: {
        findMany: findManyMock,
      },
      applicationLog: {
        count: countMock,
      },
      incident: {
        findFirst: findFirstMock,
        create: createMock,
        update: updateMock,
      },
    } as unknown as PrismaService

    svc = new AlertsEvaluatorService(prisma, new LogsService(), router)
  })

  it('fires an incident when the rule threshold is exceeded', async () => {
    /**
     * When `count > threshold`, the evaluator must create a new `Incident` with
     * `status=triggered` and call `router.notify`. Protects the breach → fire
     * path of an error-spike rule and the per-pattern timeline stamp.
     */
    await svc.evaluate()

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const createCall = createMock.mock.calls[0] as [{ data: { status: string } }]
    expect(createCall[0].data.status).toBe('triggered')
  })

  it('does not fire a duplicate incident when one is already open', async () => {
    /**
     * When an open incident already exists for the rule, the evaluator must
     * NOT create another one (one notification per pattern).
     */
    const existingIncident = makeIncident({ status: 'triggered' })
    findFirstMock.mockResolvedValue(existingIncident)

    await svc.evaluate()

    expect(createMock).not.toHaveBeenCalled()
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it('auto-resolves an open incident when count drops to zero', async () => {
    /**
     * When the count is at or below the threshold after being above it, the
     * evaluator must transition the incident to `resolved` and stamp the timeline.
     */
    const existingIncident = makeIncident({ status: 'triggered' })
    countMock.mockResolvedValue(0)
    findFirstMock.mockResolvedValue(existingIncident)

    await svc.evaluate()

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updateCall = updateMock.mock.calls[0] as [{ data: { status: string } }]
    expect(updateCall[0].data.status).toBe('resolved')
  })

  it('returns early and warns when fetching rules fails', async () => {
    /**
     * `prisma.alertRule.findMany` rejecting must be swallowed (fail-soft): the
     * evaluator logs a warning and returns without touching any rule. Protects
     * the try/catch around the rule fetch so one bad tick does not crash the cron.
     */
    findManyMock.mockRejectedValue(new Error('db down'))
    const warnSpy = jest
      .spyOn(svc['logger'] as { warn: (msg: string) => void }, 'warn')
      .mockImplementation(() => undefined)

    await svc.evaluate()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(countMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('swallows a count() failure for a single rule without firing', async () => {
    /**
     * When `applicationLog.count` rejects, that rule's evaluation must abort
     * silently (return) without firing or resolving an incident — the count
     * failure is fail-soft and never propagates out of `evaluateRule`.
     */
    countMock.mockRejectedValue(new Error('count failed'))

    await expect(svc.evaluate()).resolves.toBeUndefined()

    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('fires a "any FATAL" rule using the >= comparator with threshold 1', async () => {
    /**
     * A `count(level = fatal) over 1m >= 1` rule parses to the `fatal` level with
     * the `>=` comparator and threshold 1. With one matching log it must breach
     * and fire. Protects the fatal branch of `parseExpr` and the `>=` comparator.
     */
    findManyMock.mockResolvedValue([
      makeRule({
        id: 'fatal-rule',
        name: 'Any FATAL',
        expr: 'count(level = fatal) over 1m >= 1',
        forDuration: '1m',
        threshold: 1,
      }),
    ])
    countMock.mockResolvedValue(1)

    await svc.evaluate()

    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('does not fire a "any FATAL" rule when count is below the >= threshold', async () => {
    /**
     * The same `>= 1` fatal rule with zero matching logs must NOT breach (0 >= 1
     * is false) — exercises the false side of the `>=` comparator and the
     * non-breach resolve path with no open incident.
     */
    findManyMock.mockResolvedValue([
      makeRule({
        id: 'fatal-rule',
        name: 'Any FATAL',
        expr: 'count(level = fatal) over 1m >= 1',
        forDuration: '1m',
        threshold: 1,
      }),
    ])
    countMock.mockResolvedValue(0)

    await svc.evaluate()

    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('fires a heartbeat-absence rule using the == comparator when count is zero', async () => {
    /**
     * A heartbeat rule `count(HTTP_REQUEST_SUCCESS) over 10m == 0` parses to the
     * `==` comparator with threshold 0 and a `logKey`. With zero matching logs it
     * breaches (count == 0). Protects the absence branch of `parseExpr`, the `==`
     * comparator, and the `logKey`-filtered where clause.
     */
    findManyMock.mockResolvedValue([
      makeRule({
        id: 'heartbeat-rule',
        name: 'Heartbeat absence',
        expr: 'count(HTTP_REQUEST_SUCCESS) over 10m == 0',
        forDuration: '10m',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(0)

    await svc.evaluate()

    expect(createMock).toHaveBeenCalledTimes(1)
    const createCall = createMock.mock.calls[0] as [{ data: { logKey: string } }]
    expect(createCall[0].data.logKey).toBe('HTTP_REQUEST_SUCCESS')
  })

  it('does not fire a heartbeat-absence rule while traffic is still flowing', async () => {
    /**
     * The same `== 0` heartbeat rule with non-zero matching logs must NOT breach
     * (5 == 0 is false) — exercises the false side of the `==` comparator and the
     * non-breach path that resets the breach counter.
     */
    findManyMock.mockResolvedValue([
      makeRule({
        id: 'heartbeat-rule',
        name: 'Heartbeat absence',
        expr: 'count(HTTP_REQUEST_SUCCESS) over 10m == 0',
        forDuration: '10m',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(5)

    await svc.evaluate()

    expect(createMock).not.toHaveBeenCalled()
  })

  it('fires a specific-failure rate rule and stamps the extracted logKey', async () => {
    /**
     * A `rate(PAYMENT_REFUND_FAILED) over 5m > 0` rule parses via the `rate(...)`
     * branch to a `logKey` filter with the `>` comparator and threshold 0. The
     * incident `logKey` must be the extracted `PAYMENT_REFUND_FAILED` token.
     * Protects the rate branch of `parseExpr` and the `extractLogKey` match path.
     */
    findManyMock.mockResolvedValue([
      makeRule({
        id: 'refund-rule',
        name: 'Refund failures',
        expr: 'rate(PAYMENT_REFUND_FAILED) over 5m > 0',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(3)

    await svc.evaluate()

    expect(createMock).toHaveBeenCalledTimes(1)
    const createCall = createMock.mock.calls[0] as [{ data: { logKey: string } }]
    expect(createCall[0].data.logKey).toBe('PAYMENT_REFUND_FAILED')
  })

  it('handles the catch-all rule shape and a null extracted logKey', async () => {
    /**
     * An expression matching none of the known shapes falls through to the default
     * parse (`> 0`, no level, no logKey). With an expression containing no
     * multi-segment uppercase token, `extractLogKey` returns null and the incident
     * is created with `logKey=null`. Protects the `parseExpr` default return and
     * the null branch of `extractLogKey`.
     */
    findManyMock.mockResolvedValue([
      makeRule({
        id: 'generic-rule',
        name: 'Generic',
        expr: 'count over 5m > 0',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(2)

    await svc.evaluate()

    expect(createMock).toHaveBeenCalledTimes(1)
    const createCall = createMock.mock.calls[0] as [{ data: { logKey: string | null } }]
    expect(createCall[0].data.logKey).toBeNull()
  })

  it('parses an hour duration window without throwing', async () => {
    /**
     * A `forDuration` of `'2h'` must be parsed by the hour branch of
     * `parseDuration` (n * 60 * 60 * 1000). The rule still evaluates normally.
     */
    findManyMock.mockResolvedValue([makeRule({ forDuration: '2h' })])

    await expect(svc.evaluate()).resolves.toBeUndefined()
    expect(countMock).toHaveBeenCalledTimes(1)
  })

  it('parses a seconds duration window without throwing', async () => {
    /**
     * A `forDuration` of `'30s'` must be parsed by the seconds branch of
     * `parseDuration` (n * 1000). Protects the trailing unit fallthrough.
     */
    findManyMock.mockResolvedValue([makeRule({ forDuration: '30s' })])

    await expect(svc.evaluate()).resolves.toBeUndefined()
    expect(countMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to a 5-minute window for an unparseable duration', async () => {
    /**
     * An invalid `forDuration` string (no unit match) must fall back to the
     * default 5-minute window rather than throwing. Protects the `!match`
     * guard in `parseDuration`.
     */
    findManyMock.mockResolvedValue([makeRule({ forDuration: 'not-a-duration' })])

    await expect(svc.evaluate()).resolves.toBeUndefined()
    expect(countMock).toHaveBeenCalledTimes(1)
  })

  it('auto-resolves while preserving an existing array timeline', async () => {
    /**
     * When the open incident already has an array `timeline`, auto-resolve must
     * APPEND the system entry and keep the prior entries. Protects the
     * `Array.isArray(timeline)` true branch of `maybeResolve`.
     */
    const existing = makeIncident({
      status: 'acknowledged',
      timeline: [{ actor: 'system', action: 'triggered', at: '2026-01-01T00:00:00.000Z' }],
    } as Partial<Incident>)
    countMock.mockResolvedValue(0)
    findFirstMock.mockResolvedValue(existing)

    await svc.evaluate()

    const updateCall = updateMock.mock.calls[0] as [{ data: { timeline: unknown[] } }]
    expect(updateCall[0].data.timeline).toHaveLength(2)
  })

  it('auto-resolves with a fresh timeline when the stored value is not an array', async () => {
    /**
     * When the open incident's stored `timeline` is not an array (e.g. JSON null),
     * auto-resolve must start from an empty array and push only the system entry.
     * Protects the `Array.isArray(...)` false branch of `maybeResolve`.
     */
    const existing = makeIncident({ status: 'snoozed', timeline: null } as Partial<Incident>)
    countMock.mockResolvedValue(0)
    findFirstMock.mockResolvedValue(existing)

    await svc.evaluate()

    const updateCall = updateMock.mock.calls[0] as [{ data: { timeline: unknown[] } }]
    expect(updateCall[0].data.timeline).toHaveLength(1)
  })

  it('does nothing when no incident is open and the rule is not breaching', async () => {
    /**
     * Non-breach with no open incident must be a no-op: no create, no update.
     * Protects the early return in `maybeResolve` when `findFirst` yields null.
     */
    countMock.mockResolvedValue(0)
    findFirstMock.mockResolvedValue(null)

    await svc.evaluate()

    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('increments the consecutive-breach counter across repeated breaching ticks', async () => {
    /**
     * Two consecutive breaching ticks for the same rule must increment the
     * internal breach counter from the seeded 0 → 1 → 2. Protects the
     * `breachTicks.get(rule.id) ?? 0` accumulation across ticks; on the second
     * tick the value read is the previously stored number, not the nullish default.
     */
    await svc.evaluate()
    await svc.evaluate()

    expect(svc['breachTicks'].get('rule-1')).toBe(2)
  })

  // ── parseDuration: regex anchor survivors ─────────────────────────────────────

  it('uses the 300_000ms fallback window when forDuration ends with a trailing non-unit character', async () => {
    /**
     * '5mx' does not match /^(\d+)(m|h|s)$/ because the $ end-of-string anchor
     * requires nothing after the unit. The buildPrismaWhere `from` must therefore
     * be ~300_000ms ago (the no-match fallback). Kills the Stryker regex mutant
     * that removes the $ anchor from parseDuration.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: '5mx' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 300_000))).toBeLessThan(200)
  })

  it('uses the 300_000ms fallback window when forDuration starts with a non-digit character', async () => {
    /**
     * 'x5m' does not match /^(\d+)(m|h|s)$/ because the ^ start-of-string anchor
     * requires the string to begin with digits. The `from` window must be ~300_000ms
     * ago. Kills the Stryker regex mutant that removes the ^ anchor.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: 'x5m' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 300_000))).toBeLessThan(200)
  })

  it('uses the 300_000ms fallback window when forDuration uses the unsupported unit d', async () => {
    /**
     * '5d' does not match /^(\d+)(m|h|s)$/ because 'd' is not in the (m|h|s)
     * alternation group. Kills Stryker regex mutants that widen or omit the unit
     * alternation, making 'd' accidentally match.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: '5d' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 300_000))).toBeLessThan(200)
  })

  // ── parseDuration: arithmetic survivors (fallback + per-unit branches) ────────

  it('parseDuration fallback is exactly 300_000ms (5 × 60 × 1000) from now', async () => {
    /**
     * When parseDuration cannot match the pattern it returns 5 * 60 * 1000 =
     * 300_000ms. Asserting the exact window kills ArithmeticOperator mutants on
     * the fallback return (e.g., mutating * to + or changing any factor).
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: 'invalid' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 300_000))).toBeLessThan(200)
  })

  it('parseDuration computes exactly 3_600_000ms for a 1h forDuration', async () => {
    /**
     * '1h' must use the `unit === h` branch: 1 × 60 × 60 × 1000 = 3_600_000ms.
     * Kills ConditionalExpression mutants that skip the h branch and
     * ArithmeticOperator mutants that corrupt the 60 × 60 × 1000 product.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: '1h' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 3_600_000))).toBeLessThan(200)
  })

  it('parseDuration computes exactly 60_000ms for a 1m forDuration', async () => {
    /**
     * '1m' must use the `unit === m` branch: 1 × 60 × 1000 = 60_000ms. Kills
     * ArithmeticOperator mutants that corrupt the 60 × 1000 product in the minutes
     * branch.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: '1m' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 60_000))).toBeLessThan(200)
  })

  it('parseDuration computes exactly 1_000ms for a 1s forDuration', async () => {
    /**
     * '1s' must fall through to the seconds arm: 1 × 1000 = 1_000ms. Kills
     * ArithmeticOperator mutants that corrupt the n × 1000 product in the seconds
     * fallthrough.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: '1s' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 1_000))).toBeLessThan(200)
  })

  // ── parseExpr: regex capture-group survivors ──────────────────────────────────

  it('absence rule routes logKey HTTP_REQUEST_SUCCESS through buildPrismaWhere with no level filter', async () => {
    /**
     * The absence regex /count\(([A-Z_]+)\).*==\s*(\d+)/ must capture group 1 as
     * logKey. Evaluating the rule must call buildPrismaWhere with
     * logKey: 'HTTP_REQUEST_SUCCESS' and level: undefined (absence rules carry no
     * level filter). Kills regex mutants on L51 that corrupt the ([A-Z_]+) group
     * or the ==\s*(\d+) suffix.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'count(HTTP_REQUEST_SUCCESS) over 10m == 0',
        forDuration: '10m',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(0)

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.logKey).toBe('HTTP_REQUEST_SUCCESS')
    expect(callArg.level).toBeUndefined()
  })

  it('fatal rule routes level string fatal through buildPrismaWhere, not an array or undefined', async () => {
    /**
     * 'count(level = fatal) over 1m >= 1' matches /level\s*=\s*fatal/ (not the
     * absence pattern and not the error-spike pattern). evaluateRule must call
     * buildPrismaWhere with level: 'fatal' (a string, typeof === 'string' branch)
     * and no logKey. Kills regex mutants on L61 that widen or remove \s*=\s*.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'count(level = fatal) over 1m >= 1',
        forDuration: '1m',
        threshold: 1,
      }),
    ])
    countMock.mockResolvedValue(1)

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.level).toBe('fatal')
    expect(callArg.logKey).toBeUndefined()
  })

  it('error-spike rule passes level { gte: error } to buildPrismaWhere via the Array.isArray branch', async () => {
    /**
     * 'count(level ∈ {error,fatal}) by logKey over 5m > 0' matches
     * /level.*error.*fatal|fatal.*error/ and sets parsed.level = ['error', 'fatal'].
     * The Array.isArray(parsed.level) branch in evaluateRule maps this to
     * { gte: 'error' } for buildPrismaWhere. Kills regex mutants on L65 and
     * ConditionalExpression + LogicalOperator mutants on the level-mapping block.
     */
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'count(level ∈ {error,fatal}) by logKey over 5m > 0',
        forDuration: '5m',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(3)

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.level).toEqual({ gte: 'error' })
  })

  // ── Status string literals: maybeFireIncident + maybeResolve ─────────────────

  it('maybeFireIncident queries findFirst with exactly the three open-incident statuses', async () => {
    /**
     * On a breaching rule with no open incident, findFirst must be called with
     * status.in = ['triggered', 'acknowledged', 'snoozed']. Kills StringLiteral
     * mutants on the maybeFireIncident findFirst call that corrupt any of the three
     * status values.
     */
    await svc.evaluate()

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        ruleId: 'rule-1',
        status: { in: ['triggered', 'acknowledged', 'snoozed'] },
      },
    })
  })

  it('maybeResolve queries findFirst with exactly the three open-incident statuses', async () => {
    /**
     * When the rule is not breaching and an open incident exists, maybeResolve must
     * also pass status.in = ['triggered', 'acknowledged', 'snoozed'] to findFirst.
     * Kills StringLiteral mutants on the maybeResolve findFirst call that corrupt
     * any of the three status values.
     */
    countMock.mockResolvedValue(0)
    findFirstMock.mockResolvedValue(makeIncident({ status: 'triggered' }))

    await svc.evaluate()

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        ruleId: 'rule-1',
        status: { in: ['triggered', 'acknowledged', 'snoozed'] },
      },
    })
  })

  // ── L30: anchor/quantifier survivors (need 10m so match ≠ fallback) ──────────

  it('uses the 300_000ms fallback when forDuration has a trailing char after the unit (10mx)', async () => {
    // '10mx' must not match /^(\d+)(m|h|s)$/ because the $ anchor requires end-of-string.
    // The no-$ mutant /(\\d+)(m|h|s)/ would match '10m' prefix (600_000ms), differing from fallback.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: '10mx' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 300_000))).toBeLessThan(200)
  })

  it('uses the 300_000ms fallback when forDuration starts with a non-digit character (x10m)', async () => {
    // 'x10m' must not match /^(\d+)(m|h|s)$/ because the ^ anchor requires start-of-string digits.
    // The no-^ mutant /(\d+)(m|h|s)$/ would match '10m' at the end (600_000ms), differing from fallback.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: 'x10m' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 300_000))).toBeLessThan(200)
  })

  it('parseDuration computes exactly 600_000ms for a 10m forDuration', async () => {
    // '10m' has two digits; the single-digit mutant /^(\\d)(m|h|s)$/ fails to match it
    // (the \\d can only consume '1', leaving '0m' which has no unit match), so it
    // falls back to 300_000ms instead of the correct 10 × 60 × 1000 = 600_000ms.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([makeRule({ forDuration: '10m' })])

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    const fromMs = new Date(callArg.from!).getTime()
    expect(Math.abs(fromMs - (Date.now() - 600_000))).toBeLessThan(200)
  })

  // ── L51: absence regex \s vs \s* (double-space before threshold) ──────────────

  it('absence rule with two spaces before the threshold still fires the incident', async () => {
    // '==  0' (two spaces) satisfies ==\\s*(\\d+) but not ==\\s(\\d+) (one space only).
    // When the absence branch is skipped by the mutant, the rule falls to the default
    // '>' operator and 0 > 0 is false — no incident. The correct regex must match.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'count(HTTP_REQUEST_SUCCESS) over 10m ==  0',
        forDuration: '10m',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(0)

    await svcLocal.evaluate()

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.logKey).toBe('HTTP_REQUEST_SUCCESS')
  })

  // ── L61: fatal regex — both \s vs \s* mutants killed with double spaces ────────

  it('fatal rule with two spaces on both sides of = still routes level:fatal through buildPrismaWhere', async () => {
    // 'level  =  fatal' (two spaces each side) matches /level\\s*=\\s*fatal/ but not
    // /level\\s=\\s*fatal/ (single space before =) nor /level\\s*=\\sfatal/ (single space after =).
    // With either mutant the expr falls to the default branch, level is undefined, and
    // the rule uses operator '>' which produces a different firing decision at threshold 1.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'count(level  =  fatal) over 1m >= 1',
        forDuration: '1m',
        threshold: 1,
      }),
    ])
    countMock.mockResolvedValue(1)

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.level).toBe('fatal')
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  // ── L65: error-spike regex — single-dot mutants killed with wide gaps ─────────

  it('error-spike with many chars between error and fatal still maps to { gte: error }', async () => {
    // The mutant /level.*error.fatal/ uses a single dot so it requires exactly one
    // char between 'error' and 'fatal'. This expr has ', warning, ' between them,
    // so only the correct /level.*error.*fatal/ matches, giving level: { gte: 'error' }.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'count(level in {error, warning, fatal}) over 5m > 0',
        forDuration: '5m',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(3)

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.level).toEqual({ gte: 'error' })
  })

  it('error-spike where fatal precedes error by many chars still maps to { gte: error }', async () => {
    // The mutant /fatal.error/ uses a single dot, requiring exactly one char between
    // 'fatal' and 'error'. This expr has ' and ' between them, so only the correct
    // /fatal.*error/ second alternative matches, giving level: { gte: 'error' }.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'count(fatal and error in level) over 5m > 0',
        forDuration: '5m',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(3)

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.level).toEqual({ gte: 'error' })
  })

  // ── L69/L70: rate regex capture group and block ───────────────────────────────

  it('rate rule routes multi-char logKey PAYMENT_REFUND_FAILED through buildPrismaWhere', async () => {
    // The single-char mutant /rate\\(([A-Z_])\\)/ only captures one char, the
    // negated-class mutant /rate\\(([^A-Z_]+)\\)/ rejects uppercase chars — both
    // fail on PAYMENT_REFUND_FAILED. The block-removed mutant skips the return
    // entirely. All three cause logKey to arrive as undefined at buildPrismaWhere.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'rate(PAYMENT_REFUND_FAILED) over 5m > 0',
        forDuration: '5m',
        threshold: 0,
      }),
    ])
    countMock.mockResolvedValue(3)

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.logKey).toBe('PAYMENT_REFUND_FAILED')
  })

  // ── L106: findMany where clause — ObjectLiteral and BooleanLiteral mutants ────

  it('evaluate calls alertRule.findMany with exactly { where: { isEnabled: true } }', async () => {
    // Kills the two ObjectLiteral mutants (outer {} and inner {}) and the
    // BooleanLiteral mutant (isEnabled: false) that corrupt the findMany clause.
    await svc.evaluate()

    expect(findManyMock).toHaveBeenCalledWith({ where: { isEnabled: true } })
  })

  // ── L108: warning message content ────────────────────────────────────────────

  it('evaluate logs the exact warning message when alertRule.findMany throws', async () => {
    // Kills the StringLiteral mutant on the warn call that replaces the message with "".
    findManyMock.mockRejectedValue(new Error('db down'))
    const warnSpy = jest
      .spyOn(svc['logger'] as { warn: (msg: string) => void }, 'warn')
      .mockImplementation(() => undefined)

    await svc.evaluate()

    expect(warnSpy).toHaveBeenCalledWith('AlertsEvaluatorService: failed to fetch rules')
  })

  // ── L133: ConditionalExpression on the typeof level === string branch ─────────

  it('default rule (no level) passes level:undefined not true to buildPrismaWhere', async () => {
    // When the ConditionalExpression mutant replaces typeof parsed.level === 'string'
    // with true, any non-array level is passed as the TypeScript-casted value. For an
    // undefined level the result is still undefined at runtime, but if the mutant
    // replaces the whole nested ternary with true then callArg.level becomes true.
    const logs = new LogsService()
    const svcLocal = new AlertsEvaluatorService(prisma, logs, router)
    const buildWhereSpy = jest.spyOn(logs, 'buildPrismaWhere')
    findManyMock.mockResolvedValue([
      makeRule({ expr: 'count over 5m > 0', forDuration: '5m', threshold: 0 }),
    ])
    countMock.mockResolvedValue(3)

    await svcLocal.evaluate()

    expect(buildWhereSpy).toHaveBeenCalledTimes(1)
    const [callArg] = buildWhereSpy.mock.calls[0]!
    expect(callArg.level).toBeUndefined()
  })

  // ── L150: ConditionalExpression on >= branch — count > threshold kills false mutant

  it('rule with >= operator breaches when count is strictly greater than threshold', async () => {
    // count=2, threshold=1 satisfies count >= threshold (true) but NOT count === threshold.
    // The false mutant replaces the >= condition with false, making the arm fall to the
    // '==' check: 2 === 1 is false → no breach. Correct code must fire the incident.
    findManyMock.mockResolvedValue([
      makeRule({
        expr: 'count(level = fatal) over 1m >= 1',
        forDuration: '1m',
        threshold: 1,
      }),
    ])
    countMock.mockResolvedValue(2)
    findFirstMock.mockResolvedValue(null)

    await svc.evaluate()

    expect(createMock).toHaveBeenCalledTimes(1)
  })

  // ── L141: applicationLog.count called with non-empty where clause ─────────────

  it('applicationLog.count is called with a where clause, not an empty object', async () => {
    // Kills the ObjectLiteral mutant on L141 that replaces { where } with {}.
    await svc.evaluate()

    expect(countMock).toHaveBeenCalledTimes(1)
    expect(countMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }))
  })

  // ── L183: incident.create timeline entry shape ────────────────────────────────

  it('incident.create data contains a timeline entry with actor:system and action:triggered', async () => {
    // Kills ObjectLiteral ({}) and StringLiteral ("") mutants on the timeline array
    // literal in maybeFireIncident that corrupt the initial event entry.
    await svc.evaluate()

    const createArg = (
      createMock.mock.calls[0] as [{ data: { timeline: Array<{ actor: string; action: string }> } }]
    )[0]
    expect(createArg.data.timeline).toHaveLength(1)
    expect(createArg.data.timeline[0]!.actor).toBe('system')
    expect(createArg.data.timeline[0]!.action).toBe('triggered')
  })

  // ── L187: logger.warn message in maybeFireIncident ───────────────────────────

  it('maybeFireIncident logs a warn containing the rule name and count', async () => {
    // Kills the StringLiteral mutant that empties the template literal on the warn call.
    const warnSpy = jest
      .spyOn(svc['logger'] as { warn: (msg: string) => void }, 'warn')
      .mockImplementation(() => undefined)

    await svc.evaluate()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const msg = String(warnSpy.mock.calls[0]![0])
    expect(msg).toContain('Error spike')
    expect(msg).toContain('5')
  })

  // ── L188: router.notify event type string ────────────────────────────────────

  it('router.notify is called with triggered as the third argument', async () => {
    // Kills the StringLiteral mutant that replaces 'triggered' with "" in the notify call.
    await svc.evaluate()

    expect(notifySpy).toHaveBeenCalledTimes(1)
    const eventType = notifySpy.mock.calls[0]![2]
    expect(eventType).toBe('triggered')
  })

  // ── L203: incident.update resolve timeline entry shape ────────────────────────

  it('incident.update data contains an auto-resolved entry with actor:system', async () => {
    // Kills ObjectLiteral ({}) and StringLiteral ("") mutants on the timeline.push
    // call in maybeResolve that corrupt the auto-resolve event entry.
    countMock.mockResolvedValue(0)
    findFirstMock.mockResolvedValue(
      makeIncident({ status: 'triggered', timeline: [] } as Partial<Incident>),
    )

    await svc.evaluate()

    const updateArg = (
      updateMock.mock.calls[0] as [{ data: { timeline: Array<{ actor: string; action: string }> } }]
    )[0]
    expect(updateArg.data.timeline).toHaveLength(1)
    expect(updateArg.data.timeline[0]!.actor).toBe('system')
    expect(updateArg.data.timeline[0]!.action).toBe('auto-resolved')
  })

  // ── L210: logger.log message in maybeResolve ────────────────────────────────

  it('maybeResolve logs a message containing the incident id and rule name', async () => {
    // Kills the StringLiteral mutant that empties the template literal on the log call.
    countMock.mockResolvedValue(0)
    const existingIncident = makeIncident({
      status: 'triggered',
      id: 'inc-99',
      timeline: [],
    } as Partial<Incident>)
    findFirstMock.mockResolvedValue(existingIncident)

    const logSpy = jest
      .spyOn(svc['logger'] as { log: (msg: string) => void }, 'log')
      .mockImplementation(() => undefined)

    await svc.evaluate()

    expect(logSpy).toHaveBeenCalledTimes(1)
    const msg = String(logSpy.mock.calls[0]![0])
    expect(msg).toContain('inc-99')
    expect(msg).toContain('Error spike')
  })
})

describe('ChannelRouterService', () => {
  it('routes critical severity to both webhook and Slack channels', () => {
    /**
     * `severity=critical` must notify both the Slack and the webhook channels.
     * The email-mock channel is also critical-severity by default.
     */
    const router = new ChannelRouterService()
    const logSpy = jest
      .spyOn(router['logger'] as { log: (msg: string) => void }, 'log')
      .mockImplementation(() => undefined)

    router.notify(makeRule({ severity: 'critical' }), makeIncident(), 'triggered')

    // Three channels have 'critical' severity in the default list.
    expect(logSpy).toHaveBeenCalledTimes(3)
    const calls = logSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('slack'))).toBe(true)
    expect(calls.some((c) => c.includes('webhook'))).toBe(true)
  })

  it('routes warning severity only to Slack', () => {
    /**
     * `severity=warning` must notify only the Slack channel (which handles both
     * critical and warning), not the webhook or email channels.
     */
    const router = new ChannelRouterService()
    const logSpy = jest
      .spyOn(router['logger'] as { log: (msg: string) => void }, 'log')
      .mockImplementation(() => undefined)

    router.notify(makeRule({ severity: 'warning' }), makeIncident(), 'triggered')

    expect(logSpy).toHaveBeenCalledTimes(1)
    const call = String(logSpy.mock.calls[0]?.[0])
    expect(call).toContain('slack')
  })
})
