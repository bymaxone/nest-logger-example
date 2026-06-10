# Database

The durable, queryable tier. `PrismaLogDestination` writes `warn`+ entries to a single PostgreSQL table,
`ApplicationLog`, holding the **already-redacted** log payload plus the columns the dashboard needs for
charts and keyset paging. This page documents that schema and how to **query** it directly; the index-tuning
rationale, the chart aggregation recipes, and the Loki half of the source toggle live in
**[DASHBOARD.md §13](./DASHBOARD.md#13-data-model--queries-postgres--loki)**.

---

## The `ApplicationLog` model

```prisma
// apps/api/prisma/schema.prisma
model ApplicationLog {
  id         String   @id @default(cuid())
  time       DateTime // event time (from the log entry, NOT a DB default)
  level      String   // 'warn' | 'error' | 'fatal' (this tier is warn+)
  logKey     String
  message    String
  service    String
  tenantId   String?
  requestId  String?
  traceId    String?  // join key with Tempo
  spanId     String?
  status     Int?     // HTTP status when present (status-class charts)
  durationMs Int?     // when present (latency charts)
  payload    Json     // the full, already-REDACTED log entry

  @@index([time(ops: raw("timestamp_minmax_ops"))], type: Brin) // tiny, append-only time series
  @@index([time(sort: Desc), id(sort: Desc)])                   // keyset pagination (newest-first)
  @@index([payload(ops: JsonbPathOps)], type: Gin)              // arbitrary-metadata containment
  @@index([level])
  @@index([logKey])
  @@index([traceId])
  @@index([tenantId, time])
}
```

This is the single, dashboard-grade definition — there is no separate "simplified" table. The
**index-tuning notes** (BRIN on `time`, the keyset `(time DESC, id DESC)` index, the GIN `jsonb_path_ops`
index on `payload`) and the **chart/aggregation SQL** are documented once, in
[DASHBOARD.md §13](./DASHBOARD.md#13-data-model--queries-postgres--loki); this page does not duplicate them.

> **Table & column naming.** The schema declares no `@@map` / `@map`, so Postgres creates the table exactly as
> the model name — `"ApplicationLog"` — and keeps the camelCase column names. In raw SQL the camelCase columns
> therefore need double quotes (`"logKey"`, `"traceId"`, `"durationMs"`); lowercase columns (`time`, `level`,
> `message`, `payload`, `id`) do not.

---

## Querying the durable tier

Because `traceId` is denormalized into its own indexed column, you can reconstruct a request end to end from
the database alone — no Loki, no Tempo:

```sql
-- Reconstruct one request, oldest line first:
SELECT "time", level, "logKey", message, payload
FROM "ApplicationLog"
WHERE "traceId" = '4bf92f3577b34da6a3ce929d0e0e4736'
ORDER BY "time";
```

Filter by level and key:

```sql
SELECT "time", "logKey", message
FROM "ApplicationLog"
WHERE level IN ('error', 'fatal')
  AND "logKey" = 'PAYMENT_CHARGE_FAILED'
ORDER BY "time" DESC
LIMIT 50;
```

Page newest-first with the **keyset** pattern the read-API uses (constant-time, stable under concurrent
inserts — not `OFFSET`). The cursor is the last row's `(time, id)`:

```sql
-- Keyset page of recent errors, after an opaque (time, id) cursor:
SELECT id, "time", "logKey", message
FROM "ApplicationLog"
WHERE level IN ('error', 'fatal')
  AND ("time", id) < ($1, $2)   -- $1 = cursor time, $2 = cursor id
ORDER BY "time" DESC, id DESC
LIMIT 50;
```

The matching Prisma queries (used by `apps/api/src/logs/logs.service.ts`):

```typescript
// Reconstruct a request from the DB:
const trail = await prisma.applicationLog.findMany({
  where: { traceId: '4bf92f3577b34da6a3ce929d0e0e4736' },
  orderBy: { time: 'asc' },
})

// Keyset page of recent errors:
const page = await prisma.applicationLog.findMany({
  where: { level: { in: ['error', 'fatal'] } },
  orderBy: [{ time: 'desc' }, { id: 'desc' }],
  take: 50,
  // cursor/skip applied from the opaque (time, id) cursor
})
```

---

## The two-tier model

The example writes logs to **two** tiers with deliberately different floors:

| Tier        | Sink                              | Floor                                            | Purpose                        |
| ----------- | --------------------------------- | ------------------------------------------------ | ------------------------------ |
| Aggregation | Loki (`LokiDestination`)          | `info`+                                          | high-volume search, dashboards |
| Durable     | Postgres (`PrismaLogDestination`) | `warn`+ (via `LOG_DB_MIN_LEVEL`, default `warn`) | audit, long-lived querying     |

So an `info` line reaches stdout + Loki but **not** Postgres; a `warn`/`error`/`fatal` line reaches all three.
The dashboard's **source toggle** (Postgres ⇄ Loki) exposes this asymmetry on purpose — the same time window
shows more rows from Loki than from Postgres, and a callout explains why.

> **No raw PII reaches Postgres.** `payload` stores exactly what `PrismaLogDestination` receives, which is
> **post-redaction** (stage 2 of the pipeline runs before fan-out). The database never holds an un-redacted
> secret. See **[REDACTION.md](./REDACTION.md)**.

Retention is swept by a TTL job governed by `RETENTION_DAYS` (the Maintenance page); see
**[ENVIRONMENT.md](./ENVIRONMENT.md)**.

---

## See also

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — where redaction sits in the pipeline (so the payload is safe to persist).
- **[DASHBOARD.md §13](./DASHBOARD.md#13-data-model--queries-postgres--loki)** — index tuning, chart aggregation SQL, and the Loki/LogQL mapping.
- **[DESTINATIONS.md](./DESTINATIONS.md)** — how `PrismaLogDestination` batches inserts and filters by `minLevel`.
- **[OVERVIEW.md §10](./OVERVIEW.md#10-the-demo-domain--log-explorer-dashboard)** — the demo domain and read-API context.
