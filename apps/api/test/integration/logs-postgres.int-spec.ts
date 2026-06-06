/**
 * @fileoverview Optional integration tier — the `logs/` read-API against a REAL Postgres.
 *
 * Targets the dedicated test database (the `postgres` service in
 * `docker-compose.test.yml`, project `nest-logger-example-test`, exposed on
 * 127.0.0.1:55432), applies the Prisma schema to it via `prisma db push`, and points a
 * REAL `PrismaService` at it. The real `LogsController` and its services are booted over
 * HTTP (supertest) with NOTHING about the database mocked, then exercised against
 * deterministic seed rows.
 *
 * Where `logs-api.e2e-spec.ts` mocks Prisma to keep the default suite hermetic, this
 * suite proves the SAME endpoints against an actual database engine, so the behaviour
 * that only Postgres can produce is verified for real:
 *   - keyset paging `(time DESC, id DESC)` with a non-overlapping second page (real WHERE),
 *   - time-bucketed `date_trunc` + `generate_series` zero-filled volume aggregation,
 *   - facet `groupBy` counts that match the seeded distribution,
 *   - RBAC tenant scoping applied server-side in the real `where`,
 *   - the `PrismaLogDestination` write path landing real mapped columns.
 *
 * This tier is OPT-IN and excluded from the hermetic default suites (it matches the
 * `*.int-spec.ts` pattern, run only by `pnpm --filter api test:int`). Bring the test
 * stack up first with `pnpm infra:test:up` (the root `pnpm test:int:api` does this for
 * you); when it is not running the default `test` / `test:cov` / `test:e2e` runs are
 * unaffected.
 *
 * @module test/integration/logs-postgres.int-spec
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { Module, type INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import request from 'supertest'

import { PrismaService } from '../../src/prisma/prisma.service.js'
import { LogsController } from '../../src/logs/logs.controller.js'
import { LogsService } from '../../src/logs/logs.service.js'
import { LogsAggregateService } from '../../src/logs/logs.aggregate.service.js'
import { LogsFacetsService } from '../../src/logs/logs.facets.service.js'
import { LogsContextService } from '../../src/logs/logs.context.service.js'
import { LogsExportService } from '../../src/logs/logs.export.service.js'
import { PrismaLogDestination } from '../../src/destinations/prisma-log.destination.js'

/** Dedicated test Postgres connection string (matches docker-compose.test.yml). */
const TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55432/logs_example_test'

/** Repo root, computed from this file so `prisma db push` runs in the workspace. */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** Tenant used for the RBAC-scoping assertion. */
const TENANT_ACME = 'tenant-acme'
/** A second tenant so the RBAC `where` has something to exclude. */
const TENANT_GLOBEX = 'tenant-globex'

/**
 * Fixed five-minute aggregation window. The seeded `time`s all fall inside it so the
 * `date_trunc('minute', …)` + `generate_series(…, '5 minutes')` zero-fill SQL produces
 * buckets whose totals reconcile exactly with the seed.
 */
const AGG_FROM = '2024-06-01T12:00:00.000Z'
const AGG_TO = '2024-06-01T12:20:00.000Z'

/** A single deterministic seed row — all paging/aggregation/facet assertions key off these. */
interface SeedInput {
  id: string
  time: Date
  level: string
  logKey: string
  message: string
  service: string
  tenantId: string
  status: number | null
  durationMs: number | null
  payload: Record<string, string | number | null>
}

/** Build one `ApplicationLog` insert row at a fixed id/time with sensible defaults. */
function row(id: string, isoTime: string, overrides: Partial<SeedInput> = {}): SeedInput {
  return {
    id,
    time: new Date(isoTime),
    level: 'warn',
    logKey: 'HTTP_REQUEST_SUCCESS',
    message: `GET /demo → 200 (${id})`,
    service: 'api',
    tenantId: TENANT_ACME,
    status: 200,
    durationMs: 12,
    // The model's `payload` (full already-redacted entry) is required; a minimal
    // JSON object suffices here since no SEED-row assertion inspects it.
    payload: { source: 'seed', id },
    ...overrides,
  }
}

/**
 * Six deterministic rows, newest-first by `(time, id)`. Level distribution is
 * error:3 / warn:2 / fatal:1 so the facet `groupBy` has a known shape; all six fall
 * inside the [AGG_FROM, AGG_TO] window so the volume buckets reconcile to 6.
 * Two tenants (acme:4 / globex:2) so the RBAC `where` provably excludes the other.
 */
const SEED: SeedInput[] = [
  row('log-006', '2024-06-01T12:05:05.000Z', { level: 'error', status: 500 }),
  row('log-005', '2024-06-01T12:05:04.000Z', { level: 'error', status: 500 }),
  row('log-004', '2024-06-01T12:05:03.000Z', {
    level: 'error',
    status: 503,
    tenantId: TENANT_GLOBEX,
  }),
  row('log-003', '2024-06-01T12:05:02.000Z', {
    level: 'fatal',
    status: 500,
    tenantId: TENANT_GLOBEX,
  }),
  row('log-002', '2024-06-01T12:05:01.000Z', { level: 'warn' }),
  row('log-001', '2024-06-01T12:05:00.000Z', { level: 'warn' }),
]

let prisma: PrismaService
let app: INestApplication

beforeAll(async () => {
  // Apply the schema to the dedicated test database. `--url` overrides the datasource so
  // this only ever touches the test stack (127.0.0.1:55432), never the dev database.
  execSync(`pnpm --filter api exec prisma db push --url=${TEST_DATABASE_URL} --accept-data-loss`, {
    cwd: REPO_ROOT,
    // prisma.config.ts resolves DATABASE_URL at load time (throwing if unset), so it must be
    // present; both it and `--url` point at the test stack, never the dev database.
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  })

  // A REAL PrismaService — the config stub returns the test-stack URL for DATABASE_URL.
  // `as unknown as ConfigService` is the accepted test-fixture cast for this narrow stub.
  prisma = new PrismaService({ getOrThrow: () => TEST_DATABASE_URL } as unknown as ConfigService)
  await prisma.onModuleInit()

  // Boot the real read-API over HTTP with the real, test-stack-backed Prisma. A minimal
  // module wires the real LogsController + real services so no ConfigService / LokiClient
  // (needed only by the SSE + Loki-proxy controllers) is required — Prisma stays REAL.
  const moduleRef = await Test.createTestingModule({ imports: [LogsApiPostgresModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile()
  app = moduleRef.createNestApplication()
  await app.init()

  // Start from a clean table (the test DB is reused across runs), then seed deterministic
  // rows with real SQL — every assertion reconciles against these.
  await prisma.applicationLog.deleteMany()
  await prisma.applicationLog.createMany({ data: SEED })
}, 180_000)

afterAll(async () => {
  if (app !== undefined) await app.close()
  if (prisma !== undefined) await prisma.onApplicationShutdown()
})

/**
 * Stand-in PrismaService provider so the token resolves inside this isolated module.
 * The test-stack-backed instance is injected at compile time via `.overrideProvider`.
 */
const PRISMA_PLACEHOLDER = { provide: PrismaService, useValue: {} }

// Minimal module: the real logs read-API controller + services. The SSE and Loki-proxy
// controllers are intentionally excluded so no ConfigService / LokiClient is needed —
// the Postgres path is what this suite proves, and Prisma is REAL.
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
class LogsApiPostgresModule {}

describe('Logs read-API → real Postgres', () => {
  it('GET /logs paginates with a real keyset cursor and the second page does not overlap the first', async () => {
    /**
     * Scenario: an admin (no tenant restriction) requests a 2-row page, then replays the
     * returned cursor for the next page. Contract proven by Postgres: page one is the two
     * newest rows ordered by the real `(time DESC, id DESC)` index, `hasMore` is true, and
     * `nextCursor` is a real opaque string. Page two — fetched by Postgres applying the
     * keyset WHERE `(time < t) OR (time = t AND id < id)` — shares zero ids with page one,
     * proving the database advanced the window rather than restarting it.
     */
    const first = await request(app.getHttpServer())
      .get('/logs')
      .set('x-role', 'admin')
      .query({ limit: 2, from: AGG_FROM, to: AGG_TO })
      .expect(200)

    expect(first.body.data).toHaveLength(2)
    expect(first.body.hasMore).toBe(true)
    expect(typeof first.body.nextCursor).toBe('string')
    expect(first.body.nextCursor.length).toBeGreaterThan(0)

    const firstIds: string[] = first.body.data.map((r: { id: string }) => r.id)
    // Newest-first by (time DESC, id DESC) — the two latest seeded rows.
    expect(firstIds).toEqual(['log-006', 'log-005'])

    const second = await request(app.getHttpServer())
      .get('/logs')
      .set('x-role', 'admin')
      .query({ limit: 2, from: AGG_FROM, to: AGG_TO, cursor: first.body.nextCursor })
      .expect(200)

    const secondIds: string[] = second.body.data.map((r: { id: string }) => r.id)
    expect(secondIds).toEqual(['log-004', 'log-003'])
    // No id appears on both pages — the real keyset WHERE moved the window forward.
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false)
  })

  it('GET /logs/aggregate?metric=volume returns date_trunc buckets whose counts reconcile with the seed', async () => {
    /**
     * Scenario: an admin requests a 5-minute volume aggregation over the seed window.
     * Contract proven by Postgres: the real `date_trunc('minute', time)` +
     * `generate_series(…, '5 minutes')` × `unnest(levels)` SQL runs server-side, returning
     * a zero-filled `{ bucket, level, n }[]`. Summing `n` across all returned rows equals
     * the six seeded rows exactly, and the per-level non-zero counts match the seed
     * distribution (error:3, warn:2, fatal:1) — the database did the bucketing, not JS.
     */
    const res = await request(app.getHttpServer())
      .get('/logs/aggregate')
      .set('x-role', 'admin')
      .query({ metric: 'volume', bucket: '5m', from: AGG_FROM, to: AGG_TO })
      .expect(200)

    const buckets = res.body as Array<{ level: string; n: number }>
    const total = buckets.reduce((sum, b) => sum + b.n, 0)
    expect(total).toBe(SEED.length)

    const countFor = (level: string): number =>
      buckets.filter((b) => b.level === level).reduce((sum, b) => sum + b.n, 0)
    expect(countFor('error')).toBe(3)
    expect(countFor('warn')).toBe(2)
    expect(countFor('fatal')).toBe(1)
    // Zero-fill ran: levels with no seed rows still appear with n = 0.
    expect(countFor('debug')).toBe(0)
  })

  it('GET /logs/facets?fields=level returns real groupBy counts matching the seed distribution', async () => {
    /**
     * Scenario: an admin requests the `level` facet over the seed window. Contract proven
     * by Postgres: the real `applicationLog.groupBy({ by: ['level'], _count })` runs and the
     * facets service maps each group to `{ value, count }` ordered by count descending. The
     * returned pairs reconcile exactly with the seed (error:3, warn:2, fatal:1) — counts the
     * database computed, summing back to the six seeded rows.
     */
    const res = await request(app.getHttpServer())
      .get('/logs/facets')
      .set('x-role', 'admin')
      .query({ fields: 'level', from: AGG_FROM, to: AGG_TO })
      .expect(200)

    const levels = res.body.level as Array<{ value: string; count: number }>
    const byValue = new Map(levels.map((l) => [l.value, l.count]))
    expect(byValue.get('error')).toBe(3)
    expect(byValue.get('warn')).toBe(2)
    expect(byValue.get('fatal')).toBe(1)
    expect(levels.reduce((sum, l) => sum + l.count, 0)).toBe(SEED.length)
    // Ordered by count descending — the most frequent level is first.
    expect(levels[0]?.value).toBe('error')
  })

  it('GET /logs as a viewer scoped to a tenant returns only that tenant rows (real WHERE)', async () => {
    /**
     * Scenario: a viewer for `tenant-acme` lists logs while attempting to widen the scope
     * via a `tenantId=tenant-globex` query param. Contract proven by Postgres: the RBAC
     * restriction is compiled into the real `where.tenantId = 'tenant-acme'` and the query
     * param is ignored, so the database returns ONLY the four acme rows and never the two
     * globex rows — tenant isolation enforced server-side, not by trusting the client.
     */
    const res = await request(app.getHttpServer())
      .get('/logs')
      .set('x-role', 'viewer')
      .set('x-tenant-id', TENANT_ACME)
      .query({ limit: 100, from: AGG_FROM, to: AGG_TO, tenantId: TENANT_GLOBEX })
      .expect(200)

    const tenants = new Set((res.body.data as Array<{ tenantId: string }>).map((r) => r.tenantId))
    expect(tenants).toEqual(new Set([TENANT_ACME]))
    expect(res.body.data).toHaveLength(SEED.filter((r) => r.tenantId === TENANT_ACME).length)
  })

  it('PrismaLogDestination writes a warn line that reads back with the mapped columns', async () => {
    /**
     * Scenario: construct a `PrismaLogDestination` against the real Prisma, `write()` a
     * single `warn`-level NDJSON line carrying the library's `service: { name }` object plus
     * `statusCode` and `duration`, then `onShutdown()` to force the final flush. Contract
     * proven by Postgres: the destination's real `createMany` write path lands one row whose
     * mapped columns reconcile — `service` projected from `service.name`, `status` from
     * `statusCode`, `durationMs` from `duration`, and the full entry preserved in `payload`.
     */
    const dest = new PrismaLogDestination(prisma, { batchSize: 1 })
    const logKey = 'PAYMENT_REFUND_FAILED'
    const line = JSON.stringify({
      time: '2024-06-01T13:00:00.000Z',
      level: 'warn',
      logKey,
      message: 'refund failed',
      service: { name: 'billing', version: '1.2.3' },
      tenantId: TENANT_ACME,
      statusCode: 402,
      duration: 87,
    })
    dest.write(`${line}\n`)
    await dest.onShutdown()

    const persisted = await prisma.applicationLog.findMany({ where: { logKey } })
    expect(persisted).toHaveLength(1)
    const stored = persisted[0]
    expect(stored?.level).toBe('warn')
    // service is projected from the library's { name } object, not the bare string.
    expect(stored?.service).toBe('billing')
    // status/durationMs are mapped from statusCode/duration via the destination's pickNumber.
    expect(stored?.status).toBe(402)
    expect(stored?.durationMs).toBe(87)
    expect(stored?.tenantId).toBe(TENANT_ACME)
    // The full already-redacted entry is preserved verbatim in the JSONB payload column.
    expect((stored?.payload as { logKey?: string }).logKey).toBe(logKey)
  })
})
