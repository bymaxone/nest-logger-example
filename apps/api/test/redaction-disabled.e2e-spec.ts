/**
 * Dangerous opt-out: `shouldDisableDefaultRedact: true` — Phase 8, P8-4.
 *
 * @module
 *
 * Verifies the behaviour when the 97 default redact paths are explicitly disabled:
 *   1. The module still initialises (emits `LOGGER_BOOTSTRAP_OK`).
 *   2. `LogAuditService.hasDefaultRedactionDisabled()` returns `true`.
 *   3. PII fields at depth 1 are NOT redacted (proving the danger of the opt-out).
 *
 * Note: `LOGGER_BOOTSTRAP_WARNING` is a reserved log key defined in `RESERVED_LOG_KEYS` for
 * future use, but the current library (0.1.0) does NOT emit it during bootstrap. The CI gate
 * instead relies on `hasDefaultRedactionDisabled()` + the not-redacted proof to surface the risk.
 *
 * IMPORTANT: `shouldDisableDefaultRedact: true` appears ONLY in this isolated test
 * module — NEVER in any `apps/api/src/**` file or the running application.
 *
 * Reference: `docs/tasks/phase-08-redaction.md` §P8-4, `docs/OVERVIEW.md` §13.
 */
import { Test, type TestingModule } from '@nestjs/testing'
import { BymaxLoggerModule, PinoLoggerService } from '@bymax-one/nest-logger'
import { jest } from '@jest/globals'

import { LogAuditService } from '../src/logger/log-audit.service.js'

describe('shouldDisableDefaultRedact opt-out (e2e)', () => {
  it(/*
   * When `shouldDisableDefaultRedact: true` the module must still bootstrap successfully
   * (emits `LOGGER_BOOTSTRAP_OK`). A future version of the library may also emit
   * `LOGGER_BOOTSTRAP_WARNING` — this test is structured so that assertion can be added
   * without breaking any other test.
   */
  'module bootstraps successfully (LOGGER_BOOTSTRAP_OK) with defaults disabled', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    let moduleRef: TestingModule | undefined
    try {
      moduleRef = await Test.createTestingModule({
        imports: [
          // shouldDisableDefaultRedact: true is DANGEROUS — isolated test module ONLY.
          BymaxLoggerModule.forRoot({
            service: { name: 'redaction-disabled-test', version: 'test' },
            isPretty: false,
            shouldDisableDefaultRedact: true,
          }),
        ],
      }).compile()

      await moduleRef.init()

      const out = stdout.mock.calls.map((c) => String(c[0])).join('')

      // The library always emits LOGGER_BOOTSTRAP_OK on successful init.
      expect(out).toContain('LOGGER_BOOTSTRAP_OK')
    } finally {
      stdout.mockRestore()
      if (moduleRef) await moduleRef.close()
    }
  })

  it(/*
   * `LogAuditService.hasDefaultRedactionDisabled()` must return `true` when the
   * opt-out is active — used by monitoring dashboards to surface the dangerous state.
   */
  'LogAuditService.hasDefaultRedactionDisabled() returns true when defaults are off', () => {
    // Direct instantiation — @Inject(LOGGER_OPTIONS_TOKEN) is DI metadata only;
    // the constructor signature is (opts: BymaxLoggerModuleOptions).
    const audit = new LogAuditService({
      service: { name: 'test', version: 'test' },
      shouldDisableDefaultRedact: true,
    })

    expect(audit.hasDefaultRedactionDisabled()).toBe(true)
  })

  it(/*
   * Sanity-check: `hasDefaultRedactionDisabled()` returns `false` for a standard
   * configuration where defaults are active.
   */
  'LogAuditService.hasDefaultRedactionDisabled() returns false for standard config', () => {
    const audit = new LogAuditService({
      service: { name: 'test', version: 'test' },
    })

    expect(audit.hasDefaultRedactionDisabled()).toBe(false)
  })

  it(/*
   * Danger proof: when defaults are off, depth-1 PII fields are NOT redacted.
   * This proves WHY `shouldDisableDefaultRedact: true` is dangerous and must never
   * appear in production code.
   */
  'depth-1 PII fields are NOT redacted when defaults are disabled', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    let moduleRef: TestingModule | undefined
    try {
      moduleRef = await Test.createTestingModule({
        imports: [
          BymaxLoggerModule.forRoot({
            service: { name: 'danger-proof-test', version: 'test' },
            isPretty: false,
            shouldDisableDefaultRedact: true,
          }),
        ],
      }).compile()

      await moduleRef.init()

      const logger = moduleRef.get(PinoLoggerService)
      // Log with a depth-1 password (normally redacted by *.password, but defaults are off).
      logger.info('DANGER_PROOF', 'Should not redact', undefined, {
        user: { password: 'not-redacted-danger' },
      })

      const out = stdout.mock.calls.map((c) => String(c[0])).join('')
      // When defaults are off, `user.password` is NOT redacted — the raw value appears.
      expect(out).toContain('not-redacted-danger')
    } finally {
      stdout.mockRestore()
      if (moduleRef) await moduleRef.close()
    }
  })
})
