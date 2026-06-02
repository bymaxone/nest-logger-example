/**
 * Phase 6 — Demo Domain end-to-end verification gate.
 *
 * Proves that every Phase 6 endpoint emits the expected `logKey`(s) on stdout
 * and that each request carries the propagated correlation fields (`requestId`,
 * `tenantId`) from the request headers via the ALS scope.
 *
 * Technique: `jest.spyOn(process.stdout, 'write')` captures pino NDJSON before it
 * reaches the terminal; assertions check for JSON substrings in the captured output.
 *
 * Notes:
 *   - `isPretty: false` is forced so pino writes JSON, not colorised text.
 *   - `shouldCaptureExceptions: false` prevents auto-registration of HttpExceptionFilter
 *     so the filter order is fully controlled by the providers array below.
 *   - `PrismaService` is mocked so no database connection is required.
 *   - `traceId` assertions (Phase 9) are deferred — the OTel SDK is not started here.
 *   - `[REDACTED]` assertions (Phase 8) are deferred to `phase-08-redaction.md`.
 *   - URL normalisation applies only to IDs that match UUID/ULID/NanoID/numeric patterns.
 *     The mock order ID must be purely numeric to trigger `/:id` substitution.
 */
import type { INestApplication, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, HttpExceptionFilter, RequestIdMiddleware } from '@bymax-one/nest-logger'
// In Jest ESM mode, `jest` must be explicitly imported from '@jest/globals'.
import { jest } from '@jest/globals'
import request from 'supertest'

import { AdminModule } from '../src/admin/admin.module.js'
import { ZodValidationFilter } from '../src/common/zod-validation.filter.js'
import { DownstreamModule } from '../src/downstream/downstream.module.js'
import { OrdersModule } from '../src/orders/orders.module.js'
import { PaymentsModule } from '../src/payments/payments.module.js'
import { PiiDemoModule } from '../src/pii-demo/pii-demo.module.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { TriggerModule } from '../src/trigger/trigger.module.js'

// URL normalisation applies NUMERIC_ID_REGEX (/\/\d+/g) — use a numeric id so the mock
// order URL `/orders/42` is normalised to `/orders/:id` in the access log.
const NUMERIC_ORDER_ID = '42'

type MockOrderCreateResult = {
  id: string
  amount: number
  tenantId: string
  status: string
}

type MockOrderFindResult = {
  id: string
  amount: number
  status: string
}

// Lightweight test module: forces JSON output, prevents filter double-registration.
@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'api-e2e', version: 'test' },
      isPretty: false, // force NDJSON so stdout spy captures parseable JSON
      level: 'info',
      isGlobal: true,
      shouldUseAsNestLogger: false,
      http: {
        isEnabled: true,
        // false: do NOT auto-register HttpExceptionFilter — we control the order manually.
        shouldCaptureExceptions: false,
        shouldGenerateRequestId: false,
        tenantIdHeader: 'x-tenant-id',
        excludePaths: [/^\/health$/, /^\/metrics$/],
      },
    }),
    OrdersModule,
    PaymentsModule,
    PiiDemoModule,
    DownstreamModule,
    TriggerModule,
    AdminModule,
  ],
  providers: [
    // HttpExceptionFilter registered FIRST → lowest priority (LIFO: last registered = tried first).
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // ZodValidationFilter registered LAST → highest priority (tried before HttpExceptionFilter).
    // @Catch(ZodError) matches ZodError before the catch-all HttpExceptionFilter sees it.
    { provide: APP_FILTER, useClass: ZodValidationFilter },
  ],
})
class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}

// Helper: capture all stdout.write calls during an async operation and return the joined string.
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = []
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    chunks.push(String(data))
    return true
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return chunks.join('')
}

describe('Demo Domain (e2e)', () => {
  let app: INestApplication
  // Declared here so beforeEach can reset the resolved values.
  let mockPrisma: {
    order: {
      create: jest.Mock<() => Promise<MockOrderCreateResult>>
      findUnique: jest.Mock<() => Promise<MockOrderFindResult>>
    }
    $connect: jest.Mock<() => Promise<void>>
    $disconnect: jest.Mock<() => Promise<void>>
  }

  beforeAll(async () => {
    // Initialise jest.fn() here where jest globals are guaranteed to be available.
    mockPrisma = {
      order: {
        create: jest.fn<() => Promise<MockOrderCreateResult>>().mockResolvedValue({
          id: NUMERIC_ORDER_ID,
          amount: 1299,
          tenantId: 't_acme',
          status: 'pending',
        }),
        findUnique: jest.fn<() => Promise<MockOrderFindResult>>().mockResolvedValue({
          id: NUMERIC_ORDER_ID,
          amount: 1299,
          status: 'pending',
        }),
      },
      $connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      $disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }

    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    // Clear call history; keep mock implementations intact.
    mockPrisma.order.create.mockClear()
    mockPrisma.order.findUnique.mockClear()
    // Re-declare resolved values in case a test overrode them.
    mockPrisma.order.create.mockResolvedValue({
      id: NUMERIC_ORDER_ID,
      amount: 1299,
      tenantId: 't_acme',
      status: 'pending',
    })
    mockPrisma.order.findUnique.mockResolvedValue({
      id: NUMERIC_ORDER_ID,
      amount: 1299,
      status: 'pending',
    })
  })

  // ─── POST /orders ───────────────────────────────────────────────────────────

  it('POST /orders emits ORDER_CREATE_SUCCESS with propagated requestId and tenantId', async () => {
    const logs = await captureStdout(async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('X-Request-Id', 'r_test_orders_1')
        .set('X-Tenant-Id', 't_acme')
        .send({ amount: 1299, tenantId: 't_acme', userId: 'u_1' })
        .expect(201)
    })

    expect(logs).toContain('"logKey":"ORDER_CREATE_SUCCESS"')
    // Correlation fields propagated via ALS from request headers.
    expect(logs).toContain('r_test_orders_1')
    expect(logs).toContain('t_acme')
  })

  // ─── GET /orders/:id (URL normalisation) ────────────────────────────────────

  it('GET /orders/:id access log shows "url":"/orders/:id" via library NUMERIC_ID_REGEX normalisation', async () => {
    const logs = await captureStdout(async () => {
      // Use a purely numeric id so the library's NUMERIC_ID_REGEX (/\/\d+/g) replaces it with /:id.
      await request(app.getHttpServer())
        .get(`/orders/${NUMERIC_ORDER_ID}`)
        .set('X-Request-Id', 'r_test_orders_2')
        .expect(200)
    })

    // Library HttpLoggingInterceptor normalises numeric URL segments to /:id.
    expect(logs).toContain('"/orders/:id"')
    expect(logs).toContain('"logKey":"ORDER_LOOKUP_SUCCESS"')
  })

  // ─── GET /orders/slow ───────────────────────────────────────────────────────

  it('GET /orders/slow emits METHOD_SLOW_EXECUTION above the 50 ms threshold', async () => {
    const logs = await captureStdout(async () => {
      await request(app.getHttpServer()).get('/orders/slow').expect(200)
    })

    expect(logs).toContain('"logKey":"METHOD_SLOW_EXECUTION"')
  })

  // ─── POST /payments ─────────────────────────────────────────────────────────

  it('POST /payments emits PAYMENT_CHARGE_FAILED + METHOD_EXECUTION + exactly one HTTP_EXCEPTION_HANDLED', async () => {
    const logs = await captureStdout(async () => {
      // 402 PAYMENT_REQUIRED: < 500, so HttpExceptionFilter emits HTTP_EXCEPTION_HANDLED.
      // 5xx would emit HTTP_EXCEPTION_UNHANDLED instead.
      await request(app.getHttpServer())
        .post('/payments')
        .set('X-Request-Id', 'r_test_pay_1')
        .send({ orderId: 'o_1', amount: 500, userId: 'u_1' })
        .expect(402)
    })

    expect(logs).toContain('"logKey":"PAYMENT_CHARGE_FAILED"')
    expect(logs).toContain('"logKey":"METHOD_EXECUTION"')
    // Exactly one HTTP_EXCEPTION_HANDLED — double-log avoidance proof.
    // The interceptor logs HTTP_REQUEST_CLIENT_ERROR (4xx path); the filter logs
    // HTTP_EXCEPTION_HANDLED once. They are different log-key families.
    expect((logs.match(/"logKey":"HTTP_EXCEPTION_HANDLED"/g) ?? []).length).toBe(1)
  })

  // ─── POST /pii-demo/huge ────────────────────────────────────────────────────

  it('POST /pii-demo/huge triggers LOGGER_ENTRY_TRUNCATED inside the err serializer', async () => {
    const logs = await captureStdout(async () => {
      await request(app.getHttpServer()).post('/pii-demo/huge').expect(201)
    })

    // The library's createSizeBoundedSerializer embeds _logKey: "LOGGER_ENTRY_TRUNCATED"
    // in the truncated err field when the serialized error exceeds maxEntrySizeBytes.
    expect(logs).toContain('LOGGER_ENTRY_TRUNCATED')
  })

  // ─── POST /pii-demo/signup ──────────────────────────────────────────────────

  it('POST /pii-demo/signup emits USER_SIGNUP_ATTEMPT (full redaction validated separately)', async () => {
    const logs = await captureStdout(async () => {
      await request(app.getHttpServer())
        .post('/pii-demo/signup')
        .send({
          nome: 'Ada Lovelace',
          email: 'a@example.com',
          password: 'p@ss',
          cpf: '000.000.000-00',
          cardNumber: '4111111111111111',
          cardCvv: '123',
          payment: { cardNumber: '5500005555555559' },
        })
        .expect(201)
    })

    expect(logs).toContain('"logKey":"USER_SIGNUP_ATTEMPT"')
  })

  // ─── POST /downstream/dispatch (worker down) ────────────────────────────────

  it('POST /downstream/dispatch returns 2xx and logs DISPATCH_START + DISPATCH_DEGRADED when worker is unreachable', async () => {
    const logs = await captureStdout(async () => {
      // Fail-soft: the endpoint always returns 2xx even if the worker is down.
      await request(app.getHttpServer()).post('/downstream/dispatch').expect(201)
    })

    expect(logs).toContain('"logKey":"DOWNSTREAM_DISPATCH_START"')
    // Worker is not running in tests — expect the degraded fallback.
    expect(logs).toContain('"logKey":"DOWNSTREAM_DISPATCH_DEGRADED"')
  })

  // ─── POST /trigger/level ────────────────────────────────────────────────────

  it('POST /trigger/level emits TRIGGER_LEVEL_FIRED for each requested line', async () => {
    const logs = await captureStdout(async () => {
      await request(app.getHttpServer())
        .post('/trigger/level')
        .send({ level: 'warn', count: 3 })
        .expect(201)
    })

    // Exactly 3 lines should appear.
    expect((logs.match(/"logKey":"TRIGGER_LEVEL_FIRED"/g) ?? []).length).toBe(3)
  })

  // ─── GET /trigger/status/:code ──────────────────────────────────────────────

  it('GET /trigger/status/404 returns 404 and the library emits HTTP_REQUEST_CLIENT_ERROR', async () => {
    const logs = await captureStdout(async () => {
      // The controller throws HttpException(404) so the interceptor sees the error
      // and logs HTTP_REQUEST_CLIENT_ERROR (4xx path).
      await request(app.getHttpServer()).get('/trigger/status/404').expect(404)
    })

    expect(logs).toContain('"logKey":"HTTP_REQUEST_CLIENT_ERROR"')
  })

  // ─── PATCH /admin/log-level ─────────────────────────────────────────────────

  it('PATCH /admin/log-level emits ADMIN_LOG_LEVEL_CHANGED and updates the live level', async () => {
    const logs = await captureStdout(async () => {
      const res = await request(app.getHttpServer())
        .patch('/admin/log-level')
        .send({ level: 'debug' })
        .expect(200)

      expect(res.body).toMatchObject({ current: 'debug' })
    })

    expect(logs).toContain('"logKey":"ADMIN_LOG_LEVEL_CHANGED"')

    // Restore the level so subsequent tests are not affected.
    await request(app.getHttpServer()).patch('/admin/log-level').send({ level: 'info' }).expect(200)
  })

  // ─── Validation (ZodValidationFilter) ───────────────────────────────────────

  it('Invalid request body returns 400 and emits DOMAIN_VALIDATION_FAILED', async () => {
    const logs = await captureStdout(async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ amount: -1, tenantId: '' }) // violates positive-int + min(1) constraints
        .expect(400)
    })

    expect(logs).toContain('"logKey":"DOMAIN_VALIDATION_FAILED"')
  })
})
