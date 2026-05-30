# Phase 12 — Dashboard: Overview, Explorer, Live Tail — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-12--dashboard-overview-explorer-live-tail) §Phase 12
> **Total tasks:** 9
> **Progress:** 🔴 0 / 9 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                                       | Status | Priority | Size | Depends on             |
| ----- | -------------------------------------------------------------------------- | ------ | -------- | ---- | ---------------------- |
| P12-1 | `lib/api-client.ts` typed fetch wrappers + data hooks (`useLogs`/`useAggregate`/`useFacets`) | 🔴 | High | M | Phase 10, Phase 11 |
| P12-2 | `lib/filters.ts` nuqs `LogQuery ↔ URL` parsers + global top-bar controls   | 🔴     | High     | M    | P12-1                  |
| P12-3 | `app/page.tsx` Overview — health strip (4 golden signals + SLO)            | 🔴     | High     | M    | P12-1, P12-2           |
| P12-4 | Overview — brushable volume timeseries + RED row (Rate/Errors/Duration + heatmap) | 🔴 | High | L | P12-3 |
| P12-5 | Overview — breakdown row + pipeline-health panel                           | 🔴     | High     | M    | P12-3                  |
| P12-6 | `app/explorer/page.tsx` — facet rail + query bar (SQL/LogQL toggles)       | 🔴     | High     | L    | P12-2                  |
| P12-7 | Explorer — virtualized table (TanStack Table v8 + Virtual v3) + detail drawer | 🔴  | High     | L    | P12-6                  |
| P12-8 | `lib/use-event-source.ts` + live tail (follow-mode, rAF ring buffer)       | 🔴     | High     | L    | P12-7                  |
| P12-9 | Phase 12 verification gate (brush→filter, fire→tail, traceId→trace)        | 🔴     | High     | M    | P12-1..P12-8           |

---

## P12-1 — `lib/api-client.ts` typed fetch wrappers + data hooks (`useLogs` / `useAggregate` / `useFacets`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `Phase 10`, `Phase 11`

### Description

Build the typed client layer between `apps/web` and the Phase 10 `logs/` read-API (`DASHBOARD.md` §12). One `api-client.ts` exports thin `fetch` wrappers for every read endpoint (`/logs`, `/logs/aggregate`, `/logs/facets`, `/logs/context`, `/logs/export`), each accepting the shared `LogQuery` filter so the source toggle is transparent. On top of it, `hooks/` exposes TanStack Query v5 hooks: `useLogs` (`useInfiniteQuery`, keyset cursor), `useAggregate` (`useQuery`, per-metric chart data), and `useFacets` (`useQuery`, rail value counts). Types come from `@bymax-one/nest-logger/shared` (`LogEntry`, `LogLevel`) so the example consumes the library's isomorphic subpath, never re-declaring shapes. This is the data foundation every later Phase 12 page builds on.

### Acceptance Criteria

- [ ] `apps/web/lib/api-client.ts` exports `getLogs`, `getAggregate`, `getFacets`, `getContext`, `getExportUrl`, each typed against a `LogQuery` argument and returning typed payloads.
- [ ] A base `apiFetch<T>()` helper centralizes `process.env.NEXT_PUBLIC_API_URL`, JSON parsing, and non-2xx → thrown `ApiError` (carrying `status`).
- [ ] `LogQuery` is serialized to a query string via a single `encodeLogQuery(q)` util (re-used later by the SSE hook).
- [ ] `apps/web/hooks/use-logs.ts` exports `useLogs(query)` using `useInfiniteQuery` with `getNextPageParam` reading the opaque keyset `cursor`; a `410` response resets the query.
- [ ] `apps/web/hooks/use-aggregate.ts` exports `useAggregate(metric, query)` (`metric ∈ 'volume' | 'errorRate' | 'latency' | 'statusMix'`) via `useQuery`.
- [ ] `apps/web/hooks/use-facets.ts` exports `useFacets(fields, query)` via `useQuery`.
- [ ] `LogEntry` / `LogLevel` are imported from `@bymax-one/nest-logger/shared` — not redefined.
- [ ] `pnpm --filter web typecheck` and `pnpm --filter web build` pass.

### Files to create / modify

- `apps/web/lib/api-client.ts` — typed fetch wrappers + `apiFetch` + `encodeLogQuery`.
- `apps/web/lib/types.ts` — `LogQuery`, `AggregateMetric`, `FacetField`, `ApiError`, paged/aggregate response shapes (re-exporting library types).
- `apps/web/hooks/use-logs.ts` — `useInfiniteQuery` wrapper.
- `apps/web/hooks/use-aggregate.ts` — `useQuery` wrapper.
- `apps/web/hooks/use-facets.ts` — `useQuery` wrapper.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js engineer building the data layer of a log-observability dashboard.
> Context: Repo `nest-logger-example`, app `apps/web` (Next.js 16 + React 19), reference app for `@bymax-one/nest-logger`. This is task P12-1 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. Read `docs/DASHBOARD.md` §12 (the backing API + the `LogQuery` Filter DTO), §13 (keyset pagination + the aggregate queries), and §15–§16 (TanStack Query v5 is the server-state lib; `hooks/` holds `useLogs`/`useAggregate`/`useFacets`; `lib/api-client.ts` holds the fetch wrappers). The Phase 10 endpoints already exist: `GET /logs` (keyset, `?level=&logKey=&service=&tenantId=&traceId=&requestId=&q=&from=&to=&source=&cursor=&limit=`), `GET /logs/aggregate` (`?metric=&groupBy=&bucket=auto&from=&to=&source=`), `GET /logs/facets` (`?fields=&from=&to=`), `GET /logs/context`, `GET /logs/export`.
> Objective: Produce the typed client (`lib/api-client.ts`) and the three TanStack Query hooks.
> Steps:
>
> 1. Define the shared filter + response types in `apps/web/lib/types.ts`, re-exporting library types:
>    ```typescript
>    import type { LogEntry, LogLevel } from '@bymax-one/nest-logger/shared'
>
>    export type { LogEntry, LogLevel }
>    export type LogSource = 'postgres' | 'loki'
>    export type AggregateMetric = 'volume' | 'errorRate' | 'latency' | 'statusMix'
>    export type FacetField = 'level' | 'service' | 'logKey' | 'tenantId'
>
>    export interface LogQuery {
>      level?: LogLevel | { gte: LogLevel }
>      logKey?: string
>      service?: string
>      tenantId?: string
>      traceId?: string
>      requestId?: string
>      q?: string
>      from?: string
>      to?: string
>      source: LogSource
>      cursor?: string
>      limit?: number
>    }
>
>    export interface LogPage {
>      rows: LogEntry[]
>      nextCursor: string | null
>    }
>
>    export class ApiError extends Error {
>      constructor(
>        readonly status: number,
>        message: string,
>      ) {
>        super(message)
>      }
>    }
>    ```
> 2. Create `apps/web/lib/api-client.ts` with a base helper + the wrappers:
>    ```typescript
>    import type { AggregateMetric, FacetField, LogPage, LogQuery } from './types'
>    import { ApiError } from './types'
>
>    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
>
>    export function encodeLogQuery(q: LogQuery): string {
>      const p = new URLSearchParams()
>      for (const [k, v] of Object.entries(q)) {
>        if (v === undefined) continue
>        p.set(k, typeof v === 'object' ? `>=${v.gte}` : String(v))
>      }
>      return p.toString()
>    }
>
>    async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
>      const res = await fetch(`${BASE}${path}`, { ...init, headers: { Accept: 'application/json' } })
>      if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`)
>      return (await res.json()) as T
>    }
>
>    export const getLogs = (q: LogQuery) => apiFetch<LogPage>(`/logs?${encodeLogQuery(q)}`)
>    export const getAggregate = (metric: AggregateMetric, q: LogQuery) =>
>      apiFetch<{ buckets: Array<Record<string, number | string>> }>(
>        `/logs/aggregate?metric=${metric}&${encodeLogQuery(q)}`,
>      )
>    export const getFacets = (fields: FacetField[], q: LogQuery) =>
>      apiFetch<Record<FacetField, Array<{ value: string; count: number }>>>(
>        `/logs/facets?fields=${fields.join(',')}&${encodeLogQuery(q)}`,
>      )
>    export const getExportUrl = (format: 'json' | 'csv', q: LogQuery) =>
>      `${BASE}/logs/export?format=${format}&${encodeLogQuery(q)}`
>    ```
> 3. Create `apps/web/hooks/use-logs.ts` (infinite/keyset):
>    ```typescript
>    'use client'
>    import { useInfiniteQuery } from '@tanstack/react-query'
>    import { getLogs } from '@/lib/api-client'
>    import type { LogQuery } from '@/lib/types'
>
>    export function useLogs(query: LogQuery) {
>      return useInfiniteQuery({
>        queryKey: ['logs', query],
>        queryFn: ({ pageParam }) => getLogs({ ...query, cursor: pageParam }),
>        initialPageParam: undefined as string | undefined,
>        getNextPageParam: (last) => last.nextCursor ?? undefined,
>      })
>    }
>    ```
> 4. Create `apps/web/hooks/use-aggregate.ts` and `apps/web/hooks/use-facets.ts` as `useQuery` wrappers over `getAggregate` / `getFacets`, keyed on `['aggregate', metric, query]` / `['facets', fields, query]`.
> 5. Run `pnpm --filter web typecheck` and `pnpm --filter web build`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions (TS 5.9 strict, ESM, `printWidth 100`, `singleQuote`, `semi: false`).
> - Import `LogEntry`/`LogLevel` from `@bymax-one/nest-logger/shared` — do NOT re-declare the log shape.
> - The browser **never** aggregates raw rows — charts read `getAggregate` only (`DASHBOARD.md` §11). Do NOT add a client-side group-by.
> - Do NOT hardcode a backend port other than via `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`).
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - `node -e "require('fs').accessSync('apps/web/lib/api-client.ts')"` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P12-2 — `lib/filters.ts` nuqs `LogQuery ↔ URL` parsers + global top-bar controls

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P12-1`

### Description

Make every view a shareable deep-link. `lib/filters.ts` defines `nuqs` v2 typed search-param parsers that bidirectionally map the global `LogQuery` (time range, source, tenant, role, plus filter fields) to the URL, and a `useLogQuery()` hook that reads/writes them. Four global controls live in the 64px top bar (`DASHBOARD.md` §4): **TimeRangePicker** (relative presets + absolute `Calendar`; buckets auto-scale to ~60–120 points), **SourceToggle** `[ Loki | Postgres ]` (with the persistent two-tier callout), **TenantRoleSwitcher** (injects `tenantId`; gates actions Viewer/Operator/Admin), and **LiveToggle** `⟳` (turns on the SSE tail from P12-8). All four write through the nuqs parsers so any panel/Explorer state is reconstructable from the URL.

### Acceptance Criteria

- [ ] `apps/web/lib/filters.ts` defines nuqs parsers for `from`, `to`, `source` (`parseAsStringEnum(['loki','postgres'])`, default `loki`), `tenantId`, `role`, `level`, `logKey`, `service`, `q`, plus a `live` boolean.
- [ ] Exports `useLogQuery()` returning `{ query: LogQuery, setQuery }` derived from the URL state, and a `bucketFor(from, to)` helper (`1m` ≤6h, `5m` ≤24h, `1h` ≤7d).
- [ ] `components/controls/TimeRangePicker.tsx` — relative presets (5m/15m/1h/6h/24h/7d) + absolute shadcn `Calendar`; writes `from`/`to`.
- [ ] `components/controls/SourceToggle.tsx` — `[ Loki | Postgres ]` segmented control writing `source`, with the 🎓 two-tier callout (`info`+ Loki vs `warn`+ Postgres).
- [ ] `components/controls/TenantRoleSwitcher.tsx` — tenant `Select` + role `Select` (Viewer/Operator/Admin) writing `tenantId`/`role`.
- [ ] `components/controls/LiveToggle.tsx` — `⟳` toggle writing `live` (consumed by the SSE tail in P12-8).
- [ ] All four are mounted in the top bar (the `components/layout/Topbar` from Phase 11); the root layout already wraps children in `<NuqsAdapter>` (Phase 11).
- [ ] `pnpm --filter web typecheck` + `build` pass; changing a control updates the URL and survives a reload.

### Files to create / modify

- `apps/web/lib/filters.ts` — nuqs parsers + `useLogQuery()` + `bucketFor()`.
- `apps/web/components/controls/TimeRangePicker.tsx`
- `apps/web/components/controls/SourceToggle.tsx`
- `apps/web/components/controls/TenantRoleSwitcher.tsx`
- `apps/web/components/controls/LiveToggle.tsx`
- `apps/web/components/layout/Topbar.tsx` — mount the four controls (modify the Phase 11 shell).

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js engineer.
> Context: Task P12-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. Read `docs/DASHBOARD.md` §4 (the four global controls + the two-tier source callout), §15 (nuqs v2 typed URL params; `<NuqsAdapter>` is already in the root layout from Phase 11) and §16 (`lib/filters.ts`, `components/controls/`). The `useLogQuery()` you build here is consumed by every panel (P12-3..P12-5), the Explorer (P12-6/P12-7), and the live tail (P12-8). Builds on P12-1's `LogQuery` type.
> Objective: Produce the nuqs filter layer and the four top-bar controls.
> Steps:
>
> 1. Create `apps/web/lib/filters.ts` with the parser map + the derived hook:
>    ```typescript
>    'use client'
>    import { parseAsString, parseAsStringEnum, parseAsBoolean, useQueryStates } from 'nuqs'
>    import type { LogQuery, LogSource } from './types'
>
>    export const logQueryParsers = {
>      from: parseAsString.withDefault(''),
>      to: parseAsString.withDefault(''),
>      source: parseAsStringEnum<LogSource>(['loki', 'postgres']).withDefault('loki'),
>      tenantId: parseAsString,
>      role: parseAsStringEnum(['viewer', 'operator', 'admin']).withDefault('operator'),
>      level: parseAsString,
>      logKey: parseAsString,
>      service: parseAsString,
>      q: parseAsString,
>      live: parseAsBoolean.withDefault(false),
>    }
>
>    export function bucketFor(from: string, to: string): '1m' | '5m' | '1h' {
>      const ms = new Date(to).getTime() - new Date(from).getTime()
>      const hours = ms / 3_600_000
>      if (hours <= 6) return '1m'
>      if (hours <= 24) return '5m'
>      return '1h'
>    }
>
>    export function useLogQuery(): { query: LogQuery; setQuery: ReturnType<typeof useQueryStates>[1] } {
>      const [state, setQuery] = useQueryStates(logQueryParsers)
>      const query: LogQuery = {
>        source: state.source,
>        from: state.from || undefined,
>        to: state.to || undefined,
>        tenantId: state.tenantId ?? undefined,
>        level: state.level ?? undefined,
>        logKey: state.logKey ?? undefined,
>        service: state.service ?? undefined,
>        q: state.q ?? undefined,
>      }
>      return { query, setQuery }
>    }
>    ```
> 2. Build `components/controls/TimeRangePicker.tsx` — a shadcn `Popover` + preset buttons (`Last 5m/15m/1h/6h/24h/7d`) and an absolute `Calendar` range; on select compute ISO `from`/`to` and call `setQuery`.
> 3. Build `components/controls/SourceToggle.tsx` — a two-button segmented control bound to `source`; render the persistent callout (use the exact 🎓 copy: "You're viewing **Postgres** (`warn`+, durable). `info`/`debug` lines live only in **Loki**…").
> 4. Build `components/controls/TenantRoleSwitcher.tsx` — two shadcn `Select`s (tenant list `['acme','globex']`; role `['viewer','operator','admin']`) bound to `tenantId`/`role`; footer pill style per `DASHBOARD.md` §15.
> 5. Build `components/controls/LiveToggle.tsx` — an icon toggle (`lucide-react` `RefreshCw`) bound to `live`.
> 6. Mount all four in `components/layout/Topbar.tsx` (right cluster, after the hamburger), keeping the Phase 11 topbar classes verbatim (`h-16`, glass).
> 7. Run `pnpm --filter web typecheck` + `build`; manually confirm a control change appears in the URL and survives reload.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use **nuqs v2** only — do NOT introduce React Context or `useState` for global filter state (the URL is the single source of truth).
> - Do NOT add `next-themes`; the app is forced-dark (Phase 11).
> - Reuse the Phase 11 topbar shell classes verbatim; only add the controls cluster.
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - `grep -n "useQueryStates" apps/web/lib/filters.ts` — expected: match (nuqs wired).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P12-3 — `app/page.tsx` Overview — health strip (4 golden signals + SLO)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P12-1`, `P12-2`

### Description

Build the Overview page shell (`app/page.tsx`) and its first row: the **health strip** — four golden-signal stat tiles (Traffic, Errors, Latency, Fatal+Error) plus an **SLO/error-budget** tile (`DASHBOARD.md` §5 + §11). Each tile is a glass `Card` with a value, a sparkline, and a Δ vs the previous equal window; blue=good, red=bad; the Errors tile turns red above the 1% threshold. The SLO tile uses Google's multiwindow multi-burn-rate model (99.9% / 30-day budget; 14.4 / 6 / 1 burn-rate badges). All tiles are fed by `useAggregate` (server-side `/logs/aggregate`) and react to the global controls from P12-2. This task establishes the page layout that P12-4 and P12-5 extend.

### Acceptance Criteria

- [ ] `apps/web/app/page.tsx` renders the Overview page (RSC shell + a `'use client'` content section reading `useLogQuery()`), wrapped in the Phase 11 `max-w-7xl` container.
- [ ] `components/charts/HealthStrip.tsx` lays out five tiles in a responsive flex/grid row.
- [ ] Tiles: **Traffic** (`req/min` from `metric=volume` on `HTTP_REQUEST_START`), **Errors** (`(4xx+5xx)/total` %, red > 1%), **Latency** (`p95(durationMs)`), **Fatal+Error** (`count(level ∈ {error,fatal})`) — each via `useAggregate`.
- [ ] `components/charts/StatTile.tsx` — reusable tile: title, big value, sparkline (Recharts `Line`), Δ-vs-previous-window badge (green/red).
- [ ] `components/charts/SloGauge.tsx` — SLO tile: 99.9% / 30-day budget gauge + 14.4/6/1 burn-rate badges.
- [ ] Loading state shows shadcn `Skeleton` tiles (not spinners — `DASHBOARD.md` §2 principle 8); empty state is action-oriented ("No logs yet — fire one from the Playground →").
- [ ] `pnpm --filter web typecheck` + `build` pass; tiles re-fetch when the time range / source changes.

### Files to create / modify

- `apps/web/app/page.tsx` — Overview page shell + health-strip mount.
- `apps/web/components/charts/HealthStrip.tsx`
- `apps/web/components/charts/StatTile.tsx`
- `apps/web/components/charts/SloGauge.tsx`

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js / data-viz engineer.
> Context: Task P12-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. Read `docs/DASHBOARD.md` §5 (the Overview ASCII layout — health strip first, general→specific), §11 (the chart catalog: Traffic/Errors/Latency/Fatal+Error tiles + the SLO gauge and their exact source formulas), §2 (principle 3 four golden signals: separate successful vs failed latency; principle 4 percentiles not averages; principle 8 skeletons not spinners; principle 9 action-oriented empty states), and §15 (Recharts v3 via shadcn chart primitives; charts are fed by `/logs/aggregate`, never raw rows). Uses `useAggregate` from P12-1 and `useLogQuery` from P12-2.
> Objective: Produce the Overview page shell and the health-strip row (4 golden signals + SLO).
> Steps:
>
> 1. Create `apps/web/app/page.tsx`. Keep it a thin server component that renders a `'use client'` `<OverviewContent/>`; `OverviewContent` reads `const { query } = useLogQuery()` and composes the rows. Wrap in the Phase 11 shell container (`<div className="mx-auto max-w-7xl">`).
> 2. Create `components/charts/StatTile.tsx` — a glass `Card` (`border-(--glass-border) bg-(--glass-card-bg) rounded-2xl`) with `CardTitle` (`font-mono`), a big value, a Recharts sparkline, and a Δ badge:
>    ```tsx
>    'use client'
>    import { Line, LineChart, ResponsiveContainer } from 'recharts'
>    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
>
>    export function StatTile({
>      title,
>      value,
>      delta,
>      series,
>      danger,
>    }: {
>      title: string
>      value: string
>      delta?: number
>      series: Array<{ n: number }>
>      danger?: boolean
>    }) {
>      return (
>        <Card className={danger ? 'ring-1 ring-destructive/60' : undefined}>
>          <CardHeader>
>            <CardTitle className="font-mono text-sm">{title}</CardTitle>
>          </CardHeader>
>          <CardContent>
>            <div className="text-2xl font-bold">{value}</div>
>            <div className="h-10">
>              <ResponsiveContainer width="100%" height="100%">
>                <LineChart data={series}>
>                  <Line dataKey="n" dot={false} strokeWidth={2} />
>                </LineChart>
>              </ResponsiveContainer>
>            </div>
>            {delta !== undefined && (
>              <span className={delta > 0 ? 'text-destructive' : 'text-[#22c55e]'}>
>                {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
>              </span>
>            )}
>          </CardContent>
>        </Card>
>      )
>    }
>    ```
> 3. Create `components/charts/SloGauge.tsx` — render the 99.9% / 30-day budget as a gauge (`budget = 1 − errorRate`) and badge the 14.4 / 6 / 1 burn rates.
> 4. Create `components/charts/HealthStrip.tsx` — call `useAggregate('volume', q)`, `useAggregate('errorRate', q)`, `useAggregate('latency', q)`, `useAggregate('statusMix', q)`; derive each tile's value + sparkline series; show `Skeleton` while `isLoading`; show the action-oriented empty state when there are zero buckets. Lay out 5 tiles in a `flex flex-wrap gap-4` / responsive grid.
> 5. Mount `<HealthStrip query={query} />` as the first row of `app/page.tsx`.
> 6. Run `pnpm --filter web typecheck` + `build`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Latency = **p95**, never an average (principle 4). The Errors tile turns red strictly above **1%**.
> - Charts read `useAggregate` only — do NOT fetch raw rows and aggregate client-side.
> - Use shadcn `Skeleton` for loading, never a spinner.
> - Reuse the verbatim glass/brand tokens from Phase 11 (`--glass-card-bg`, `--primary`); do NOT introduce new colors.
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - `grep -n "useAggregate" apps/web/components/charts/HealthStrip.tsx` — expected: match (server-fed).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P12-4 — Overview — brushable volume timeseries + RED row (Rate / Errors / Duration + heatmap)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P12-3`

### Description

Build the Overview's signature panel and RED row (`DASHBOARD.md` §5 + §11). The **log-volume** panel is a stacked-bar-by-level timeseries (info=blue, warn=amber, error/fatal=red, debug/trace=grey) that doubles as the global time selector: dragging a Recharts brush sets `from`/`to` (and so the Explorer's filter — the core "brush → filter" payoff verified in P12-9). The **RED row** derives Rate/Errors/Duration from the library's `HTTP_REQUEST_*` keys + `durationMs`: Requests/min (line), Error-rate % (separate 4xx/5xx series with a 1% threshold line), latency p50/p95/p99 **lines**, and a latency **heatmap** (reveals bimodal distributions percentiles hide) + a slow-request stat (`METHOD_SLOW_EXECUTION`). Every series is fed by `/logs/aggregate`.

### Acceptance Criteria

- [ ] `components/charts/VolumeBar.tsx` — Recharts stacked `Bar` by level per bucket, with a `Brush` whose `onChange` writes `from`/`to` via `setQuery` (from P12-2); colors match the severity map (info blue / warn amber / error+fatal red / debug+trace grey).
- [ ] `components/charts/RequestsLine.tsx` — `count(HTTP_REQUEST_START)` per bucket (RED — Rate).
- [ ] `components/charts/ErrorRateLine.tsx` — `(4xx+5xx)/total` per bucket as two series + a `ReferenceLine` at 1% (RED — Errors).
- [ ] `components/charts/LatencyLines.tsx` — p50/p95/p99 lines from `metric=latency` (RED — Duration; never an average).
- [ ] `components/charts/LatencyHeatmap.tsx` — `durationMs` histogram per bucket as a heatmap + a "Slow reqs > 1s: N" stat (`count(durationMs > 1000)` / `METHOD_SLOW_EXECUTION`).
- [ ] All five panels read `useAggregate` and respect the global time range + source toggle.
- [ ] Brushing the volume chart visibly updates the URL `from`/`to` (drives every other panel + the Explorer).
- [ ] `pnpm --filter web typecheck` + `build` pass.

### Files to create / modify

- `apps/web/components/charts/VolumeBar.tsx`
- `apps/web/components/charts/RequestsLine.tsx`
- `apps/web/components/charts/ErrorRateLine.tsx`
- `apps/web/components/charts/LatencyLines.tsx`
- `apps/web/components/charts/LatencyHeatmap.tsx`
- `apps/web/app/page.tsx` — mount the volume panel + RED row under the health strip.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js / data-viz engineer.
> Context: Task P12-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. Read `docs/DASHBOARD.md` §5 (the "LOG VOLUME (signature panel — BRUSHABLE)" + "RED ROW" ASCII blocks), §11 (chart catalog rows: Log volume / Requests-min / Error-rate / Latency-percentiles / Latency-heatmap / Slow-requests with their exact formulas), §2 (principle 2 RED method; principle 4 percentiles + heatmap reveal bimodal; principle 5 bounded dimensions only). Charts are fed by `/logs/aggregate` (§13 has the SQL for volume/error-rate/percentile buckets). Uses `useAggregate` (P12-1), `useLogQuery` + `bucketFor` (P12-2), and extends `app/page.tsx` (P12-3).
> Objective: Produce the brushable volume timeseries and the four RED panels, mounted under the health strip.
> Steps:
>
> 1. Create `components/charts/VolumeBar.tsx` — stacked bar by level with a brush that lifts the range to the URL:
>    ```tsx
>    'use client'
>    import { Bar, BarChart, Brush, ResponsiveContainer, XAxis, YAxis } from 'recharts'
>    import { useAggregate } from '@/hooks/use-aggregate'
>    import type { LogQuery } from '@/lib/types'
>
>    const LEVEL_FILL: Record<string, string> = {
>      info: '#60a5fa',
>      warn: '#f59e0b',
>      error: '#ef4444',
>      fatal: '#ef4444',
>      debug: '#9ca3af',
>      trace: '#9ca3af',
>    }
>
>    export function VolumeBar({
>      query,
>      onBrush,
>    }: {
>      query: LogQuery
>      onBrush: (from: string, to: string) => void
>    }) {
>      const { data } = useAggregate('volume', query)
>      const buckets = data?.buckets ?? []
>      return (
>        <ResponsiveContainer width="100%" height={180}>
>          <BarChart data={buckets}>
>            <XAxis dataKey="bucket" hide />
>            <YAxis hide />
>            {Object.keys(LEVEL_FILL).map((lvl) => (
>              <Bar key={lvl} dataKey={lvl} stackId="v" fill={LEVEL_FILL[lvl]} />
>            ))}
>            <Brush
>              dataKey="bucket"
>              height={20}
>              onChange={(r) => {
>                const a = buckets[r?.startIndex ?? 0]
>                const b = buckets[r?.endIndex ?? buckets.length - 1]
>                if (a && b) onBrush(String(a.bucket), String(b.bucket))
>              }}
>            />
>          </BarChart>
>        </ResponsiveContainer>
>      )
>    }
>    ```
> 2. Create `RequestsLine.tsx` (Rate), `ErrorRateLine.tsx` (two series + `<ReferenceLine y={0.01} />`), `LatencyLines.tsx` (p50/p95/p99 lines), and `LatencyHeatmap.tsx` (per-bucket `durationMs` histogram cells + a "Slow reqs > 1s" stat). Each calls the matching `useAggregate(metric, query)`.
> 3. In `app/page.tsx`, mount `<VolumeBar query={query} onBrush={(from, to) => setQuery({ from, to })} />` directly under the health strip, then a 2-column RED row (`grid grid-cols-1 lg:grid-cols-2 gap-4`): left = Requests/min + Error-rate; right = Latency lines + heatmap.
> 4. Run `pnpm --filter web typecheck` + `build`; manually drag the volume brush and confirm `from`/`to` change in the URL.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Latency panels are **percentile lines**, never a mean. The error-rate threshold line sits at exactly **1%**.
> - Every series is fed by `useAggregate` — the browser never crunches raw rows (`DASHBOARD.md` §11 bounded-dimension rule). Group-by is only ever `level` / status-class here.
> - Reuse the severity colors from Phase 11's `lib/severity.ts` where possible; do NOT invent new level colors.
> - The brush must write through `setQuery` (nuqs) — do NOT hold the range in local component state.
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - `grep -n "Brush" apps/web/components/charts/VolumeBar.tsx` — expected: match (brushable).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P12-5 — Overview — breakdown row + pipeline-health panel

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P12-3`

### Description

Complete the Overview with the breakdown row and the pipeline-health panel (`DASHBOARD.md` §5 + §11). The **breakdown row** is five bounded-dimension panels — level donut, top `logKey`s, top errors (`logKey` where `level ∈ {error,fatal}`), status mix (2xx/3xx/4xx/5xx stacked), top tenants (top-N + "other") — each **click-to-filter** (clicking a slice/bar pivots to the Explorer with that filter applied via the nuqs query). The **pipeline-health** panel surfaces the library's own fail-soft saturation: counts of `LOGGER_DESTINATION_WRITE_FAILED` / `_INIT_FAILED` / `LOGGER_ENTRY_TRUNCATED` + Loki/Postgres write lag, so injecting a fault from the Trigger Center is observable. All fed by `/logs/aggregate`.

### Acceptance Criteria

- [ ] `components/charts/LevelDonut.tsx` — `count() by level` donut (bounded, 6 levels), colored per severity.
- [ ] `components/charts/TopBar.tsx` — reusable horizontal-bar top-N panel; instantiated for top `logKey`s, top errors (`level ∈ {error,fatal}`), and top tenants (top-N + "other").
- [ ] `components/charts/StatusMix.tsx` — `count() by status_class` stacked bar (2xx/3xx/4xx/5xx).
- [ ] `components/charts/PipelineHealth.tsx` — stat row of `LOGGER_DESTINATION_WRITE_FAILED` / `_INIT_FAILED` / `LOGGER_ENTRY_TRUNCATED` counts + Loki/Postgres write-lag readouts.
- [ ] Every breakdown panel is **click-to-filter**: a slice/bar click calls `setQuery` to add that dimension (e.g. `level`, `logKey`, `tenantId`) — pivoting to the Explorer filter.
- [ ] All panels read `useAggregate` with bounded `groupBy` only (`level` / `logKey` / `status_class` / `tenantId`) — never `requestId`/`traceId`/`userId`.
- [ ] `pnpm --filter web typecheck` + `build` pass; the Overview now shows health strip + volume + RED + breakdown + pipeline-health top to bottom.

### Files to create / modify

- `apps/web/components/charts/LevelDonut.tsx`
- `apps/web/components/charts/TopBar.tsx`
- `apps/web/components/charts/StatusMix.tsx`
- `apps/web/components/charts/PipelineHealth.tsx`
- `apps/web/app/page.tsx` — mount the breakdown row + pipeline-health under the RED row.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js / data-viz engineer.
> Context: Task P12-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. Read `docs/DASHBOARD.md` §5 (the "BREAKDOWN ROW" + "PIPELINE HEALTH" ASCII blocks — every bar/slice is click-to-filter; pipeline health is USE-style saturation of the logging pipeline itself), §11 (catalog rows: Level distribution donut / Top logKeys / Top errors / Status mix / Top tenants / Pipeline health, all with bounded group-by; plus the **bounded-dimension rule** banner), and §2 (principle 1 overview→drill-down: every panel click narrows the Explorer; principle 5 avoid high cardinality). Uses `useAggregate` (P12-1) and `setQuery` from `useLogQuery` (P12-2); extends `app/page.tsx` (P12-3/P12-4).
> Objective: Produce the breakdown row (donut + 3 top-N bars + status mix) and the pipeline-health panel, each click-to-filter, mounted under the RED row.
> Steps:
>
> 1. Create `components/charts/TopBar.tsx` — a reusable horizontal-bar panel:
>    ```tsx
>    'use client'
>    import { Bar, BarChart, Cell, ResponsiveContainer, YAxis } from 'recharts'
>
>    export function TopBar({
>      title,
>      rows,
>      onPick,
>    }: {
>      title: string
>      rows: Array<{ value: string; count: number }>
>      onPick: (value: string) => void
>    }) {
>      return (
>        <div>
>          <h3 className="font-mono text-sm">{title}</h3>
>          <ResponsiveContainer width="100%" height={160}>
>            <BarChart data={rows} layout="vertical">
>              <YAxis type="category" dataKey="value" width={120} />
>              <Bar dataKey="count" onClick={(d) => onPick(String(d.value))}>
>                {rows.map((r) => (
>                  <Cell key={r.value} cursor="pointer" fill="#ff6224" />
>                ))}
>              </Bar>
>            </BarChart>
>          </ResponsiveContainer>
>        </div>
>      )
>    }
>    ```
> 2. Create `LevelDonut.tsx` (Recharts `Pie`/donut over `count() by level`, slice `onClick` → `setQuery({ level })`) and `StatusMix.tsx` (stacked bar by status-class).
> 3. Create `PipelineHealth.tsx` — a stat row reading the `LOGGER_DESTINATION_WRITE_FAILED` / `_INIT_FAILED` / `LOGGER_ENTRY_TRUNCATED` counts (via `useAggregate` grouped by `logKey`, filtered to those keys) + Loki/Postgres write-lag readouts.
> 4. In `app/page.tsx`, mount a 5-up breakdown row (`grid grid-cols-2 lg:grid-cols-5 gap-4`) — `LevelDonut`, `TopBar` (top logKeys), `TopBar` (top errors), `StatusMix`, `TopBar` (top tenants) — each `onPick`/slice-click wired to `setQuery`; then the `PipelineHealth` panel as the final row.
> 5. Run `pnpm --filter web typecheck` + `build`; click a donut slice / top-bar and confirm the URL gains the filter.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - **Bounded dimensions only**: `groupBy` ∈ `{ level, status_class, logKey, service, tenantId }`. NEVER group-by `requestId` / `traceId` / `spanId` / `userId` (high cardinality — `DASHBOARD.md` §11).
> - Top-N panels must include an "other" rollup for `tenantId` (low-cardinality guarantee).
> - Click-to-filter writes through `setQuery` (nuqs) so the pivot is a shareable deep-link; do NOT navigate imperatively with local state.
> - Reuse severity colors from Phase 11; do NOT invent new ones.
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - `grep -n "setQuery" apps/web/components/charts/LevelDonut.tsx` — expected: match (click-to-filter).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P12-6 — `app/explorer/page.tsx` — facet rail + query bar (SQL/LogQL teaching toggles)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P12-2`

### Description

Build the Log Explorer shell (`app/explorer/page.tsx`), its faceted left rail, and the query bar (`DASHBOARD.md` §6). The **facet rail** shows `level` / `service.name` / `logKey` / `tenantId` with live value counts from `/logs/facets`; clicking adds a positive filter, ⌥-click a negative (`is-not`); counts reflect the current query + time range. The **query bar** parses structured field syntax (`level:error`, `level>=warn`, `logKey:PAYMENT_*`, `service:api`, `tenantId:acme`, `traceId:…`, free-text `msg ~ "refund"`) into the `LogQuery`, autocompletes `logKey` values, and **validates them against `LOG_KEYS_CONVENTION_REGEX` imported from `@bymax-one/nest-logger/shared`** (a typo'd key is flagged inline). **Teaching toggles** reveal the generated `SQL` and `LogQL` beside the form. Filter state is the nuqs URL state from P12-2, so brushing the Overview volume chart (P12-4) lands here pre-filtered.

### Acceptance Criteria

- [ ] `apps/web/app/explorer/page.tsx` renders a two-pane layout: facet rail (left) + query bar / (table placeholder for P12-7) (right), reading `useLogQuery()`.
- [ ] `components/explorer/FacetRail.tsx` — `useFacets(['level','service','logKey','tenantId'], query)`; each value shows its count; click → add positive filter, ⌥/Alt-click → negative (`is-not`).
- [ ] `components/explorer/QueryBar.tsx` — parses the structured syntax into `LogQuery` and writes it via `setQuery`; supports `level:`/`level>=`/`logKey:` (prefix `*`)/`service:`/`tenantId:`/`traceId:`/free-text `msg ~ "…"`.
- [ ] `apps/web/lib/log-keys.ts` imports `LOG_KEYS_CONVENTION_REGEX` from `@bymax-one/nest-logger/shared` and exposes `isValidLogKey(key)`; the query bar flags an invalid `logKey` inline (red, with a hint).
- [ ] Teaching toggles (`▸ generated SQL` / `▸ generated LogQL`) render the compiled query strings beside the form (read from the API's "show generated query" response or a local compiler mirroring §12).
- [ ] Facet counts + query bar both react to the global time range + source toggle.
- [ ] `pnpm --filter web typecheck` + `build` pass; arriving at `/explorer?level=error&logKey=PAYMENT_*` pre-populates the rail + bar.

### Files to create / modify

- `apps/web/app/explorer/page.tsx` — Explorer shell (rail + query bar; table mounts in P12-7).
- `apps/web/components/explorer/FacetRail.tsx`
- `apps/web/components/explorer/QueryBar.tsx`
- `apps/web/lib/log-keys.ts` — `LOG_KEYS_CONVENTION_REGEX` import + `isValidLogKey`.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js engineer.
> Context: Task P12-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. Read `docs/DASHBOARD.md` §6 (the Explorer ASCII layout — faceted rail with live counts, query bar with field syntax + the two teaching toggles, `logKey` validated against `LOG_KEYS_CONVENTION_REGEX`), §12 (the `LogQuery` Filter DTO + the "service compiles `LogQuery` to BOTH a Prisma `where` and a LogQL string; the Explorer's show-generated-query toggles render exactly these"), and §16 (`lib/log-keys.ts` imports the regex from `/shared`; `components/explorer/FacetRail`, `QueryBar`). Uses `useFacets` (P12-1) and `useLogQuery`/`setQuery` (P12-2). The Phase 11 skeleton already added a `lib/log-keys.ts` stub importing the regex — extend it.
> Objective: Produce the Explorer shell, the facet rail, the structured query bar with live `logKey` validation, and the SQL/LogQL teaching toggles.
> Steps:
>
> 1. Extend `apps/web/lib/log-keys.ts`:
>    ```typescript
>    import { LOG_KEYS_CONVENTION_REGEX } from '@bymax-one/nest-logger/shared'
>
>    export function isValidLogKey(key: string): boolean {
>      // allow a trailing wildcard prefix like PAYMENT_*
>      const probe = key.endsWith('*') ? `${key.slice(0, -1)}X` : key
>      return LOG_KEYS_CONVENTION_REGEX.test(probe)
>    }
>    ```
> 2. Create `components/explorer/FacetRail.tsx` — call `useFacets(['level','service','logKey','tenantId'], query)`; render each field as a section of value+count rows; a row click adds a positive filter (`setQuery({ [field]: value })`), Alt/⌥-click marks it negative (encode an `is-not` into the query, e.g. a `!`-prefixed value the API understands).
> 3. Create `components/explorer/QueryBar.tsx` — a controlled input (optionally a shadcn `Command` popover for autocomplete). On submit, tokenize `key:value` / `key>=value` / free-text `msg ~ "…"` into a `LogQuery` and call `setQuery`. For any `logKey:` token, call `isValidLogKey` and, if invalid, render an inline red hint ("not a valid logKey — expected `MODULE_ACTION_RESULT`"). Render two collapsible teaching toggles showing the compiled SQL + LogQL (use the API's generated-query field, or a small local compiler that mirrors §12 — `level>=warn` → `level IN (...)` / `| json | level=~"warn|error|fatal"`).
> 4. Create `apps/web/app/explorer/page.tsx` — a `grid grid-cols-[260px_1fr]` layout: `<FacetRail/>` left; right column = `<QueryBar/>` then a `{/* LogTable mounts in P12-7 */}` placeholder. Read `const { query } = useLogQuery()`.
> 5. Run `pnpm --filter web typecheck` + `build`; visit `/explorer?level=error&logKey=PAYMENT_*` and confirm the rail + bar reflect it.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - `logKey` validation MUST import `LOG_KEYS_CONVENTION_REGEX` from `@bymax-one/nest-logger/shared` — do NOT hardcode the pattern.
> - Filter state lives in the nuqs URL (P12-2) — do NOT add a parallel Context/`useState` store; this is what makes brush→filter (P12-4) land here.
> - Facet counts come from `/logs/facets` — do NOT compute them client-side from fetched rows.
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - `grep -n "LOG_KEYS_CONVENTION_REGEX" apps/web/lib/log-keys.ts` — expected: match (validation wired).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P12-7 — Explorer — virtualized table (TanStack Table v8 + Virtual v3) + detail drawer

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P12-6`

### Description

Build the Explorer's data grid and detail drawer (`DASHBOARD.md` §6). The **table** uses TanStack Table v8 (headless) + TanStack Virtual v3 for 50k+ rows at 60fps: sticky header, sortable/resizable/pinnable columns, selectable columns (`time`, `level` chip, `logKey` mono badge, `service`, `msg`, `requestId`, `traceId`), newest-first; older rows load via keyset/cursor infinite-scroll-up (using `useLogs` from P12-1). The **detail drawer** (row click) has four tabs: Overview (per-field `filter for`/`filter out`/`add as column`), Raw JSON (`@uiw/react-json-view` — PII fields show `[REDACTED]`, proving redaction-at-source), Context (surrounding lines by `requestId`/`traceId` via `/logs/context`), and Trace (`traceId`/`spanId` + **[View trace]** Tempo deep-link + **[All logs for this trace]** cross-service pivot). This is the table the live tail (P12-8) appends to.

### Acceptance Criteria

- [ ] `components/explorer/LogTable.tsx` — TanStack Table v8 + `useVirtualizer({ overscan: 10 })` rendering `useLogs(query)` pages; sticky header; newest-first; keyset infinite-scroll-up via `fetchNextPage`; verified smooth at 50k rows.
- [ ] Columns: `time`, `level` (severity chip), `logKey` (mono badge), `service`, `msg`, `requestId`, `traceId`; sortable/resizable/pinnable; column-visibility toggle.
- [ ] `components/explorer/DetailDrawer.tsx` — opens on row click with four tabs: **Overview**, **Raw JSON**, **Context**, **Trace**.
- [ ] Overview tab: each field offers `filter for` / `filter out` / `add as column` (writing via `setQuery` / column state).
- [ ] Raw JSON tab: `@uiw/react-json-view` collapsible tree; redacted fields display `[REDACTED]` verbatim (no client unmask).
- [ ] Context tab: calls `getContext` (`/logs/context?requestId=|traceId=&before=10&after=10`).
- [ ] Trace tab: shows `traceId`/`spanId` + a **[ View trace ]** link (Tempo/Grafana derived-field URL) and **[ All logs for this trace ]** that pivots the Explorer to that `traceId` (`setQuery({ traceId })`) across `api` + `worker`.
- [ ] `pnpm --filter web typecheck` + `build` pass.

### Files to create / modify

- `apps/web/components/explorer/LogTable.tsx`
- `apps/web/components/explorer/DetailDrawer.tsx`
- `apps/web/components/explorer/columns.tsx` — column defs (severity chip, mono badge).
- `apps/web/app/explorer/page.tsx` — mount `<LogTable/>` + `<DetailDrawer/>` (replace the P12-6 placeholder).

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js engineer specializing in virtualized data grids.
> Context: Task P12-7 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. Read `docs/DASHBOARD.md` §6 (the table spec — `TanStack Table v8` + `TanStack Virtual v3`, sticky header, sort/resize/pin, selectable columns, newest-first, 50k rows @60fps via `useVirtualizer({ overscan: 10, measureElement })`, keyset infinite-scroll-up, new rows via SSE at the bottom; the four-tab detail drawer with `@uiw/react-json-view` showing `[REDACTED]` + the Trace tab's `[View trace]` / `[All logs for this trace]`), §13 (keyset cursor — older pages load via `(time,id) < cursor`), §15 (the table + JSON-viewer libs). Uses `useLogs` (P12-1), `getContext` (P12-1), and `useLogQuery`/`setQuery` (P12-2). The Tempo derived-field link comes from the Phase 1 Grafana provisioning (`traceId` → Tempo).
> Objective: Produce the virtualized log table and the four-tab detail drawer, mounted in the Explorer.
> Steps:
>
> 1. Create `components/explorer/columns.tsx` — TanStack `ColumnDef<LogEntry>[]` for `time`, `level` (render the severity chip from Phase 11 `lib/severity.ts`), `logKey` (mono `Badge`), `service`, `msg`, `requestId`, `traceId`.
> 2. Create `components/explorer/LogTable.tsx` — flatten `useLogs(query).data.pages` to rows; drive a `useReactTable` instance; virtualize the body with `useVirtualizer`:
>    ```tsx
>    'use client'
>    import { useRef } from 'react'
>    import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
>    import { useVirtualizer } from '@tanstack/react-virtual'
>    import { useLogs } from '@/hooks/use-logs'
>    import { logColumns } from './columns'
>    import type { LogEntry, LogQuery } from '@/lib/types'
>
>    export function LogTable({ query, onRowClick }: { query: LogQuery; onRowClick: (r: LogEntry) => void }) {
>      const { data, fetchNextPage, hasNextPage } = useLogs(query)
>      const rows = (data?.pages ?? []).flatMap((p) => p.rows)
>      const table = useReactTable({ data: rows, columns: logColumns, getCoreRowModel: getCoreRowModel() })
>      const parentRef = useRef<HTMLDivElement>(null)
>      const rowVirtualizer = useVirtualizer({
>        count: rows.length,
>        getScrollElement: () => parentRef.current,
>        estimateSize: () => 36,
>        overscan: 10,
>      })
>      // onScroll near top → if (hasNextPage) fetchNextPage()  (keyset scroll-up)
>      return (
>        <div ref={parentRef} className="h-[70vh] overflow-auto">
>          {/* sticky header from table.getHeaderGroups(); body maps rowVirtualizer.getVirtualItems() */}
>        </div>
>      )
>    }
>    ```
> 3. Create `components/explorer/DetailDrawer.tsx` — a shadcn `Sheet`/`Dialog` with `Tabs` (Overview / Raw JSON / Context / Trace). Overview: map every field with `filter for` (`setQuery({ [k]: v })`) / `filter out` / `add as column`. Raw JSON: `<JsonView value={row.payload} />` from `@uiw/react-json-view` (redacted fields already read `[REDACTED]` — render verbatim). Context: `getContext({ requestId, before: 10, after: 10 })`. Trace: `traceId`/`spanId`, a `[ View trace ]` anchor to the Grafana/Tempo derived-field URL, and `[ All logs for this trace ]` → `setQuery({ traceId })`.
> 4. In `app/explorer/page.tsx`, replace the P12-6 table placeholder with `<LogTable query={query} onRowClick={setSelected} />` and a `<DetailDrawer row={selected} .../>`.
> 5. Run `pnpm --filter web typecheck` + `build`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Pagination is **keyset/cursor** (older rows scroll-up) via `useLogs` — do NOT use OFFSET or fetch all rows at once (`DASHBOARD.md` §13).
> - Redacted fields render `[REDACTED]` exactly as stored — do NOT add any "unmask" affordance (the library redacted at source; raw PII never reached the client — `DASHBOARD.md` §10).
> - Severity is color **+** icon **+** text (reuse Phase 11 `lib/severity.ts`) — never color alone (§2 principle 7).
> - Leave the SSE "new rows at the bottom" wiring to P12-8; expose a small append hook/prop the live tail can drive.
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - `grep -n "useVirtualizer" apps/web/components/explorer/LogTable.tsx` — expected: match (virtualized).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P12-8 — `lib/use-event-source.ts` + live tail (follow-mode, rAF ring buffer)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P12-7`

### Description

Wire the headline real-time feature (`DASHBOARD.md` §7 + §14). `lib/use-event-source.ts` exposes a `useLogStream(filter, enabled)` hook over the browser `EventSource` (SSE — free auto-reconnect + `Last-Event-ID` resume), feeding a bounded **ring buffer** (10k lines, drop-oldest); incoming events are coalesced and flushed on `requestAnimationFrame` (backpressure). The live tail adds **follow-mode** to the Explorer table: pinned-to-bottom ⇒ new lines auto-scroll in with a contrasting highlight; scrolling up **pauses** auto-scroll and shows a "**N new logs — Jump to latest**" pill; returning to the bottom resumes. Controls: `Live ▸ Pause ▸ Resume ▸ Clear`. Guardrails: live tail only on **relative** time ranges; auto-pause on very high rate; auto-stop after long idle. The `live` toggle (P12-2) turns it on; it appends to the P12-7 table.

### Acceptance Criteria

- [ ] `apps/web/lib/use-event-source.ts` exports `useLogStream(filter, enabled)` opening an `EventSource` at `/api/logs/stream?<encoded filter>` (or the API's `/logs/stream`), returning a bounded ring buffer.
- [ ] A `RingBuffer<LogEntry>` (capacity 10k, drop-oldest) holds the stream; messages are buffered and flushed via `requestAnimationFrame` in batches (~10/frame).
- [ ] `EventSource` auto-reconnect + `Last-Event-ID` resume are used (no manual polling); a `ping`/keep-alive event is ignored.
- [ ] `hooks/use-follow-mode.ts` — follow-mode state: auto-scroll only when pinned to bottom; pause on scroll-up; expose `newCount` + `jumpToLatest()`.
- [ ] The Explorer table (P12-7) shows new SSE rows at the bottom with a contrasting highlight; a "**N new logs — Jump to latest**" pill appears when paused.
- [ ] Controls `Live ▸ Pause ▸ Resume ▸ Clear` are present; the `live` URL toggle (P12-2) enables/disables the stream.
- [ ] Guardrails: stream enabled only on **relative** ranges; auto-pause on very-high rate; auto-stop after long idle.
- [ ] `pnpm --filter web typecheck` + `build` pass.

### Files to create / modify

- `apps/web/lib/use-event-source.ts` — `useLogStream` + `RingBuffer`.
- `apps/web/hooks/use-follow-mode.ts` — follow-mode (pause-on-scroll, jump-to-latest).
- `apps/web/app/api/logs/stream/route.ts` — (optional) SSE proxy/transform of the `apps/api` stream.
- `apps/web/components/explorer/LogTable.tsx` — consume the buffer; append rows; highlight; pill (modify P12-7).

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js engineer specializing in real-time UIs.
> Context: Task P12-8 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. Read `docs/DASHBOARD.md` §7 (Live Tail: SSE transport, follow-mode `less +F` UX, `Live ▸ Pause ▸ Resume ▸ Clear`, rAF-batched bounded ring buffer ~10/frame, guardrails: relative-range only / auto-pause on high rate / auto-stop on idle), §14 (the end-to-end SSE architecture incl. the canonical `useLogStream` hook with the `RingBuffer` + rAF batch-flush, and the optional Next.js route handler that proxies the stream), and §16 (`lib/use-event-source.ts`; `hooks/useFollowMode`). The Phase 10 `GET /logs/stream` SSE endpoint exists (honors the filter + `Last-Event-ID`). Builds on the P12-7 table and the P12-2 `live` toggle.
> Objective: Produce the SSE hook + ring buffer, the follow-mode hook, the optional proxy route, and wire live tail into the Explorer table.
> Steps:
>
> 1. Create `apps/web/lib/use-event-source.ts` with a `RingBuffer` + the hook (per `DASHBOARD.md` §14):
>    ```typescript
>    'use client'
>    import { useEffect, useRef, useState } from 'react'
>    import { encodeLogQuery } from './api-client'
>    import type { LogEntry, LogQuery } from './types'
>
>    class RingBuffer<T> {
>      private buf: T[] = []
>      constructor(private cap: number) {}
>      pushMany(items: T[]) {
>        this.buf.push(...items)
>        if (this.buf.length > this.cap) this.buf.splice(0, this.buf.length - this.cap)
>      }
>      snapshot(): T[] {
>        return this.buf
>      }
>      clear() {
>        this.buf = []
>      }
>    }
>
>    export function useLogStream(filter: LogQuery, enabled: boolean) {
>      const [buffer] = useState(() => new RingBuffer<LogEntry>(10_000))
>      const [, force] = useState(0)
>      const esRef = useRef<EventSource>(null)
>      useEffect(() => {
>        if (!enabled) return
>        const es = new EventSource(`/api/logs/stream?${encodeLogQuery(filter)}`)
>        const pending: LogEntry[] = []
>        let raf = 0
>        es.onmessage = (ev) => {
>          if (!ev.data) return // ignore keep-alive ping
>          pending.push(JSON.parse(ev.data) as LogEntry)
>          raf ||= requestAnimationFrame(() => {
>            buffer.pushMany(pending.splice(0))
>            raf = 0
>            force((n) => n + 1)
>          })
>        }
>        esRef.current = es
>        return () => {
>          es.close()
>          if (raf) cancelAnimationFrame(raf)
>        }
>      }, [enabled, encodeLogQuery(filter), buffer])
>      return buffer
>    }
>    ```
> 2. Create `apps/web/hooks/use-follow-mode.ts` — track whether the table scroll container is pinned to the bottom; when pinned, auto-scroll on new rows; when scrolled up, set `paused` and accumulate `newCount`; expose `jumpToLatest()` that scrolls to bottom and resumes.
> 3. (Optional) Create `apps/web/app/api/logs/stream/route.ts` — a Next.js route handler that proxies/transforms the `apps/api` `/logs/stream` `text/event-stream` (set `Cache-Control: no-cache`, `X-Accel-Buffering: no`).
> 4. Modify `components/explorer/LogTable.tsx` — when `live` is on (from P12-2), merge the ring-buffer snapshot at the bottom of the rows, highlight newly-arrived rows, and render the "**N new logs — Jump to latest**" pill (wired to `useFollowMode`). Add the `Live ▸ Pause ▸ Resume ▸ Clear` controls. Enforce guardrails: only subscribe on relative ranges; auto-pause on a high arrival rate; auto-stop after a long idle.
> 5. Run `pnpm --filter web typecheck` + `build`.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Transport is **SSE / `EventSource`** — do NOT use WebSocket or polling (`DASHBOARD.md` §7). Rely on the browser's built-in auto-reconnect + `Last-Event-ID`; do NOT hand-roll a reconnect loop.
> - The buffer is **bounded** (10k, drop-oldest) and flushed on `requestAnimationFrame` — do NOT setState per message (it would freeze the tab at high rate).
> - Live tail only on **relative** time ranges; auto-pause on high rate; auto-stop on idle (the §7 guardrails).
> - Ignore the keep-alive `ping` events; do NOT parse empty `data`.
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - `grep -n "requestAnimationFrame" apps/web/lib/use-event-source.ts` — expected: match (rAF-batched).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-8 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P12-9 — Phase 12 verification gate (brush→filter, fire→tail, traceId→trace)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P12-1`, `P12-2`, `P12-3`, `P12-4`, `P12-5`, `P12-6`, `P12-7`, `P12-8`

### Description

Phase 12 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove the three daily-driver behaviors end to end against the live stack. (1) **Brushing the Overview volume chart filters the Explorer** — dragging the brush updates the URL `from`/`to`, which the Explorer reads. (2) **Firing a log appears in the live tail** — hitting an `apps/api` demo endpoint (or `/trigger/burst`) shows the new line stream into the Explorer's SSE tail. (3) **A row's `traceId` opens the Tempo trace** — the detail drawer's Trace tab deep-links to Grafana/Tempo. Closes the phase. No new feature code — only verification (and fixes routed back to P12-1..P12-8 if a check fails).

### Acceptance Criteria

- [ ] `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web build` all exit 0.
- [ ] With `pnpm infra:up` + `apps/api` + `apps/web` running: brushing the Overview volume chart changes the URL `from`/`to` and the Explorer table re-queries to that window.
- [ ] Firing a log (e.g. `curl -X POST :3001/orders` or the Trigger Center `/trigger/burst`) with **Live** on shows the new entry arrive at the bottom of the Explorer tail (follow-mode highlight + jump-to-latest pill when scrolled up).
- [ ] A row's **[ View trace ]** in the detail drawer opens the corresponding Tempo trace in Grafana (derived-field URL resolves).
- [ ] `[ All logs for this trace ]` pivots the Explorer to that one `traceId` across `api` + `worker`.
- [ ] Charts confirmed to be fed only by `/logs/aggregate` (no client-side aggregation of raw rows); no chart groups by `requestId`/`traceId`/`userId`.
- [ ] If any check fails, the fix lands in the matching P12-x task file, then this gate is re-run green.

### Files to create / modify

- _(none — verification only; fix earlier task files if a check fails)_

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js engineer.
> Context: Task P12-9 of `docs/DEVELOPMENT_PLAN.md` §Phase 12. DoD (verbatim): "brushing the volume chart filters the Explorer; firing a log appears in the live tail; a row's `traceId` opens the trace." Read `docs/DASHBOARD.md` §5 (brushable volume), §6–§7 (Explorer + live tail), §11 (charts fed only by `/logs/aggregate`; bounded dimensions), §14 (SSE). Prereqs P12-1..P12-8 are 🟢. The local stack is Phase 1 (`pnpm infra:up` → Postgres/Loki/Tempo/Grafana); the API is `apps/api` (Phase 10 `logs/`), the worker is `apps/worker` (Phase 9).
> Objective: Confirm the three daily-driver behaviors end to end and close the phase.
> Steps:
>
> 1. Run the static gates: `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web build` — all must exit 0.
> 2. Bring up the stack: `pnpm infra:up`; start `pnpm --filter api dev` and `pnpm --filter web dev`.
> 3. **Brush → filter:** on `/`, drag the volume-chart brush; confirm the URL `from`/`to` change and `/explorer` (same URL state) re-queries to that window.
> 4. **Fire → tail:** open `/explorer` with **Live** on; in another shell fire `curl -X POST http://localhost:3001/orders` (and/or the Trigger Center `/trigger/burst`); confirm the new line streams into the tail at the bottom (highlight; and the "N new logs — Jump to latest" pill when scrolled up).
> 5. **traceId → trace:** click a row, open the **Trace** tab, click **[ View trace ]**; confirm it opens the matching Tempo trace in Grafana. Click **[ All logs for this trace ]**; confirm the Explorer pivots to that `traceId` across `api` + `worker`.
> 6. Sanity: confirm every chart's network calls go to `/logs/aggregate` (DevTools) and none group by `requestId`/`traceId`/`userId`.
> 7. If any check fails, diagnose and fix in the corresponding P12-x task file, then re-run this gate. Do NOT patch around a failure here.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Do NOT use `--no-verify`, `@ts-ignore`, or `eslint-disable` to pass a gate (§0 principle 6).
> - Do NOT add placeholder/mocked data to fake a passing behavior — verify against the real stack.
>   Verification:
>
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web lint` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - Manual: brush→filter, fire→tail, traceId→trace all observed working against the live stack.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P12-9 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 12 is 9/9 — switch the Phase 12 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
