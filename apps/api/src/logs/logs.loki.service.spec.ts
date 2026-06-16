/**
 * Unit tests for `LogsLokiService` — the `source=loki` Explorer list path.
 *
 * Covers: LogQL service-label resolution (query override vs `OTEL_SERVICE_NAME`
 * default), stream → row mapping (field defaults, `msg`/`message`, line-time vs
 * ns-fallback, service from line/label/default), malformed-line and shape guards,
 * newest-first ordering, `hasMore`/`nextCursor` keyset pagination, the cursor
 * boundary (`end = cursorNs - 1`), the Postgres-cursor staleness guard, and the
 * Loki-down → 502 / non-Loki error rethrow paths. A real `LogsService` supplies the
 * pure LogQL/cursor codec; `LokiClient` and `ConfigService` are stubbed.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { BadGatewayException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { LogQueryDto } from './dto/log-query.dto.js'
import { LogsLokiService } from './logs.loki.service.js'
import { LogsService, StaleCursorError } from './logs.service.js'
import { LokiClient, LokiUnavailableError } from './loki.client.js'

/** A Loki `query_range` stream entry: `[ns, line]` where `line` is JSON (or a raw string). */
type Entry = [string, Record<string, unknown> | string]

/**
 * Build a `LogsLokiService` over a real `LogsService` (pure) plus a controllable
 * `LokiClient.queryRange` and a `ConfigService` whose `OTEL_SERVICE_NAME` is fixed.
 */
function build(serviceName?: string): {
  svc: LogsLokiService
  logs: LogsService
  queryRange: jest.MockedFunction<LokiClient['queryRange']>
} {
  const logs = new LogsService()
  const queryRange = jest.fn() as jest.MockedFunction<LokiClient['queryRange']>
  const client = { queryRange } as unknown as LokiClient
  // ConfigService.get(key, default) returns the fixed service name, or the default.
  const config = {
    get: jest.fn((_key: string, def?: string) => serviceName ?? def),
  } as unknown as ConfigService
  return { svc: new LogsLokiService(logs, client, config), logs, queryRange }
}

/** Compose a Loki `query_range` streams response from `[ns, line]` entries. */
function lokiResp(
  entries: Entry[],
  labels: Record<string, unknown> = { service: 'nest-logger-example-api' },
): { status: string; data: { resultType: string; result: unknown[] } } {
  return {
    status: 'success',
    data: {
      resultType: 'streams',
      result: [
        {
          stream: labels,
          values: entries.map(([ns, line]) => [
            ns,
            typeof line === 'string' ? line : JSON.stringify(line),
          ]),
        },
      ],
    },
  }
}

/** A fully-defaulted `source=loki` query with the given overrides. */
function query(overrides: Partial<LogQueryDto> = {}): LogQueryDto {
  return { source: 'loki', limit: 100, ...overrides } as LogQueryDto
}

describe('LogsLokiService.query — LogQL + window', () => {
  beforeEach(() => jest.clearAllMocks())

  it('resolves the service label from OTEL_SERVICE_NAME when the query omits service', async () => {
    /**
     * With no `service` in the query, the selector must use the configured
     * `OTEL_SERVICE_NAME` (here the default `nest-logger-example-api`) — NOT the
     * literal `api` that `buildLogQL` falls back to, which matches no real stream.
     */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(lokiResp([]))

    await svc.query(query())

    const logql = queryRange.mock.calls[0]?.[0] as string
    expect(logql).toContain('service="nest-logger-example-api"')
    expect(logql).not.toContain('service="api"')
  })

  it('uses the query service label verbatim when provided, bypassing the config default', async () => {
    /**
     * An explicit `service` must win over the configured default so the operator can
     * scope to another stream — covers the `q.service ?? config` left side.
     */
    const { svc, queryRange } = build('ignored-default')
    queryRange.mockResolvedValue(lokiResp([]))

    await svc.query(query({ service: 'worker-svc' }))

    expect(queryRange.mock.calls[0]?.[0]).toContain('service="worker-svc"')
  })

  it('passes the RBAC tenant restriction into the LogQL pipeline', async () => {
    /**
     * The `restriction.tenantId` must be ANDed into the LogQL so Loki cannot return
     * other tenants' streams — RBAC parity with the Postgres path.
     */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(lokiResp([]))

    await svc.query(query(), { tenantId: 'acme' })

    expect(queryRange.mock.calls[0]?.[0]).toContain('tenantId="acme"')
  })

  it('derives the start/end ns window from from/to and requests the query limit', async () => {
    /**
     * `from`/`to` ISO times must convert to nanosecond Unix timestamps (ms × 1e6) and
     * the `limit` must be forwarded so Loki bounds the result set.
     */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(lokiResp([]))

    await svc.query(
      query({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T01:00:00.000Z', limit: 50 }),
    )

    const [, startNs, endNs, , limit] = queryRange.mock.calls[0] as [
      string,
      string,
      string,
      string,
      number,
    ]
    expect(startNs).toBe((BigInt(Date.parse('2026-01-01T00:00:00.000Z')) * 1_000_000n).toString())
    expect(endNs).toBe((BigInt(Date.parse('2026-01-01T01:00:00.000Z')) * 1_000_000n).toString())
    expect(limit).toBe(50)
  })

  it('defaults the window to roughly now-1h..now when from/to are absent', async () => {
    /**
     * Omitting `from`/`to` must fall back to a now-1h..now window — the ns end must be
     * within a second of "now" and the start ~3600s earlier.
     */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(lokiResp([]))

    const before = Date.now()
    await svc.query(query())
    const after = Date.now()

    const [, startNs, endNs] = queryRange.mock.calls[0] as [string, string, string]
    const endMs = Number(BigInt(endNs) / 1_000_000n)
    const startMs = Number(BigInt(startNs) / 1_000_000n)
    expect(endMs).toBeGreaterThanOrEqual(before)
    expect(endMs).toBeLessThanOrEqual(after + 1000)
    expect(endMs - startMs).toBe(60 * 60 * 1000)
  })
})

describe('LogsLokiService.query — stream mapping', () => {
  beforeEach(() => jest.clearAllMocks())

  it('maps a full info line into every ApplicationLog field', async () => {
    /**
     * A complete Loki line must map field-for-field, with the synthetic `id` set to
     * the nanosecond timestamp and the whole line preserved as `payload`.
     */
    const { svc, queryRange } = build()
    const line = {
      time: '2026-06-16T14:58:00.000Z',
      level: 'info',
      logKey: 'ORDER_CREATE_SUCCESS',
      msg: 'Order created',
      service: 'nest-logger-example-api',
      tenantId: 'acme',
      requestId: 'req-1',
      traceId: 'trace-1',
      spanId: 'span-1',
      status: 201,
      durationMs: 12,
    }
    queryRange.mockResolvedValue(lokiResp([['1718549880000000000', line]]))

    const { data } = await svc.query(query())

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      id: '1718549880000000000',
      level: 'info',
      logKey: 'ORDER_CREATE_SUCCESS',
      message: 'Order created',
      service: 'nest-logger-example-api',
      tenantId: 'acme',
      requestId: 'req-1',
      traceId: 'trace-1',
      spanId: 'span-1',
      status: 201,
      durationMs: 12,
    })
    expect(data[0]?.time.toISOString()).toBe('2026-06-16T14:58:00.000Z')
    expect(data[0]?.payload).toMatchObject({ logKey: 'ORDER_CREATE_SUCCESS' })
  })

  it('applies safe defaults for a minimal line and reads service from the stream label', async () => {
    /**
     * A line missing optional fields must default level→info, logKey→UNKNOWN,
     * message→'' and null-out the correlation ids/status/durationMs; `service`
     * falls back to the stream label when absent from the line body.
     */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(
      lokiResp([['1718549880000000000', { foo: 'bar' }]], { service: 'label-svc' }),
    )

    const { data } = await svc.query(query())

    expect(data[0]).toMatchObject({
      level: 'info',
      logKey: 'UNKNOWN',
      message: '',
      service: 'label-svc',
      tenantId: null,
      requestId: null,
      traceId: null,
      spanId: null,
      status: null,
      durationMs: null,
    })
  })

  it('falls back to DEFAULT_SERVICE when neither the line nor the label carries one', async () => {
    /**
     * If both `line.service` and the stream `service` label are absent, the row must
     * still carry the demo default — covers the final `?? DEFAULT_SERVICE` arm.
     */
    const { svc, queryRange } = build()
    // A stream object with NO `stream` label field exercises the `?? {}` fallback.
    queryRange.mockResolvedValue({
      status: 'success',
      data: {
        resultType: 'streams',
        result: [{ values: [['1718549880000000000', JSON.stringify({ msg: 'x' })]] }],
      },
    } as never)

    const { data } = await svc.query(query())

    expect(data[0]?.service).toBe('nest-logger-example-api')
  })

  it('prefers msg but falls back to message for the row text', async () => {
    /**
     * Pino emits `msg`; some entries carry `message`. The mapper must prefer `msg`
     * and only use `message` when `msg` is absent — covers both `??` arms.
     */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(
      lokiResp([
        ['1718549880000000002', { msg: 'from-msg', message: 'ignored' }],
        ['1718549880000000001', { message: 'from-message' }],
      ]),
    )

    const { data } = await svc.query(query())
    const byId = Object.fromEntries(data.map((r) => [r.id, r.message]))
    expect(byId['1718549880000000002']).toBe('from-msg')
    expect(byId['1718549880000000001']).toBe('from-message')
  })

  it('derives time from the ns timestamp when the line time is missing or unparseable', async () => {
    /**
     * When `line.time` is absent or not a valid date, the row `time` must come from
     * the Loki nanosecond timestamp (ns ÷ 1e6) — covers the ns-fallback branch.
     */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(
      lokiResp([
        ['1718549880000000000', { msg: 'no-time' }],
        ['1718549881000000000', { time: 'not-a-date', msg: 'bad-time' }],
      ]),
    )

    const { data } = await svc.query(query())
    const byId = Object.fromEntries(data.map((r) => [r.id, r.time.getTime()]))
    expect(byId['1718549880000000000']).toBe(1718549880000)
    expect(byId['1718549881000000000']).toBe(1718549881000)
  })

  it('sorts rows newest-first regardless of Loki return order', async () => {
    /**
     * Rows must be ordered by descending time so the Explorer table shows newest at
     * the top even if Loki streams arrive out of order.
     */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(
      lokiResp([
        ['1718549880000000000', { time: '2026-06-16T14:00:00.000Z', msg: 'older' }],
        ['1718549890000000000', { time: '2026-06-16T15:00:00.000Z', msg: 'newer' }],
      ]),
    )

    const { data } = await svc.query(query())
    expect(data.map((r) => r.message)).toEqual(['newer', 'older'])
  })
})

describe('LogsLokiService.query — shape + malformed guards', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns an empty page when result is not an array', async () => {
    /** A non-array `data.result` (or absent `data`) must yield no rows, not throw. */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue({
      status: 'success',
      data: { resultType: 'streams', result: undefined },
    } as never)

    const { data, hasMore, nextCursor } = await svc.query(query())
    expect(data).toEqual([])
    expect(hasMore).toBe(false)
    expect(nextCursor).toBeNull()
  })

  it('skips a stream whose values field is not an array', async () => {
    /** A stream with a non-array `values` must be skipped without throwing. */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue({
      status: 'success',
      data: { resultType: 'streams', result: [{ stream: {}, values: 'nope' }] },
    } as never)

    expect((await svc.query(query())).data).toEqual([])
  })

  it('skips entries that are not [ns, line] pairs', async () => {
    /** Entries that are not arrays of length ≥ 2 must be dropped (defensive shape guard). */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue({
      status: 'success',
      data: {
        resultType: 'streams',
        result: [
          {
            stream: {},
            values: [['only-one'], 'not-an-array', ['1718549880000000000', '{"msg":"ok"}']],
          },
        ],
      },
    } as never)

    const { data } = await svc.query(query())
    expect(data).toHaveLength(1)
    expect(data[0]?.message).toBe('ok')
  })

  it('drops a malformed JSON line and keeps the valid ones', async () => {
    /** A line that fails `JSON.parse` must be dropped (mirrors `| __error__=""`). */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(
      lokiResp([
        ['1718549880000000000', '{ not valid json'],
        ['1718549881000000000', { msg: 'valid' }],
      ]),
    )

    const { data } = await svc.query(query())
    expect(data).toHaveLength(1)
    expect(data[0]?.message).toBe('valid')
  })
})

describe('LogsLokiService.query — pagination', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sets hasMore and a nextCursor when a full page is returned', async () => {
    /**
     * When Loki returns exactly `limit` rows, `hasMore` is true and `nextCursor`
     * encodes the last (oldest) row's time + ns id for the next page.
     */
    const { svc, queryRange, logs } = build()
    queryRange.mockResolvedValue(
      lokiResp([
        ['1718549890000000000', { time: '2026-06-16T15:00:00.000Z', msg: 'a' }],
        ['1718549880000000000', { time: '2026-06-16T14:00:00.000Z', msg: 'b' }],
      ]),
    )

    const { hasMore, nextCursor } = await svc.query(query({ limit: 2 }))
    expect(hasMore).toBe(true)
    expect(nextCursor).not.toBeNull()
    // The cursor must round-trip to the oldest row's ns id.
    expect(logs.decodeCursor(nextCursor as string).id).toBe('1718549880000000000')
  })

  it('returns no cursor when fewer than limit rows come back', async () => {
    /** A partial page means the end of the stream — `hasMore` false, `nextCursor` null. */
    const { svc, queryRange } = build()
    queryRange.mockResolvedValue(lokiResp([['1718549890000000000', { msg: 'only' }]]))

    const { hasMore, nextCursor } = await svc.query(query({ limit: 100 }))
    expect(hasMore).toBe(false)
    expect(nextCursor).toBeNull()
  })

  it('pages strictly older than the cursor (end = cursorNs - 1)', async () => {
    /**
     * A cursor whose id is a nanosecond timestamp must set the Loki `end` to
     * `cursorNs - 1`, excluding the cursor entry so pages do not overlap.
     */
    const { svc, queryRange, logs } = build()
    queryRange.mockResolvedValue(lokiResp([]))
    const cursor = logs.encodeCursor({
      time: new Date('2026-06-16T15:00:00.000Z'),
      id: '1718549890000000000',
    })

    await svc.query(query({ cursor }))

    const endNs = (queryRange.mock.calls[0] as [string, string, string])[2]
    expect(endNs).toBe('1718549889999999999')
  })

  it('treats a Postgres-style (non-numeric id) cursor as stale', async () => {
    /**
     * Switching source mid-pagination yields a cursor whose id is a cuid, not a ns
     * timestamp; `BigInt()` throws and the service must surface `StaleCursorError`
     * so the controller maps it to 410 and the client restarts.
     */
    const { svc, logs } = build()
    const cursor = logs.encodeCursor({
      time: new Date('2026-06-16T15:00:00.000Z'),
      id: 'cml0abcd0000xyz',
    })

    await expect(svc.query(query({ cursor }))).rejects.toBeInstanceOf(StaleCursorError)
  })
})

describe('LogsLokiService.query — failure mapping', () => {
  beforeEach(() => jest.clearAllMocks())

  it('maps a LokiUnavailableError to BadGatewayException (HTTP 502)', async () => {
    /** Loki being unreachable must degrade to a 502 so the dashboard stays usable. */
    const { svc, queryRange } = build()
    queryRange.mockRejectedValue(new LokiUnavailableError('Loki unreachable: ECONNREFUSED'))

    await expect(svc.query(query())).rejects.toBeInstanceOf(BadGatewayException)
    await expect(svc.query(query())).rejects.toThrow(/Loki is unavailable/)
  })

  it('rethrows a non-Loki error unchanged', async () => {
    /** An unexpected error (not LokiUnavailableError) must propagate, not become a 502. */
    const { svc, queryRange } = build()
    queryRange.mockRejectedValue(new Error('boom'))

    await expect(svc.query(query())).rejects.toThrow('boom')
    await expect(svc.query(query())).rejects.not.toBeInstanceOf(BadGatewayException)
  })
})
