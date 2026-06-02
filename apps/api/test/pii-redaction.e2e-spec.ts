/**
 * PII Redaction Proofs — Phase 8 end-to-end verification.
 *
 * Proves the library's 97 default paths + app-supplied extensions redact PII values
 * correctly across the full logger pipeline (stdout, Postgres, and Loki).
 *
 * Technique:
 *   - `jest.spyOn(process.stdout, 'write')` captures Pino NDJSON from `DefaultStdoutDestination`.
 *   - `jest.spyOn(globalThis, 'fetch')` intercepts Loki push calls.
 *   - A mock `ApplicationLogClient` captures `createMany` calls without a real database.
 *   - `batchSize: 1` on both destinations triggers immediate flushes; `FLUSH_SETTLE_MS`
 *     lets the asynchronous flush chain settle before assertions.
 *
 * Tests in this file:
 *   P8-1 — default-path redaction (fields + sensitive headers → `[REDACTED]`)
 *   P8-2 — custom `redactPaths` merged with defaults (extend, not replace)
 *   P8-3 — deep-nested depth 1→5 boundary (depth-4 redacted, depth-5 NOT-redacted)
 *   P8-5 — oversized-entry truncation + cross-sink no-raw-PII (Postgres + Loki)
 *
 * Reference: `docs/tasks/phase-08-redaction.md`, `docs/OVERVIEW.md` §13 + §16.
 */
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, DefaultStdoutDestination } from '@bymax-one/nest-logger'
import type { Prisma } from '@prisma/client'
import { jest } from '@jest/globals'
import request from 'supertest'

import {
  PrismaLogDestination,
  type ApplicationLogClient,
} from '../src/destinations/prisma-log.destination.js'
import { LokiDestination } from '../src/destinations/loki.destination.js'
import { PiiDemoModule } from '../src/pii-demo/pii-demo.module.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal mock Prisma client — typed so no cast is needed in PrismaLogDestination. */
function buildMockPrisma(): ApplicationLogClient & {
  applicationLog: {
    createMany: ReturnType<
      typeof jest.fn<
        (args: {
          data: Prisma.ApplicationLogCreateManyInput[]
          skipDuplicates?: boolean
        }) => Promise<{ count: number }>
      >
    >
  }
} {
  return {
    applicationLog: {
      createMany: jest
        .fn<
          (args: {
            data: Prisma.ApplicationLogCreateManyInput[]
            skipDuplicates?: boolean
          }) => Promise<{ count: number }>
        >()
        .mockResolvedValue({ count: 1 }),
    },
  }
}

// Loki endpoint intercepted by fetch spy — never a real network call.
const TEST_LOKI_URL = 'http://loki.test/loki/api/v1/push'

// Two event-loop ticks at ~60 ms each; empirically sufficient for batchSize:1
// flush chains (PrismaLogDestination + LokiDestination) to settle after a request.
const FLUSH_SETTLE_MS = 120

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PII Redaction proofs (e2e)', () => {
  let app: INestApplication
  let mockPrisma: ReturnType<typeof buildMockPrisma>
  let fetchSpy!: ReturnType<typeof jest.spyOn<typeof globalThis, 'fetch'>>

  beforeAll(async () => {
    // Mock fetch before app bootstrap so LokiDestination's flush calls never hit the network.
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))

    mockPrisma = buildMockPrisma()

    const lokiDest = new LokiDestination({
      url: TEST_LOKI_URL,
      batchSize: 1,
      flushIntervalMs: 60_000, // timer-based flush disabled; batchSize:1 triggers it on each write
    })
    const prismaDest = new PrismaLogDestination(mockPrisma, {
      minLevel: 'info', // capture info+ so signup logs reach the mock (prod uses 'warn')
      batchSize: 1,
      flushIntervalMs: 60_000,
    })

    const moduleRef = await Test.createTestingModule({
      imports: [
        BymaxLoggerModule.forRoot({
          service: { name: 'pii-e2e', version: 'test' },
          isPretty: false,
          level: 'info',
          isGlobal: true,
          redactPaths: ['*.webhookSignature', 'payload.creditCard.*'],
          redactCensor: '[REDACTED]',
          maxEntrySizeBytes: 65_536,
          destinations: [new DefaultStdoutDestination(), lokiDest, prismaDest],
        }),
        PiiDemoModule,
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useLogger(false)
    await app.init()
    // Allow bootstrap logs to flush before tests begin.
    await new Promise<void>((r) => setTimeout(r, FLUSH_SETTLE_MS))
  })

  afterAll(async () => {
    try {
      await app.close()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  beforeEach(() => {
    mockPrisma.applicationLog.createMany.mockClear()
    fetchSpy.mockClear()
  })

  // ─── P8-1: Default-path redaction ──────────────────────────────────────────

  it(/*
   * P8-1: The library's 97 default paths redact PII fields and sensitive headers.
   * `nome` must appear in cleartext (it is NOT a default path — LGPD boundary demo).
   * Protects: no raw `password`, `email`, `cpf`, `cardNumber`, or auth headers on stdout.
   */
  'P8-1: redacts default PII fields and sensitive headers; `nome` stays cleartext', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      await request(app.getHttpServer())
        .post('/pii-demo/signup')
        .send({
          nome: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'p@ss',
          cpf: '123.456.789-09',
          cardNumber: '4111111111111111',
          cardCvv: '123',
          payment: { cardNumber: '4111111111111111' },
        })
        .expect(201)

      await request(app.getHttpServer())
        .get('/pii-demo/echo-headers')
        .set('authorization', 'Bearer leak-me')
        .set('x-api-key', 'sk_live_leak')
        .expect(200)

      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')

      expect(logs).toContain('[REDACTED]')
      expect(logs).not.toContain('p@ss')
      expect(logs).not.toContain('ada@example.com')
      expect(logs).not.toContain('123.456.789-09')
      expect(logs).not.toContain('4111111111111111')
      expect(logs).not.toContain('leak-me')
      expect(logs).not.toContain('sk_live_leak')
      expect(logs).toContain('Ada Lovelace') // `nome` intentionally NOT redacted (LGPD boundary)
    } finally {
      stdout.mockRestore()
    }
  })

  // ─── P8-2: Custom redactPaths merge ────────────────────────────────────────

  it(/*
   * P8-2: `redactPaths` MERGES with the 97 defaults — it never replaces them.
   * Both the custom paths (`*.webhookSignature`, `payload.creditCard.*`) AND a default
   * field (`cardNumber`) must render `[REDACTED]` in the same log entry.
   * Protects: app-specific secrets are redacted without losing the library defaults.
   */
  'P8-2: merges custom redactPaths with defaults — custom AND default fields both `[REDACTED]`', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      await request(app.getHttpServer()).post('/pii-demo/webhook').send({}).expect(201)

      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')

      expect(logs).not.toContain('deadbeef') // custom: event.webhookSignature → *.webhookSignature
      expect(logs).not.toContain('4111111111111111') // default: event.cardNumber → *.cardNumber
      expect(logs).not.toContain('5500005555555559') // custom: payload.creditCard.number → payload.creditCard.*
      expect(logs).toContain('[REDACTED]')
    } finally {
      stdout.mockRestore()
    }
  })

  // ─── P8-3: Deep-nested depth-4/5 boundary ──────────────────────────────────

  it(/*
   * P8-3: fast-redact's `*` is single-level (no `**`); defaults list each field at depths 1–4.
   * Depth 5 is BEYOND REDACT_MAX_DEPTH and is intentionally NOT redacted by default.
   * Protects: makes the depth boundary observable so operators know when to add explicit paths.
   */
  'P8-3: redacts `cardNumber` at depths 1–4 but NOT at depth 5 (wildcard boundary proof)', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      await request(app.getHttpServer()).post('/pii-demo/nested').send({}).expect(201)

      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')

      expect(logs).not.toContain('card-d1') // depth 1 → redacted
      expect(logs).not.toContain('card-d2') // depth 2 → redacted
      expect(logs).not.toContain('card-d3') // depth 3 → redacted
      expect(logs).not.toContain('card-d4') // depth 4 → redacted (REDACT_MAX_DEPTH)
      expect(logs).toContain('card-d5') // depth 5 → NOT redacted (documented boundary)
      expect(logs).toContain('[REDACTED]')
    } finally {
      stdout.mockRestore()
    }
  })

  // ─── P8-5a: Oversized-entry truncation ─────────────────────────────────────

  it(/*
   * P8-5a: When the serialized `err` field exceeds `maxEntrySizeBytes` (65 536), the library's
   * `createSizeBoundedSerializer` replaces the `err` field with a `LOGGER_ENTRY_TRUNCATED`
   * envelope — the oversized error stack never reaches destinations as raw JSON.
   * Note: the Pino `msg` field naturally contains `error.message`; the truncation proof
   * is that the `err` FIELD is replaced (verified by `LOGGER_ENTRY_TRUNCATED` in the entry).
   * Protects: Loki and Postgres are not blown by runaway error stacks.
   */
  'P8-5a: truncates an oversized err field to LOGGER_ENTRY_TRUNCATED', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      await request(app.getHttpServer()).post('/pii-demo/huge').send({}).expect(201)

      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')

      // The `err` field is replaced with a LOGGER_ENTRY_TRUNCATED envelope.
      expect(logs).toContain('LOGGER_ENTRY_TRUNCATED')
      // The truncated envelope is tiny — the _preview field is at most 200 chars.
      expect(logs).toContain('"_truncated":true')
    } finally {
      stdout.mockRestore()
    }
  })

  // ─── P8-5b: Cross-sink no-raw-PII ──────────────────────────────────────────

  it(/*
   * P8-5b: The library's redact pipeline fires BEFORE the destinations receive the entry.
   * Both Postgres (`PrismaLogDestination.createMany`) and Loki (fetch push body) must
   * contain `[REDACTED]` and must NEVER contain the raw synthetic PII markers.
   * Protects: no raw PII reaches durable storage even if a sink is read directly.
   */
  'P8-5b: writes `[REDACTED]` (never raw PII) to Postgres and Loki', async () => {
    await request(app.getHttpServer())
      .post('/pii-demo/signup')
      .send({
        nome: 'Y',
        email: 'leak@db.com',
        password: 'leak-pass',
        cpf: 'leak-cpf',
        cardNumber: 'leak-card',
        cardCvv: 'leak-cvv',
        payment: { cardNumber: 'leak-card2' },
      })
      .expect(201)

    // Wait for batchSize:1 flush chains to settle on both destinations.
    await new Promise<void>((r) => setTimeout(r, FLUSH_SETTLE_MS))

    // ── Postgres assertion ──────────────────────────────────────────────────
    expect(mockPrisma.applicationLog.createMany).toHaveBeenCalled()
    const allDbData = mockPrisma.applicationLog.createMany.mock.calls.flatMap((c) => c[0].data)
    const dbDump = JSON.stringify(allDbData)
    expect(dbDump).not.toContain('leak-pass')
    expect(dbDump).not.toContain('leak@db.com')
    expect(dbDump).not.toContain('leak-card')
    expect(dbDump).toContain('[REDACTED]')

    // ── Loki assertion ──────────────────────────────────────────────────────
    const lokiCall = fetchSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/loki/api/v1/push'),
    )
    expect(lokiCall).toBeDefined()
    const [, lokiInit] = lokiCall! // lokiCall is defined — expect().toBeDefined() asserted above
    const rawBody = (lokiInit as RequestInit).body
    if (typeof rawBody !== 'string') {
      throw new Error(`Expected Loki fetch body to be a string, got ${typeof rawBody}`)
    }
    const body = JSON.parse(rawBody) as { streams: { values: [string, string][] }[] }
    const lokiDump = JSON.stringify(body)
    expect(lokiDump).not.toContain('leak-pass')
    expect(lokiDump).not.toContain('leak@db.com')
    expect(lokiDump).not.toContain('leak-card')
    expect(lokiDump).toContain('[REDACTED]')
  })
})
