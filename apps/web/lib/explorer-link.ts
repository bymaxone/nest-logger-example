/**
 * @fileoverview Builds Explorer deep-links from a correlation id or time window.
 *
 * Reuses the exact `nuqs` param names the Explorer already reads (`requestId`,
 * `traceId`, `logKey`, `from`, `to`, `range`) so a link lands pre-filtered with
 * no parallel query-state scheme. A relative `range` is applied by default so the
 * live-tail / keyset window includes "now" and the just-fired request is visible.
 *
 * @module lib/explorer-link
 */

/** Target the Explorer should open on — at least one field should be set. */
export interface ExplorerTarget {
  /** Pivot to a single request by its correlation id. */
  requestId?: string
  /** Pivot to a distributed trace (spans both `api` and `worker` rows). */
  traceId?: string
  /** Pre-apply a `logKey` filter (exact or `PREFIX_*`). */
  logKey?: string
  /** Absolute ISO window start; when set, the relative `range` is omitted. */
  from?: string
  /** Absolute ISO window end. */
  to?: string
  /** Relative range preset token (e.g. `15m`); defaults to `15m` for id pivots. */
  range?: string
}

/** Default relative range so a freshly fired request falls inside the window. */
const DEFAULT_RANGE = '15m'

/**
 * Build a relative-or-absolute Explorer href from a {@link ExplorerTarget}.
 *
 * When `from`/`to` are provided the link uses that absolute window; otherwise it
 * applies a relative `range` (default `15m`) so the Explorer covers "now".
 *
 * @param target - The correlation id(s), optional `logKey`, and time window.
 * @returns A root-relative href like `/explorer?traceId=…&range=15m`.
 */
export function explorerHref(target: ExplorerTarget): string {
  const params = new URLSearchParams()
  if (target.traceId !== undefined && target.traceId !== '') {
    params.set('traceId', target.traceId)
  }
  if (target.requestId !== undefined && target.requestId !== '') {
    params.set('requestId', target.requestId)
  }
  if (target.logKey !== undefined && target.logKey !== '') {
    params.set('logKey', target.logKey)
  }
  if (target.from !== undefined && target.from !== '') {
    // Absolute window: an explicit from/to overrides any relative range.
    params.set('from', target.from)
    if (target.to !== undefined && target.to !== '') params.set('to', target.to)
  } else {
    params.set('range', target.range ?? DEFAULT_RANGE)
  }
  return `/explorer?${params.toString()}`
}
