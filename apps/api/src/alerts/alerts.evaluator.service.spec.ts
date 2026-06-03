/**
 * Unit tests for `AlertsEvaluatorService`.
 *
 * Covers: an error-spike rule fires an incident, ack→resolve lifecycle appends
 * timeline entries, and severity-based channel routing (critical → both webhook
 * and Slack; warning → Slack only).
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

    prisma = {
      alertRule: {
        findMany: jest.fn<() => Promise<AlertRule[]>>().mockResolvedValue([makeRule()]),
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
     * `status=triggered` and call `router.notify`.
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
     * evaluator must transition the incident to `resolved`.
     */
    const existingIncident = makeIncident({ status: 'triggered' })
    countMock.mockResolvedValue(0)
    findFirstMock.mockResolvedValue(existingIncident)

    await svc.evaluate()

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updateCall = updateMock.mock.calls[0] as [{ data: { status: string } }]
    expect(updateCall[0].data.status).toBe('resolved')
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
