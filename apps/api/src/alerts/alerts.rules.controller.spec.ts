/**
 * Unit tests for `AlertsRulesController`.
 *
 * Covers `GET /alerts/rules` (open read), `POST /alerts/rules` (viewer forbidden
 * vs operator/admin create with audit + optional tenantId), and
 * `PATCH /alerts/rules/:id` (viewer forbidden, undefined-field filtering, and
 * audit record with/without tenantId). Prisma and `AuditService` are mocked.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ForbiddenException } from '@nestjs/common'

import type { PrismaService } from '../prisma/prisma.service.js'
import type { AuditService } from '../governance/audit.service.js'
import {
  AlertsRulesController,
  createRuleSchema,
  updateRuleSchema,
} from './alerts.rules.controller.js'

/** Typed alias for the mocked Prisma / audit surfaces. */
type MockFn = ReturnType<typeof jest.fn>

/** A valid create body matching `createRuleSchema`. */
const createBody = {
  name: 'Error spike',
  expr: 'count(level ∈ {error,fatal}) by logKey over 5m > 0',
  threshold: 0,
  forDuration: '5m',
  severity: 'critical' as const,
  channels: [],
}

describe('AlertsRulesController.list', () => {
  it('returns all rules ordered newest-first', async () => {
    /**
     * Listing is open to all roles and must read every rule ordered by
     * `createdAt desc`.
     */
    const findManyMock: MockFn = jest
      .fn<() => Promise<unknown[]>>()
      .mockResolvedValue([{ id: 'r1' }])
    const prisma = {
      alertRule: { findMany: findManyMock, create: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService
    const audit = { record: jest.fn() } as unknown as AuditService
    const controller = new AlertsRulesController(prisma, audit)

    const result = await controller.list()

    expect(result).toEqual([{ id: 'r1' }])
    expect(findManyMock).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } })
  })
})

describe('AlertsRulesController.create', () => {
  let createMock: MockFn
  let recordMock: MockFn
  let prisma: PrismaService
  let audit: AuditService
  let controller: AlertsRulesController

  beforeEach(() => {
    createMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'rule-new' })
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue()
    prisma = {
      alertRule: { create: createMock, findMany: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService
    audit = { record: recordMock } as unknown as AuditService
    controller = new AlertsRulesController(prisma, audit)
  })

  it('forbids viewers from creating a rule', async () => {
    /**
     * Rule creation is operator+; a `viewer` must be rejected with a
     * `ForbiddenException` and nothing is written or audited.
     */
    await expect(controller.create({ 'x-role': 'viewer' }, createBody)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(createMock).not.toHaveBeenCalled()
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('creates a rule and records an audit event with tenantId for an operator', async () => {
    /**
     * An operator with `x-tenant-id` must persist the rule and write an audit
     * record carrying the `tenantId` (the populated-spread branch).
     */
    const result = await controller.create(
      { 'x-role': 'operator', 'x-tenant-id': 'acme', 'x-actor': 'alice' },
      createBody,
    )

    expect(result).toEqual({ id: 'rule-new' })
    expect(createMock).toHaveBeenCalledWith({ data: createBody })
    expect(recordMock).toHaveBeenCalledWith({
      actor: 'alice',
      action: 'rule.created',
      target: 'AlertRule:rule-new',
      tenantId: 'acme',
    })
  })

  it('omits tenantId from the audit record when none is supplied', async () => {
    /**
     * An admin without `x-tenant-id` must still create the rule, but the audit
     * record must NOT carry a `tenantId` key (the empty-spread branch).
     */
    await controller.create({ 'x-role': 'admin', 'x-actor': 'root' }, createBody)

    expect(recordMock).toHaveBeenCalledWith({
      actor: 'root',
      action: 'rule.created',
      target: 'AlertRule:rule-new',
    })
  })

  it('audit record carries no tenantId key at all when x-tenant-id is absent (strict equality)', async () => {
    /**
     * Scenario: admin creates a rule without x-tenant-id header.
     * Rule: the conditional spread `ctx.tenantId !== undefined ? { tenantId } : {}` must
     * produce an object with NO tenantId key — not even undefined — when tenantId is absent.
     * toStrictEqual (unlike toEqual) treats `{ tenantId: undefined }` as distinct from `{}`,
     * so a mutant that replaces the condition with `true` is killed here.
     */
    await controller.create({ 'x-role': 'admin', 'x-actor': 'root' }, createBody)
    const callArg = recordMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArg).toStrictEqual({
      actor: 'root',
      action: 'rule.created',
      target: 'AlertRule:rule-new',
    })
  })

  it('throws a ForbiddenException with the exact viewer-denied message on create', async () => {
    /**
     * Scenario: a viewer tries to create a rule.
     * Rule: the `ForbiddenException` message must equal the exact string
     * `'Viewers cannot create alert rules'` — kills the StringLiteral mutation
     * that changes the message text.
     */
    let thrown: unknown
    try {
      await controller.create({ 'x-role': 'viewer' }, createBody)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ForbiddenException)
    expect((thrown as ForbiddenException).message).toBe('Viewers cannot create alert rules')
  })
})

describe('AlertsRulesController.update', () => {
  let updateMock: MockFn
  let recordMock: MockFn
  let prisma: PrismaService
  let audit: AuditService
  let controller: AlertsRulesController

  beforeEach(() => {
    updateMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'rule-1' })
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue()
    prisma = {
      alertRule: { update: updateMock, findMany: jest.fn(), create: jest.fn() },
    } as unknown as PrismaService
    audit = { record: recordMock } as unknown as AuditService
    controller = new AlertsRulesController(prisma, audit)
  })

  it('forbids viewers from updating a rule', async () => {
    /**
     * Rule updates are operator+; a `viewer` must be rejected with a
     * `ForbiddenException` and nothing is written or audited.
     */
    await expect(
      controller.update('rule-1', { 'x-role': 'viewer' }, { name: 'renamed' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(updateMock).not.toHaveBeenCalled()
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('strips undefined fields and records the update with tenantId for an operator', async () => {
    /**
     * The partial body may carry `undefined` values; those must be filtered out
     * of the Prisma `data` payload, and the audit record must include the
     * `tenantId` (the populated-spread branch).
     */
    const result = await controller.update(
      'rule-1',
      { 'x-role': 'operator', 'x-tenant-id': 'acme', 'x-actor': 'alice' },
      { name: 'renamed', threshold: undefined, isEnabled: false },
    )

    expect(result).toEqual({ id: 'rule-1' })
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { name: 'renamed', isEnabled: false },
    })
    expect(recordMock).toHaveBeenCalledWith({
      actor: 'alice',
      action: 'rule.updated',
      target: 'AlertRule:rule-1',
      tenantId: 'acme',
    })
  })

  it('omits tenantId from the audit record when none is supplied', async () => {
    /**
     * An admin without `x-tenant-id` must still apply the update, but the audit
     * record must NOT carry a `tenantId` key (the empty-spread branch).
     */
    await controller.update('rule-1', { 'x-role': 'admin', 'x-actor': 'root' }, { name: 'renamed' })

    expect(recordMock).toHaveBeenCalledWith({
      actor: 'root',
      action: 'rule.updated',
      target: 'AlertRule:rule-1',
    })
  })

  it('audit record carries no tenantId key at all when x-tenant-id is absent (strict equality)', async () => {
    /**
     * Scenario: admin updates a rule without x-tenant-id header.
     * Rule: the conditional spread must produce NO tenantId key when tenantId is absent.
     * toStrictEqual distinguishes `{ tenantId: undefined }` from `{}`, killing the mutant
     * that replaces `ctx.tenantId !== undefined` with `true`.
     */
    await controller.update('rule-1', { 'x-role': 'admin', 'x-actor': 'root' }, { name: 'renamed' })
    const callArg = recordMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArg).toStrictEqual({
      actor: 'root',
      action: 'rule.updated',
      target: 'AlertRule:rule-1',
    })
  })

  it('throws a ForbiddenException with the exact viewer-denied message on update', async () => {
    /**
     * Scenario: a viewer tries to update a rule.
     * Rule: the `ForbiddenException` message must equal the exact string
     * `'Viewers cannot update alert rules'` — kills the StringLiteral mutation
     * that changes the message text.
     */
    let thrown: unknown
    try {
      await controller.update('rule-1', { 'x-role': 'viewer' }, { name: 'x' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ForbiddenException)
    expect((thrown as ForbiddenException).message).toBe('Viewers cannot update alert rules')
  })
})

describe('createRuleSchema — validation', () => {
  /** Base valid body reused across schema tests (channels supplied explicitly). */
  const validBase = {
    name: 'My Rule',
    expr: 'count > 0',
    threshold: 0,
    forDuration: '5m',
    severity: 'critical' as const,
    channels: [],
  }

  it('accepts valid forDuration patterns that match ^\\d+[smh]$', () => {
    /**
     * Scenario: well-formed duration strings.
     * Rule: `'5m'`, `'1h'`, `'30s'` all satisfy `/^\d+[smh]$/` — protects the
     * Regex mutation that strips the `$` anchor or widens the character class.
     */
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '5m' })).not.toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '1h' })).not.toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '30s' })).not.toThrow()
  })

  it('rejects forDuration values that do not match ^\\d+[smh]$', () => {
    /**
     * Scenario: malformed duration strings.
     * Rule: `'5m trailing'`, `'abc'`, `'5x'` must all fail — an anchor-stripped
     * mutant (`/\d+[smh]/`) would accept `'5m trailing'`; a class-widened
     * mutant would accept `'5x'`. Any acceptance here means a survivor.
     */
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '5m trailing' })).toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: 'abc' })).toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '5x' })).toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '' })).toThrow()
  })

  it('defaults channels to [] when the field is omitted', () => {
    /**
     * Scenario: body without `channels`.
     * Rule: `channels` must default to `[]` (the `default([])` branch) — a
     * ArrayDeclaration mutation that changes the default value would make
     * `channels` undefined or non-empty here.
     */
    const { channels } = createRuleSchema.parse({
      name: 'r',
      expr: 'x',
      threshold: 0,
      forDuration: '1m',
      severity: 'warning',
    })
    expect(channels).toEqual([])
  })

  it('accepts an explicit non-empty channels array', () => {
    /**
     * Scenario: caller supplies channels explicitly.
     * Rule: the array passes through as-is; the `default([])` branch is bypassed
     * when channels are present, confirming the non-default path is also valid.
     */
    const { channels } = createRuleSchema.parse({ ...validBase, channels: ['ch-1', 'ch-2'] })
    expect(channels).toEqual(['ch-1', 'ch-2'])
  })

  it('rejects an empty name and a name longer than 200 characters', () => {
    /**
     * Scenario: name boundary violations.
     * Rule: `.min(1)` rejects '' and `.max(200)` rejects a 201-char string.
     * A `.max(200)` → `.min(200)` mutant would accept 201+ chars;
     * a `.min(1)` → `.max(1)` mutant would reject anything longer than 1 char
     * but accept '' — both are killed here.
     */
    expect(() => createRuleSchema.parse({ ...validBase, name: '' })).toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, name: 'a'.repeat(201) })).toThrow()
  })

  it('accepts a name exactly at the 200-character boundary', () => {
    /**
     * Scenario: name at maximum allowed length.
     * Rule: a 200-char name is within `.max(200)` — confirms the upper bound is 200,
     * not 199, killing any off-by-one mutation on the max constraint.
     */
    expect(() => createRuleSchema.parse({ ...validBase, name: 'a'.repeat(200) })).not.toThrow()
  })

  it('rejects an empty expr and an expr longer than 1024 characters', () => {
    /**
     * Scenario: expr boundary violations.
     * Rule: `.min(1)` rejects '' and `.max(1024)` rejects a 1025-char string.
     * Kills `.max(1024)` → `.min(1024)` and `.min(1)` → `.max(1)` mutants.
     */
    expect(() => createRuleSchema.parse({ ...validBase, expr: '' })).toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, expr: 'x'.repeat(1025) })).toThrow()
  })

  it('accepts an expr exactly at the 1024-character boundary', () => {
    /**
     * Scenario: expr at maximum allowed length.
     * Rule: a 1024-char expr is within `.max(1024)` — confirms the upper bound is 1024.
     */
    expect(() => createRuleSchema.parse({ ...validBase, expr: 'x'.repeat(1024) })).not.toThrow()
  })

  it('rejects a negative threshold but accepts zero', () => {
    /**
     * Scenario: threshold boundary.
     * Rule: `.min(0)` rejects -1 (below minimum) and accepts 0 (at minimum).
     * A `.min(0)` → `.max(0)` mutant would ACCEPT -1 (≤ 0 passes max check), so
     * asserting -1 is rejected kills that mutant.
     */
    expect(() => createRuleSchema.parse({ ...validBase, threshold: -1 })).toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, threshold: 0 })).not.toThrow()
  })

  it('rejects forDuration with a leading non-digit (kills the no-^ anchor mutant)', () => {
    /**
     * Scenario: forDuration string that starts with a non-digit.
     * Rule: without the `^` anchor, `/\\d+[smh]$/` would match the `5m` tail of
     * `'x5m'`, accepting it as valid. The correct pattern rejects it.
     */
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: 'x5m' })).toThrow()
  })

  it('rejects forDuration with trailing characters after the unit (kills the no-$ anchor mutant)', () => {
    /**
     * Scenario: forDuration string with a trailing non-unit suffix.
     * Rule: without the `$` anchor, `/^\\d+[smh]/` would match the `5m` prefix of
     * `'5mz'`, accepting it. The correct pattern rejects any trailing character.
     */
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '5mz' })).toThrow()
  })

  it('accepts a multi-digit forDuration (kills the single-digit mutant /^\\d[smh]$/)', () => {
    /**
     * Scenario: forDuration strings with more than one leading digit.
     * Rule: the mutant `/^\\d[smh]$/` (single digit) rejects '10m' and '123s',
     * but the correct pattern `/^\\d+[smh]$/` (one-or-more) accepts them.
     */
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '10m' })).not.toThrow()
    expect(() => createRuleSchema.parse({ ...validBase, forDuration: '123s' })).not.toThrow()
  })

  it('carries the exact forDuration error message when the format is wrong', () => {
    /**
     * Scenario: an invalid forDuration triggers the custom Zod message.
     * Rule: the StringLiteral mutation changes the message to ''. Asserting the
     * exact message `'must be like 5m, 1h, 30s'` distinguishes the correct string
     * from the empty mutant.
     */
    const result = createRuleSchema.safeParse({ ...validBase, forDuration: 'bad' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain('must be like 5m, 1h, 30s')
    }
  })

  it('accepts severity "warning" (kills the warning→"" StringLiteral mutant)', () => {
    /**
     * Scenario: caller submits severity='warning'.
     * Rule: the mutant changes 'warning' to '' in the enum, making 'warning' invalid.
     * A schema accepting 'warning' fails under that mutant → mutant is killed.
     */
    expect(() => createRuleSchema.parse({ ...validBase, severity: 'warning' })).not.toThrow()
  })

  it('rejects a severity value that is not in the enum', () => {
    /**
     * Scenario: caller submits an invalid severity string.
     * Rule: `z.enum(['critical', 'warning'])` must reject unknown values, confirming
     * the enum is active (not an empty array `[]` from the ArrayDeclaration mutant).
     */
    expect(() => createRuleSchema.parse({ ...validBase, severity: 'info' })).toThrow()
  })
})

describe('updateRuleSchema — validation', () => {
  /** Base partial update body with only the new field. */
  it('accepts and carries through the isEnabled flag (kills the ObjectLiteral {} mutant)', () => {
    /**
     * Scenario: a partial update body that contains only `isEnabled`.
     * Rule: the `.extend({ isEnabled: z.boolean().optional() })` call can be
     * mutated to `.extend({})`, stripping isEnabled from the schema. With the mutant,
     * the parsed output would not contain `isEnabled`. Asserting `data.isEnabled`
     * equals the supplied value kills that mutation.
     */
    const trueResult = updateRuleSchema.safeParse({ isEnabled: true })
    expect(trueResult.success).toBe(true)
    if (trueResult.success) {
      expect(trueResult.data.isEnabled).toBe(true)
    }

    const falseResult = updateRuleSchema.safeParse({ isEnabled: false })
    expect(falseResult.success).toBe(true)
    if (falseResult.success) {
      expect(falseResult.data.isEnabled).toBe(false)
    }
  })
})
