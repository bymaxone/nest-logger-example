/**
 * Unit tests for `PiiDemoService`.
 *
 * The service is a thin set of logging surfaces that hand structured, PII-bearing
 * payloads to the injected `PinoLoggerService` so the library's redaction layer can
 * be exercised end to end. These tests bypass DI (the `@InjectLogger` decorator is
 * pure metadata) and assert on a mocked logger that each surface:
 *   - calls the correct logger method with the documented log key,
 *   - shapes the meta payload exactly as the redaction paths expect (nesting under
 *     `user` / `event` / `payload` / `probe` / `req.headers`),
 *   - returns the constant `{ ok: true }` response.
 *
 * No real redaction happens here (the mock logger is inert); these tests pin the
 * contract the service must uphold for the library's redaction to apply.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

import type { PinoLoggerService } from '@bymax-one/nest-logger'
import type { SignupDto } from './dto/signup.dto.js'
import { PiiDemoService } from './pii-demo.service.js'

/** Build a logger mock exposing only the methods the service invokes. */
function makeLoggerMock() {
  return {
    info: jest.fn(),
    errorStructured: jest.fn(),
  }
}

describe('PiiDemoService', () => {
  let logger: ReturnType<typeof makeLoggerMock>
  let service: PiiDemoService

  beforeEach(() => {
    logger = makeLoggerMock()
    service = new PiiDemoService(logger as unknown as PinoLoggerService)
  })

  /**
   * `signup` must emit `USER_SIGNUP_ATTEMPT` via `info`, nest every PII field under
   * `user` (so the `*.field` redact wildcards match at depth 1), surface `payment.cardNumber`
   * at depth 2, log `nome` in cleartext, and return `{ ok: true }`.
   * Protects the signup redaction-surface contract.
   */
  it('signup logs USER_SIGNUP_ATTEMPT with the PII payload nested under user and returns ok', () => {
    const dto: SignupDto = {
      nome: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'hunter2',
      cpf: '123.456.789-00',
      cardNumber: '4111111111111111',
      cardCvv: '123',
      payment: { cardNumber: '5500005555555559' },
    }

    const result = service.signup(dto)

    expect(result).toEqual({ ok: true })
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith('USER_SIGNUP_ATTEMPT', 'Signup initiated', undefined, {
      user: {
        nome: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'hunter2',
        cpf: '123.456.789-00',
        cardNumber: '4111111111111111',
        cardCvv: '123',
        payment: { cardNumber: '5500005555555559' },
      },
    })
  })

  /**
   * `webhook` must emit `WEBHOOK_RECEIVE_VERIFIED` via `info` with a custom path
   * (`event.webhookSignature`), a default path (`event.cardNumber`), and an absolute
   * custom path (`payload.creditCard.*`) so the merge-not-replace redaction contract
   * is exercised. Returns `{ ok: true }`.
   */
  it('webhook logs WEBHOOK_RECEIVE_VERIFIED with custom + default + absolute paths and returns ok', () => {
    const result = service.webhook()

    expect(result).toEqual({ ok: true })
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      'WEBHOOK_RECEIVE_VERIFIED',
      'Inbound webhook',
      undefined,
      {
        event: {
          webhookSignature: 't=1700000000,v1=deadbeef',
          cardNumber: '4111111111111111',
        },
        payload: {
          creditCard: { number: '5500005555555559', brand: 'visa' },
        },
      },
    )
  })

  /**
   * `nested` must emit `PII_NESTED_PROBE` via `info` with `cardNumber` markers at
   * depths 1–5 nested under `probe` so the depth-4/5 redaction boundary is exposed.
   * Returns `{ ok: true }`.
   */
  it('nested logs PII_NESTED_PROBE with cardNumber markers at depths 1-5 and returns ok', () => {
    const result = service.nested()

    expect(result).toEqual({ ok: true })
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      'PII_NESTED_PROBE',
      'Depth boundary probe',
      undefined,
      {
        probe: {
          cardNumber: 'card-d1',
          a: {
            cardNumber: 'card-d2',
            b: {
              cardNumber: 'card-d3',
              c: {
                cardNumber: 'card-d4',
                d: {
                  cardNumber: 'card-d5',
                },
              },
            },
          },
        },
      },
    )
  })

  /**
   * `echoHeaders` must emit `PII_HEADERS_ECHO` via `info` and wrap the raw headers
   * under `{ req: { headers } }` so the library's absolute header redact paths apply.
   * Returns `{ ok: true }`.
   */
  it('echoHeaders logs PII_HEADERS_ECHO wrapping headers under req.headers and returns ok', () => {
    const headers = {
      authorization: 'Bearer secret-token',
      'x-api-key': 'abc-123',
      'content-type': 'application/json',
    }

    const result = service.echoHeaders(headers)

    expect(result).toEqual({ ok: true })
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith('PII_HEADERS_ECHO', 'Headers echoed', undefined, {
      req: { headers },
    })
  })

  /**
   * `huge` must emit `PII_HUGE_PAYLOAD` via `errorStructured` with an Error whose
   * message exceeds the library's `maxEntrySizeBytes` so `LOGGER_ENTRY_TRUNCATED`
   * is triggered. Returns `{ ok: true }`.
   */
  it('huge logs PII_HUGE_PAYLOAD via errorStructured with an oversized error and returns ok', () => {
    const result = service.huge()

    expect(result).toEqual({ ok: true })
    expect(logger.errorStructured).toHaveBeenCalledTimes(1)

    const [logKey, errArg, userId, meta] = logger.errorStructured.mock.calls[0] as [
      string,
      Error,
      undefined,
      Record<string, unknown>,
    ]
    expect(logKey).toBe('PII_HUGE_PAYLOAD')
    expect(errArg).toBeInstanceOf(Error)
    expect(errArg.message.length).toBeGreaterThan(65_536)
    expect(userId).toBeUndefined()
    expect(meta).toEqual({})
  })
})
