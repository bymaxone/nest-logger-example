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
