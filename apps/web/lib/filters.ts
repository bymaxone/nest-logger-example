/**
 * @fileoverview nuqs typed URL state — the single source of truth for filters.
 *
 * Maps the global {@link LogQuery} (time range, source, tenant, role, plus filter
 * fields) bidirectionally to the URL so every view is a shareable deep-link.
 * `useLogQuery()` derives the effective filter; relative ranges (`range=1h`) are
 * resolved to concrete `from`/`to` at read time, quantized so the query key
 * stays stable between refreshes.
 *
 * @module lib/filters
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { parseAsBoolean, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs'
import type { LogLevel } from '@bymax-one/nest-logger/shared'

import type { LogQuery, LogSource, RbacRole } from './types'

/** Selectable backends for the source toggle. */
export const SOURCES = ['loki', 'postgres'] as const satisfies readonly LogSource[]

/** Selectable RBAC roles for the tenant/role switcher. */
export const ROLES = ['viewer', 'operator', 'admin'] as const satisfies readonly RbacRole[]

/** All log levels, highest severity first. */
const LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const satisfies readonly LogLevel[]

/** Relative range presets → milliseconds. Keys are the preset tokens stored in the URL. */
export const RANGE_MS: Record<string, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
}

/** Ordered preset tokens for rendering the relative-range buttons. */
export const RANGE_PRESETS = ['5m', '15m', '1h', '6h', '24h', '7d'] as const

/** Quantize "now" to this granularity so a relative range yields a stable query key. */
const NOW_QUANTUM_MS = 30_000

/**
 * nuqs parser map for the global filter state.
 *
 * Each field defaults to an empty string / sensible enum so reads are non-null;
 * an empty string means "unset". `role` defaults to `admin` so the on-call
 * landing view shows logs across every tenant out of the box (operator/viewer
 * narrow it).
 *
 * `tenantId` stays an unbounded free-text parser so a deep-linked URL is never
 * silently dropped on read; its value is validated against a safe pattern at the
 * request boundary in `lib/rbac-headers.ts` before it is forwarded as the
 * `x-tenant-id` header. `role` is, by contrast, a closed enum, so it cannot carry
 * arbitrary input.
 */
export const logQueryParsers = {
  range: parseAsString.withDefault(''),
  from: parseAsString.withDefault(''),
  to: parseAsString.withDefault(''),
  source: parseAsStringEnum<LogSource>([...SOURCES]).withDefault('loki'),
  tenantId: parseAsString.withDefault(''),
  role: parseAsStringEnum<RbacRole>([...ROLES]).withDefault('admin'),
  level: parseAsString.withDefault(''),
  logKey: parseAsString.withDefault(''),
  service: parseAsString.withDefault(''),
  q: parseAsString.withDefault(''),
  traceId: parseAsString.withDefault(''),
  requestId: parseAsString.withDefault(''),
  live: parseAsBoolean.withDefault(false),
}

/** Type-guard narrowing an arbitrary string to a {@link LogLevel}. */
function isLevel(value: string): value is LogLevel {
  return (LEVELS as readonly string[]).includes(value)
}

/**
 * Parse the URL `level` token into the {@link LogQuery} `level` shape.
 *
 * A leading `>=` denotes the at-or-above comparison (`>=warn` ⇒ `{ gte: 'warn' }`);
 * a bare level is exact. Unrecognized tokens resolve to `undefined`.
 *
 * @param raw - The raw URL `level` value.
 * @returns The parsed level, or `undefined` when unset/invalid.
 */
export function parseLevelToken(raw: string): LogLevel | { gte: LogLevel } | undefined {
  if (raw === '') return undefined
  if (raw.startsWith('>=')) {
    const lvl = raw.slice(2)
    return isLevel(lvl) ? { gte: lvl } : undefined
  }
  return isLevel(raw) ? raw : undefined
}

/**
 * Bucket size hint for a window — `1m` ≤6h, `5m` ≤24h, `1h` otherwise.
 *
 * The API resolves buckets server-side (`bucket=auto`); this mirror is exposed
 * for callers that want to label or pre-size a chart.
 *
 * @param from - ISO window start.
 * @param to - ISO window end.
 * @returns The bucket token.
 */
export function bucketFor(from: string, to: string): '1m' | '5m' | '1h' {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  const hours = ms / 3_600_000
  if (hours <= 6) return '1m'
  if (hours <= 24) return '5m'
  return '1h'
}

/** Effective filter state derived from the URL. */
export interface LogQueryState {
  /** The compiled filter passed to the data hooks. */
  query: LogQuery
  /** nuqs setter for the raw URL state. */
  setQuery: ReturnType<typeof useQueryStates<typeof logQueryParsers>>[1]
  /** Whether the live tail toggle is on. */
  live: boolean
  /** Whether the current range is relative (live tail is only allowed when true). */
  isRelative: boolean
}

/**
 * Read the global filter from the URL and compile it into a {@link LogQuery}.
 *
 * Resolves a relative `range` preset to concrete `from`/`to` (quantized "now"),
 * threads the RBAC role, and reports whether the range is relative so the live
 * tail can enforce its relative-only guardrail.
 *
 * @returns The effective query, the nuqs setter, and `live` / `isRelative` flags.
 */
export function useLogQuery(): LogQueryState {
  const [state, setQuery] = useQueryStates(logQueryParsers)

  // A relative preset advances its window over time; tick a coarse counter so the
  // memoized window (and the query key) refresh on a bounded cadence. The ticker
  // only runs for relative ranges, so absolute windows keep a stable query key.
  const usesRelativePreset = RANGE_MS[state.range] !== undefined
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    if (!usesRelativePreset) return
    const id = setInterval(() => setNowTick((t) => t + 1), NOW_QUANTUM_MS)
    return () => clearInterval(id)
  }, [usesRelativePreset])

  const query = useMemo<LogQuery>(() => {
    let from = state.from
    let to = state.to
    const rangeMs = RANGE_MS[state.range]
    if (rangeMs !== undefined) {
      const now = Math.floor(Date.now() / NOW_QUANTUM_MS) * NOW_QUANTUM_MS
      to = new Date(now).toISOString()
      from = new Date(now - rangeMs).toISOString()
    }
    const level = parseLevelToken(state.level)
    return {
      source: state.source,
      role: state.role,
      ...(from !== '' ? { from } : {}),
      ...(to !== '' ? { to } : {}),
      ...(state.tenantId !== '' ? { tenantId: state.tenantId } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(state.logKey !== '' ? { logKey: state.logKey } : {}),
      ...(state.service !== '' ? { service: state.service } : {}),
      ...(state.q !== '' ? { q: state.q } : {}),
      ...(state.traceId !== '' ? { traceId: state.traceId } : {}),
      ...(state.requestId !== '' ? { requestId: state.requestId } : {}),
    }
    // `nowTick` intentionally participates: a relative window must recompute as time advances.
  }, [
    nowTick,
    state.range,
    state.from,
    state.to,
    state.source,
    state.role,
    state.tenantId,
    state.level,
    state.logKey,
    state.service,
    state.q,
    state.traceId,
    state.requestId,
  ])

  const isRelative = state.range !== '' || (state.from === '' && state.to === '')

  return { query, setQuery, live: state.live, isRelative }
}
