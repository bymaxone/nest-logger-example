/**
 * Unit coverage for `LogAuditService`.
 *
 * Proves the service surfaces the effective PII-redaction posture exactly:
 *   - `listEffectiveRedactPaths()` = library defaults FOLLOWED BY app extensions, in order.
 *   - `listConfiguredRedactPaths()` = only the app-supplied `redactPaths` (or `[]` when unset).
 *   - `hasDefaultRedactionDisabled()` = strict-`true` check on `shouldDisableDefaultRedact`.
 *
 * The service is constructed directly with a `BymaxLoggerModuleOptions`-shaped stub
 * (the `@Inject(LOGGER_OPTIONS_TOKEN)` decorator is metadata only — DI is bypassed).
 */
import type { BymaxLoggerModuleOptions } from '@bymax-one/nest-logger'
import { DEFAULT_REDACT_PATHS } from '@bymax-one/nest-logger'
import { describe, expect, it } from '@jest/globals'

import { LogAuditService } from './log-audit.service.js'

/**
 * Build a `LogAuditService` over a minimal options stub.
 *
 * @param opts - Partial module options merged onto a minimal valid base.
 * @returns A `LogAuditService` bound to the stubbed options.
 */
function makeService(opts: Partial<BymaxLoggerModuleOptions>): LogAuditService {
  const base = {
    service: { name: 'spec', version: 'test' },
    ...opts,
  } as unknown as BymaxLoggerModuleOptions
  return new LogAuditService(base)
}

describe('LogAuditService', () => {
  // ─── listEffectiveRedactPaths ──────────────────────────────────────────────

  /**
   * Scenario: app supplies extra redact paths.
   * Contract: effective list = the 97 library defaults first, then the app extensions
   * appended in order — the audit must report the EXACT in-process redaction set so the
   * CI redaction gate can assert PII coverage.
   */
  it('returns library defaults followed by app-configured extensions', () => {
    const svc = makeService({ redactPaths: ['custom.token', 'req.headers.cookie'] })
    const effective = svc.listEffectiveRedactPaths()

    expect(effective.length).toBe(DEFAULT_REDACT_PATHS.length + 2)
    // Defaults preserved at the head, in their original order.
    expect(effective.slice(0, DEFAULT_REDACT_PATHS.length)).toEqual([...DEFAULT_REDACT_PATHS])
    // Extensions appended at the tail, in order.
    expect(effective.slice(-2)).toEqual(['custom.token', 'req.headers.cookie'])
  })

  /**
   * Scenario: `redactPaths` is undefined.
   * Contract: the `?? []` fallback means the effective list is exactly the library
   * defaults — never `undefined`, never a throw.
   */
  it('falls back to defaults-only when redactPaths is undefined', () => {
    const svc = makeService({ redactPaths: undefined })
    expect([...svc.listEffectiveRedactPaths()]).toEqual([...DEFAULT_REDACT_PATHS])
  })

  // ─── listConfiguredRedactPaths ─────────────────────────────────────────────

  /**
   * Scenario: app supplies extra redact paths.
   * Contract: `listConfiguredRedactPaths()` returns ONLY the app extensions — never the
   * library defaults — so callers can inspect what the app added on top.
   */
  it('returns only the app-configured redact paths when present', () => {
    const svc = makeService({ redactPaths: ['a.b', 'c.d'] })
    expect([...svc.listConfiguredRedactPaths()]).toEqual(['a.b', 'c.d'])
  })

  /**
   * Scenario: `redactPaths` is undefined.
   * Contract: the `?? []` fallback yields an empty array, not `undefined`.
   */
  it('returns an empty array when redactPaths is undefined', () => {
    const svc = makeService({ redactPaths: undefined })
    expect([...svc.listConfiguredRedactPaths()]).toEqual([])
  })

  // ─── hasDefaultRedactionDisabled ───────────────────────────────────────────

  /**
   * Scenario: the dangerous opt-out flag is explicitly `true`.
   * Contract: returns `true` — this flips ONLY inside a dedicated test module, never in
   * the running app, so the audit must report it faithfully.
   */
  it('reports true when shouldDisableDefaultRedact is explicitly true', () => {
    const svc = makeService({ shouldDisableDefaultRedact: true })
    expect(svc.hasDefaultRedactionDisabled()).toBe(true)
  })

  /**
   * Scenario: flag set to a non-`true` value (here `false`).
   * Contract: the strict `=== true` check returns `false` for any value other than `true`,
   * proving the guard is not loosely truthy.
   */
  it('reports false when shouldDisableDefaultRedact is false', () => {
    const svc = makeService({ shouldDisableDefaultRedact: false })
    expect(svc.hasDefaultRedactionDisabled()).toBe(false)
  })

  /**
   * Scenario: flag omitted entirely (undefined).
   * Contract: the strict `=== true` check returns `false` for `undefined`, the
   * production-safe default.
   */
  it('reports false when shouldDisableDefaultRedact is undefined', () => {
    const svc = makeService({})
    expect(svc.hasDefaultRedactionDisabled()).toBe(false)
  })
})
