/**
 * Unit tests for `ChannelRouterService`.
 *
 * Covers severity-based routing (`critical` reaching every critical channel,
 * `warning` reaching only the Slack channel, and an unknown severity matching no
 * channel), the test-fire found / not-found branches, listing channels, and
 * registering a new channel. Delivery is asserted via the internal logger.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { AlertRule, Incident } from '@prisma/client'

import { ChannelRouterService, type NotificationChannel } from './channel-router.service.js'

/** Build a minimal `AlertRule` with overridable fields. */
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

/** Build a minimal `Incident` with overridable fields. */
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

describe('ChannelRouterService.notify', () => {
  let router: ChannelRouterService
  let logSpy: jest.SpiedFunction<(msg: string) => void>

  beforeEach(() => {
    router = new ChannelRouterService()
    logSpy = jest
      .spyOn(router['logger'] as { log: (msg: string) => void }, 'log')
      .mockImplementation(() => undefined)
  })

  it('delivers a critical alert to every critical-eligible channel', () => {
    /**
     * `severity=critical` matches all three default channels (slack, webhook,
     * email-mock), so `deliver` must run once per channel and each payload must
     * carry the channel, rule, incident, event and severity.
     */
    router.notify(makeRule({ severity: 'critical' }), makeIncident(), 'triggered')

    expect(logSpy).toHaveBeenCalledTimes(3)
    const calls = logSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('type=slack'))).toBe(true)
    expect(calls.some((c) => c.includes('type=webhook'))).toBe(true)
    expect(calls.some((c) => c.includes('type=email-mock'))).toBe(true)
    expect(calls.every((c) => c.includes('event=triggered'))).toBe(true)
    expect(calls.every((c) => c.includes('severity=critical'))).toBe(true)
  })

  it('delivers a warning alert only to the Slack channel', () => {
    /**
     * Only the Slack channel lists `warning` among its severities, so a warning
     * rule must deliver exactly once and only to Slack.
     */
    router.notify(makeRule({ severity: 'warning' }), makeIncident(), 'triggered')

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(String(logSpy.mock.calls[0]?.[0])).toContain('type=slack')
  })

  it('delivers nothing when no channel handles the severity', () => {
    /**
     * An unknown severity matches no channel, so the `eligible` list is empty and
     * the delivery loop body never runs — the no-match path.
     */
    router.notify(
      makeRule({ severity: 'info' as AlertRule['severity'] }),
      makeIncident(),
      'triggered',
    )

    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('ChannelRouterService.testFire', () => {
  let router: ChannelRouterService
  let logSpy: jest.SpiedFunction<(msg: string) => void>

  beforeEach(() => {
    router = new ChannelRouterService()
    logSpy = jest
      .spyOn(router['logger'] as { log: (msg: string) => void }, 'log')
      .mockImplementation(() => undefined)
  })

  it('returns true and logs when the channel id exists', () => {
    /**
     * A test-fire against a registered channel id must dispatch the mock delivery
     * (logged once) and return `true`.
     */
    const ok = router.testFire('slack-critical')

    expect(ok).toBe(true)
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(String(logSpy.mock.calls[0]?.[0])).toContain('[TEST-FIRE]')
  })

  it('returns false and logs nothing for an unknown channel id', () => {
    /**
     * An unknown channel id resolves to `undefined`, so test-fire returns `false`
     * without logging — the not-found guard.
     */
    const ok = router.testFire('does-not-exist')

    expect(ok).toBe(false)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('testFire log includes the exact channel type and endpoint for slack-critical', () => {
    /**
     * Scenario: test-fire the default slack-critical channel.
     * Rule: the log message must contain the channel's exact `type` string
     * `'slack'` and endpoint string `'https://hooks.slack.example/mock/critical'`
     * — kills the six StringLiteral mutations at L37–L38 and their sibling
     * lines in DEFAULT_CHANNELS.
     */
    router.testFire('slack-critical')
    const msg = String(logSpy.mock.calls[0]?.[0])
    expect(msg).toContain('type=slack')
    expect(msg).toContain('endpoint=https://hooks.slack.example/mock/critical')
  })

  it('testFire log includes the exact type and endpoint for webhook-critical', () => {
    /**
     * Scenario: test-fire the webhook-critical channel.
     * Rule: confirms `type=webhook` and the exact endpoint
     * `'https://ops.example/webhook/critical'` — kills StringLiteral mutations
     * on L44–L45 of DEFAULT_CHANNELS.
     */
    router.testFire('webhook-critical')
    const msg = String(logSpy.mock.calls[0]?.[0])
    expect(msg).toContain('type=webhook')
    expect(msg).toContain('endpoint=https://ops.example/webhook/critical')
  })

  it('testFire log includes the exact type and endpoint for email-mock', () => {
    /**
     * Scenario: test-fire the email-mock channel.
     * Rule: confirms `type=email-mock` and the exact endpoint `'ops@example.com'`
     * — kills StringLiteral mutations on L51–L52 of DEFAULT_CHANNELS.
     */
    router.testFire('email-mock')
    const msg = String(logSpy.mock.calls[0]?.[0])
    expect(msg).toContain('type=email-mock')
    expect(msg).toContain('endpoint=ops@example.com')
  })
})

describe('ChannelRouterService.listChannels / addChannel', () => {
  it('returns the default channel registry', () => {
    /**
     * `listChannels` exposes the in-memory registry, which seeds with the three
     * default channels.
     */
    const router = new ChannelRouterService()

    const channels = router.listChannels()

    expect(channels).toHaveLength(3)
    expect(channels.map((c) => c.id)).toEqual(['slack-critical', 'webhook-critical', 'email-mock'])
  })

  it('appends a newly registered channel to the registry', () => {
    /**
     * `addChannel` mutates the registry; the new channel must then be visible via
     * `listChannels` and reachable for a matching-severity test-fire.
     */
    const router = new ChannelRouterService()
    const extra: NotificationChannel = {
      id: 'pager',
      type: 'webhook',
      name: 'PagerDuty',
      endpoint: 'https://events.pagerduty.example/mock',
      severities: ['critical'],
    }

    router.addChannel(extra)

    expect(router.listChannels()).toHaveLength(4)
    expect(router.listChannels().some((c) => c.id === 'pager')).toBe(true)
    expect(router.testFire('pager')).toBe(true)
  })

  it('each default channel has the correct endpoint and severities values', () => {
    /**
     * Scenario: inspect the default channel registry directly.
     * Rule: each channel's `endpoint` and `severities` array must match the exact
     * default values — kills the StringLiteral mutations on the endpoint strings
     * and ArrayDeclaration mutations on the severities arrays.
     */
    const router = new ChannelRouterService()
    const channels = router.listChannels()

    const slack = channels.find((c) => c.id === 'slack-critical')
    const webhook = channels.find((c) => c.id === 'webhook-critical')
    const email = channels.find((c) => c.id === 'email-mock')

    expect(slack?.endpoint).toBe('https://hooks.slack.example/mock/critical')
    expect(slack?.severities).toEqual(['critical', 'warning'])

    expect(webhook?.endpoint).toBe('https://ops.example/webhook/critical')
    expect(webhook?.severities).toEqual(['critical'])

    expect(email?.endpoint).toBe('ops@example.com')
    expect(email?.severities).toEqual(['critical'])
  })
})
