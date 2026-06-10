/**
 * Unit tests for `AlertsChannelsController`.
 *
 * Covers `GET /alerts/channels` (viewer forbidden vs operator/admin allowed),
 * `POST /alerts/channels` (admin-only create with audit record and optional
 * tenantId), and `POST /alerts/channels/:id/test` (viewer forbidden vs allowed
 * test-fire). The underlying `ChannelRouterService` and `AuditService` are mocked.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ForbiddenException } from '@nestjs/common'

import type { ChannelRouterService } from './channel-router.service.js'
import type { AuditService } from '../governance/audit.service.js'
import { AlertsChannelsController, createChannelSchema } from './alerts.channels.controller.js'

/** Typed alias for the mocked service surfaces. */
type MockFn = ReturnType<typeof jest.fn>

/** A valid channel body matching `createChannelSchema`. */
const sampleChannel = {
  id: 'pager',
  type: 'webhook' as const,
  name: 'PagerDuty',
  endpoint: 'https://events.pagerduty.example/mock',
  severities: ['critical' as const],
}

describe('AlertsChannelsController.list', () => {
  let listChannelsMock: MockFn
  let router: ChannelRouterService
  let recordMock: MockFn
  let audit: AuditService
  let controller: AlertsChannelsController

  beforeEach(() => {
    listChannelsMock = jest.fn(() => [{ id: 'slack-critical' }])
    router = { listChannels: listChannelsMock } as unknown as ChannelRouterService
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue()
    audit = { record: recordMock } as unknown as AuditService
    controller = new AlertsChannelsController(router, audit)
  })

  it('forbids viewers from listing channels', () => {
    /**
     * Listing channels is operator+; a `viewer` must be rejected with a
     * `ForbiddenException` before the registry is read.
     */
    expect(() => controller.list({ 'x-role': 'viewer' })).toThrow(ForbiddenException)
    expect(listChannelsMock).not.toHaveBeenCalled()
  })

  it('returns the channel registry for an operator', () => {
    /**
     * A non-viewer (operator by default) is allowed to read the registry, so the
     * router result is returned verbatim.
     */
    const result = controller.list({ 'x-role': 'operator' })

    expect(result).toEqual([{ id: 'slack-critical' }])
    expect(listChannelsMock).toHaveBeenCalledTimes(1)
  })

  it('throws ForbiddenException with the exact viewer-denied message on list', () => {
    /**
     * Scenario: viewer tries to list channels.
     * Rule: the exact message `'Viewers cannot list notification channels'` must be
     * on the thrown exception — kills the StringLiteral mutation on the message text.
     */
    let thrown: unknown
    try {
      controller.list({ 'x-role': 'viewer' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ForbiddenException)
    expect((thrown as ForbiddenException).message).toBe('Viewers cannot list notification channels')
  })
})

describe('AlertsChannelsController.create', () => {
  let addChannelMock: MockFn
  let router: ChannelRouterService
  let recordMock: MockFn
  let audit: AuditService
  let controller: AlertsChannelsController

  beforeEach(() => {
    addChannelMock = jest.fn()
    router = { addChannel: addChannelMock } as unknown as ChannelRouterService
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue()
    audit = { record: recordMock } as unknown as AuditService
    controller = new AlertsChannelsController(router, audit)
  })

  it('forbids non-admins from adding a channel', async () => {
    /**
     * Channel creation is admin-only; an operator must be rejected with a
     * `ForbiddenException` and nothing is registered or audited.
     */
    await expect(controller.create({ 'x-role': 'operator' }, sampleChannel)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(addChannelMock).not.toHaveBeenCalled()
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('registers a channel and records an audit event with tenantId for an admin', async () => {
    /**
     * An admin supplying `x-tenant-id` must register the channel and write an
     * audit record that includes the `tenantId` (the spread branch where
     * `tenantId !== undefined`).
     */
    const result = await controller.create(
      { 'x-role': 'admin', 'x-tenant-id': 'acme', 'x-actor': 'root' },
      sampleChannel,
    )

    expect(result).toEqual({ ok: true, channel: sampleChannel })
    expect(addChannelMock).toHaveBeenCalledWith(sampleChannel)
    expect(recordMock).toHaveBeenCalledWith({
      actor: 'root',
      action: 'channel.created',
      target: 'Channel:pager',
      tenantId: 'acme',
    })
  })

  it('omits tenantId from the audit record when none is supplied', async () => {
    /**
     * An admin without `x-tenant-id` must still register the channel, but the
     * audit record must NOT carry a `tenantId` key (the empty-spread branch).
     */
    await controller.create({ 'x-role': 'admin', 'x-actor': 'root' }, sampleChannel)

    expect(recordMock).toHaveBeenCalledWith({
      actor: 'root',
      action: 'channel.created',
      target: 'Channel:pager',
    })
  })

  it('throws ForbiddenException with the exact non-admin-denied message on create', async () => {
    /**
     * Scenario: non-admin operator tries to add a channel.
     * Rule: the exact message `'Only admins can add channels'` must appear on the
     * thrown exception — kills the StringLiteral mutation on the message text.
     */
    let thrown: unknown
    try {
      await controller.create({ 'x-role': 'operator' }, sampleChannel)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ForbiddenException)
    expect((thrown as ForbiddenException).message).toBe('Only admins can add channels')
  })

  it('response ok property is strictly true, not just truthy', async () => {
    /**
     * Scenario: admin creates a channel successfully.
     * Rule: `result.ok` must be boolean `true` (not merely truthy) — kills the
     * StringLiteral mutation that changes the `ok: true` object literal value.
     */
    const result = (await controller.create(
      { 'x-role': 'admin', 'x-actor': 'root' },
      sampleChannel,
    )) as { ok: boolean; channel: typeof sampleChannel }
    expect(result.ok).toBe(true)
    expect(result.channel).toBe(sampleChannel)
  })
})

describe('AlertsChannelsController.testFire', () => {
  let testFireMock: MockFn
  let router: ChannelRouterService
  let controller: AlertsChannelsController

  beforeEach(() => {
    testFireMock = jest.fn(() => true)
    router = { testFire: testFireMock } as unknown as ChannelRouterService
    const audit = { record: jest.fn() } as unknown as AuditService
    controller = new AlertsChannelsController(router, audit)
  })

  it('forbids viewers from test-firing a channel', () => {
    /**
     * Test-firing is operator+; a `viewer` must be rejected with a
     * `ForbiddenException` before the router is touched.
     */
    expect(() => controller.testFire('slack-critical', { 'x-role': 'viewer' })).toThrow(
      ForbiddenException,
    )
    expect(testFireMock).not.toHaveBeenCalled()
  })

  it('delegates to the router and returns its ok flag for an operator', () => {
    /**
     * A non-viewer may test-fire; the controller forwards the id and returns the
     * router's boolean result wrapped as `{ ok }`.
     */
    const result = controller.testFire('slack-critical', { 'x-role': 'operator' })

    expect(result).toEqual({ ok: true })
    expect(testFireMock).toHaveBeenCalledWith('slack-critical')
  })

  it('throws ForbiddenException with the exact viewer-denied message on testFire', () => {
    /**
     * Scenario: viewer tries to test-fire a channel.
     * Rule: the exact message `'Viewers cannot test-fire channels'` must appear
     * on the thrown exception — kills the StringLiteral mutation on the message text.
     */
    let thrown: unknown
    try {
      controller.testFire('slack-critical', { 'x-role': 'viewer' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ForbiddenException)
    expect((thrown as ForbiddenException).message).toBe('Viewers cannot test-fire channels')
  })
})

describe('createChannelSchema — validation', () => {
  /** A fully valid channel payload matching the schema. */
  const validChannel = {
    id: 'slack-1',
    type: 'slack' as const,
    name: 'Slack Alerts',
    endpoint: 'https://hooks.slack.example/mock',
    severities: ['critical' as const],
  }

  it('requires at least one severity entry', () => {
    /**
     * Scenario: empty severities array.
     * Rule: `z.array(...).min(1)` must reject an empty severities list — kills the
     * MethodExpression mutation that removes the `.min(1)` constraint.
     */
    expect(() => createChannelSchema.parse({ ...validChannel, severities: [] })).toThrow()
  })

  it('accepts two-severity array — kills z.array().max(1) mutant', () => {
    /**
     * Scenario: both 'critical' and 'warning' supplied together.
     * Rule: the schema allows multiple severities, so a two-element array must parse
     * successfully.  Under the mutant `z.array(...).max(1)`, a two-element array
     * would be rejected — making this test fail and killing the mutant.
     */
    expect(() =>
      createChannelSchema.parse({ ...validChannel, severities: ['critical', 'warning'] }),
    ).not.toThrow()
  })

  it('accepts all valid channel types', () => {
    /**
     * Scenario: each enum variant for `type`.
     * Rule: `'slack'`, `'webhook'`, and `'email-mock'` must all parse successfully —
     * kills the StringLiteral mutation that changes any enum value.
     */
    for (const type of ['slack', 'webhook', 'email-mock'] as const) {
      expect(() => createChannelSchema.parse({ ...validChannel, type })).not.toThrow()
    }
  })

  it('rejects unknown channel types', () => {
    /**
     * Scenario: an unrecognised type string.
     * Rule: the enum is closed — unknown types must throw, confirming the enum
     * covers exactly the three documented channel types.
     */
    expect(() => createChannelSchema.parse({ ...validChannel, type: 'sms' })).toThrow()
  })

  it('rejects an empty id string — kills z.string().max(1) mutant on id', () => {
    /**
     * Scenario: id is an empty string.
     * Rule: `z.string().min(1)` must reject `''` — kills the MethodExpression
     * mutant that replaces `.min(1)` with `.max(1)` on the `id` field.
     */
    expect(() => createChannelSchema.parse({ ...validChannel, id: '' })).toThrow()
  })

  it('rejects an empty name string — kills z.string().max(1) mutant on name', () => {
    /**
     * Scenario: name is an empty string.
     * Rule: `z.string().min(1)` on `name` must reject `''` — kills the
     * MethodExpression mutant that replaces `.min(1)` with `.max(1)`.
     */
    expect(() => createChannelSchema.parse({ ...validChannel, name: '' })).toThrow()
  })

  it('rejects a name longer than 200 characters — kills z.string().min(200) mutant', () => {
    /**
     * Scenario: name exceeds the 200-char maximum.
     * Rule: `z.string().max(200)` must reject a 201-character name — kills the
     * MethodExpression mutant that replaces `.max(200)` with `.min(200)`.
     */
    expect(() => createChannelSchema.parse({ ...validChannel, name: 'x'.repeat(201) })).toThrow()
  })

  it('rejects an empty endpoint string — kills z.string().max(1) mutant on endpoint', () => {
    /**
     * Scenario: endpoint is an empty string.
     * Rule: `z.string().min(1)` on `endpoint` must reject `''` — kills the
     * MethodExpression mutant that replaces `.min(1)` with `.max(1)`.
     */
    expect(() => createChannelSchema.parse({ ...validChannel, endpoint: '' })).toThrow()
  })

  it('accepts critical and warning as exact severity enum values', () => {
    /**
     * Scenario: each documented severity value supplied individually.
     * Rule: exactly `'critical'` and `'warning'` must be accepted — kills both
     * StringLiteral mutants that replace each enum string with `''`, and the
     * ArrayDeclaration mutant that empties the enum array.
     */
    expect(() =>
      createChannelSchema.parse({ ...validChannel, severities: ['critical'] }),
    ).not.toThrow()
    expect(() =>
      createChannelSchema.parse({ ...validChannel, severities: ['warning'] }),
    ).not.toThrow()
  })

  it('rejects an unrecognised severity value', () => {
    /**
     * Scenario: a severity string not in the enum.
     * Rule: `z.enum(['critical','warning'])` must reject unknown strings — kills
     * the StringLiteral mutants that would widen or empty the enum.
     */
    expect(() => createChannelSchema.parse({ ...validChannel, severities: ['error'] })).toThrow()
  })
})

describe('AlertsChannelsController.create — L72 conditional tenantId spread', () => {
  let addChannelMock: ReturnType<typeof jest.fn>
  let recordMock: ReturnType<typeof jest.fn>
  let router: import('./channel-router.service.js').ChannelRouterService
  let audit: import('../governance/audit.service.js').AuditService
  let controller: AlertsChannelsController

  beforeEach(() => {
    addChannelMock = jest.fn()
    router = {
      addChannel: addChannelMock,
    } as unknown as import('./channel-router.service.js').ChannelRouterService
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    audit = {
      record: recordMock,
    } as unknown as import('../governance/audit.service.js').AuditService
    controller = new AlertsChannelsController(router, audit)
  })

  it('audit record has no tenantId OWN property when context carries no tenantId', async () => {
    /**
     * Scenario: admin with no `x-tenant-id` header.
     * Rule: the spread `...(ctx.tenantId !== undefined ? { tenantId } : {})` must
     * produce an object whose `tenantId` key is ABSENT (not merely undefined) — kills
     * the ConditionalExpression mutant `true` that always spreads `{ tenantId:
     * undefined }`. Jest's `toHaveBeenCalledWith` ignores undefined-valued keys, so
     * a direct `hasOwnProperty` check is required here.
     */
    const sampleCh = {
      id: 'pager',
      type: 'webhook' as const,
      name: 'PagerDuty',
      endpoint: 'https://events.pagerduty.example/mock',
      severities: ['critical' as const],
    }
    await controller.create({ 'x-role': 'admin', 'x-actor': 'root' }, sampleCh)

    const callArg = recordMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(callArg, 'tenantId')).toBe(false)
  })
})
