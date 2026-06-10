/**
 * Unit tests for `AuditService`.
 *
 * Covers: a successful `record()` persists the row with the supplied fields and
 * a null tenantId fallback, and a fail-soft path where a Prisma write rejection
 * is swallowed and reported to stderr (never re-thrown) so an audit failure can
 * never block the primary action.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'

import type { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from './audit.service.js'

/** Typed helper for the mocked Prisma surface. */
type MockFn = ReturnType<typeof jest.fn>

describe('AuditService', () => {
  let createMock: MockFn
  let prisma: PrismaService
  let svc: AuditService
  let stderrSpy: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    createMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'ae1' })
    prisma = {
      auditEvent: { create: createMock },
    } as unknown as PrismaService
    svc = new AuditService(prisma)
    // Silence and capture stderr so the fail-soft branch does not pollute output.
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as unknown as typeof process.stderr.write)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('persists the audit row with the explicit tenantId when provided', async () => {
    /**
     * `record()` must map actor/action/target verbatim and pass through an
     * explicit tenantId so the row is correctly tenant-scoped.
     */
    await svc.record({
      actor: 'alice',
      action: 'retention.changed',
      target: 'retentionDays=7',
      tenantId: 'acme',
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock).toHaveBeenCalledWith({
      data: {
        actor: 'alice',
        action: 'retention.changed',
        target: 'retentionDays=7',
        tenantId: 'acme',
      },
    })
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('defaults tenantId to null when it is omitted', async () => {
    /**
     * When no tenantId is supplied the row must store `null` (the `?? null`
     * fallback), keeping the column non-undefined for Prisma.
     */
    await svc.record({ actor: 'bob', action: 'export', target: 'logs' })

    expect(createMock).toHaveBeenCalledWith({
      data: { actor: 'bob', action: 'export', target: 'logs', tenantId: null },
    })
  })

  it('swallows a write failure and reports it to stderr (fail-soft)', async () => {
    /**
     * A DB write rejection must be caught and written to stderr as a
     * `AUDIT_WRITE_FAILED` warn record, and `record()` must resolve (never
     * throw) so the primary action is not blocked by an audit failure.
     */
    createMock.mockRejectedValueOnce(new Error('db down'))

    await expect(
      svc.record({ actor: 'carol', action: 'rule.muted', target: 'rule-9' }),
    ).resolves.toBeUndefined()

    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const written = String(stderrSpy.mock.calls[0]?.[0])
    expect(written).toContain('AUDIT_WRITE_FAILED')
    expect(written).toContain('"level":"warn"')
    expect(written).toContain('rule.muted')
  })

  it('stderr output is valid JSON with the exact logKey and level keys', async () => {
    /**
     * Scenario: DB write failure.
     * Rule: `JSON.stringify({ level: 'warn', logKey: 'AUDIT_WRITE_FAILED', input })`
     * must produce valid JSON whose `logKey` property equals `'AUDIT_WRITE_FAILED'`
     * and `level` equals `'warn'` — kills the StringLiteral mutation that changes
     * the `'logKey'` key name to something else (e.g. `'log_key'`), which the
     * `toContain('AUDIT_WRITE_FAILED')` check alone cannot detect.
     */
    createMock.mockRejectedValueOnce(new Error('crash'))

    await svc.record({ actor: 'x', action: 'y', target: 'z' })

    const raw = String(stderrSpy.mock.calls[0]?.[0]).trimEnd()
    const parsed = JSON.parse(raw) as { level: string; logKey: string }
    expect(parsed.logKey).toBe('AUDIT_WRITE_FAILED')
    expect(parsed.level).toBe('warn')
  })

  it('stderr line ends with a newline character — kills StringLiteral "" mutant on the \\n suffix', async () => {
    /**
     * Scenario: DB write failure.
     * Rule: `JSON.stringify({...}) + '\\n'` must append a newline so each record is
     * on its own line in structured log pipelines — kills the StringLiteral mutant
     * that replaces `'\\n'` with `''`.  The existing JSON-parse tests call
     * `.trimEnd()` which masks the missing newline; this test checks the raw output
     * before trimming.
     */
    createMock.mockRejectedValueOnce(new Error('nl-check'))

    await svc.record({ actor: 'u', action: 'v', target: 'w' })

    const raw = String(stderrSpy.mock.calls[0]?.[0])
    expect(raw.endsWith('\n')).toBe(true)
  })
})
