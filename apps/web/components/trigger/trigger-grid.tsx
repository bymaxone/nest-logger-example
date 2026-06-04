/**
 * @fileoverview TriggerGrid — the twelve Log Playground cards.
 *
 * Declares one descriptor per `DASHBOARD.md` §8 row: title, "Demonstrates" line,
 * target endpoint, the **real** `logKey`(s) the demo emits (sourced from the
 * `apps/api` log-key catalog, which is the running-stack ground truth), an
 * optional input control, the fire action, and how to build the post-fire
 * Explorer deep-link. The declared `logKey` literals are validated against the
 * library convention at module load so a typo fails fast (and is unit-tested).
 *
 * The active tenant comes from the single global control (nuqs URL state); the
 * tenant-scoped `/orders` fire uses it (falling back to a demo tenant so the
 * required field is always present).
 *
 * @module components/trigger/trigger-grid
 */

'use client'

import { useQueryStates } from 'nuqs'

import { logQueryParsers } from '@/lib/filters'
import { isValidLogKey } from '@/lib/log-keys'
import { triggerApi, type TriggerResult } from '@/lib/trigger-api'
import type { ExplorerTarget } from '@/lib/explorer-link'
import { TriggerCard } from './trigger-card'

/** Runtime inputs a card collects and passes to its fire action. */
export interface FireContext {
  /** Active tenant id (used by tenant-scoped fires such as `/orders`). */
  tenantId: string
  /** Selected level for the "Emit each level" card. */
  level: 'info' | 'warn' | 'error'
  /** Selected HTTP status code for the 4xx/5xx card. */
  code: number
  /** Burst line count for the load-burst card. */
  count: number
}

/** A single Trigger Center card definition. */
export interface TriggerDescriptor {
  /** Stable id (also the React key). */
  id: string
  /** Card title. */
  title: string
  /** One-line "what this proves" description. */
  demonstrates: string
  /** Target route shown as a mono badge (`METHOD /path`). */
  endpoint: string
  /** The real `logKey`(s) this fire emits (validated against the convention). */
  logKeys: string[]
  /** Which input control the card renders, if any. */
  input?: 'level' | 'status' | 'burst'
  /** When `true`, a 4xx/5xx response is the expected outcome (not an error toast). */
  isExpectedError?: boolean
  /** Fire the demo endpoint with the collected inputs. */
  fire: (ctx: FireContext) => Promise<TriggerResult>
  /** Build the Explorer deep-link target from the fire result. */
  explorerTarget: (result: TriggerResult, firedAtMs: number) => ExplorerTarget
}

/** Default tenant for tenant-scoped fires when "All tenants" is selected. */
const DEFAULT_TENANT = 'acme'

/** Pivot helper — prefer the `requestId`, fall back to the `traceId`. */
function byRequest(result: TriggerResult): ExplorerTarget {
  if (result.requestId !== null) return { requestId: result.requestId }
  if (result.traceId !== null) return { traceId: result.traceId }
  return {}
}

/** Pivot to the shared `traceId` (cross-service rows), or an empty target. */
function byTrace(result: TriggerResult): ExplorerTarget {
  return result.traceId !== null ? { traceId: result.traceId } : {}
}

/** Window (ms) padded around a burst so the Explorer range covers every tick. */
const BURST_PAD_MS = 60_000

/**
 * The twelve trigger descriptors, in `DASHBOARD.md` §8 order. `logKey` literals
 * are the keys the running stack actually emits (see `apps/api`
 * `common/app-log-keys.ts` + the library HTTP/perf keys).
 */
export const TRIGGERS: TriggerDescriptor[] = [
  {
    id: 'level',
    title: 'Emit each level',
    demonstrates: 'PinoLoggerService.info/warn/error + level mapping',
    endpoint: 'POST /trigger/level',
    logKeys: ['TRIGGER_LEVEL_FIRED'],
    input: 'level',
    // Fires a single line at the chosen level; the endpoint's `count` is left at its default.
    fire: (ctx) => triggerApi.level(ctx.level),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'order',
    title: 'Structured success',
    demonstrates: 'info(logKey, msg, userId, meta) + ALS requestId/tenantId',
    endpoint: 'POST /orders',
    logKeys: ['ORDER_CREATE_SUCCESS'],
    fire: (ctx) => triggerApi.order(ctx.tenantId === '' ? DEFAULT_TENANT : ctx.tenantId),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'payment',
    title: 'Error with stack',
    demonstrates: 'errorStructured(logKey, Error, …) → 402, exception logged once',
    endpoint: 'POST /payments',
    logKeys: ['PAYMENT_CHARGE_FAILED', 'HTTP_EXCEPTION_HANDLED'],
    isExpectedError: true,
    fire: () => triggerApi.payment(),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'pii-signup',
    title: 'PII payload',
    demonstrates: '97-path redaction → [REDACTED] (password/cpf/cardNumber)',
    endpoint: 'POST /pii-demo/signup',
    logKeys: ['USER_SIGNUP_ATTEMPT'],
    fire: () => triggerApi.piiSignup(),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'pii-nested',
    title: 'Deep-nested PII',
    demonstrates: 'wildcard depth boundary (depth 4 redacted, 5 not)',
    endpoint: 'POST /pii-demo/nested',
    logKeys: ['PII_NESTED_ATTEMPT'],
    fire: () => triggerApi.piiNested(),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'pii-headers',
    title: 'Sensitive headers',
    demonstrates: 'header bracket-syntax redaction (authorization, x-api-key)',
    endpoint: 'GET /pii-demo/echo-headers',
    logKeys: ['PII_HEADERS_ECHO'],
    fire: () => triggerApi.echoHeaders(),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'huge',
    title: 'Oversized entry',
    demonstrates: 'maxEntrySizeBytes → LOGGER_ENTRY_TRUNCATED',
    endpoint: 'POST /pii-demo/huge',
    logKeys: ['PII_HUGE_ATTEMPT', 'LOGGER_ENTRY_TRUNCATED'],
    fire: () => triggerApi.huge(),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'slow',
    title: 'Slow method',
    demonstrates: '@LogPerformance → METHOD_SLOW_EXECUTION',
    endpoint: 'GET /orders/slow',
    logKeys: ['ORDER_SLOW_SUCCESS', 'METHOD_SLOW_EXECUTION'],
    fire: () => triggerApi.slow(),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'status',
    title: 'HTTP 4xx / 5xx',
    demonstrates: 'HTTP_REQUEST_CLIENT_ERROR / _SERVER_ERROR',
    endpoint: 'GET /trigger/status/:code',
    logKeys: ['HTTP_REQUEST_CLIENT_ERROR', 'HTTP_REQUEST_SERVER_ERROR'],
    input: 'status',
    isExpectedError: true,
    fire: (ctx) => triggerApi.status(ctx.code),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'dispatch',
    title: 'Cross-service',
    demonstrates: 'one traceId across api + worker',
    endpoint: 'POST /downstream/dispatch',
    logKeys: ['DOWNSTREAM_DISPATCH_START', 'DOWNSTREAM_DISPATCH_SUCCESS'],
    // Cross-service join key is the shared traceId, so both api + worker rows appear.
    fire: () => triggerApi.dispatch(),
    explorerTarget: (r) => byTrace(r),
  },
  {
    id: 'fault-loki',
    title: 'Fault-inject a destination',
    demonstrates: 'Loki sink at a dead host → LOGGER_DESTINATION_WRITE_FAILED, fail-soft',
    endpoint: 'POST /trigger/fault/loki',
    logKeys: ['TRIGGER_FAULT_REQUESTED', 'LOGGER_DESTINATION_WRITE_FAILED'],
    fire: () => triggerApi.faultLoki(),
    explorerTarget: (r) => byRequest(r),
  },
  {
    id: 'burst',
    title: 'Load burst',
    demonstrates: 'N lines to populate charts / drive RED panels / test live tail',
    endpoint: 'POST /trigger/burst',
    logKeys: ['TRIGGER_BURST_TICK'],
    input: 'burst',
    fire: (ctx) => triggerApi.burst(ctx.count),
    // Burst fans out many lines — pivot to the burst time window, not a single id.
    explorerTarget: (_r, firedAtMs) => ({
      logKey: 'TRIGGER_BURST_TICK',
      from: new Date(firedAtMs - BURST_PAD_MS).toISOString(),
      to: new Date(Date.now() + BURST_PAD_MS).toISOString(),
    }),
  },
]

// Fail fast if a declared logKey literal drifts from the library convention.
// Mirrored by an explicit unit test so the guard is covered even in production builds.
for (const trigger of TRIGGERS) {
  for (const key of trigger.logKeys) {
    if (!isValidLogKey(key)) {
      throw new Error(`Invalid logKey literal in trigger "${trigger.id}": ${key}`)
    }
  }
}

/**
 * The responsive grid of all twelve trigger cards.
 *
 * @returns The Trigger Center card grid bound to the active tenant.
 */
export function TriggerGrid() {
  const [{ tenantId }] = useQueryStates(logQueryParsers)
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {TRIGGERS.map((descriptor) => (
        <TriggerCard key={descriptor.id} descriptor={descriptor} tenantId={tenantId} />
      ))}
    </div>
  )
}
