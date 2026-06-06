/**
 * Unit tests for `IncidentsController`.
 *
 * Covers `GET /incidents` (non-admin gets `[]`, admin gets enriched rows with a
 * deepLink built from `logKey`) and `PATCH /incidents/:id` lifecycle transitions
 * (forbidden for a tenant-less non-admin, not-found guard, acknowledge / snooze /
 * resolve status mapping, default-vs-explicit snooze duration, timeline append
 * for both array and non-array starting timelines, and audit record with/without
 * tenantId). Prisma and `AuditService` are mocked.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Incident } from '@prisma/client'

import type { PrismaService } from '../prisma/prisma.service.js'
import type { AuditService } from '../governance/audit.service.js'
import { IncidentsController } from './incidents.controller.js'

/** Typed alias for the mocked Prisma / audit surfaces. */
type MockFn = ReturnType<typeof jest.fn>

/** Build a minimal `Incident` row with overridable fields. */
function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-1',
    ruleId: 'rule-1',
    status: 'triggered',
    logKey: 'PAYMENT_REFUND_FAILED',
    openedAt: new Date('2026-01-01T00:00:00.000Z'),
    resolvedAt: null,
    timeline: [],
    ...overrides,
  }
}

describe('IncidentsController.list', () => {
  let findManyMock: MockFn
  let prisma: PrismaService
  let controller: IncidentsController

  beforeEach(() => {
    findManyMock = jest.fn<() => Promise<Incident[]>>().mockResolvedValue([makeIncident()])
    prisma = {
      incident: { findMany: findManyMock, findUnique: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService
    const audit = { record: jest.fn() } as unknown as AuditService
    controller = new IncidentsController(prisma, audit)
  })

  it('returns an empty array for a non-admin caller', async () => {
    /**
     * Incident/AlertRule carry no `tenantId`, so a non-admin caller must receive
     * `[]` rather than any cross-tenant rows — the find is never issued.
     */
    const result = await controller.list({ 'x-role': 'operator' })

    expect(result).toEqual([])
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('returns enriched rows with a deepLink for an admin', async () => {
    /**
     * An admin reads every incident; each row is augmented with a `deepLink`
     * encoding its `logKey` and `openedAt` ISO timestamp.
     */
    const result = (await controller.list({ 'x-role': 'admin' })) as Array<{ deepLink: string }>

    expect(findManyMock).toHaveBeenCalledWith({
      include: { rule: true },
      orderBy: { openedAt: 'desc' },
    })
    expect(result[0]?.deepLink).toBe(
      '/explorer?logKey=PAYMENT_REFUND_FAILED&from=2026-01-01T00%3A00%3A00.000Z',
    )
  })

  it('encodes an empty logKey when the incident has none', async () => {
    /**
     * A null `logKey` must collapse to an empty string in the deepLink (the
     * `?? ''` fallback) rather than emitting the literal `null`.
     */
    findManyMock.mockResolvedValue([makeIncident({ logKey: null })])

    const result = (await controller.list({ 'x-role': 'admin' })) as Array<{ deepLink: string }>

    expect(result[0]?.deepLink).toBe('/explorer?logKey=&from=2026-01-01T00%3A00%3A00.000Z')
  })
})

describe('IncidentsController.transition', () => {
  let findUniqueMock: MockFn
  let updateMock: MockFn
  let recordMock: MockFn
  let prisma: PrismaService
  let audit: AuditService
  let controller: IncidentsController

  beforeEach(() => {
    findUniqueMock = jest.fn<() => Promise<Incident | null>>().mockResolvedValue(makeIncident())
    updateMock = jest
      .fn<(args: { data: Incident }) => Promise<Incident>>()
      .mockImplementation(async (args) => makeIncident(args.data))
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue()
    prisma = {
      incident: { findUnique: findUniqueMock, update: updateMock, findMany: jest.fn() },
    } as unknown as PrismaService
    audit = { record: recordMock } as unknown as AuditService
    controller = new IncidentsController(prisma, audit)
  })

  it('forbids a non-admin without a tenantId from mutating an incident', async () => {
    /**
     * A non-admin caller must supply `x-tenant-id` to mutate; without it the
     * transition is rejected before any read or write.
     */
    await expect(
      controller.transition('inc-1', { 'x-role': 'operator' }, { action: 'acknowledge' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(findUniqueMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws NotFound when the incident id does not exist', async () => {
    /**
     * A missing incident (null lookup) must raise `NotFoundException`; no update
     * or audit record is written.
     */
    findUniqueMock.mockResolvedValue(null)

    await expect(
      controller.transition('missing', { 'x-role': 'admin' }, { action: 'acknowledge' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(updateMock).not.toHaveBeenCalled()
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('acknowledges an incident, appending to the timeline and recording audit', async () => {
    /**
     * The `acknowledge` action sets `status=acknowledged`, leaves `resolvedAt`
     * null, appends one timeline entry, and writes an audit record. An admin
     * without tenantId exercises the empty-spread audit branch.
     */
    const result = (await controller.transition(
      'inc-1',
      { 'x-role': 'admin', 'x-actor': 'root' },
      { action: 'acknowledge' },
    )) as { status: string; resolvedAt: Date | null; deepLink: string }

    const updateArg = updateMock.mock.calls[0]?.[0] as {
      data: { status: string; resolvedAt: Date | null; timeline: Array<{ action: string }> }
    }
    expect(updateArg.data.status).toBe('acknowledged')
    expect(updateArg.data.resolvedAt).toBeNull()
    expect(updateArg.data.timeline).toHaveLength(1)
    expect(updateArg.data.timeline[0]).toMatchObject({ actor: 'root', action: 'acknowledge' })
    expect(result.deepLink).toContain('logKey=PAYMENT_REFUND_FAILED')
    expect(recordMock).toHaveBeenCalledWith({
      actor: 'root',
      action: 'incident.acknowledge',
      target: 'Incident:inc-1',
    })
  })

  it('snoozes with the explicit duration and includes tenantId in the audit record', async () => {
    /**
     * The `snooze` action sets `status=snoozed`, computes `resolvedAt` from the
     * explicit `snoozeDuration` (4h), and — with a tenantId present — records the
     * audit event including `tenantId` (the populated-spread branch).
     */
    const before = Date.now()
    await controller.transition(
      'inc-1',
      { 'x-role': 'admin', 'x-tenant-id': 'acme', 'x-actor': 'root' },
      { action: 'snooze', snoozeDuration: '4h' },
    )
    const after = Date.now()

    const updateArg = updateMock.mock.calls[0]?.[0] as {
      data: { status: string; resolvedAt: Date }
    }
    expect(updateArg.data.status).toBe('snoozed')
    const fourHoursMs = 4 * 60 * 60 * 1000
    expect(updateArg.data.resolvedAt.getTime()).toBeGreaterThanOrEqual(before + fourHoursMs)
    expect(updateArg.data.resolvedAt.getTime()).toBeLessThanOrEqual(after + fourHoursMs)
    expect(recordMock).toHaveBeenCalledWith({
      actor: 'root',
      action: 'incident.snooze',
      target: 'Incident:inc-1',
      tenantId: 'acme',
    })
  })

  it('snoozes with the default 1h duration when none is supplied', async () => {
    /**
     * Omitting `snoozeDuration` must fall back to the `1h` map entry (the
     * `?? '1h'` branch), producing a `resolvedAt` one hour in the future.
     */
    const before = Date.now()
    await controller.transition(
      'inc-1',
      { 'x-role': 'admin', 'x-tenant-id': 'acme' },
      { action: 'snooze' },
    )
    const after = Date.now()

    const updateArg = updateMock.mock.calls[0]?.[0] as { data: { resolvedAt: Date } }
    const oneHourMs = 60 * 60 * 1000
    expect(updateArg.data.resolvedAt.getTime()).toBeGreaterThanOrEqual(before + oneHourMs)
    expect(updateArg.data.resolvedAt.getTime()).toBeLessThanOrEqual(after + oneHourMs)
  })

  it('resolves an incident, setting status and resolvedAt to now', async () => {
    /**
     * The `resolve` action sets `status=resolved` and stamps `resolvedAt` with the
     * current time.
     */
    const before = Date.now()
    await controller.transition(
      'inc-1',
      { 'x-role': 'admin', 'x-tenant-id': 'acme' },
      { action: 'resolve' },
    )
    const after = Date.now()

    const updateArg = updateMock.mock.calls[0]?.[0] as {
      data: { status: string; resolvedAt: Date }
    }
    expect(updateArg.data.status).toBe('resolved')
    expect(updateArg.data.resolvedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(updateArg.data.resolvedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('preserves an existing array timeline when appending', async () => {
    /**
     * When the incident already has an array `timeline`, the new entry must be
     * appended to a copy of it (the `Array.isArray` true branch).
     */
    findUniqueMock.mockResolvedValue(
      makeIncident({
        timeline: [{ actor: 'a', action: 'acknowledge', at: 'x' }] as Incident['timeline'],
      }),
    )

    await controller.transition(
      'inc-1',
      { 'x-role': 'admin', 'x-tenant-id': 'acme' },
      { action: 'resolve' },
    )

    const updateArg = updateMock.mock.calls[0]?.[0] as { data: { timeline: unknown[] } }
    expect(updateArg.data.timeline).toHaveLength(2)
  })

  it('starts a fresh timeline when the stored value is not an array', async () => {
    /**
     * A non-array `timeline` (e.g. null or a JSON object) must be replaced by a
     * fresh single-entry array (the `Array.isArray` false branch).
     */
    findUniqueMock.mockResolvedValue(
      makeIncident({ timeline: null as unknown as Incident['timeline'] }),
    )

    await controller.transition(
      'inc-1',
      { 'x-role': 'admin', 'x-tenant-id': 'acme' },
      { action: 'acknowledge' },
    )

    const updateArg = updateMock.mock.calls[0]?.[0] as { data: { timeline: unknown[] } }
    expect(updateArg.data.timeline).toHaveLength(1)
  })

  it('encodes an empty logKey in the returned deepLink when none is set', async () => {
    /**
     * The updated incident's deepLink must collapse a null `logKey` to an empty
     * string (the `?? ''` fallback on the response path).
     */
    updateMock.mockResolvedValue(makeIncident({ logKey: null, status: 'resolved' }))

    const result = (await controller.transition(
      'inc-1',
      { 'x-role': 'admin', 'x-tenant-id': 'acme' },
      { action: 'resolve' },
    )) as { deepLink: string }

    expect(result.deepLink).toBe('/explorer?logKey=&from=2026-01-01T00:00:00.000Z')
  })
})
