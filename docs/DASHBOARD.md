# The Log Observability Dashboard (`apps/web`)

> A **production-grade, real-world observability console** for `@bymax-one/nest-logger`, built with **Next.js 16 + React 19**. It is the human face of the example: fire any kind of log on demand, watch it stream in real time, slice it with charts and facets, drill from an error spike to a single request's trace, and operate it like an on-call engineer would — alerts, retention, RBAC, audit.
>
> This document is the build spec for that app. It is grounded in how real tools work (Datadog, Grafana/Loki, Kibana, SigNoz, Sentry, Better Stack) — see [§17 References](#17-references) for every source consulted.

---

> **Companion to [`OVERVIEW.md`](OVERVIEW.md).** OVERVIEW defines the whole repo (the `apps/api` logging pipeline, destinations, redaction, OTel). This file zooms into `apps/web` and the `logs/` read-API in `apps/api` that powers it. Read OVERVIEW §3 (architecture), §10 (demo domain), §12 (destinations), §13 (redaction), §14 (OTel) first.

## Table of Contents

1. [What this is (and isn't)](#1-what-this-is-and-isnt)
2. [Design principles](#2-design-principles)
3. [Information architecture](#3-information-architecture)
4. [Global controls](#4-global-controls)
5. [Page — Overview (health)](#5-page--overview-health)
6. [Page — Log Explorer](#6-page--log-explorer)
7. [Live Tail (real-time)](#7-live-tail-real-time)
8. [Page — Trigger Center (Log Playground)](#8-page--trigger-center-log-playground)
9. [Page — Alerts & Incidents](#9-page--alerts--incidents)
10. [Page — Maintenance & Governance](#10-page--maintenance--governance)
11. [Chart & panel catalog](#11-chart--panel-catalog)
12. [The backing API (`apps/api/src/logs`)](#12-the-backing-api-appsapisrclogs)
13. [Data model & queries (Postgres + Loki)](#13-data-model--queries-postgres--loki)
14. [Real-time architecture (SSE)](#14-real-time-architecture-sse)
15. [Frontend tech stack & design system](#15-frontend-tech-stack--design-system)
16. [apps/web file layout](#16-appsweb-file-layout)
17. [References](#17-references)

---

## 1. What this is (and isn't)

`apps/web` is a **real log-observability tool** — the kind an engineer keeps open on a second monitor. It demonstrates the full daily loop:

> glance at health → spot an error spike on the volume bar → brush that time range → see the top failing `logKey` → filter the Explorer → open one log → jump to its distributed trace → (if it's bad) acknowledge the alert it fired.

It deliberately mirrors the **common-denominator feature set** of Datadog Log Management, Grafana Explore/Loki, Kibana Discover, SigNoz, and Sentry Logs, scaled down to something an example can own end to end.

**It is honest about scope.** Several features (retention sweeps, RBAC, alert evaluation, archival) are **scoped demonstrations** of production concepts, implemented as small, real code against the two data sources the example already has — never faked screenshots. Each such feature carries an inline callout:

> 🎓 _Scoped demo of **\<production feature\>**. In a real deployment you would use **\<Loki retention / Datadog indexes / PagerDuty / your IdP\>**._

**Non-goals:** it is not a multi-region SaaS, not a replacement for Grafana, and it does **not** invent a new design language. It reuses `nest-auth-example`'s design system **verbatim** — the same forced-dark orange/blue glass-morphism, the same Geist Sans/Mono type, the same 64px-topbar + 250px-sidebar shell, the same shadcn `new-york` components — so the two reference apps look like one product. The screens differ (logs/observability vs. auth), the look is identical. See [§15 — Frontend tech stack & design system](#15-frontend-tech-stack--design-system).

---

## 2. Design principles

Every principle below is lifted from a real source and applied to this app.

| # | Principle | What it means here | Source |
| - | --------- | ------------------ | ------ |
| 1 | **Overview → drill-down** | Pages flow general→specific: Health strip → RED row → breakdowns → Explorer. Every panel click narrows the Explorer's filters. | Grafana dashboard best-practices |
| 2 | **RED method** | Derive **R**ate / **E**rrors / **D**uration from the library's `HTTP_REQUEST_*` keys + `durationMs`. RED is the request-oriented specialization of Google's four golden signals. | Tom Wilkie / Grafana "The RED Method" |
| 3 | **Four golden signals** | The health strip = Latency, Traffic, Errors, Saturation. Separate **successful vs failed** latency ("a slow error is worse than a fast error"). | Google SRE Book |
| 4 | **Percentiles, never averages** | Latency shown as p50/p95/p99 + a heatmap (reveals bimodal distributions percentiles hide). `[1,1,1,5000]ms` has a misleading 1251ms mean. | Google SRE Book / Grafana histograms |
| 5 | **Avoid high cardinality** | Aggregate only on **bounded** dimensions: `level` (6), status-class (4), `logKey`, `service.name`, `tenantId` (top-N + "other"). **Never** group-by `requestId`/`traceId`/`userId` — those are for search/drill-down only. | Grafana / Loki query-optimization |
| 6 | **Logs ↔ traces correlation is the payoff** | Every row's `traceId` is a click-through to the Tempo trace; every row offers "show all logs for this traceId" across `api` + `worker`. | OVERVIEW §14 + Grafana derived fields |
| 7 | **Accessible severity** | Severity = color **+** icon **+** text (never color alone). Left-border accent + leading icon + level pill. | PatternFly / Astro UXDS |
| 8 | **Skeletons, not spinners** | Dashboard/feed/table fetches show skeleton screens; spinners only for short blocking actions (submit/save). | NN/g + Onething |
| 9 | **Action-oriented empty states** | "No logs yet — fire one from the Playground →" with a primary action, never a blank pane. | NN/g empty-state design |
| 10 | **One global time range + one global source toggle** | Both controls drive every panel and the Explorer simultaneously; time buckets auto-scale to ~60–120 points. | Grafana / Datadog |

---

## 3. Information architecture

A left nav with six destinations. The first three are the daily drivers; the last three are the "operate it like a real platform" surface.

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│  ☰ nest-   │  [ Time: Last 1h ▾ ]   [ Source: ● Loki  ○ Postgres ]   ⟳ Live │
│   logger   ├──────────────────────────────────────────────────────────────┤
│            │                                                                │
│ ▸ Overview │   (page content — see §5–§10)                                  │
│ ▸ Explorer │                                                                │
│ ▸ Trigger  │                                                                │
│   ─────    │                                                                │
│ ▸ Alerts   │                                                                │
│ ▸ Maintain │                                                                │
│ ▸ Settings │                                                                │
│            │                                                                │
│  tenant ▾  │                                                                │
│  role:     │                                                                │
│  Operator  │                                                                │
└────────────┴──────────────────────────────────────────────────────────────┘
```

| Route | Page | Primary job |
| ----- | ---- | ----------- |
| `/` | **Overview** | Health at a glance — golden signals, RED, breakdowns, pipeline health |
| `/explorer` | **Log Explorer** | Search, filter, live-tail, drill into individual logs and their traces |
| `/trigger` | **Trigger Center** | Fire every kind of log / library feature on demand (the Playground) |
| `/alerts` | **Alerts & Incidents** | Rules over log patterns, channels, incident lifecycle |
| `/maintenance` | **Maintenance & Governance** | Retention, export, RBAC, redaction proof, audit trail |
| `/settings` | **Settings** | Source endpoints, display defaults, theme |

---

## 4. Global controls

Three controls live in the top bar and are persisted in the **URL** (via `nuqs` typed search params) so any view is a shareable deep-link.

- **Time range** — relative presets (Last 5m/15m/1h/6h/24h/7d) + absolute picker (shadcn `Calendar`). Drives every panel and the Explorer. Buckets auto-scale: `1m` for ≤6h, `5m` for ≤24h, `1h` for ≤7d (~60–120 points).
- **Source toggle `[ Loki | Postgres ]`** — switches which backend answers. **Loki = `info`+ (full)**, **Postgres = `warn`+ (durable/audit tier)**. A persistent callout explains the asymmetry so different volumes per source read as a *lesson*, not missing data:

  > 🎓 You're viewing **Postgres** (`warn`+, durable). `info`/`debug` lines live only in **Loki**. This two-tier split — cheap full-fidelity aggregation (Loki) + durable structured audit store (Postgres) — is how real platforms balance cost and compliance.

- **Tenant / Role switcher** — drives the RBAC demo (§10). Switching tenant injects a `tenantId` restriction into every query; switching role gates actions (Viewer/Operator/Admin).
- **Live toggle `⟳`** — turns on the SSE live tail (§7) wherever a log list is shown.

---

## 5. Page — Overview (health)

The on-call landing page. Strict top-left-first, general→specific. Every panel is **click-to-filter** (clicking a bar/slice pivots to the Explorer with that filter applied) and **brushable** where it's a timeseries (dragging sets the global time range).

```
┌─ HEALTH STRIP (4 golden signals + SLO) ───────────────────────────────────────────┐
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐ │
│ │ TRAFFIC    │ │ ERRORS     │ │ LATENCY    │ │ FATAL+ERROR│ │ SLO 99.9% (30d)  │ │
│ │ 1.2k req/m │ │ 0.8%  ▲0.2 │ │ p95 240ms  │ │ 14 in 1h   │ │ ▓▓▓▓▓▓▓░ 71%     │ │
│ │ ▁▂▃▅▃▂▁    │ │ (green<1%) │ │ ▁▂▂▃▂▂▁    │ │ ▁▁▃▁▁      │ │ budget left      │ │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────────────┘ │
├─ LOG VOLUME (signature panel — stacked bar by level, BRUSHABLE) ───────────────────┤
│  count                                                                             │
│   ▏    ▏  █(error)                                                                  │
│   ▏ ▏  ▏  █ ▏    ▏   ← drag to zoom → sets global time range + Explorer filter      │
│   █▏█▏█▏█▏█▏█▏█▏█▏█  (info=blue · warn=amber · error/fatal=red · debug/trace=grey)  │
│   └────────────── time ──────────────┘                                             │
├─ RED ROW ──────────────────────────────────────────────────────────────────────────┤
│ ┌─ Requests/min (HTTP_REQUEST_START) ─┐ ┌─ Latency p50/p95/p99 (durationMs) ──────┐ │
│ │  line                               │ │  p99 ───╮   (lines; NEVER average)      │ │
│ │                                     │ │  p95 ──╮ ╰── + heatmap below            │ │
│ ├─ Error rate % (4xx vs 5xx series) ──┤ │  p50 ─╯                                 │ │
│ │  (4xx+5xx)/total per bucket, red    │ │ ┌ Latency heatmap (bimodal reveal) ───┐ │ │
│ │  threshold line at 1%               │ │ │ ░░▒▓░░  Slow reqs >1s: 6  (METHOD_  │ │ │
│ └─────────────────────────────────────┘ │ └ ───────────────── SLOW_EXECUTION) ─┘ │ │
│                                          └────────────────────────────────────────┘ │
├─ BREAKDOWN ROW (bounded dimensions only — each bar/slice click-to-filter) ──────────┤
│ ┌ Level donut ┐ ┌ Top logKeys ──────┐ ┌ Top errors ─────┐ ┌ Status mix ┐ ┌ Tenants┐│
│ │   ◔ info 82% │ │ ORDER_CREATE…  ███ │ │ PAYMENT_*_FAIL ██│ │2xx ███████ │ │acme  ██││
│ │   warn 12%   │ │ HTTP_REQUEST…  ██  │ │ DOWNSTREAM_*   █ │ │4xx ██      │ │globex █││
│ │   error 6%   │ │ PAYMENT_REFU…  █   │ │ …              │ │5xx █       │ │…       ││
│ └──────────────┘ └────────────────────┘ └─────────────────┘ └────────────┘ └────────┘│
├─ PIPELINE HEALTH (USE-style saturation of the logging pipeline itself) ─────────────┤
│  LOGGER_DESTINATION_WRITE_FAILED: 0   _INIT_FAILED: 0   LOGGER_ENTRY_TRUNCATED: 2    │
│  Loki write lag: 1.1s   Postgres write lag: 0.3s    (fault-inject from Trigger →)    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Panel specifics** (full catalog in [§11](#11-chart--panel-catalog)):

- **Health strip** — four golden-signal stat tiles, each with a sparkline and Δ vs the previous equal window; blue=good, red=bad. The **Errors** tile turns red above a 1% threshold. The **SLO** tile uses Google's multiwindow multi-burn-rate model (99.9% / 30-day budget; badges the 14.4 / 6 / 1 burn rates).
- **Log volume** — the signature panel: stacked bar by level, doubles as the time selector. Drag-to-brush sets the global range.
- **RED row** — left: Requests/min + Error-rate % (`(4xx+5xx)/total` per bucket, separate 4xx/5xx series); right: latency percentile **lines** + a latency **heatmap** + a slow-request stat (`durationMs` > the `@LogPerformance(ms)` threshold ⇒ `METHOD_SLOW_EXECUTION`).
- **Breakdown row** — level donut, top `logKey`s, top errors (`logKey` where `level ∈ {error,fatal}`), status-code stacked bar, top tenants (top-N + "other"). Bounded dimensions only.
- **Pipeline health** — counts of `LOGGER_DESTINATION_WRITE_FAILED` / `_INIT_FAILED` / `LOGGER_ENTRY_TRUNCATED` + write lag, so the library's **fail-soft** behavior is observable when you inject a fault from the Trigger Center.

All panels are fed by **server-side aggregation endpoints** (`GET /logs/aggregate`, §12) — the browser never aggregates raw rows.

---

## 6. Page — Log Explorer

The daily driver. Modeled on Datadog Log Explorer + Grafana Explore: a faceted left rail, a query bar, a brushable volume histogram, a virtualized table, and a detail drawer.

```
┌─ FACETS ──┐┌─ QUERY BAR ───────────────────────────────────────────────────────────┐
│ level     ││ level:error logKey:PAYMENT_* tenantId:acme  | msg ~ "refund"   [Search] │
│  ☑ error  ││   ▸ generated SQL  ▸ generated LogQL   (teaching toggles)  [Save view…] │
│  ☐ warn   │├───────────────────────────────────────────────────────────────────────┤
│  ☐ info   ││  volume histogram (stacked by level, brushable)  ▏█▏█▏█▏█▏█▏  [⟳ Live]  │
│  service  │├───────────────────────────────────────────────────────────────────────┤
│  ☑ api    ││ time         lvl  logKey                msg                 trace  │ ▤ │
│  ☐ worker ││ 10:12:44.512 ●ERR PAYMENT_REFUND_FAILED  Gateway declined…  ↗4bf9 │ ⋮ │
│  logKey   ││ 10:12:44.498 ●INF HTTP_REQUEST_SUCCESS   GET /orders/:id     ↗4bf9 │   │
│  (counts) ││ 10:12:44.480 ●INF ORDER_CREATE_SUCCESS   Order created       ↗4bf9 │   │
│  tenantId ││ … virtualized (TanStack Virtual) — 50k rows @60fps, infinite scroll ↑ │
│  (top-N)  ││ ───────────────────────────────────────────────────────────────────── │
│           ││ ▼ DETAIL DRAWER (row click)                                           │
│ [Saved▾]  ││  Overview │ Raw JSON │ Context │ Trace                                 │
│ All errors││  logKey  PAYMENT_REFUND_FAILED          [filter for][filter out][+col] │
│ Pay fails ││  traceId 4bf9…4736   → [ View trace ] [ All logs for this trace ]      │
│ Slow reqs ││  { "level":50, "msg":"Gateway declined", "cardNumber":"[REDACTED]" …}  │
└───────────┘└───────────────────────────────────────────────────────────────────────┘
```

**Faceted left rail** — `level`, `service.name`, `logKey`, `tenantId` as facets with **live value counts** (from `GET /logs/facets`); click to add a positive filter, ⌥-click for negative (`is-not`). Counts reflect the current query + time range.

**Query bar** — structured field syntax compiled to **both** SQL (Postgres) and LogQL (Loki):
- `level:error` · `level>=warn` · `logKey:PAYMENT_*` (wildcard prefix) · `service:api` · `tenantId:acme` · `traceId:4bf9…` · free-text `msg ~ "refund"` (ILIKE / `|=`).
- `logKey` values autocomplete and are validated against **`LOG_KEYS_CONVENTION_REGEX`** imported from `@bymax-one/nest-logger/shared` — a typo'd key is flagged inline.
- **Teaching toggles** reveal the generated `SQL` and `LogQL` beside the form (mirrors Grafana's "verify in Explore first" habit and makes the dual-backend tangible).

**Volume histogram** — same stacked-by-level brushable bar as the Overview, scoped to the current query.

**Table** — `TanStack Table v8` (headless) + `TanStack Virtual v3`: sticky header, column sort/resize/pin, selectable columns (`time`, `level` chip, `logKey` mono badge, `service`, `msg`, `requestId`, `traceId`), newest-first default, 50k+ rows at 60fps via `useVirtualizer({ overscan: 10, measureElement })`. Older logs load via **keyset/cursor infinite-scroll-up**; new logs arrive at the bottom via SSE (§7). Display toggles (real-tool polish): dedup (None/Exact/Numbers/Signature), wrap (off/on/on+pretty-JSON), timestamp precision (ms/ns), density.

**Detail drawer** (row click) — four tabs:
1. **Overview** — every field with per-field `filter for` / `filter out` / `add as column` / ad-hoc field-stats.
2. **Raw JSON** — full entry in a collapsible tree (`@uiw/react-json-view`, built-in clipboard). PII fields show `[REDACTED]` — **proof the library redacted at source** (see §10 governance).
3. **Context** — surrounding lines by `requestId` (or `traceId`), N-before / N-after (`GET /logs/context`).
4. **Trace** — `traceId`/`spanId` + **[ View trace ]** (opens the Tempo trace via the provisioned Grafana derived field) and **[ All logs for this trace ]** (pivots the Explorer to that one request across `api` + `worker` — the cross-service correlation payoff).

Plus: copy line, copy JSON, **copy permalink** (the full filter+selection encoded in the URL), and **Export** (§10) — download the current filtered result set as JSON/CSV (hard cap 100k rows, like Datadog, with a truncation banner).

---

## 7. Live Tail (real-time)

The **Live** toggle turns any log list into a real-time stream. This is the headline "visualizar em tempo real" feature.

- **Transport: Server-Sent Events** (not WebSocket, not polling). Logs are strictly server→client — SSE's sweet spot. It gives **free auto-reconnect** with exponential backoff and **`Last-Event-ID` resume** (the browser re-sends the last id; the server replays only newer rows from the keyset store — no missed lines, no per-client server bookkeeping). Plain HTTP `text/event-stream` is proxy/firewall-friendly. (Architecture in §14.)
- **Follow-mode UX** (the universal `less +F` / GitHub Actions / Loki convention): pinned to bottom ⇒ new lines auto-scroll in with a **contrasting highlight**; the moment the user scrolls up, auto-scroll **pauses** and a **“N new logs — Jump to latest”** pill appears; returning to the bottom resumes.
- **Controls:** `Live ▸ Pause ▸ Resume ▸ Clear`.
- **Backpressure:** incoming events are buffered and flushed on `requestAnimationFrame` in small batches (coalesce ~10/frame); a bounded in-memory **ring buffer** (e.g. 10k lines, drop-oldest) means a high-rate stream never freezes the tab or exhausts memory.
- **Guardrails** (Sentry's pattern): auto-pause when the rate is very high; live tail is enabled only on **relative** time ranges; it auto-stops after a long idle period.
- **Source:** the SSE feed proxies **Loki** (`info`+, the live-fidelity tier) by default; a Postgres-backed `warn`+ stream is also available. The toggle is honored.

---

## 8. Page — Trigger Center (Log Playground)

The "acionar todos os tipos de logs pelo dashboard" requirement — and the exact analog of how `nest-auth-example`'s UI exercises every auth feature. A grid of buttons/forms that hit the `apps/api` demo endpoints (OVERVIEW §10) to emit each kind of log, then **auto-pivots the Explorer** to the new `requestId`/`traceId` so you immediately see what you fired.

| Trigger | Fires | Demonstrates | Endpoint |
| ------- | ----- | ------------ | -------- |
| **Emit each level** | `trace`/`debug`/`info`/`warn`/`error`/`fatal` | `PinoLoggerService.info/warn/error/fatal` + level mapping | `POST /trigger/level` |
| **Structured success** | `ORDER_CREATE_SUCCESS` (+ metadata) | `info(logKey, msg, userId, meta)` + ALS `requestId`/`tenantId` | `POST /orders` |
| **Error with stack** | `PAYMENT_REFUND_FAILED` | `errorStructured(logKey, Error, …)` + `HTTP_EXCEPTION_HANDLED` once | `POST /payments` |
| **PII payload** | signup with `password`/`cpf`/`cardNumber` | 97-path redaction → `[REDACTED]` | `POST /pii-demo/signup` |
| **Deep-nested PII** | depth 1→5 payload | wildcard depth boundary (4 redacted, 5 not) | `POST /pii-demo/nested` |
| **Sensitive headers** | `authorization`, `x-api-key`, `set-cookie` | header bracket-syntax redaction | `GET /pii-demo/echo-headers` |
| **Oversized entry** | >64 KB metadata | `maxEntrySizeBytes` → `LOGGER_ENTRY_TRUNCATED` | `POST /pii-demo/huge` |
| **Slow method** | sleeps > 1s | `@LogPerformance` → `METHOD_SLOW_EXECUTION` | `GET /orders/slow` |
| **HTTP 4xx / 5xx** | client/server error | `HTTP_REQUEST_CLIENT_ERROR` / `_SERVER_ERROR` | `GET /trigger/status/:code` |
| **Cross-service** | calls `apps/worker` | one `traceId` across two services | `POST /downstream/dispatch` |
| **Fault-inject a destination** | point Loki at a dead host | `LOGGER_DESTINATION_WRITE_FAILED`, fail-soft | `POST /trigger/fault/loki` |
| **Load burst** | N requests over T seconds | populate charts / drive the RED panels / test live tail | `POST /trigger/burst` |

Each trigger card shows the emitted `logKey`(s) and, after firing, a **“View in Explorer →”** link pre-filtered to the resulting `requestId`/`traceId`. The burst generator is what makes the Overview charts and live tail feel alive in a demo.

---

## 9. Page — Alerts & Incidents

Turns the viewer into an on-call tool. Modeled on the Loki ruler + Alertmanager + PagerDuty lifecycle, scoped to the example's data.

> 🎓 _Scoped demo of **log-based alerting + on-call**. In production you'd use the **Loki ruler → Alertmanager → PagerDuty/Slack**; here the same shape runs as a NestJS cron over the `/logs` query layer with mockable channels._

**Alert rules** — `expr + threshold + for-duration`, evaluated on a NestJS cron (e.g. every 30s) against the same query layer the Explorer uses. Rule shapes the library's `logKey` convention enables:
- **Error spike** — `count(level ∈ {error,fatal}) by logKey over 5m > N`.
- **Any FATAL** — `count(level = fatal) over 1m ≥ 1`.
- **Specific failure** — `rate(PAYMENT_REFUND_FAILED) over 5m > X`.
- **Heartbeat/absence** — `count(HTTP_REQUEST_SUCCESS) over 10m == 0`.
- Best-practice baked in: **rate-based not count**, combine **error-rate-high AND volume-above-floor**, time-aware thresholds, **aggregate** (one notification per pattern), **auto-resolve**. Each rule shows its equivalent **Loki ruler YAML** as a teaching device.

**Notification channels** — a registry of receivers (Slack webhook, generic webhook, email-mock) with **severity-based routing** (critical → webhook + Slack; warning → Slack only). Deliveries are mockable/logged so the demo runs offline; channels can be **test-fired**.

**Incidents** — the PagerDuty lifecycle: **Triggered → Acknowledged → Snoozed (1h/4h/8h/24h) → Resolved**, every transition appended to an **immutable timeline** (actor + timestamp). Each incident **deep-links back to the Explorer** pre-filtered to the matching `logKey` + time window. Saved Views (§6) can be promoted to alert rules in one click (the Datadog "save view → monitor" pattern).

---

## 10. Page — Maintenance & Governance

The "dar manutenção / como é usado em caso real" surface. Four believable, small, real implementations.

### Retention & storage
- A real **TTL sweep**: a NestJS cron deletes `application_logs` rows older than `RETENTION_DAYS` (default 30) and the panel shows next-sweep time + rows-pending-deletion.
- A **read-only echo** of the Loki retention config beside it, making the **two-tier story** concrete: hot/durable `warn`+ in Postgres (TTL'd) + full `info`+ aggregation in Loki (its own retention). ⚠️ Loki retention is **off by default**: `retention_period`/`retention_stream` do nothing unless the **`compactor`** sets `retention_enabled: true` **and** a `delete_request_store` — the example's `loki-config.yml` enables both so the echo reflects a real, working policy.
- 🎓 _Scoped demo of **tiered retention**. Real platforms add warm/cold object-storage tiers (S3/Glacier) and per-tenant retention overrides._

### Export
- Download the **current filtered result set** as **JSON** and **CSV** (columns: `time, level, logKey, service, requestId, traceId, tenantId, msg`), hard-capped at 100k rows with a truncation banner (Datadog's cap). Reuses the Explorer's exact query.

### RBAC (query-based, multi-tenant)
- **Roles:** **Viewer** (own `tenantId` only, no export, no alert edits) · **Operator** (read + ack/snooze/resolve incidents + export) · **Admin** (manage rules/retention/channels, all tenants, see audit).
- Enforced by **injecting a `tenantId` restriction into the existing SQL/LogQL query builder** — RBAC reuses the query layer rather than bolting on a second auth path. Switching role/tenant in the global control visibly changes what the Explorer can see.
- 🎓 _Scoped demo of **query-based RBAC** (à la Datadog data-access restrictions). In production, wire roles to your IdP/`@bymax-one/nest-auth`._

### Governance — redaction at source (the hero)
This is the library's strongest, most differentiated story and gets a dedicated panel:

- Show the **same record from Postgres and Loki side by side**, both displaying `[REDACTED]` censor values.
- A **“redacted at source — never stored raw”** badge. Unlike Datadog Sensitive Data Scanner or OTel-collector redaction (which scrub **after** ingest and gate de-obfuscation behind an "unmask" permission), `@bymax-one/nest-logger` redacts **in-process** via `fast-redact` (97 default paths) **before the line leaves the service** — so Postgres and Loki only ever hold redacted data. **There is nothing to unmask because raw PII never left the process.**
- Link to the **active redact-path list** from `LogAuditService` (`@Inject(LOGGER_OPTIONS_TOKEN)`, OVERVIEW §13).

### Audit trail
- An `audit_events` table records **actions** (not logins): who exported, who created/edited/muted an alert, who switched role/tenant, who changed retention — `{ actor, action, target, tenantId, at }`, rendered read-only. Closes the compliance loop and pairs with the redaction story.

---

## 11. Chart & panel catalog

Every chart is fed by a **server-side aggregation endpoint**; the browser never crunches raw rows. Library: **Recharts v3** via shadcn chart primitives (ECharts/uPlot reserved for the dense heatmap if needed).

| Panel | Chart type | Source query (Postgres ⇄ Loki) | Formula / notes |
| ----- | ---------- | ------------------------------ | --------------- |
| Traffic tile | Stat + sparkline | `count(HTTP_REQUEST_START)` per bucket | req/min |
| Errors tile | Stat + threshold | `(4xx+5xx)/total` | red > 1% |
| Latency tile | Stat | `p95(durationMs)` | percentile, not avg |
| Fatal+Error tile | Stat + sparkline | `count(level ∈ {error,fatal})` | — |
| SLO/error-budget | Gauge | budget = `1 − errorRate`; burn = consumed/window | 99.9% / 30d; 14.4/6/1 burn badges |
| **Log volume** | **Stacked bar (brushable)** | `count() by level` per bucket | signature panel + time selector |
| Requests/min | Line/bar | `count(HTTP_REQUEST_START)` per bucket | RED — Rate |
| Error rate % | Line (4xx, 5xx series) | `(4xx+5xx)/total` per bucket | RED — Errors; threshold 1% |
| Latency percentiles | Lines (p50/p95/p99) | `percentile(durationMs)` per bucket | RED — Duration; never average |
| Latency heatmap | Heatmap | `durationMs` histogram per bucket | reveals bimodal distributions |
| Slow requests | Stat | `count(durationMs > 1000)` / `METHOD_SLOW_EXECUTION` | — |
| Level distribution | Donut | `count() by level` | bounded (6) |
| Top logKeys | Horizontal bar | `count() by logKey` top-N | bounded |
| Top errors | Horizontal bar | `count() by logKey where level∈{error,fatal}` | — |
| Status mix | Stacked bar | `count() by status_class` | 2xx/3xx/4xx/5xx |
| Top tenants | Horizontal bar | `count() by tenantId` top-N + "other" | low cardinality only |
| Pipeline health | Stat row | counts of `LOGGER_DESTINATION_*` / `LOGGER_ENTRY_TRUNCATED` | USE-style saturation |

> **Bounded-dimension rule:** aggregation `group by` is only ever `level`, `status_class`, `logKey`, `service.name`, `tenantId`. `requestId`/`traceId`/`spanId`/`userId` are **search/drill-down keys only** — never chart dimensions (high cardinality).

---

## 12. The backing API (`apps/api/src/logs`)

All dashboard features are powered by **one `logs/` module** in `apps/api` (plus small modules for alerts/incidents/views/audit). No new datastore — it reads the same Postgres `application_logs` and proxies Loki. Each endpoint accepts the same filter object so the source toggle is transparent.

| Method & route | Purpose | Notes |
| -------------- | ------- | ----- |
| `GET /logs` | Paged log query | Keyset cursor; `?level=&logKey=&service=&tenantId=&traceId=&requestId=&q=&from=&to=&source=&cursor=&limit=` |
| `GET /logs/aggregate` | Time-bucketed counts for charts | `?metric=volume\|errorRate\|latency\|statusMix&groupBy=level\|logKey\|...&bucket=auto&from=&to=&source=` |
| `GET /logs/facets` | Distinct values + counts for the rail | `?fields=level,service,logKey,tenantId&from=&to=` |
| `GET /logs/context` | Surrounding lines | `?requestId=\|traceId=&before=10&after=10` |
| `GET /logs/stream` | **SSE live tail** | `text/event-stream`; honors filters + `Last-Event-ID`; §14 |
| `GET /logs/loki` | Loki proxy | maps the filter object → LogQL `query_range` / `labels` / `tail` |
| `GET /logs/export` | JSON/CSV download | `?format=json\|csv` + filters; 100k cap |
| `GET/POST /views` | Saved views CRUD | named filter sets |
| `GET/POST/PATCH /alerts/rules` | Alert rules CRUD | `expr + threshold + for` |
| `GET/POST /alerts/channels` | Notification channels | test-fireable |
| `GET/PATCH /incidents` | Incident lifecycle | ack/snooze/resolve + timeline |
| `GET /audit` | Audit events | read-only |
| `GET/PATCH /maintenance/retention` | TTL config + sweep status | Admin only |

**Filter DTO** (shared by `/logs`, `/logs/aggregate`, `/logs/export`, `/logs/stream`) — validated with Zod; `logKey` patterns checked against `LOG_KEYS_CONVENTION_REGEX`:

```typescript
// logs/dto/log-query.dto.ts
export interface LogQuery {
  level?: LogLevel | { gte: LogLevel } // level:error OR level>=warn
  logKey?: string // exact or PREFIX_* wildcard
  service?: string
  tenantId?: string
  traceId?: string
  requestId?: string
  q?: string // free-text msg contains (ILIKE / Loki |=)
  from?: string // ISO; default now-1h
  to?: string // ISO; default now
  source: 'postgres' | 'loki' // the global toggle
  cursor?: string // opaque keyset cursor (time,id)
  limit?: number // default 100, max 1000
}
```

The service compiles `LogQuery` to **both** a Prisma `where` (Postgres) and a **LogQL** string (Loki); the Explorer's "show generated query" toggles render exactly these.

---

## 13. Data model & queries (Postgres + Loki)

### Postgres schema & indexes

The `application_logs` table (written by `PrismaLogDestination`, `warn`+) is tuned for log querying at volume:

```prisma
model ApplicationLog {
  id        String   @id @default(cuid())
  time      DateTime                 // event time (from the log entry)
  level     String                   // 'warn' | 'error' | 'fatal' (this tier is warn+)
  logKey    String
  message   String
  service   String
  tenantId  String?
  requestId String?
  traceId   String?
  spanId    String?
  status    Int?                     // HTTP status when present (for status-class charts)
  durationMs Int?                    // when present (for latency charts)
  payload   Json                     // full, already-REDACTED entry

  // Prisma expresses ALL of these natively (the index access method via `type:` +
  // per-field ops — GA on PostgreSQL since Prisma 4, no preview flag in 6.x/7.x):
  @@index([time(ops: raw("timestamp_minmax_ops"))], type: Brin)        // tiny, append-only time series
  @@index([time(sort: Desc), id(sort: Desc)])                          // keyset pagination (newest-first)
  @@index([payload(ops: JsonbPathOps)], type: Gin)                     // arbitrary-metadata containment
  @@index([level])
  @@index([logKey])
  @@index([traceId])
  @@index([tenantId, time])
}
```

> **Audit fix:** earlier drafts claimed BRIN/GIN "can't be expressed in Prisma" and used raw-SQL migrations — that's outdated. The native declarations above are correct for Prisma 6/7 ([extended indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes) are GA on PostgreSQL). Reserve raw SQL only for things Prisma still can't model (e.g. BRIN `pages_per_range` tuning or partial indexes).

### Keyset (cursor) pagination — not OFFSET

OFFSET degrades linearly with depth and skips/dupes rows under concurrent inserts. Keyset is constant-time and stable (~17× faster at depth):

```sql
-- page of newest-first logs after an opaque cursor (time,id)
SELECT * FROM application_logs
WHERE tenant_id = $1                       -- RBAC restriction injected here
  AND time BETWEEN $2 AND $3               -- global time range
  AND ($4::text IS NULL OR level = $4)     -- filters…
  AND (time, id) < ($cursorTime, $cursorId)  -- the cursor
ORDER BY time DESC, id DESC
LIMIT $limit;
```

The cursor is the opaque base64 of `(time,id)`; a stale/invalid cursor returns `410` and the client restarts.

### Time-bucketed aggregation for charts

`generate_series` guarantees zero-filled empty buckets (so charts don't have gaps):

```sql
-- volume stacked by level, auto-bucketed (e.g. 1 minute)
SELECT b.bucket, l.level, COALESCE(c.n, 0) AS n
FROM generate_series($from, $to, $interval) AS b(bucket)
CROSS JOIN unnest(ARRAY['fatal','error','warn','info','debug','trace']) AS l(level)
LEFT JOIN (
  SELECT date_trunc($unit, time) AS bucket, level, count(*) AS n
  FROM application_logs
  WHERE time BETWEEN $from AND $to AND tenant_id = $tenant
  GROUP BY 1, 2
) c ON c.bucket = b.bucket AND c.level = l.level
ORDER BY b.bucket;

-- error rate per bucket
SELECT date_trunc($unit, time) AS bucket,
       count(*) FILTER (WHERE status >= 400)::float / NULLIF(count(*),0) AS error_rate
FROM application_logs WHERE logKey LIKE 'HTTP_REQUEST_%' AND time BETWEEN $from AND $to
GROUP BY 1 ORDER BY 1;

-- latency percentiles per bucket
SELECT date_trunc($unit, time) AS bucket,
       percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
       percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
FROM application_logs WHERE duration_ms IS NOT NULL AND time BETWEEN $from AND $to
GROUP BY 1 ORDER BY 1;
```

### Loki mapping (the other half of the toggle)

The same `LogQuery` compiles to LogQL and hits the Loki HTTP API:

| Dashboard need | Loki endpoint / query |
| -------------- | --------------------- |
| Paged search | `GET /loki/api/v1/query_range` with `{service="api"} | json | level="error" |= "refund"` |
| Chart buckets | `query_range` of `sum by (level) (count_over_time({service="api"} | json [1m]))`, `step=$interval` |
| Facet values | `GET /loki/api/v1/label/<name>/values` |
| Live tail | `GET /loki/api/v1/tail` (WebSocket) → bridged to the dashboard's SSE feed |

`logKey` filtering uses `| json | logKey=~"PAYMENT_.*"`; malformed lines are dropped with `| __error__=""`. Because Loki holds `info`+, the same window shows more rows than Postgres — the toggle callout explains why.

---

## 14. Real-time architecture (SSE)

End-to-end live tail, server to browser.

**NestJS producer** — `@Sse()` returns an `Observable<MessageEvent>`; the row's keyset cursor is the SSE `id` so reconnect resumes cleanly:

```typescript
// apps/api/src/logs/logs.sse.controller.ts
@Controller('logs')
export class LogsSseController {
  constructor(private readonly bus: LogEventBus) {}

  @Sse('stream')
  stream(@Query() filter: LogQuery, @Headers('last-event-id') lastId?: string): Observable<MessageEvent> {
    const replay$ = this.bus.replaySince(lastId, filter) // keyset replay of missed rows
    const live$ = fromEvent(this.bus.emitter, 'log').pipe(
      filter((e) => matches(e, filter)),
      map((e) => ({ data: JSON.stringify(e), id: e.cursor }) as MessageEvent),
    )
    const keepAlive$ = interval(15_000).pipe(map(() => ({ data: '', type: 'ping' }) as MessageEvent))
    return merge(replay$, live$, keepAlive$)
  }
}
```

`PinoLoggerService` writes flow to the destinations; a lightweight `LogEventBus` (an in-process `EventEmitter`, or a Loki `tail` bridge) re-emits each entry to connected SSE clients. Set `X-Accel-Buffering: no` + `Cache-Control: no-cache` to defeat proxy buffering. **Serve the API over HTTP/2** to escape the HTTP/1.1 6-connection-per-domain SSE cap.

**Next.js 16 consumer** — a route handler can also proxy/transform the stream; the client uses a small `useEventSource` hook:

```typescript
// apps/web/lib/use-event-source.ts
export function useLogStream(filter: LogFilter, enabled: boolean) {
  const ref = useRef<EventSource>()
  const [buffer] = useState(() => new RingBuffer<LogEntry>(10_000)) // drop-oldest
  useEffect(() => {
    if (!enabled) return
    const url = `/api/logs/stream?${encode(filter)}`
    const es = new EventSource(url) // browser auto-reconnects + sends Last-Event-ID
    const pending: LogEntry[] = []
    let raf = 0
    es.onmessage = (ev) => {
      pending.push(JSON.parse(ev.data))
      raf ||= requestAnimationFrame(() => { buffer.pushMany(pending.splice(0)); raf = 0 }) // batch flush
    }
    ref.current = es
    return () => es.close()
  }, [enabled, encode(filter)])
  return buffer
}
```

Follow-mode (auto-scroll only when pinned to bottom; pause-on-scroll-up; "jump to latest" pill) lives in the virtualized table component, driven by the buffer.

---

## 15. Frontend tech stack & design system

`apps/web` adopts the **shared Bymax example-apps design system verbatim** so every reference app is visually one product. The tech below is the data/UX layer; the design tokens are copied 1:1.

> **🎨 Canonical UI reference:** [`docs/design_system.html`](design_system.html) — open it in a browser. It is the **rendered, project-agnostic design-system guide** for all Bymax example apps (tokens, color/type/space, the app shell, live component examples, severity, and a step-by-step **AI-agent recreation guide**). This section summarizes it; when building `apps/web`, follow `design_system.html` and copy the four files it names.

### Tech stack

| Concern | Choice | Why |
| ------- | ------ | --- |
| Framework | **Next.js `^16.2`** (App Router) + **React `^19.2`** + TypeScript | matches `nest-auth-example`; SSR + route handlers for SSE |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss` only — v4 auto-prefixes, **no `autoprefixer`/`postcss-import`**) + **shadcn/ui `new-york`** | identical to `nest-auth-example` |
| Icons | **`lucide-react`** | the nav + UI icon set (shadcn `iconLibrary: lucide`) |
| Fonts | **`geist`** (`GeistSans` + `GeistMono`) | body = Geist Sans; headings/brand/card-titles = mono |
| Theme | **forced dark** (`dark` on `<html>`) — **no `next-themes`** | the design system is dark-only by design |
| Charts | **Recharts v3** via shadcn chart primitives | **fed by `/logs/aggregate`, never raw rows**; ECharts/uPlot only if the heatmap needs it |
| Server state | **TanStack Query v5** (App-Router `get-query-client` + `HydrationBoundary`) | `useInfiniteQuery` (table), `useQuery` (panels) |
| Table | **TanStack Table v8** + **TanStack Virtual v3** | 50k rows @60fps, sticky header, sort/resize/pin, expandable rows |
| Filter state | **nuqs v2** typed URL search params | every view is a shareable deep-link |
| Live tail | **`EventSource`** + custom `useLogStream` hook | SSE; reconnect + `Last-Event-ID` + rAF-batched ring buffer |
| JSON viewer | **`@uiw/react-json-view`** | zero-dep, built-in clipboard, collapsible tree |
| Toasts | **`sonner`** (glass `Toaster`) | identical config to `nest-auth-example` |
| Class utils | **`class-variance-authority` + `clsx` + `tailwind-merge`** | the `cn()` util + button/badge variants |
| Types | **`@bymax-one/nest-logger/shared`** | `LogEntry`, `LogLevel`, `LOG_KEYS_CONVENTION_REGEX` — the isomorphic subpath |

Install (pinned to `nest-auth-example`): `next@^16.2 react@^19.2 react-dom@^19.2 tailwindcss@^4.2 @tailwindcss/postcss@^4.2 geist@^1.7 lucide-react sonner@^2 class-variance-authority clsx tailwind-merge` + the data libs (`@tanstack/react-query @tanstack/react-table @tanstack/react-virtual nuqs @uiw/react-json-view recharts`). **Do not** add `next-themes`, **and do not add `autoprefixer`/`postcss-import`** (Tailwind v4 handles both). Remember the **`<NuqsAdapter>`** in the root layout (required by nuqs v2).

### Design tokens — copy `nest-auth-example/apps/web` 1:1

> **Source of truth:** `~/Documents/MyApps/nest-auth-example/apps/web`. Copy `app/globals.css`, `tailwind.config.ts`, `components.json`, and `postcss.config.mjs` **verbatim**, then build the logger nav. The token values below are reproduced so this doc is self-contained; if they ever diverge, the `nest-auth-example` files win.

**`components.json` (shadcn):** `style: "new-york"`, `rsc: true`, `tsx: true`, `tailwind.baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`, aliases `@/components · @/lib/utils · @/components/ui · @/lib · @/hooks`.

**Brand & semantics:** primary **orange `#ff6224`** (`hsl(20.5 90.2% 57.8%)` → `--primary` & `--ring`), secondary blue `#60a5fa`, accent `#f97316`, success `#22c55e`, danger `#ef4444`. Radius base `--radius: 0.75rem` (extras `--radius-sm 8px … --radius-pill 9999px`). Brand glow `--shadow-primary: 0 0 24px rgba(255,98,36,0.4)`. Brand scale `brand.50 #fff5f0 … brand.500 #ff6224 … brand.900 #7a2609`.

**`app/globals.css` — Tailwind v4, CSS-first (the `.dark` set is always active):**

```css
@import 'tailwindcss';

/* v4 class-based dark variant (no next-themes — `dark` is forced on <html>) */
@custom-variant dark (&:is(.dark *));

/* Tokens at TOP LEVEL (shadcn-v4 puts :root/.dark OUTSIDE @layer base) */
:root {
  --background: 0 0% 100%; --foreground: 20 14.3% 4.1%;
  --primary: 20.5 90.2% 57.8%; --primary-foreground: 60 9.1% 97.8%; /* #ff6224 */
  --border: 20 5.9% 90%; --input: 20 5.9% 90%; --ring: 20.5 90.2% 57.8%;
  --radius: 0.75rem;
  --glass-bg: rgba(0,0,0,0.03); --glass-card-bg: rgba(0,0,0,0.03); --glass-border: rgba(0,0,0,0.08);
  --shadow-primary: 0 0 24px rgba(255,98,36,0.4);
  /* …full light set (card/popover/secondary/muted/accent/destructive) … */
}
.dark {
  --background: 20 14.3% 4.1%; --foreground: 60 9.1% 97.8%;
  --primary: 20.5 90.2% 57.8%; --primary-foreground: 20 14.3% 4.1%;
  --border: 12 6.5% 15.1%; --input: 12 6.5% 15.1%; --ring: 20.5 90.2% 57.8%;
  --color-bg-primary: #0a0a0a;
  --glass-bg: rgba(255,255,255,0.05); --glass-bg-raised: rgba(255,255,255,0.08);
  --glass-bg-hover: rgba(255,255,255,0.10); --glass-card-bg: rgba(255,255,255,0.06);
  --glass-border: rgba(255,255,255,0.10);
  --color-secondary: #60a5fa; --color-accent: #f97316; /* …full dark (live) set … */
}

/* Map tokens → Tailwind utilities so `bg-background`, `from-brand-500`, `rounded-lg`,
   `font-mono` actually generate. In v4 this REPLACES tailwind.config theme.extend. */
@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-border: hsl(var(--border));
  --color-ring: hsl(var(--ring));
  --color-brand-50: #fff5f0; --color-brand-400: #ff8748; --color-brand-500: #ff6224;
  --color-brand-600: #e5511b; --color-brand-900: #7a2609;
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
  --font-sans: var(--font-geist-sans), system-ui, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
}

@layer base {
  * { border-color: hsl(var(--border)); }
  body { background-color: hsl(var(--background)); color: hsl(var(--foreground)); font-family: var(--font-sans); }
  h1,h2,h3,h4,h5,h6 { font-family: var(--font-mono); }
}
/* keyframes glow-float/glow-drift/fade-in: define in @theme, or keep them in a JS
   tailwind.config bridged via `@config './tailwind.config.ts';` at the top of this file. */
```

> **Tailwind v4 notes (audit fix — the earlier draft was v3-style under a v4 header).** ① Tokens map to utilities via the **`@theme inline`** block; v4 does **not** auto-load a JS `tailwind.config.ts`, so `theme.extend` brand/radius/font tokens would be silently ignored and `from-brand-500` would never generate. If you keep a JS config (e.g. for `keyframes`/`animation`), bridge it explicitly with **`@config './tailwind.config.ts';`** at the top of `globals.css` (the legacy escape hatch). ② `:root`/`.dark` live at **top level**, not inside `@layer base` (shadcn-v4). ③ The dark variant uses **`@custom-variant`**. ④ **Drop `autoprefixer` and `postcss-import`** — v4 does both; `postcss.config.mjs` needs only `@tailwindcss/postcss`. Match whatever `nest-auth-example/apps/web/app/globals.css` actually ships (it bridges its `tailwind.config.ts` via `@config`).

**`app/layout.tsx` — fonts + forced dark + providers:**

```tsx
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { NuqsAdapter } from 'nuqs/adapters/next/app' // REQUIRED in nuqs v2 (App Router)
import './globals.css'
import Providers from './providers' // 'use client': QueryClientProvider + <Toaster/> (Sonner, theme="dark")

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`} suppressHydrationWarning>
      <body>
        {/* nuqs v2 made the adapter MANDATORY — without it every useQueryState() throws
            at runtime, breaking the shareable-deep-link filters. */}
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </body>
    </html>
  )
}
```

> For RSC reads of the same filter state, use `createSearchParamsCache(...)` from `nuqs/server`.

### App shell — identical structure, logger nav

Reuse `nest-auth-example`'s Topbar + Sidebar shell **classes verbatim**; only the brand label and nav items change.

- **Topbar** — fixed `h-16` (64px), `bg-[rgba(10,10,10,0.85)] backdrop-blur-md border-b border-[rgba(255,255,255,0.07)] z-200`. Left: the orange-bordered brand mark (rounded-lg badge `border-[rgba(255,98,36,0.4)] bg-[rgba(255,98,36,0.15)]` holding the 3-line stacked-layers SVG, stroke `#ff6224`) + gradient mono wordmark `bg-linear-to-r from-[#ff6224] to-amber-200 bg-clip-text text-transparent` reading **`nest-logger-example`**. Right: hamburger, the **global controls** (time range, source toggle, tenant/role, Live), `SignOutButton` if RBAC is on.
- **Sidebar** — `w-[250px] bg-[rgba(12,12,12,0.98)] border-r border-[rgba(255,255,255,0.08)]`, `lg:sticky lg:top-16 h-[calc(100vh-64px)]`. Item base `flex items-center gap-3 rounded-lg border-l-2 px-3 py-[10px] text-sm transition-all duration-150`; **active** `border-l-[#ff6224] bg-[rgba(255,98,36,0.1)] font-semibold text-[#ff6224]`; inactive `border-l-transparent text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.05)]`. Footer: tenantId + role pill (`rounded-full border-[rgba(255,98,36,0.25)] bg-[rgba(255,98,36,0.12)] font-mono text-[10px] uppercase text-[#ff6224]`).
- **Main** — `<div className="flex pt-16"><Sidebar/><main className="min-w-0 flex-1 px-6 py-8"><div className="mx-auto max-w-5xl">{children}</div></main></div>` (widen to `max-w-7xl` for the chart-heavy Overview/Explorer).

**Logger nav items** (replacing auth's Overview/Account/Security/…), lucide icons:

| Label | href | Icon |
| ----- | ---- | ---- |
| Overview | `/` | `LayoutDashboard` |
| Explorer | `/explorer` | `Search` |
| Trigger Center | `/trigger` | `Zap` |
| Alerts | `/alerts` | `BellRing` |
| Maintenance | `/maintenance` | `Settings2` |
| Settings | `/settings` | `Cog` |

### Glass-morphism & component recipes (verbatim)

- **Card** — `border-(--glass-border) bg-(--glass-card-bg) rounded-2xl border shadow-sm backdrop-blur-md`; `CardHeader` optional top brand-gradient line; `CardTitle` `font-mono text-xl font-bold`.
- **Button (CVA, pill)** — base `rounded-full`; `default` = `bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm hover:shadow-(--shadow-primary) hover:scale-[1.02] active:scale-[0.98]`; `outline`/`ghost` use the glass tokens. Sizes `h-10 px-6` / `sm h-8 px-4 text-xs` / `lg h-12 px-8` / `icon h-10 w-10`.
- **Badge** — `bg-brand-500 text-white rounded-full` (use for the `logKey` mono badge + level chips, colored per `severity.ts`).
- **Sonner Toaster** — `theme="dark"`, `position="bottom-right"`, glass style (`background: var(--glass-card-bg)`, `1px var(--glass-border)`, `backdropFilter: blur(16px)`, `font-mono`), severity left-borders (success green-500 / error red-500 / info blue-400 / warning amber-500).
- **shadcn/ui set to scaffold** (superset of `nest-auth-example`'s 14): `alert-dialog, avatar, badge, button, card, dialog, dropdown-menu, form, input, label, select, sonner, table, tabs, tooltip, popover, scroll-area, skeleton, command` (the last few support the query bar, facet popovers, skeleton loaders, and the command-palette filter UX).
- **Severity mapping** (`lib/severity.ts`, accessible — color **+** icon **+** text): `trace` muted-blue, `debug` blue, `info` green/neutral, `warn` amber, `error` red, `fatal` purple — each as a left-border accent + lucide icon + level pill. Reuse for log rows, the level donut, and toasts.

> **Net effect:** drop a `nest-auth-example` screenshot next to a `nest-logger-example` screenshot and the chrome (topbar, sidebar, cards, buttons, fonts, orange brand, glass) is indistinguishable — only the content (logs, charts, traces) differs.

---

## 16. apps/web file layout

```
apps/web/
├── app/
│   ├── layout.tsx                 # Geist fonts + forced `dark` <html> + <Providers> (NO next-themes)
│   ├── providers.tsx              # 'use client': QueryClientProvider + <Toaster/> (Sonner, dark glass)
│   ├── globals.css                # ← COPIED VERBATIM from nest-auth-example (token block + keyframes)
│   ├── page.tsx                   # Overview (health)
│   ├── explorer/page.tsx          # Log Explorer
│   ├── trigger/page.tsx           # Trigger Center (Playground)
│   ├── alerts/page.tsx            # Alerts & Incidents
│   ├── maintenance/page.tsx       # Maintenance & Governance
│   ├── settings/page.tsx
│   └── api/logs/stream/route.ts   # (optional) SSE proxy/transform of apps/api stream
├── components.json                # ← shadcn "new-york" config (copied; cssVariables, lucide)
├── tailwind.config.ts             # OPTIONAL in v4 — only for keyframes/animation; bridge via @config in globals.css
├── postcss.config.mjs             # @tailwindcss/postcss ONLY (v4 auto-prefixes — no autoprefixer)
├── components/
│   ├── layout/                    # Topbar (64px), Sidebar (250px, orange active), AppShell — copied shell
│   ├── controls/                  # TimeRangePicker, SourceToggle, TenantRoleSwitcher, LiveToggle
│   ├── charts/                    # VolumeBar, ErrorRateLine, LatencyLines, LatencyHeatmap, LevelDonut, TopBar, SloGauge
│   ├── explorer/                  # FacetRail, QueryBar, LogTable (virtualized), DetailDrawer, DisplayToggles
│   ├── trigger/                   # TriggerCard grid
│   ├── alerts/                    # RuleForm, ChannelRegistry, IncidentTimeline
│   ├── governance/                # RedactionProof, RbacBadge, AuditTable, RetentionPanel
│   └── ui/                        # shadcn primitives
├── lib/
│   ├── api-client.ts              # typed fetch wrappers for the logs/ API
│   ├── use-event-source.ts        # the SSE hook (§14)
│   ├── filters.ts                 # nuqs parsers + LogQuery <-> URL
│   ├── log-keys.ts                # imports LOG_KEYS_CONVENTION_REGEX from /shared; validates query bar
│   └── severity.ts                # level → {color, icon, label} (accessible)
├── hooks/                         # useLogs (infinite), useAggregate, useFacets, useFollowMode
├── package.json
└── tsconfig.json
```

---

## 17. References

Grouped by topic; every URL was consulted during the research that produced this spec.

**Real tools surveyed** — [Datadog Log Explorer](https://docs.datadoghq.com/logs/explorer/) · [Datadog Side Panel](https://docs.datadoghq.com/logs/explorer/side_panel/) · [Datadog Facets](https://docs.datadoghq.com/logs/explorer/facets/) · [Datadog Live Tail](https://docs.datadoghq.com/logs/explorer/live_tail/) · [Datadog Export](https://docs.datadoghq.com/logs/explorer/export/) · [Datadog Indexes/retention](https://docs.datadoghq.com/logs/log_configuration/indexes/) · [Datadog Sensitive Data Scanner](https://docs.datadoghq.com/security/sensitive_data_scanner/) · [Grafana Explore logs](https://grafana.com/docs/grafana/latest/explore/logs-integration/) · [SigNoz Logs Explorer](https://signoz.io/docs/product-features/logs-explorer/) · [Sentry Logs](https://docs.sentry.io/product/explore/logs/) · [Better Stack live tail](https://betterstack.com/docs/logs/using-logtail/live-tail-query-language/) · [New Relic logs UI](https://docs.newrelic.com/docs/logs/ui-data/use-logs-ui/) · [Coralogix LiveTail](https://coralogix.com/docs/user-guides/data_exploration/logs/livetail/) · [OpenObserve RED metrics](https://openobserve.ai/blog/red-metrics-monitoring/)

**Methodology** — [The RED Method (Grafana)](https://grafana.com/blog/the-red-method-how-to-instrument-your-services/) · [Four Golden Signals (Google SRE Book)](https://sre.google/sre-book/monitoring-distributed-systems/) · [Alerting on SLOs / burn rates (SRE Workbook)](https://sre.google/workbook/alerting-on-slos/) · [Burn rate is a better error rate (Datadog)](https://www.datadoghq.com/blog/burn-rate-is-better-error-rate/) · [USE & RED (PagerTree)](https://pagertree.com/learn/devops/what-is-observability/use-and-red-method)

**Dashboard design & charts** — [Grafana dashboard best-practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/) · [6 ways to improve log dashboards (Grafana/Loki)](https://grafana.com/blog/2023/05/18/6-easy-ways-to-improve-your-log-dashboards-with-grafana-and-grafana-loki/) · [Visualize Prometheus histograms (Grafana)](https://grafana.com/blog/2020/06/23/how-to-visualize-prometheus-histograms-in-grafana/) · [Datadog heatmap engineering](https://www.datadoghq.com/blog/engineering/how-we-built-the-datadog-heatmap-to-visualize-distributions-over-time-at-arbitrary-scale/) · [Empty states (NN/g)](https://www.nngroup.com/articles/empty-state-interface-design/) · [Skeletons vs spinners (Onething)](https://www.onething.design/post/skeleton-screens-vs-loading-spinners)

**Real-time & front-end** — [WebSockets vs SSE (Ably)](https://ably.com/blog/websockets-vs-sse) · [Using SSE (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) · [NestJS SSE](https://docs.nestjs.com/techniques/server-sent-events) · [Next.js Streaming](https://nextjs.org/docs/app/guides/streaming) · [Cursor pagination deep-dive (Milan Jovanović)](https://www.milanjovanovic.tech/blog/understanding-cursor-pagination-and-why-its-so-fast-deep-dive) · [Keyset cursors not offsets (Sequin)](https://blog.sequinstream.com/keyset-cursors-not-offsets-for-postgres-pagination/) · [TanStack Virtual](https://tanstack.com/virtual/latest) · [TanStack Query Advanced SSR](https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr) · [nuqs](https://nuqs.dev/) · [@uiw/react-json-view](https://www.npmjs.com/package/@uiw/react-json-view) · [PatternFly status & severity](https://www.patternfly.org/patterns/status-and-severity/) · [Astro UXDS status system](https://www.astrouxds.com/patterns/status-system/)

**Maintenance & ops** — [Loki retention](https://grafana.com/docs/loki/latest/operations/storage/retention/) · [LogQL](https://grafana.com/docs/loki/latest/query/) · [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/) · [Datadog archives](https://docs.datadoghq.com/logs/log_configuration/archives/) · [Datadog query-based RBAC](https://docs.datadoghq.com/logs/guide/manage-sensitive-logs-data-access/) · [Elastic KQL](https://www.elastic.co/docs/explore-analyze/query-filter/languages/kql) · [OTel sampling](https://opentelemetry.io/docs/concepts/sampling/) · [Loki alerts → Slack/PagerDuty (OneUptime)](https://oneuptime.com/blog/post/2026-01-21-loki-alerts-slack-pagerduty/view) · [PagerDuty incidents](https://support.pagerduty.com/main/docs/incidents)

> **Document version:** 1.0 — initial dashboard blueprint. Status: specification only (the `apps/web` app and the `apps/api/src/logs` module are not yet built). This file is the build base; see OVERVIEW §20 for the suggested order.
