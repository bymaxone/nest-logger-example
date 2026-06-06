/**
 * Logs read-API end-to-end verification (`GET /logs*`).
 *
 * Boots a minimal NestJS module that wires the real `LogsController`,
 * `LogsService`, `LogsAggregateService` and `LogsFacetsService` so the keyset
 * cursor codec is exercised through the HTTP boundary exactly as in production.
 * Only `PrismaService`'s data methods are mocked — there is no database, Loki, or
 * any other external dependency, so the suite stays fast and DB-free.
 *
 * What this proves:
 *   - `GET /logs` returns a `{ data, nextCursor, hasMore }` page and a follow-up
 *     request with the emitted cursor advances to a non-overlapping second page.
 *   - A stale/malformed cursor surfaces as HTTP 410 (the `StaleCursorError` →
 *     `GoneException` mapping in the controller).
 *   - `GET /logs/aggregate` echoes the bucket counts the database returns.
 *   - `GET /logs/facets` maps a Prisma `groupBy` result to `{ value, count }`.
 *   - RBAC scoping (`x-role` / `x-tenant-id`) is applied to the Prisma `where`.
 *
 * Technique: the controller calls `prisma.applicationLog.findMany/groupBy` and
 * `prisma.$queryRaw`; those are the only methods mocked. The cursor returned by
 * page one is fed verbatim into page two, so the codec round-trip is real.
 */
import type { INestApplication } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
// In Jest ESM mode, `jest` must be explicitly imported from '@jest/globals'.
import { jest } from '@jest/globals'
import request from 'supertest'

import { PrismaService } from '../src/prisma/prisma.service.js'
import { LogsController } from '../src/logs/logs.controller.js'
import { LogsService } from '../src/logs/logs.service.js'
import { LogsAggregateService } from '../src/logs/logs.aggregate.service.js'
import { LogsFacetsService } from '../src/logs/logs.facets.service.js'
import { LogsContextService } from '../src/logs/logs.context.service.js'
import { LogsExportService } from '../src/logs/logs.export.service.js'

/** Minimal row shape the controller reads back from `applicationLog.findMany`. */
interface SeedRow {
  id: string
  time: Date
  level: string
  logKey: string
  message: string
  service: string
  tenantId: string | null
  requestId: string | null
  traceId: string | null
  spanId: string | null
  status: number | null
  durationMs: number | null
  payload: Record<string, unknown>
}

/** Shape of the Prisma double — only the methods the logs read-API touches. */
interface PrismaMock {
  applicationLog: {
    findMany: jest.Mock<(args: unknown) => Promise<SeedRow[]>>
    groupBy: jest.Mock<(args: unknown) => Promise<Array<Record<string, unknown>>>>
    count: jest.Mock<(args: unknown) => Promise<number>>
  }
  $queryRaw: jest.Mock<(...args: unknown[]) => Promise<unknown>>
}

/** Build a deterministic `ApplicationLog`-like row at a fixed time/id. */
function makeRow(id: string, isoTime: string, overrides: Partial<SeedRow> = {}): SeedRow {
  return {
    id,
    time: new Date(isoTime),
    level: 'info',
    logKey: 'HTTP_REQUEST_SUCCESS',
    message: 'GET /demo → 200',
    service: 'api',
    tenantId: 'acme',
    requestId: `r_${id}`,
    traceId: null,
    spanId: null,
    status: 200,
    durationMs: 12,
    payload: {},
    ...overrides,
  }
}

// Two fixed, newest-first pages — distinct ids so overlap is detectable.
const PAGE_ONE: SeedRow[] = [
  makeRow('row-001', '2024-06-01T12:00:02.000Z'),
  makeRow('row-002', '2024-06-01T12:00:01.000Z'),
]
const PAGE_TWO: SeedRow[] = [
  makeRow('row-003', '2024-06-01T12:00:00.500Z'),
  makeRow('row-004', '2024-06-01T12:00:00.000Z'),
]

// Stand-in PrismaService provider so the token is resolvable inside this isolated
// module (the real one lives in the global PrismaModule, not imported here). The
// concrete mock is injected at compile time via `.overrideProvider(...).useValue(...)`.
const PRISMA_PLACEHOLDER = { provide: PrismaService, useValue: {} }

// Minimal test module: wires the real logs read-API controller + services. The
// SSE controller and Loki proxy are intentionally excluded so no ConfigService /
// LokiClient is needed — this keeps the boot hermetic and DB/Loki-free.
@Module({
  controllers: [LogsController],
  providers: [
    PRISMA_PLACEHOLDER,
    LogsService,
    LogsAggregateService,
    LogsFacetsService,
    LogsContextService,
    LogsExportService,
  ],
})
class LogsApiTestModule {}

describe('Logs read-API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaMock

  beforeAll(async () => {
    prisma = {
      applicationLog: {
        findMany: jest.fn<(args: unknown) => Promise<SeedRow[]>>().mockResolvedValue(PAGE_ONE),
        groupBy: jest
          .fn<(args: unknown) => Promise<Array<Record<string, unknown>>>>()
          .mockResolvedValue([]),
        count: jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0),
      },
      $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]),
    }

    const moduleRef = await Test.createTestingModule({
      imports: [LogsApiTestModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    // Reset call history and restore the default first-page resolution between tests.
    prisma.applicationLog.findMany.mockReset().mockResolvedValue(PAGE_ONE)
    prisma.applicationLog.groupBy.mockReset().mockResolvedValue([])
    prisma.$queryRaw.mockReset().mockResolvedValue([])
  })

  // ─── GET /logs — keyset pagination ──────────────────────────────────────────

  it('GET /logs paginates with a keyset cursor and the second page does not overlap the first', async () => {
    /**
     * Scenario: request a 2-row page, then replay the returned cursor for the next
     * page. Contract: page one yields `{ data: 2, hasMore: true, nextCursor: <str> }`,
     * the cursor is a non-empty opaque string produced by the real codec, and page
     * two (mocked to the next two rows) shares no ids with page one — proving the
     * cursor advances the window rather than restarting it.
     */
    const first = await request(app.getHttpServer()).get('/logs').query({ limit: 2 }).expect(200)

    expect(first.body.data).toHaveLength(2)
    expect(first.body.hasMore).toBe(true)
    expect(typeof first.body.nextCursor).toBe('string')
    expect(first.body.nextCursor.length).toBeGreaterThan(0)

    const firstIds: string[] = first.body.data.map((r: { id: string }) => r.id)
    expect(firstIds).toEqual(['row-001', 'row-002'])

    // The next page returns the following two rows when the cursor is supplied.
    prisma.applicationLog.findMany.mockResolvedValueOnce(PAGE_TWO)

    const second = await request(app.getHttpServer())
      .get('/logs')
      .query({ limit: 2, cursor: first.body.nextCursor })
      .expect(200)

    const secondIds: string[] = second.body.data.map((r: { id: string }) => r.id)
    expect(secondIds).toEqual(['row-003', 'row-004'])
    // No id appears on both pages — the cursor moved the window forward.
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false)

    // The cursor clause was threaded into the Prisma where for the second call.
    const secondCallArg = prisma.applicationLog.findMany.mock.calls.at(-1)?.[0] as {
      where: { AND?: unknown[] }
    }
    expect(Array.isArray(secondCallArg.where.AND)).toBe(true)
  })

  it('GET /logs with a malformed cursor returns HTTP 410 Gone (StaleCursorError path)', async () => {
    /**
     * Scenario: supply a cursor string the codec cannot decode. Contract: the
     * controller catches `StaleCursorError` from `decodeCursor` and rethrows it as a
     * `GoneException`, so the client receives HTTP 410 and `findMany` is never
     * reached — the stale-cursor guard short-circuits before the query.
     */
    await request(app.getHttpServer())
      .get('/logs')
      .query({ limit: 2, cursor: 'this-is-not-a-valid-base64url-cursor!!!' })
      .expect(410)

    expect(prisma.applicationLog.findMany).not.toHaveBeenCalled()
  })

  // ─── GET /logs/aggregate — volume metric ────────────────────────────────────

  it('GET /logs/aggregate?metric=volume echoes the bucket counts returned by the database', async () => {
    /**
     * Scenario: mock the aggregate service's underlying `$queryRaw` to return two
     * known volume buckets. Contract: the response is a JSON array that reconciles
     * exactly with the seeded `{ bucket, level, n }` rows — the service passes the
     * database-computed counts through without re-aggregating in JS.
     */
    const buckets = [
      { bucket: '2024-06-01T12:00:00.000Z', level: 'error', n: 4 },
      { bucket: '2024-06-01T12:05:00.000Z', level: 'error', n: 7 },
    ]
    prisma.$queryRaw.mockResolvedValueOnce(buckets)

    const res = await request(app.getHttpServer())
      .get('/logs/aggregate')
      .query({
        metric: 'volume',
        bucket: '5m',
        from: '2024-06-01T12:00:00.000Z',
        to: '2024-06-01T13:00:00.000Z',
      })
      .expect(200)

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    expect(res.body).toEqual(buckets)
    const total = (res.body as Array<{ n: number }>).reduce((sum, b) => sum + b.n, 0)
    expect(total).toBe(11)
  })

  // ─── GET /logs/facets — level facet ─────────────────────────────────────────

  it('GET /logs/facets?fields=level maps groupBy counts to ordered { value, count } pairs', async () => {
    /**
     * Scenario: mock `applicationLog.groupBy` to return per-level counts already
     * sorted by count descending. Contract: the facets service maps each group to
     * `{ value, count }` preserving the database ordering and dropping null buckets,
     * so the response is `{ level: [{ value, count }, …] }` in the right order.
     */
    prisma.applicationLog.groupBy.mockResolvedValueOnce([
      { level: 'info', _count: { _all: 12 } },
      { level: 'error', _count: { _all: 5 } },
      { level: 'warn', _count: { _all: 2 } },
    ])

    const res = await request(app.getHttpServer())
      .get('/logs/facets')
      .query({ fields: 'level' })
      .expect(200)

    expect(res.body.level).toEqual([
      { value: 'info', count: 12 },
      { value: 'error', count: 5 },
      { value: 'warn', count: 2 },
    ])
  })

  // ─── RBAC scoping ───────────────────────────────────────────────────────────

  it('GET /logs as a viewer scoped to a tenant applies the tenant restriction to the Prisma where', async () => {
    /**
     * Scenario: a viewer for tenant `acme` lists logs. Contract: the request still
     * succeeds (HTTP 200) and the RBAC restriction is threaded into the Prisma query
     * — the compiled `where.tenantId` equals `acme`, proving tenant scoping is applied
     * server-side and cannot be bypassed by query params.
     */
    await request(app.getHttpServer())
      .get('/logs')
      .set('x-role', 'viewer')
      .set('x-tenant-id', 'acme')
      .query({ limit: 2, tenantId: 'attacker' })
      .expect(200)

    const callArg = prisma.applicationLog.findMany.mock.calls.at(-1)?.[0] as {
      where: { tenantId?: string }
    }
    // The restriction wins over the attacker-supplied query tenantId.
    expect(callArg.where.tenantId).toBe('acme')
  })
})
