/**
 * PII-demo service — surfaces that emit PII fields to exercise the library's redaction layer.
 *
 * Demonstrates:
 *   - Default-redact fields: `password`, `email`, `cpf`, `cardNumber`, `cardCvv`.
 *   - `nome` logged in cleartext (LGPD boundary — not a default redact path).
 *   - Custom redact-path merge: `*.webhookSignature` + `payload.creditCard.*` extended over defaults.
 *   - Nested depth boundary: `cardNumber` at depths 1–4 is redacted; depth 5 is NOT (by default).
 *   - Header echo under the `req.headers` shape so absolute header paths redact.
 *   - Oversized entry that triggers `LOGGER_ENTRY_TRUNCATED` (emitted by the library).
 *
 * Depth convention (fast-redact):
 *   `DEFAULT_REDACT_PATHS` uses `*.field` as the shallowest path — it matches a field
 *   nested ONE level inside any key, NOT at the Pino root. Fields must therefore be placed
 *   inside a container object so the wildcard `*` has one level to match.
 *   Example: `{ user: { email } }` → `user.email` is matched by `*.email`.
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
   * Fields are nested under `user` so `*.email`, `*.password`, etc. match (depth 1).
   * `nome` is NOT a default redact path — it logs in cleartext to demonstrate the
   * LGPD personal-name boundary.
   *
   * @param dto - Signup data including `nome`, `email`, `password`, `cpf`, `cardNumber`, `cardCvv`.
   * @returns Constant ok response.
   */
  signup(dto: SignupDto): { ok: true } {
    this.logger.info('USER_SIGNUP_ATTEMPT', 'Signup initiated', undefined, {
      user: {
        // `nome` is cleartext — LGPD boundary: personal name is NOT a default redact path.
        nome: dto.nome,
        email: dto.email, // depth 1 under `user` → matched by *.email → [REDACTED]
        password: dto.password,
        cpf: dto.cpf,
        cardNumber: dto.cardNumber,
        cardCvv: dto.cardCvv,
        payment: { cardNumber: dto.payment.cardNumber }, // depth 2 from Pino root → *.*.cardNumber
      },
    })
    return { ok: true }
  }

  /**
   * Log a payload that mixes a custom redact path, a nested custom path, and a default
   * field to prove `redactPaths` MERGES with (never replaces) the 97 defaults.
   *
   * - `event.webhookSignature` → matched by `*.webhookSignature` (custom path, depth 1)
   * - `payload.creditCard.*` → matched by `payload.creditCard.*` (absolute custom path)
   * - `event.cardNumber` → matched by `*.cardNumber` (default path, depth 1)
   *
   * @returns Constant ok response.
   */
  webhook(): { ok: true } {
    this.logger.info('WEBHOOK_RECEIVE_VERIFIED', 'Inbound webhook', undefined, {
      event: {
        webhookSignature: 't=1700000000,v1=deadbeef', // depth 1 → *.webhookSignature (custom)
        cardNumber: '4111111111111111', // depth 1 → *.cardNumber (DEFAULT path — proves merge)
      },
      payload: {
        // Distinct value from event.cardNumber so tests can tell the two paths apart.
        creditCard: { number: '5500005555555559', brand: 'visa' }, // absolute: payload.creditCard.*
      },
    })
    return { ok: true }
  }

  /**
   * Log a payload with a `cardNumber` field at depths 1–5 to expose the depth-4/5 boundary.
   *
   * All values are nested under `probe` so depths 1–4 are at wildcard depths 1–4 from the
   * Pino root (matching `*.cardNumber` … `*.*.*.*.cardNumber`). Depth 5 is at wildcard depth 5,
   * which is BEYOND `REDACT_MAX_DEPTH = 4` and is NOT in `DEFAULT_REDACT_PATHS`.
   *
   * The depth-5 value `card-d5` is a SYNTHETIC marker — never a realistic card number.
   *
   * @returns Constant ok response.
   */
  nested(): { ok: true } {
    this.logger.info('PII_NESTED_PROBE', 'Depth boundary probe', undefined, {
      probe: {
        cardNumber: 'card-d1', // probe.cardNumber → *.cardNumber → redacted (depth 1)
        a: {
          cardNumber: 'card-d2', // probe.a.cardNumber → *.*.cardNumber → redacted (depth 2)
          b: {
            cardNumber: 'card-d3', // *.*.*.cardNumber → redacted (depth 3)
            c: {
              cardNumber: 'card-d4', // *.*.*.*.cardNumber → redacted (depth 4 = REDACT_MAX_DEPTH)
              d: {
                cardNumber: 'card-d5', // depth 5 → NOT in defaults (boundary demo — synthetic only)
              },
            },
          },
        },
      },
    })
    return { ok: true }
  }

  /**
   * Log incoming headers under `req.headers` so the library's absolute header redact paths apply.
   *
   * The default absolute paths `req.headers.authorization`, `req.headers["x-api-key"]`, and
   * `res.headers["set-cookie"]` match only when headers are logged under `{ req: { headers } }`.
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
    const bigError = new Error(`${'x'.repeat(80_000)}`)
    this.logger.errorStructured('PII_HUGE_PAYLOAD', bigError, undefined, {})
    return { ok: true }
  }
}
