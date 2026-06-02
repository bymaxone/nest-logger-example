/**
 * LogAuditService — CI redaction-coverage gate (Phase 8, P8-4).
 *
 * Proves that the effective redact-path list covers every field listed in
 * `EXPECTED_REDACTED_FIELDS`, and that firing the signup endpoint actually
 * serializes those values as `[REDACTED]` on stdout.
 *
 * Two gates:
 *   1. Path-coverage gate: `listEffectiveRedactPaths()` must contain a path
 *      that covers each required field (as a top-level path, a `.field` suffix,
 *      or a bracket-syntax `"field"` segment).
 *   2. End-to-end redaction gate: `POST /pii-demo/signup` must emit only
 *      `[REDACTED]` values for PII fields and leave `nome` in cleartext.
 *
 * Reference: `docs/tasks/phase-08-redaction.md` §P8-4.
 */
import type { INestApplication } from '@nestjs/common'
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, HttpExceptionFilter, RequestIdMiddleware } from '@bymax-one/nest-logger'
import { jest } from '@jest/globals'
import request from 'supertest'

import { LogAuditService, EXPECTED_REDACTED_FIELDS } from '../src/logger/log-audit.service.js'
import { LoggerModule } from '../src/logger/logger.module.js'
import { PiiDemoModule } from '../src/pii-demo/pii-demo.module.js'
import { ZodValidationFilter } from '../src/common/zod-validation.filter.js'

// Minimal test module: JSON output, HTTP logging enabled for header-path coverage.
@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'audit-e2e', version: 'test' },
      isPretty: false,
      level: 'info',
      isGlobal: true,
      redactPaths: ['*.webhookSignature', 'payload.creditCard.*'],
      redactCensor: '[REDACTED]',
      http: {
        isEnabled: true,
        shouldCaptureExceptions: false,
        shouldGenerateRequestId: false,
      },
    }),
    PiiDemoModule,
    LoggerModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_FILTER, useClass: ZodValidationFilter },
  ],
})
class AuditTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}

describe('LogAuditService — redaction coverage gate (e2e)', () => {
  let app: INestApplication
  let audit: LogAuditService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuditTestModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useLogger(false)
    await app.init()
    audit = app.get(LogAuditService)
  })

  afterAll(async () => {
    await app.close()
  })

  it(/*
   * Gate 1: every field in EXPECTED_REDACTED_FIELDS must appear in the effective path list.
   * If this fails, a required PII field has no redact path in the active configuration.
   */
  'covers every EXPECTED_REDACTED_FIELDS path in listEffectiveRedactPaths()', () => {
    const effective = audit.listEffectiveRedactPaths()
    const missing = EXPECTED_REDACTED_FIELDS.filter(
      (field) =>
        !effective.some((p) => p === field || p.endsWith(`.${field}`) || p.includes(`"${field}"`)),
    )
    // Fail with the list of missing fields so the error is self-documenting.
    expect(missing).toEqual([])
  })

  it(/*
   * Gate 2: end-to-end proof — PII field values are `[REDACTED]` in Pino NDJSON.
   * `nome` must appear in cleartext (it is NOT a default path — LGPD boundary demo).
   */
  'actually redacts every required field end to end via POST /pii-demo/signup', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      await request(app.getHttpServer())
        .post('/pii-demo/signup')
        .send({
          nome: 'Verify User',
          email: 'verify@example.com',
          password: 'verify-pass',
          cpf: 'verify-cpf',
          cardNumber: 'verify-card',
          cardCvv: 'verify-cvv',
          payment: { cardNumber: 'verify-card2' },
        })
        .expect(201)

      await request(app.getHttpServer())
        .get('/pii-demo/echo-headers')
        .set('authorization', 'Bearer verify-token')
        .expect(200)

      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')

      expect(logs).not.toContain('verify-pass')
      expect(logs).not.toContain('verify@example.com')
      expect(logs).not.toContain('verify-cpf')
      expect(logs).not.toContain('verify-card')
      expect(logs).not.toContain('verify-cvv')
      expect(logs).not.toContain('verify-token')
      expect(logs).toContain('[REDACTED]')
      expect(logs).toContain('Verify User') // `nome` intentionally NOT redacted (LGPD boundary)
    } finally {
      stdout.mockRestore()
    }
  })

  it(/*
   * Extra: listConfiguredRedactPaths() returns only app-supplied extensions,
   * and hasDefaultRedactionDisabled() returns false in the running app.
   */
  'listConfiguredRedactPaths returns app extras; hasDefaultRedactionDisabled returns false', () => {
    const configured = audit.listConfiguredRedactPaths()
    expect(configured).toContain('*.webhookSignature')
    expect(configured).toContain('payload.creditCard.*')
    expect(audit.hasDefaultRedactionDisabled()).toBe(false)
  })
})
