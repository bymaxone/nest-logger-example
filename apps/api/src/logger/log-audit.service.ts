/**
 * Log audit service for `apps/api`.
 *
 * Layer: app/logger. Injects the resolved module options via `LOGGER_OPTIONS_TOKEN`
 * and exposes the effective redaction posture for inspection and assertion.
 * The CI redaction gate relies on this service to assert that critical PII paths
 * are present in the active configuration.
 *
 * @module
 */
import { Inject, Injectable } from '@nestjs/common'
import {
  DEFAULT_REDACT_PATHS,
  LOGGER_OPTIONS_TOKEN,
  type BymaxLoggerModuleOptions,
} from '@bymax-one/nest-logger'

/**
 * Required PII fields that must be present in the effective redact-path list.
 *
 * The CI redaction gate asserts every entry here:
 *   1. Appears as a path or path suffix in `listEffectiveRedactPaths()`.
 *   2. Is effectively serialized as `[REDACTED]` when logged (end-to-end proof).
 */
export const EXPECTED_REDACTED_FIELDS = [
  'password',
  'email',
  'cpf',
  'cardNumber',
  'cardCvv',
  'authorization',
] as const

/**
 * Injectable that exposes the effective PII-redaction posture of the running app.
 *
 * Injects `LOGGER_OPTIONS_TOKEN` — available globally because `BymaxLoggerModule`
 * is registered with `isGlobal: true` in `app.module.ts`.
 */
@Injectable()
export class LogAuditService {
  constructor(@Inject(LOGGER_OPTIONS_TOKEN) private readonly opts: BymaxLoggerModuleOptions) {}

  /**
   * Effective redact paths = the library's exported 97 defaults + the app-supplied extensions.
   *
   * @returns Combined list of all active redact paths.
   */
  listEffectiveRedactPaths(): readonly string[] {
    return [...DEFAULT_REDACT_PATHS, ...(this.opts.redactPaths ?? [])]
  }

  /**
   * Just the app-supplied extra redact paths merged on top of the library defaults.
   *
   * @returns The application-configured `redactPaths` option, or an empty array.
   */
  listConfiguredRedactPaths(): readonly string[] {
    return this.opts.redactPaths ?? []
  }

  /**
   * Whether the dangerous default-redact opt-out is active.
   *
   * Should only ever be `true` inside a dedicated test module — never in the running app.
   *
   * @returns `true` when `shouldDisableDefaultRedact` is explicitly set to `true`.
   */
  hasDefaultRedactionDisabled(): boolean {
    return this.opts.shouldDisableDefaultRedact === true
  }
}
