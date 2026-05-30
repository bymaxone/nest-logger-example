# Phase 13 — Dashboard: Trigger, Alerts, Maintenance — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13
> **Total tasks:** 9
> **Progress:** 🔴 0 / 9 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                                          | Status | Priority | Size | Depends on             |
| ----- | ----------------------------------------------------------------------------- | ------ | -------- | ---- | ---------------------- |
| P13-1 | `app/trigger/page.tsx` Trigger Center — card grid firing every log type       | 🔴     | High     | L    | Phase 12               |
| P13-2 | Trigger cards — emitted `logKey`(s) + auto-pivot Explorer ("View in Explorer →") | 🔴   | High     | M    | P13-1                  |
| P13-3 | `app/alerts/page.tsx` — rule form (`expr + threshold + for`) + Loki ruler YAML | 🔴     | High     | M    | Phase 12               |
| P13-4 | Alerts — notification channel registry (Slack/webhook/email-mock, routing)    | 🔴     | High     | M    | P13-3                  |
| P13-5 | Alerts — incident lifecycle (Triggered→Ack→Snoozed→Resolved) + timeline       | 🔴     | High     | M    | P13-3, P13-4           |
| P13-6 | `app/maintenance/page.tsx` Retention (TTL sweep + Loki echo) + 🎓 callout      | 🔴     | High     | M    | Phase 12               |
| P13-7 | Maintenance — JSON/CSV export (100k cap) + query-based RBAC (Viewer/Op/Admin) | 🔴     | High     | M    | P13-6                  |
| P13-8 | Maintenance — redaction-at-source hero panel + `audit_events` table           | 🔴     | High     | M    | P13-6, P13-7           |
| P13-9 | Verification gate — triggers→logKeys, alert→incident, export, tenant scoping  | 🔴     | High     | M    | P13-1..P13-8           |

---

## P13-1 — `app/trigger/page.tsx` Trigger Center — card grid firing every log type

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (2–4 h)
- **Depends on:** `Phase 12`

### Description

Build the **Trigger Center** (`/trigger`) — the "acionar todos os tipos de logs pelo dashboard" page and the exact analog of how `nest-auth-example`'s UI exercises every auth feature (see `DASHBOARD.md` §8). It is a responsive **grid of cards**, one per library feature, each firing the matching `apps/api` demo endpoint (`DASHBOARD.md` §8 table, OVERVIEW §10) to emit a specific kind of log. The twelve cards cover: **emit each level** (`POST /trigger/level`), **structured success** (`POST /orders`), **error with stack** (`POST /payments`), **PII payload** (`POST /pii-demo/signup`), **deep-nested PII** (`POST /pii-demo/nested`), **sensitive headers** (`GET /pii-demo/echo-headers`), **oversized entry** (`POST /pii-demo/huge`), **slow method** (`GET /orders/slow`), **HTTP 4xx/5xx** (`GET /trigger/status/:code`), **cross-service** (`POST /downstream/dispatch`), **fault-inject a destination** (`POST /trigger/fault/loki`), and **load burst** (`POST /trigger/burst`). This task ships the page, the card layout, the fire actions, and per-fire UX (loading state, success/failure toast); the result-linking ("View in Explorer →" + Explorer auto-pivot) lands in P13-2. The burst generator is what makes the Overview charts and live tail feel alive in a demo.

### Acceptance Criteria

- [ ] `apps/web/app/trigger/page.tsx` renders a responsive card grid (one card per the **12** triggers in `DASHBOARD.md` §8).
- [ ] Each card has a title, a one-line "Demonstrates" description, the target endpoint shown as a mono badge, and a **Fire** button (forms for cards needing input — e.g. status `:code`, burst `N`/`T`).
- [ ] Firing a card calls the documented endpoint via the `NEXT_PUBLIC_API_URL` base (a typed `triggerApi` client in `apps/web/lib/`), shows a per-card loading state, and surfaces a `sonner` success/error toast.
- [ ] The **HTTP 4xx/5xx** card lets the user pick a code (e.g. `400`/`404`/`500`/`503`) → `GET /trigger/status/:code`; the **load burst** card takes `N` (count) + `T` (seconds) → `POST /trigger/burst`.
- [ ] The **fault-inject** card is clearly labelled as fail-soft (`POST /trigger/fault/loki` points a destination at a dead host → `LOGGER_DESTINATION_WRITE_FAILED`, app keeps serving).
- [ ] The page uses the shared app shell + design tokens (forced-dark orange/glass, `new-york` shadcn `Card`/`Button`/`Input`) — visually one product with the rest of `apps/web`.
- [ ] No client-side aggregation or business logic — cards are thin fire-and-report wrappers over the API.

### Files to create / modify

- `apps/web/app/trigger/page.tsx` — Trigger Center page (card grid).
- `apps/web/components/trigger/trigger-card.tsx` — reusable card (title, endpoint badge, fire button, input slot).
- `apps/web/components/trigger/trigger-grid.tsx` — the grid + the 12 trigger definitions.
- `apps/web/lib/trigger-api.ts` — typed client hitting the demo endpoints via `NEXT_PUBLIC_API_URL`.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer building a React 19 dashboard page against an existing design system.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13 + §2 Global Conventions, and `docs/DASHBOARD.md` §8 Trigger Center). This is task P13-1. The `apps/web` Next.js 16 + React 19 + Tailwind v4 + shadcn `new-york` skeleton (Phase 11) and the Overview/Explorer/Live-Tail pages (Phase 12) already exist; reuse the app shell, tokens, and the `NEXT_PUBLIC_API_URL` base. The Trigger Center is the analog of `nest-auth-example`'s feature playground: a grid of cards that fire `apps/api` demo endpoints to emit each kind of log.
> Objective: Ship `app/trigger/page.tsx` with a responsive grid of the **12** trigger cards from `DASHBOARD.md` §8, each firing its documented endpoint with a loading state + toast. (Result-linking to the Explorer is P13-2.)
> Steps:
>
> 1. Create the typed client `apps/web/lib/trigger-api.ts`. Model each trigger as a typed descriptor and a `fire()` helper:
>    ```typescript
>    // apps/web/lib/trigger-api.ts
>    const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
>
>    export interface TriggerResult {
>      requestId: string | null
>      traceId: string | null
>      status: number
>      body: unknown
>    }
>
>    async function call(method: string, path: string, body?: unknown): Promise<TriggerResult> {
>      const res = await fetch(`${API}${path}`, {
>        method,
>        headers: body ? { 'content-type': 'application/json' } : undefined,
>        body: body ? JSON.stringify(body) : undefined,
>      })
>      // The library echoes correlation ids on every response (Phase 4 middleware).
>      const requestId = res.headers.get('x-request-id')
>      const traceId = res.headers.get('x-trace-id')
>      return { requestId, traceId, status: res.status, body: await res.json().catch(() => null) }
>    }
>
>    export const triggerApi = {
>      level: (level: string) => call('POST', '/trigger/level', { level }),
>      order: () => call('POST', '/orders', { sku: 'DEMO-1', qty: 1 }),
>      payment: () => call('POST', '/payments', { orderId: 'demo', amount: 4200 }),
>      piiSignup: () => call('POST', '/pii-demo/signup', { email: 'a@b.co', password: 's3cret', cpf: '111', cardNumber: '4111' }),
>      piiNested: () => call('POST', '/pii-demo/nested', { depth: 5 }),
>      echoHeaders: () => call('GET', '/pii-demo/echo-headers'),
>      huge: () => call('POST', '/pii-demo/huge', { padKb: 80 }),
>      slow: () => call('GET', '/orders/slow'),
>      status: (code: number) => call('GET', `/trigger/status/${code}`),
>      dispatch: () => call('POST', '/downstream/dispatch', { job: 'demo' }),
>      faultLoki: () => call('POST', '/trigger/fault/loki'),
>      burst: (count: number, seconds: number) => call('POST', '/trigger/burst', { count, seconds }),
>    }
>    ```
> 2. Create `apps/web/components/trigger/trigger-card.tsx` — a shadcn `Card` with `CardHeader` (title + `Demonstrates` line), a mono endpoint `Badge`, an optional input slot (`children`), and a `Button` that runs the passed `onFire`, toggling a local `isFiring` state and emitting a `sonner` toast on success/failure. Keep it presentational; the fire callback is injected.
> 3. Create `apps/web/components/trigger/trigger-grid.tsx` declaring the **12** trigger descriptors (title, demonstrates, endpoint label, the `triggerApi` call, and any inputs). For the status card render a small select of `[400, 404, 500, 503]`; for the burst card render `count` + `seconds` number inputs.
> 4. Create `apps/web/app/trigger/page.tsx` — a server component that renders the page header ("Trigger Center / Log Playground", a one-line intro) inside the shared shell, then mounts `<TriggerGrid />` (a `'use client'` component since it holds fire state).
> 5. Lay out the grid responsively (e.g. `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`). Use only the existing tokens/components — no new design language.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (TypeScript 5.9 strict, ESM, `printWidth 100`, `singleQuote`, English-only).
> - Do NOT aggregate or transform log data in the browser; cards only **fire** endpoints and report the response (the Explorer/Overview own the reading side).
> - Do NOT hardcode the API origin — read `NEXT_PUBLIC_API_URL` (Appendix A) with a localhost fallback.
> - Match the endpoints in `DASHBOARD.md` §8 **exactly** (path, method, the emitted feature); do not invent new routes.
> - Defer the "View in Explorer →" link + Explorer auto-pivot to P13-2 — this task only fires and toasts.
>   Verification:
>
> - `pnpm --filter web build` — expected: compiles with zero type errors.
> - `pnpm --filter web dev`, open `/trigger` — expected: 12 cards render in the dark/glass shell; clicking **Fire** on "Emit each level" shows a loading state then a success toast (with `apps/api` running).
> - `node -e "import('./apps/web/lib/trigger-api.ts')"` (or a Vitest import smoke) — expected: the module exposes all 12 trigger methods.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P13-2 — Trigger cards — emitted `logKey`(s) + auto-pivot Explorer ("View in Explorer →")

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–2 h)
- **Depends on:** `P13-1`

### Description

Close the Trigger Center loop (`DASHBOARD.md` §8): every card must **show the `logKey`(s) it emits** and, after firing, expose a **"View in Explorer →"** link that **auto-pivots the Explorer** (Phase 12) to the freshly-produced `requestId`/`traceId` so the user immediately sees what they fired. This is the "fire → see it land" payoff. The pivot reuses the Explorer's `nuqs`-encoded URL state (Phase 12 put time-range/source/filters in the URL): the link navigates to `/explorer?requestId=…` (or `?traceId=…`) on a relative time range covering "now", and the Explorer renders that single request (across `api` + `worker` for the cross-service card). The expected `logKey`(s) per card come straight from `DASHBOARD.md` §8 (e.g. `ORDER_CREATE_SUCCESS`, `PAYMENT_REFUND_FAILED`, `HTTP_REQUEST_CLIENT_ERROR`/`_SERVER_ERROR`, `METHOD_SLOW_EXECUTION`, `LOGGER_ENTRY_TRUNCATED`, `LOGGER_DESTINATION_WRITE_FAILED`).

### Acceptance Criteria

- [ ] Each trigger card statically lists the **expected `logKey`(s)** it emits (as mono badges), sourced from `DASHBOARD.md` §8.
- [ ] After a successful fire, the card shows the returned `requestId` and/or `traceId` and a **"View in Explorer →"** link.
- [ ] The link navigates to the Explorer with the correlation id pre-applied via the existing `nuqs` URL params (`/explorer?requestId=<id>` or `?traceId=<id>`), on a relative time window that includes "now".
- [ ] The cross-service card's link uses `traceId` (so the Explorer shows both `api` + `worker` lines for the one request).
- [ ] The burst card, after firing, links to the Explorer filtered to the burst window (time range) rather than a single id.
- [ ] `logKey` strings shown are validated against `LOG_KEYS_CONVENTION_REGEX` imported from `@bymax-one/nest-logger/shared` (a malformed literal fails a unit test).
- [ ] Navigating from a card lands on a non-empty Explorer result for that request (with `apps/api` running).

### Files to create / modify

- `apps/web/components/trigger/trigger-grid.tsx` — add `logKeys: string[]` + post-fire result + Explorer link per descriptor.
- `apps/web/components/trigger/trigger-card.tsx` — render the `logKey` badges + the result/`View in Explorer →` affordance.
- `apps/web/lib/explorer-link.ts` — helper building the `nuqs`-compatible Explorer href from a `{ requestId?, traceId?, from?, to? }`.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer wiring cross-page deep-links via typed URL state.
> Context: Task P13-2 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13; see `docs/DASHBOARD.md` §8 (each card "shows the emitted `logKey`(s) and, after firing, a **View in Explorer →** link pre-filtered to the resulting `requestId`/`traceId`") and §6 (the Explorer's `nuqs` URL filters from Phase 12). The Explorer already reads `requestId`/`traceId`/`from`/`to` from the URL (Phase 12). The `LOG_KEYS_CONVENTION_REGEX` lives in the isomorphic `/shared` subpath.
> Objective: Make every trigger card declare its expected `logKey`(s) and, post-fire, deep-link into the Explorer pre-filtered to the new `requestId`/`traceId` (or burst time window).
> Steps:
>
> 1. Create `apps/web/lib/explorer-link.ts` building an Explorer href from the same param names Phase 12's `nuqs` parsers use:
>    ```typescript
>    // apps/web/lib/explorer-link.ts
>    export interface ExplorerTarget {
>      requestId?: string
>      traceId?: string
>      from?: string // ISO; e.g. fire time − 1m
>      to?: string // ISO; e.g. now + 1m
>    }
>
>    export function explorerHref(t: ExplorerTarget): string {
>      const p = new URLSearchParams()
>      if (t.traceId) p.set('traceId', t.traceId)
>      if (t.requestId) p.set('requestId', t.requestId)
>      // Live tail needs a RELATIVE range; default to last 15m so "now" is covered.
>      p.set('from', t.from ?? 'now-15m')
>      if (t.to) p.set('to', t.to)
>      return `/explorer?${p.toString()}`
>    }
>    ```
> 2. Extend each descriptor in `trigger-grid.tsx` with `logKeys: string[]` taken verbatim from `DASHBOARD.md` §8 (e.g. order → `['ORDER_CREATE_SUCCESS']`, payment → `['PAYMENT_REFUND_FAILED', 'HTTP_EXCEPTION_HANDLED']`, status → `['HTTP_REQUEST_CLIENT_ERROR', 'HTTP_REQUEST_SERVER_ERROR']`, slow → `['METHOD_SLOW_EXECUTION']`, huge → `['LOGGER_ENTRY_TRUNCATED']`, faultLoki → `['LOGGER_DESTINATION_WRITE_FAILED']`, dispatch → `['DOWNSTREAM_DISPATCH_SUCCESS']`).
> 3. In `trigger-card.tsx`, render the `logKeys` as mono `Badge`s under the description. After a successful fire, store the `TriggerResult` and render the returned `requestId`/`traceId` plus a `next/link` to `explorerHref({ traceId } | { requestId })`. For the cross-service card prefer `traceId`; for burst, link with a `{ from, to }` window instead of an id.
> 4. Guard the declared `logKeys` at module load (or in a unit test) against `LOG_KEYS_CONVENTION_REGEX`:
>    ```typescript
>    import { LOG_KEYS_CONVENTION_REGEX } from '@bymax-one/nest-logger/shared'
>    // every declared logKey must match the library convention
>    for (const t of TRIGGERS) for (const k of t.logKeys) {
>      if (!LOG_KEYS_CONVENTION_REGEX.test(k)) throw new Error(`Invalid logKey literal: ${k}`)
>    }
>    ```
> 5. Ensure the Explorer link opens on a relative range (so the live tail / keyset window includes the just-fired request).
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (strict TS, ESM, English-only).
> - Reuse Phase 12's exact `nuqs` param names — do NOT invent a parallel query-state scheme; the Explorer must read these without changes.
> - Import `LOG_KEYS_CONVENTION_REGEX` from `@bymax-one/nest-logger/shared` (the isomorphic subpath) — never re-declare the regex locally.
> - `logKey` literals must be copied from `DASHBOARD.md` §8 verbatim; do not paraphrase or rename keys.
>   Verification:
>
> - `pnpm --filter web build` — expected: zero type errors; the `logKey`-regex guard does not throw.
> - With `apps/api` up: fire "Structured success", click **View in Explorer →** — expected: the Explorer opens filtered to that `requestId` and shows the `ORDER_CREATE_SUCCESS` row.
> - Fire "Cross-service", follow the link — expected: the Explorer shows both `api` and `worker` rows sharing one `traceId`.
> - A Vitest asserting a deliberately bad literal (e.g. `'badkey'`) fails `LOG_KEYS_CONVENTION_REGEX` — expected: the guard rejects it.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P13-3 — `app/alerts/page.tsx` — rule form (`expr + threshold + for`) + Loki ruler YAML

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–2 h)
- **Depends on:** `Phase 12`

### Description

Build the **rule-authoring** half of Alerts & Incidents (`/alerts`, `DASHBOARD.md` §9). A form creates/edits alert rules with the shape **`expr + threshold + for-duration`**, evaluated server-side on a NestJS cron over the **same `/logs` query layer** the Explorer uses (Phase 10 `alerts/` module). The form must support the rule shapes the library's `logKey` convention enables — **error spike** (`count(level ∈ {error,fatal}) by logKey over 5m > N`), **any FATAL** (`count(level = fatal) over 1m ≥ 1`), **specific failure** (`rate(PAYMENT_REFUND_FAILED) over 5m > X`), **heartbeat/absence** (`count(HTTP_REQUEST_SUCCESS) over 10m == 0`) — and render the **equivalent Loki ruler YAML** beside the form as a teaching device (the "verify in Grafana" habit). This page is a **scoped demo**, so it carries the §9 callout. This task delivers the page shell, the rule list, the create/edit form (wired to `GET/POST/PATCH /alerts/rules`), and the live YAML preview; channels (P13-4) and incidents (P13-5) plug into the same page.

### Acceptance Criteria

- [ ] `apps/web/app/alerts/page.tsx` renders inside the shared shell with the **🎓 scoped demo of log-based alerting + on-call** callout (text per `DASHBOARD.md` §9).
- [ ] A rule form captures `name`, `expr` (metric + `logKey`/level selector + comparator + threshold `N`), a `for`-duration, and severity; it lists existing rules from `GET /alerts/rules`.
- [ ] Create/edit persists via `POST` / `PATCH /alerts/rules`; the list refreshes (TanStack Query invalidation).
- [ ] Presets for the four canonical shapes (error spike / any FATAL / specific failure / heartbeat-absence) one-click-fill the form.
- [ ] A **live "Loki ruler YAML" panel** renders the equivalent rule (`groups: [{ rules: [{ alert, expr, for, labels, annotations }] }]`) and updates as the form changes.
- [ ] `logKey` inputs autocomplete/validate against `LOG_KEYS_CONVENTION_REGEX` from `@bymax-one/nest-logger/shared` (typo'd key flagged inline).
- [ ] Best-practice guidance is surfaced in-UI (prefer **rate** over raw count; combine **error-rate-high AND volume-above-floor**; **aggregate** one notification per pattern; **auto-resolve**).

### Files to create / modify

- `apps/web/app/alerts/page.tsx` — Alerts page shell + scoped-demo callout + sections (rules / channels / incidents).
- `apps/web/components/alerts/rule-form.tsx` — the `expr + threshold + for` form + presets.
- `apps/web/components/alerts/rule-list.tsx` — existing rules table (from `/alerts/rules`).
- `apps/web/components/alerts/ruler-yaml.tsx` — live Loki ruler YAML preview.
- `apps/web/lib/alerts-api.ts` — typed client for `/alerts/rules` (+ later `/alerts/channels`, `/incidents`).
- `apps/web/lib/ruler-yaml.ts` — pure function `ruleToRulerYaml(rule) → string`.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer building a forms-heavy ops page against an existing API.
> Context: Task P13-3 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13; see `docs/DASHBOARD.md` §9 (Alerts & Incidents) and §12 (`GET/POST/PATCH /alerts/rules`). The `alerts/` backend (rules cron + channels + incidents) is delivered in Phase 10; this page is its UI. Rules are **`expr + threshold + for-duration`**, evaluated by a NestJS cron over the `/logs` query layer. This is a **scoped demo** of `Loki ruler → Alertmanager → PagerDuty/Slack`, so it must carry the §9 callout. `LOG_KEYS_CONVENTION_REGEX` is in the `/shared` subpath.
> Objective: Ship `app/alerts/page.tsx` with the rule list + create/edit form (`expr + threshold + for` + severity + presets) wired to `/alerts/rules`, plus a live equivalent **Loki ruler YAML** preview.
> Steps:
>
> 1. Create `apps/web/lib/alerts-api.ts` (TanStack Query-friendly fetchers) for `listRules()` (`GET /alerts/rules`), `createRule(body)` (`POST`), `updateRule(id, body)` (`PATCH`). Type the rule:
>    ```typescript
>    export type AlertMetric = 'count' | 'rate'
>    export interface AlertRule {
>      id?: string
>      name: string
>      metric: AlertMetric
>      level?: 'error' | 'fatal' | 'info' // for level-based shapes
>      logKey?: string // exact or PREFIX_* (e.g. PAYMENT_REFUND_FAILED)
>      comparator: '>' | '>=' | '==' | '<'
>      threshold: number
>      window: string // e.g. '5m'
>      for: string // e.g. '2m' (sustained)
>      severity: 'critical' | 'warning'
>    }
>    ```
> 2. Create `apps/web/lib/ruler-yaml.ts` — a pure `ruleToRulerYaml(rule)` that emits a Loki ruler group, e.g. for an error-spike rule:
>    ```yaml
>    groups:
>      - name: nest-logger-example
>        rules:
>          - alert: PaymentRefundFailures
>            expr: |
>              sum by (logKey) (count_over_time({service="api"} | json | level=~"error|fatal" [5m])) > 10
>            for: 2m
>            labels: { severity: critical }
>            annotations: { summary: "logKey {{ $labels.logKey }} error spike" }
>    ```
>    (Build the `expr` from `metric`/`level`/`logKey`/`comparator`/`threshold`/`window`; `rate` → `rate(... [window])`, `count` → `count_over_time(... [window])`.)
> 3. Create `rule-form.tsx` (a `'use client'` form): fields for `name`, `metric`, `level`/`logKey`, `comparator`, `threshold`, `window`, `for`, `severity`; four **preset** buttons that fill the canonical shapes from `DASHBOARD.md` §9. Validate `logKey` against `LOG_KEYS_CONVENTION_REGEX` and flag inline. On submit call `createRule`/`updateRule` and invalidate the rules query.
> 4. Create `rule-list.tsx` (rules table from `listRules()`, edit/delete actions) and `ruler-yaml.tsx` (renders `ruleToRulerYaml(currentFormValue)` in a mono code block, updating live).
> 5. Create `app/alerts/page.tsx` — shell + the **🎓 scoped demo** callout (verbatim §9 wording) + sections: **Rules** (form + list here), with placeholders/anchors for **Channels** (P13-4) and **Incidents** (P13-5). Surface the best-practice tips (rate-not-count, error-rate-AND-volume, aggregate, auto-resolve) as inline helper text.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (strict TS, ESM, English-only, `printWidth 100`).
> - The cron/evaluation lives in `apps/api` (Phase 10) — the page only **authors** rules and previews YAML; do NOT evaluate rules in the browser.
> - `ruleToRulerYaml` must be a **pure** function (no I/O) so it is trivially unit/mutation-testable.
> - Honest scope: the page MUST display the §9 scoped-demo callout — do not present it as production alerting.
> - Validate `logKey` via `LOG_KEYS_CONVENTION_REGEX` from `/shared`; never inline the pattern.
>   Verification:
>
> - `pnpm --filter web build` — expected: zero type errors.
> - With `apps/api` up: create an "error spike" rule via a preset → it appears in the rule list; the YAML panel shows a matching `count_over_time(... [5m]) > N` group.
> - A Vitest on `ruleToRulerYaml` asserts `rate` vs `count` and the `for`/`labels` lines render exactly.
> - Typing `payment_bad key` into `logKey` — expected: inline "invalid logKey" flag (fails `LOG_KEYS_CONVENTION_REGEX`).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P13-4 — Alerts — notification channel registry (Slack/webhook/email-mock, routing)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–2 h)
- **Depends on:** `P13-3`

### Description

Add the **notification channel registry** to the Alerts page (`DASHBOARD.md` §9). A channel is a receiver — **Slack webhook**, **generic webhook**, or **email-mock** — with **severity-based routing** (critical → webhook + Slack; warning → Slack only). Deliveries are **mockable/logged** so the demo runs offline, and each channel is **test-fireable** (a "Send test" button posts a synthetic alert through the channel and reports success/failure). This is the bridge between a firing rule (P13-3) and an incident (P13-5). UI wires to `GET/POST /alerts/channels` (Phase 10), with the `test-fire` calling the same endpoint family.

### Acceptance Criteria

- [ ] A **Channels** section on `/alerts` lists registered channels from `GET /alerts/channels` with type, target (redacted/masked where sensitive), and routed severities.
- [ ] Create/edit a channel of type `slack` | `webhook` | `email-mock` via `POST /alerts/channels` (URL for slack/webhook, address for email-mock).
- [ ] **Severity routing** is configurable per channel (which of `critical`/`warning` it receives); the §9 default (critical → webhook + Slack; warning → Slack only) is the seed.
- [ ] Each channel has a **"Send test"** action that test-fires a synthetic alert and surfaces the delivery result (toast + inline status); offline-safe (deliveries are mocked/logged).
- [ ] Sensitive fields (webhook URLs) are never rendered in full — shown masked — reinforcing the redaction story.
- [ ] The section reuses the shared design tokens/components (no new design language).

### Files to create / modify

- `apps/web/components/alerts/channel-registry.tsx` — channel list + create/edit + routing toggles + "Send test".
- `apps/web/app/alerts/page.tsx` — mount the Channels section between Rules and Incidents.
- `apps/web/lib/alerts-api.ts` — add `listChannels()`, `createChannel()`, `testChannel(id)` (extends P13-3 client).

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer building a registry UI with test-fire actions.
> Context: Task P13-4 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13; see `docs/DASHBOARD.md` §9 ("Notification channels — a registry of receivers (Slack webhook, generic webhook, email-mock) with severity-based routing … Deliveries are mockable/logged so the demo runs offline; channels can be test-fired") and §12 (`GET/POST /alerts/channels`, "test-fireable"). The backend lives in Phase 10. This plugs into the Alerts page from P13-3.
> Objective: Ship the channel registry section — list/create/edit channels (`slack`/`webhook`/`email-mock`) with severity routing and a per-channel "Send test".
> Steps:
>
> 1. Extend `apps/web/lib/alerts-api.ts`:
>    ```typescript
>    export type ChannelType = 'slack' | 'webhook' | 'email-mock'
>    export interface NotificationChannel {
>      id?: string
>      type: ChannelType
>      target: string // slack/webhook URL, or email-mock address
>      severities: Array<'critical' | 'warning'> // which severities route here
>    }
>    export const listChannels = () => get<NotificationChannel[]>('/alerts/channels')
>    export const createChannel = (b: NotificationChannel) => post('/alerts/channels', b)
>    export const testChannel = (id: string) => post(`/alerts/channels/${id}/test`, {})
>    ```
> 2. Create `channel-registry.tsx` (`'use client'`): a list (type icon, masked target, severity chips), a create/edit form (type select; URL/address input; severity checkboxes for `critical`/`warning`), and a **Send test** button per row calling `testChannel(id)` then toasting the result. Seed the §9 routing default (critical → webhook + Slack; warning → Slack only) as the form's initial routing.
> 3. Mask sensitive targets in the list — render e.g. `https://hooks.slack.com/…/****` (show scheme + host, mask the token) so secrets never appear in full.
> 4. Mount `<ChannelRegistry />` in `app/alerts/page.tsx` between the Rules and Incidents sections.
> 5. Keep all delivery effects on the server (Phase 10 mocks/logs them) — the UI only triggers and reports.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (strict TS, ESM, English-only).
> - Channels must be **offline-safe** — the UI must not assume a real Slack/webhook is reachable; "Send test" reports whatever the mock/log channel returns.
> - Never render a full webhook URL/token — always mask (consistency with the redaction-at-source story in P13-8).
> - Reuse the P13-3 `alerts-api.ts` client and TanStack Query patterns — do not introduce a second data-fetching style.
>   Verification:
>
> - `pnpm --filter web build` — expected: zero type errors.
> - With `apps/api` up: add a Slack channel routed to `critical` → it lists with a masked target; **Send test** reports a delivery result (mock).
> - A Vitest asserts the masking helper hides the token segment of a webhook URL.
> - Editing routing to add `warning` persists via `POST /alerts/channels` and the chips update.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P13-5 — Alerts — incident lifecycle (Triggered→Ack→Snoozed→Resolved) + timeline

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–2 h)
- **Depends on:** `P13-3`, `P13-4`

### Description

Add the **incident lifecycle** to the Alerts page (`DASHBOARD.md` §9) — the PagerDuty-style flow **Triggered → Acknowledged → Snoozed (1h/4h/8h/24h) → Resolved**. Every transition appends to an **immutable timeline** (actor + timestamp), and each incident **deep-links back to the Explorer** pre-filtered to the matching `logKey` + time window (the rule that fired it). Lifecycle actions go through `GET/PATCH /incidents` (Phase 10). The timeline is **append-only/immutable** (it pairs with the audit story in P13-8): the UI renders it read-only and never mutates past entries.

### Acceptance Criteria

- [ ] An **Incidents** section on `/alerts` lists incidents from `GET /incidents` with current state, source rule, `logKey`, and opened-at.
- [ ] Actions transition state via `PATCH /incidents`: **Acknowledge**, **Snooze** (menu of 1h/4h/8h/24h), **Resolve** — each gated by the current state (e.g. can't resolve an already-resolved incident).
- [ ] Each incident shows an **immutable timeline** of transitions (`{ actor, action, at }`), newest-first, rendered read-only.
- [ ] Each incident has a **"View in Explorer →"** deep-link pre-filtered to the incident's `logKey` + firing time window (reuses the P13-2 `explorerHref` helper).
- [ ] Snooze sets a visible "snoozed until" time; the row reflects the snoozed state until it lapses or is resolved.
- [ ] Lifecycle actions are gated by RBAC role (Operator/Admin can ack/snooze/resolve; Viewer cannot) — consistent with §10 / P13-7.
- [ ] (If Saved Views exist) a "promote saved view → alert rule" affordance is present (the Datadog "save view → monitor" pattern, §9) — optional, non-blocking.

### Files to create / modify

- `apps/web/components/alerts/incident-list.tsx` — incident table + lifecycle actions + per-incident timeline + Explorer deep-link.
- `apps/web/components/alerts/incident-timeline.tsx` — read-only immutable transition timeline.
- `apps/web/app/alerts/page.tsx` — mount the Incidents section after Channels.
- `apps/web/lib/alerts-api.ts` — add `listIncidents()`, `transitionIncident(id, action, opts?)`.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer modelling a state-machine UI with an immutable audit timeline.
> Context: Task P13-5 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13; see `docs/DASHBOARD.md` §9 ("Incidents — the PagerDuty lifecycle: Triggered → Acknowledged → Snoozed (1h/4h/8h/24h) → Resolved, every transition appended to an immutable timeline (actor + timestamp). Each incident deep-links back to the Explorer pre-filtered to the matching logKey + time window") and §12 (`GET/PATCH /incidents`). RBAC roles come from §10 (Viewer/Operator/Admin). Reuse the `explorerHref` helper from P13-2.
> Objective: Ship the Incidents section — list, lifecycle transitions (ack/snooze/resolve, state-gated), an immutable per-incident timeline, and an Explorer deep-link.
> Steps:
>
> 1. Extend `apps/web/lib/alerts-api.ts`:
>    ```typescript
>    export type IncidentState = 'triggered' | 'acknowledged' | 'snoozed' | 'resolved'
>    export interface IncidentEvent { actor: string; action: string; at: string }
>    export interface Incident {
>      id: string
>      ruleName: string
>      logKey: string
>      state: IncidentState
>      openedAt: string
>      snoozedUntil?: string
>      firedFrom: string // ISO window start
>      firedTo: string // ISO window end
>      timeline: IncidentEvent[]
>    }
>    export const listIncidents = () => get<Incident[]>('/incidents')
>    export const transitionIncident = (id: string, action: 'ack' | 'snooze' | 'resolve', opts?: { durationH?: number }) =>
>      patch(`/incidents/${id}`, { action, ...opts })
>    ```
> 2. Create `incident-timeline.tsx` — renders `incident.timeline` newest-first, each row `{actor} {action} · {relative time}`, strictly read-only (no edit/delete affordances — it is immutable).
> 3. Create `incident-list.tsx` (`'use client'`): a table of incidents; per row a state badge and a state-gated action menu — **Acknowledge** (when `triggered`), **Snooze** with a 1h/4h/8h/24h submenu (when `triggered`/`acknowledged`), **Resolve** (when not already `resolved`). Each action calls `transitionIncident(...)` then invalidates the incidents query. Disable actions the RBAC role lacks (Viewer is read-only; gate via the global role from §10).
> 4. Add a **View in Explorer →** link per incident using `explorerHref({ from: incident.firedFrom, to: incident.firedTo })` plus the `logKey` filter param (reuse the Explorer's `nuqs` `logKey` param).
> 5. Mount `<IncidentList />` in `app/alerts/page.tsx` after Channels. (Optional) add a "promote saved view → rule" button if Saved Views are available.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (strict TS, ESM, English-only).
> - The timeline is **immutable** — the UI must never offer to edit or delete past transition entries; it only appends via server transitions.
> - Transitions must be **state-gated** in the UI (don't show "Resolve" on a resolved incident; don't show "Acknowledge" once acknowledged).
> - RBAC: Viewer cannot transition incidents — reuse the §10 global role, do not invent a separate permission model (aligns with P13-7).
> - Reuse `explorerHref` from P13-2 — do not duplicate the link builder.
>   Verification:
>
> - `pnpm --filter web build` — expected: zero type errors.
> - With `apps/api` up + a firing rule: an incident appears `triggered`; **Acknowledge** → `acknowledged` and a timeline entry is appended; **Snooze 4h** → `snoozed` with a "snoozed until" time; **Resolve** → `resolved` and Resolve is no longer offered.
> - **View in Explorer →** opens the Explorer filtered to the incident's `logKey` + time window.
> - As **Viewer** (role switch), lifecycle actions are disabled.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P13-6 — `app/maintenance/page.tsx` Retention (TTL sweep + Loki echo) + 🎓 callout

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–2 h)
- **Depends on:** `Phase 12`

### Description

Build the **Retention & storage** section of Maintenance & Governance (`/maintenance`, `DASHBOARD.md` §10). It surfaces the real **TTL sweep**: a NestJS cron deletes `application_logs` rows older than `RETENTION_DAYS` (default 30); the panel shows **next-sweep time** + **rows-pending-deletion**, and (Admin) lets you trigger/configure it via `GET/PATCH /maintenance/retention` (Phase 10). Beside it sits a **read-only echo of the Loki retention config**, making the **two-tier story** concrete: durable `warn`+ in Postgres (TTL'd) + full `info`+ aggregation in Loki (its own retention via the `compactor` with `retention_enabled: true` + a `delete_request_store`). The section carries the **🎓 scoped demo of tiered retention** callout (§10). This task ships the Maintenance page shell + the Retention section; Export/RBAC (P13-7) and the redaction hero + audit (P13-8) mount into the same page.

### Acceptance Criteria

- [ ] `apps/web/app/maintenance/page.tsx` renders inside the shared shell with section anchors for Retention, Export, RBAC, Redaction, and Audit.
- [ ] The **Retention** panel shows TTL = `RETENTION_DAYS` (default 30), **next-sweep time**, and **rows-pending-deletion**, fetched from `GET /maintenance/retention`.
- [ ] An **Admin-only** control updates TTL / triggers a sweep via `PATCH /maintenance/retention` (hidden/disabled for non-Admin).
- [ ] A **read-only Loki retention echo** sits beside it (the `retention_period` + a note that the `compactor` has `retention_enabled: true` + a `delete_request_store`, per `DASHBOARD.md` §10).
- [ ] The section carries the **🎓 scoped demo of tiered retention** callout (verbatim §10 wording, incl. the "real platforms add warm/cold object-storage tiers (S3/Glacier) + per-tenant overrides" line).
- [ ] The two-tier asymmetry (Postgres `warn`+ durable vs Loki `info`+ full) is explained in-panel so differing volumes read as a lesson.

### Files to create / modify

- `apps/web/app/maintenance/page.tsx` — Maintenance page shell + section anchors.
- `apps/web/components/maintenance/retention-panel.tsx` — TTL sweep status + Admin config + Loki echo + scoped-demo callout.
- `apps/web/components/maintenance/scoped-demo-callout.tsx` — reusable "🎓 scoped demo of <prod feature>" callout component.
- `apps/web/lib/maintenance-api.ts` — typed client for `/maintenance/retention`.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer building an ops/governance page.
> Context: Task P13-6 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13; see `docs/DASHBOARD.md` §10 (Maintenance & Governance → Retention & storage) and §12 (`GET/PATCH /maintenance/retention`, "Admin only"). The TTL sweep cron + Loki `compactor` retention live in `apps/api`/infra (Phases 10/1). `RETENTION_DAYS` is in Appendix A (default 30). This page must carry the §10 **🎓 scoped demo of tiered retention** callout; every scoped-demo feature in this phase carries a "🎓 scoped demo of <prod feature>" callout.
> Objective: Ship `app/maintenance/page.tsx` + the Retention panel (TTL sweep status, Admin config, read-only Loki echo, scoped-demo callout).
> Steps:
>
> 1. Create `apps/web/components/maintenance/scoped-demo-callout.tsx` — a small presentational component:
>    ```tsx
>    // apps/web/components/maintenance/scoped-demo-callout.tsx
>    export function ScopedDemoCallout({ feature, children }: { feature: string; children: React.ReactNode }) {
>      return (
>        <div className="rounded-md border border-border bg-glass-card-bg p-3 text-sm text-muted-foreground">
>          <span aria-hidden>🎓</span>{' '}
>          <strong>Scoped demo of {feature}.</strong> {children}
>        </div>
>      )
>    }
>    ```
> 2. Create `apps/web/lib/maintenance-api.ts` — `getRetention()` (`GET /maintenance/retention` → `{ ttlDays, nextSweepAt, rowsPendingDeletion, lokiRetentionPeriod }`) and `updateRetention(body)` (`PATCH`).
> 3. Create `retention-panel.tsx` (`'use client'`): show TTL (`ttlDays`), next-sweep (`nextSweepAt`, relative), rows-pending-deletion; beside it a read-only "Loki retention" card echoing `lokiRetentionPeriod` with a note that the `compactor` has `retention_enabled: true` + a `delete_request_store`. Gate the TTL edit / "Run sweep now" control behind the Admin role (global role from §10); non-Admins see it disabled. Render `<ScopedDemoCallout feature="tiered retention">…</ScopedDemoCallout>` with the §10 warm/cold + per-tenant-override text.
> 4. Create `app/maintenance/page.tsx` — the shell, a page header, and section anchors (`#retention`, `#export`, `#rbac`, `#redaction`, `#audit`); mount `<RetentionPanel />` under `#retention`. Leave the other sections as anchored placeholders for P13-7/P13-8.
> 5. Add the two-tier explainer text (Postgres `warn`+ durable, TTL'd; Loki `info`+ full, own retention) so the volume asymmetry reads as a lesson.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (strict TS, ESM, English-only).
> - The sweep/cron executes in `apps/api` — the UI only **reads** status and (Admin) **requests** a config change; do NOT delete rows from the browser.
> - The Loki echo is **read-only** — never offer to mutate Loki retention from this page.
> - The `ScopedDemoCallout` component is reused by P13-7 (RBAC) and P13-8 (redaction) — keep it generic (`feature` + children).
> - Use the §10 callout wording verbatim; do not soften or omit the honest-scope framing.
>   Verification:
>
> - `pnpm --filter web build` — expected: zero type errors.
> - With `apps/api` up: `/maintenance` shows TTL=30, a next-sweep time, and rows-pending-deletion; the Loki echo card renders the retention period; the 🎓 callout is visible.
> - As a non-Admin role, the TTL edit / "Run sweep now" control is disabled; as **Admin**, `PATCH /maintenance/retention` succeeds and the panel refreshes.
> - A Vitest asserts `ScopedDemoCallout` renders the `feature` text and children.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P13-7 — Maintenance — JSON/CSV export (100k cap) + query-based RBAC (Viewer/Op/Admin)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–2 h)
- **Depends on:** `P13-6`

### Description

Add **Export** + **query-based RBAC** to Maintenance (`DASHBOARD.md` §10). **Export** downloads the **current filtered result set** (the Explorer's exact query, Phase 12) as **JSON** or **CSV** (columns `time, level, logKey, service, requestId, traceId, tenantId, msg`), hard-capped at **100k rows** with a truncation banner (Datadog's cap), via `GET /logs/export?format=json|csv` (Phase 10). **RBAC** is **query-based + multi-tenant**: roles **Viewer** (own `tenantId` only, no export, no alert edits) · **Operator** (read + ack/snooze/resolve + export) · **Admin** (manage rules/retention/channels, all tenants, see audit), enforced by **injecting a `tenantId` restriction into the existing SQL/LogQL query builder** — RBAC reuses the query layer, it doesn't bolt on a second auth path. Switching role/tenant in the global control (Phase 12) visibly changes what the Explorer can see and which actions are allowed. Both features carry the **🎓 scoped demo** callouts (§10).

### Acceptance Criteria

- [ ] An **Export** panel reuses the Explorer's current query (filters + time range + source) and downloads **JSON** or **CSV** via `GET /logs/export?format=…`.
- [ ] CSV columns are exactly `time, level, logKey, service, requestId, traceId, tenantId, msg`; the export honors the active `tenantId` RBAC restriction.
- [ ] A **100k-row hard cap** is enforced with a visible **truncation banner** when the result set exceeds it.
- [ ] Export is **gated to Operator/Admin** (Viewer cannot export) — control hidden/disabled for Viewer.
- [ ] An **RBAC** panel documents the three roles + their grants and reflects the **global role/tenant** control (Phase 12); switching tenant injects a `tenantId` restriction into every query (Explorer visibly scopes).
- [ ] The RBAC restriction is applied via the **shared query builder** (same param the `/logs` filter DTO uses), not a separate code path — the panel states this explicitly.
- [ ] Both Export and RBAC carry their **🎓 scoped demo** callouts (export → Datadog cap; RBAC → query-based data-access restrictions / wire to IdP or `@bymax-one/nest-auth`), per §10.

### Files to create / modify

- `apps/web/components/maintenance/export-panel.tsx` — JSON/CSV export reusing the Explorer query + truncation banner + role gate.
- `apps/web/components/maintenance/rbac-panel.tsx` — role/grant matrix + tenant-restriction explainer + scoped-demo callout.
- `apps/web/app/maintenance/page.tsx` — mount Export under `#export` and RBAC under `#rbac`.
- `apps/web/lib/maintenance-api.ts` — add `exportLogs(format, query)` building the `/logs/export` URL from the current `LogQuery`.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer wiring exports + a query-based RBAC demo.
> Context: Task P13-7 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13; see `docs/DASHBOARD.md` §10 (Export + RBAC) and §12 (`GET /logs/export`, 100k cap; the `LogQuery` filter DTO shared across `/logs*`). The global time-range/source/**tenant**/**role** controls live in the top bar from Phase 12 (URL via `nuqs`). RBAC works by **injecting a `tenantId` restriction into the existing query builder** — the same `tenantId` field the `/logs` filter already accepts. Both features are **scoped demos** and carry §10 callouts; reuse `<ScopedDemoCallout>` from P13-6.
> Objective: Ship Export (JSON/CSV, 100k cap, role-gated, reusing the Explorer query) + the RBAC panel (Viewer/Operator/Admin, tenant restriction via the shared query builder).
> Steps:
>
> 1. Extend `apps/web/lib/maintenance-api.ts` with an export URL builder from the current `LogQuery` (same shape as `docs/DASHBOARD.md` §12):
>    ```typescript
>    // reuses the Explorer's LogQuery (filters + time range + source + tenantId restriction)
>    export function exportUrl(format: 'json' | 'csv', q: LogQuery): string {
>      const p = new URLSearchParams({ format, source: q.source })
>      if (q.level) p.set('level', typeof q.level === 'string' ? q.level : `gte:${q.level.gte}`)
>      if (q.logKey) p.set('logKey', q.logKey)
>      if (q.service) p.set('service', q.service)
>      if (q.tenantId) p.set('tenantId', q.tenantId) // RBAC restriction injected here
>      if (q.traceId) p.set('traceId', q.traceId)
>      if (q.q) p.set('q', q.q)
>      if (q.from) p.set('from', q.from)
>      if (q.to) p.set('to', q.to)
>      return `${API}/logs/export?${p.toString()}`
>    }
>    ```
> 2. Create `export-panel.tsx` (`'use client'`): read the current `LogQuery` from the shared Explorer query-state (the `nuqs` params + global controls), render **Download JSON** / **Download CSV** buttons that navigate to `exportUrl(...)` (browser handles the file). Show a **truncation banner** when the server signals >100k rows (a `X-Truncated`/`X-Total` header or a `truncated` flag). Gate the whole panel to Operator/Admin (Viewer sees it disabled with a note). State the CSV columns (`time, level, logKey, service, requestId, traceId, tenantId, msg`). Add `<ScopedDemoCallout feature="exporting filtered logs">…Datadog's 100k cap…</ScopedDemoCallout>`.
> 3. Create `rbac-panel.tsx`: a role/grant matrix (Viewer/Operator/Admin × read-own-tenant / export / ack-incidents / manage-rules-retention-channels / all-tenants / see-audit) from §10; read the **global role + tenant** (Phase 12 control); explain that switching tenant **injects a `tenantId` restriction into the shared query builder** (`LogQuery.tenantId`), so the Explorer/Export/charts all scope identically. Add `<ScopedDemoCallout feature="query-based RBAC">…wire roles to your IdP / @bymax-one/nest-auth…</ScopedDemoCallout>`.
> 4. Mount Export under `#export` and RBAC under `#rbac` in `app/maintenance/page.tsx`.
> 5. Ensure role/tenant come from the **single** global control (Phase 12) — these panels read it; they do not create a second source of truth.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (strict TS, ESM, English-only).
> - Export must **reuse the Explorer's exact `LogQuery`** — do not build a second, divergent filter form.
> - The 100k cap + truncation banner are mandatory (match Datadog); the server enforces the cap, the UI surfaces it.
> - RBAC must be expressed as a **`tenantId` restriction on the shared query builder** — do NOT introduce a parallel authorization path; the panel must say so (honest scope).
> - Both panels carry their §10 **🎓 scoped demo** callouts via the reused `<ScopedDemoCallout>`.
>   Verification:
>
> - `pnpm --filter web build` — expected: zero type errors.
> - With `apps/api` up + filters applied in the Explorer: **Download CSV** yields a file whose header is exactly `time,level,logKey,service,requestId,traceId,tenantId,msg`, scoped to the active tenant.
> - Switching tenant in the global control visibly reduces the Explorer rows (tenant restriction); switching to **Viewer** disables the export control.
> - A Vitest asserts `exportUrl('csv', query)` sets `format=csv`, `source`, and the `tenantId` param when present.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P13-8 — Maintenance — redaction-at-source hero panel + `audit_events` table

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–2 h)
- **Depends on:** `P13-6`, `P13-7`

### Description

Ship the library's **strongest, most differentiated story** as a dedicated **redaction-at-source hero panel** (`DASHBOARD.md` §10) plus the **audit trail**. The hero panel shows **the same record from Postgres and Loki side by side**, both displaying `[REDACTED]` censor values, with a **"redacted at source — never stored raw"** badge: unlike Datadog Sensitive Data Scanner / OTel-collector redaction (which scrub **after** ingest and gate de-obfuscation behind an "unmask" permission), `@bymax-one/nest-logger` redacts **in-process** via `fast-redact` (97 default paths) **before the line leaves the service** — so Postgres and Loki only ever hold redacted data; **there is nothing to unmask because raw PII never left the process**. It links to the **active redact-path list** from `LogAuditService` (`@Inject(LOGGER_OPTIONS_TOKEN)`, OVERVIEW §13 / `listActiveRedactPaths()`). The **audit trail** renders the `audit_events` table (read-only) recording **actions** (not logins): who exported, who created/edited/muted an alert, who switched role/tenant, who changed retention — `{ actor, action, target, tenantId, at }` — via `GET /audit` (Phase 10). This closes the compliance loop and pairs with the redaction story.

### Acceptance Criteria

- [ ] A **redaction hero panel** under `#redaction` shows the **same record from Postgres and Loki side by side** (fetched via `GET /logs` `source=postgres` and `source=loki` for one `requestId`/`traceId`), both rendering `[REDACTED]` for PII fields.
- [ ] A **"redacted at source — never stored raw"** badge is prominent, with the explainer (in-process `fast-redact`, 97 default paths, before the line leaves the service; nothing to unmask).
- [ ] A link to the **active redact-path list** (from `LogAuditService.listActiveRedactPaths()` via an `apps/api` endpoint) is present.
- [ ] An **Audit trail** panel under `#audit` renders `audit_events` from `GET /audit` (read-only) with columns `actor, action, target, tenantId, at`, newest-first.
- [ ] The audit table is **read-only** (no edit/delete) and records **actions** (export, alert create/edit/mute, role/tenant switch, retention change) — not logins.
- [ ] The panel reuses the JSON viewer (`@uiw/react-json-view`) to display the side-by-side records so the `[REDACTED]` values are obvious.
- [ ] The redaction panel carries a callout distinguishing this from after-ingest scrubbing (the §10 "nothing to unmask" framing).

### Files to create / modify

- `apps/web/components/maintenance/redaction-hero.tsx` — side-by-side Postgres/Loki record + "redacted at source" badge + redact-path link.
- `apps/web/components/maintenance/audit-table.tsx` — read-only `audit_events` table.
- `apps/web/app/maintenance/page.tsx` — mount Redaction under `#redaction` and Audit under `#audit`.
- `apps/web/lib/maintenance-api.ts` — add `getAuditEvents()` (`GET /audit`) + `getActiveRedactPaths()` + a `getSameRecord(id)` helper (Postgres+Loki).

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer building a governance "hero" proof panel.
> Context: Task P13-8 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13; see `docs/DASHBOARD.md` §10 (Governance — redaction at source (the hero) + Audit trail) and §12 (`GET /audit`). The library redacts **in-process** via `fast-redact` (97 default paths) **before** the line leaves the service — so Postgres + Loki only ever hold redacted data (OVERVIEW §13). `LogAuditService.listActiveRedactPaths()` (`@Inject(LOGGER_OPTIONS_TOKEN)`) exposes the active paths; surface it via an `apps/api` endpoint (Phase 8/10). `audit_events` records **actions** (`{ actor, action, target, tenantId, at }`), not logins. Use `@uiw/react-json-view` (already in the stack) for the side-by-side records.
> Objective: Ship the redaction-at-source hero (same record from Postgres + Loki, both `[REDACTED]`, "redacted at source" badge, link to active redact paths) + the read-only `audit_events` table.
> Steps:
>
> 1. Extend `apps/web/lib/maintenance-api.ts`:
>    ```typescript
>    export interface AuditEvent { actor: string; action: string; target: string; tenantId: string | null; at: string }
>    export const getAuditEvents = () => get<AuditEvent[]>('/audit')
>    export const getActiveRedactPaths = () => get<string[]>('/logger/redact-paths') // LogAuditService.listActiveRedactPaths()
>    // fetch the SAME record from both backends for the side-by-side proof
>    export async function getSameRecord(id: { requestId?: string; traceId?: string }) {
>      const q = new URLSearchParams(id.requestId ? { requestId: id.requestId } : { traceId: id.traceId! })
>      const [pg, loki] = await Promise.all([
>        get(`/logs?source=postgres&limit=1&${q}`),
>        get(`/logs?source=loki&limit=1&${q}`),
>      ])
>      return { postgres: pg, loki }
>    }
>    ```
> 2. Create `redaction-hero.tsx` (`'use client'`): an input to pick a `requestId`/`traceId` (default to a known PII-demo record, e.g. from `POST /pii-demo/signup`), then render the Postgres record and the Loki record **side by side** via `@uiw/react-json-view` so the `[REDACTED]` values are visually obvious in both. Add a prominent **"redacted at source — never stored raw"** badge + the explainer (in-process `fast-redact`, 97 default paths, nothing to unmask) and a link to the active redact-path list (`getActiveRedactPaths()` → a modal/list). Add a callout contrasting this with after-ingest scrubbing (§10 framing) — reuse `<ScopedDemoCallout>` only if framed as the prod-feature contrast; otherwise a plain info callout (this feature is **real**, not a scoped demo).
> 3. Create `audit-table.tsx`: a read-only table of `getAuditEvents()` with columns `actor, action, target, tenantId, at`, newest-first; no edit/delete affordances.
> 4. Mount `<RedactionHero />` under `#redaction` and `<AuditTable />` under `#audit` in `app/maintenance/page.tsx`.
> 5. Ensure the side-by-side records are the **same** logical entry (same `requestId`/`traceId`) so the "both `[REDACTED]`" proof is honest.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (strict TS, ESM, English-only).
> - Redaction is **real** (the library's headline) — do NOT label the hero panel itself a "scoped demo"; only the contrast with prod scrubbing tooling is editorial.
> - The audit table is **read-only** and records **actions, not logins** — do not add row mutation or render auth events.
> - The active redact-path list MUST come from `LogAuditService.listActiveRedactPaths()` (via an `apps/api` endpoint) — do not hardcode the 97 paths in the web app.
> - Use `@uiw/react-json-view` (already in the stack) — do not add another JSON viewer.
>   Verification:
>
> - `pnpm --filter web build` — expected: zero type errors.
> - Fire `POST /pii-demo/signup` (Trigger Center), then on `/maintenance` pick that `requestId` — expected: both the Postgres and Loki records render with `password`/`cpf`/`cardNumber` = `[REDACTED]`, and the "redacted at source" badge + redact-path link are shown.
> - `GET /audit` renders rows for a prior export / role-switch with `actor, action, target, tenantId, at`, read-only.
> - The redact-path link lists paths returned by `LogAuditService.listActiveRedactPaths()` (not a hardcoded literal).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-8 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P13-9 — Verification gate — triggers→logKeys, alert→incident, export, tenant scoping

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–2 h)
- **Depends on:** `P13-1`, `P13-2`, `P13-3`, `P13-4`, `P13-5`, `P13-6`, `P13-7`, `P13-8`

### Description

Phase 13 **"Definition of done"** gate per `DEVELOPMENT_PLAN.md` §Phase 13: prove the operate-it-like-a-platform surface works end to end — **each Playground trigger produces the documented `logKey`s**; **an alert fires an incident**; **export downloads the filtered set**; **switching tenant scopes the Explorer**. This is a verification + light-test task (no new product surface): exercise the four DoD flows against a running stack, add the missing Playwright journeys that assert them (these also feed Phase 14's e2e consolidation), and close the phase. Do not lower any threshold or fake a flow to make it pass.

### Acceptance Criteria

- [ ] **Trigger → logKeys:** firing each of the 12 Trigger Center cards produces the documented `logKey`(s) (`DASHBOARD.md` §8), verified by following "View in Explorer →" and asserting the row(s) appear.
- [ ] **Alert → incident:** creating a rule (e.g. error-spike) and firing the matching trigger (e.g. repeated `POST /payments`) produces an **incident** that can be Acknowledged/Snoozed/Resolved with an appended immutable timeline.
- [ ] **Export:** with filters applied, JSON and CSV export download the **current filtered set** (correct columns, tenant-scoped, 100k cap honored).
- [ ] **Tenant scoping:** switching tenant in the global control visibly scopes the Explorer (and Export) to that `tenantId`; switching role gates actions (Viewer can't export / transition incidents).
- [ ] Playwright journeys covering the four DoD flows are added under `apps/web` and pass (`pnpm --filter web test:e2e`).
- [ ] `pnpm --filter web build`, `pnpm --filter web typecheck`, and `pnpm --filter web lint` all exit 0 for the Phase 13 pages/components.
- [ ] Every scoped-demo feature (alerts, retention, RBAC/export) renders its **🎓 scoped demo of <prod feature>** callout (spot-checked in the journeys).

### Files to create / modify

- `apps/web/e2e/trigger.spec.ts` — fire → "View in Explorer →" → assert documented `logKey` rows.
- `apps/web/e2e/alerts.spec.ts` — rule create → trigger → incident lifecycle + immutable timeline.
- `apps/web/e2e/maintenance.spec.ts` — export (JSON/CSV columns + cap) + tenant/role scoping.
- _(fix the corresponding P13-1..P13-8 component files if a flow fails — no placeholder pages)_

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js 16 engineer writing end-to-end Playwright journeys and closing a phase.
> Context: Task P13-9 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-13--dashboard-trigger-alerts-maintenance) §Phase 13. DoD (verbatim): "each Playground trigger produces the documented logKeys; an alert fires an incident; export downloads the filtered set; switching tenant scopes the Explorer." The Trigger/Alerts/Maintenance pages (P13-1..P13-8) and the Phase 12 Explorer exist; `apps/api` + the stack (`pnpm infra:up`) are up. Playwright is the web e2e tool (Phase 11/14); these journeys also feed Phase 14's e2e consolidation.
> Objective: Verify the four DoD flows against a running stack, add Playwright journeys asserting them, and close the phase.
> Steps:
>
> 1. Bring up the stack: `pnpm infra:up`, run `apps/api` (`pnpm --filter api dev`) + `apps/web` (`pnpm --filter web dev`).
> 2. `apps/web/e2e/trigger.spec.ts` — for representative cards (each level; `ORDER_CREATE_SUCCESS`; `PAYMENT_REFUND_FAILED`; `HTTP_REQUEST_CLIENT_ERROR`/`_SERVER_ERROR` via `/trigger/status/:code`; `METHOD_SLOW_EXECUTION`; `LOGGER_ENTRY_TRUNCATED`; cross-service `traceId`): click **Fire**, follow **View in Explorer →**, assert the documented `logKey` row(s) render. Assert the cross-service journey shows both `api` + `worker` rows for one `traceId`.
> 3. `apps/web/e2e/alerts.spec.ts` — create an **error-spike** rule (preset), fire the matching trigger enough to breach (`POST /payments` ×N, or `/trigger/burst`), wait for the cron window, assert an **incident** appears `triggered`; **Acknowledge** → `acknowledged` + a new immutable timeline entry; **Snooze 4h** → `snoozed`; **Resolve** → `resolved` (and Resolve no longer offered). Assert the §9 🎓 callout is present.
> 4. `apps/web/e2e/maintenance.spec.ts` — apply Explorer filters, trigger **Download CSV**, assert the file header is exactly `time,level,logKey,service,requestId,traceId,tenantId,msg`; switch **tenant** and assert the Explorer row count scopes; switch to **Viewer** and assert export + incident actions are disabled. Assert the retention/RBAC 🎓 callouts render.
> 5. If any flow fails, fix it in the corresponding P13-1..P13-8 component (never add a placeholder or weaken an assertion to pass). Run `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (strict TS, ESM, English-only) and Guiding Principle #6 (no `--no-verify`, no lowered thresholds, no `@ts-ignore`/`eslint-disable` to pass a gate).
> - These journeys assert **real** behavior against the running stack — do NOT stub the API to fabricate a passing flow.
> - Do NOT introduce new product surface here — this is a verification/close task; fix earlier P13 tasks if a DoD flow breaks.
> - Keep the journeys deterministic (await the cron window / poll the Explorer) rather than fixed sleeps where avoidable.
>   Verification:
>
> - `pnpm --filter web test:e2e` — expected: the trigger/alerts/maintenance journeys pass.
> - `pnpm --filter web typecheck` — expected: exit 0.
> - `pnpm --filter web lint` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0.
> - Manual spot-check: each of the four DoD bullets demonstrably holds with the stack up.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P13-9 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 13 is 9/9 — switch the Phase 13 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
