/**
 * PII-demo service — surfaces that emit PII fields to exercise the library's redaction layer.
 *
 * Demonstrates:
 *   - Default-redact fields: `password`, `email`, `cpf`, `cardNumber`, `cardCvv`.
 *   - Nested depth boundary: fields at depths 1–4 are redacted; depth 5 is NOT (by default).
 *   - Header echo under the `req.headers` shape so absolute header paths redact.
 *   - Oversized entry that triggers `LOGGER_ENTRY_TRUNCATED` (emitted by the library).
 *
 * This service only emits the PII surfaces; the `[REDACTED]` assertions are in the
 * redaction proof test suite.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import { InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'

import type { SignupDto } from './dto/signup.dto.js'

/** Exposes PII-bearing endpoints for end-to-end redaction validation. */
@Injectable()
export class PiiDemoService {
  constructor(@InjectLogger(PiiDemoService.name) private readonly logger: PinoLoggerService) {}

  /**
   * Log a signup payload containing the 23 default-redact PII fields.
   *
   * @param dto - Signup data (email, password, cpf, cardNumber, cardCvv).
   * @returns Constant ok response.
   */
  signup(dto: SignupDto): { ok: true } {
    this.logger.info('USER_SIGNUP_ATTEMPT', 'Signup initiated', undefined, {
      email: dto.email,
      password: dto.password,
      cpf: dto.cpf,
      cardNumber: dto.cardNumber,
      cardCvv: dto.cardCvv,
      payment: { cardNumber: dto.cardNumber }, // depth-2 redact
    })
    return { ok: true }
  }

  /**
   * Log a payload with a `password` field at depths 1–5 to expose the depth-4/5 boundary.
   *
   * Defaults redact depths 1–4; depth 5 is NOT redacted by default (boundary proof).
   *
   * @returns Constant ok response.
   */
  nested(): { ok: true } {
    this.logger.info('PII_NESTED_ATTEMPT', 'Nested payload logged', undefined, {
      password: 'd1',
      a: { password: 'd2' },
      b: { c: { password: 'd3' } },
      d: { e: { f: { password: 'd4' } } },
      g: { h: { i: { j: { password: 'd5' } } } }, // depth 5 — NOT redacted by default
    })
    return { ok: true }
  }

  /**
   * Log incoming headers under `req.headers` so the library's absolute header redact paths apply.
   *
   * @param headers - Raw request headers (from `@Headers()` decorator).
   * @returns Constant ok response.
   */
  echoHeaders(headers: Record<string, unknown>): { ok: true } {
    this.logger.info('PII_HEADERS_ECHO', 'Headers echoed', undefined, { req: { headers } })
    return { ok: true }
  }

  /**
   * Log a >64 KiB error via `errorStructured` to trigger `LOGGER_ENTRY_TRUNCATED`.
   *
   * The library's `createSizeBoundedSerializer` wraps the `err` Pino serializer. When the
   * serialized error (type + message + stack) exceeds `maxEntrySizeBytes` (default 65 536),
   * the `err` field is replaced with `{ _logKey: "LOGGER_ENTRY_TRUNCATED", _truncated: true, … }`.
   *
   * @returns Constant ok response.
   */
  huge(): { ok: true } {
    const bigError = new Error(`${'x'.repeat(70_000)}`)
    this.logger.errorStructured('PII_HUGE_ATTEMPT', bigError, undefined, {})
    return { ok: true }
  }
}
