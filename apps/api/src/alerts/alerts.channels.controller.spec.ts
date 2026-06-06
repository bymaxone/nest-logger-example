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
import { AlertsChannelsController } from './alerts.channels.controller.js'

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
})
