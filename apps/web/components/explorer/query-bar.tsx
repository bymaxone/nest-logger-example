/**
 * @fileoverview QueryBar — structured field-syntax search + teaching toggles.
 *
 * Parses `key:value` / `key>=value` / free-text `msg ~ "…"` into the global
 * {@link LogQuery} (written to the URL via nuqs), validates any `logKey` token
 * against `LOG_KEYS_CONVENTION_REGEX` inline, and reveals the compiled SQL /
 * LogQL beside the form (`DASHBOARD.md` §6). Filter state lives in the URL, so a
 * brushed range from the Overview lands here pre-filtered.
 *
 * @module components/explorer/query-bar
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import { useLogQuery } from '@/lib/filters'
import { isValidLogKey } from '@/lib/log-keys'
import { toLogQL, toSqlWhere } from '@/lib/query-compile'
import type { LogQuery } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** The structured fields the query bar owns (writes/clears on submit). */
interface ParsedQuery {
  level: string
  logKey: string
  service: string
  tenantId: string
  traceId: string
  q: string
}

/** A blank parsed query (every structured field cleared). */
const EMPTY: ParsedQuery = { level: '', logKey: '', service: '', tenantId: '', traceId: '', q: '' }

/**
 * Render the current query as the bar's field-syntax text.
 *
 * @param query - The active filter.
 * @returns The reconstructed query-bar string.
 */
function queryToText(query: LogQuery): string {
  const parts: string[] = []
  if (query.level !== undefined) {
    parts.push(
      typeof query.level === 'string' ? `level:${query.level}` : `level>=${query.level.gte}`,
    )
  }
  if (query.logKey !== undefined) parts.push(`logKey:${query.logKey}`)
  if (query.service !== undefined) parts.push(`service:${query.service}`)
  if (query.tenantId !== undefined) parts.push(`tenantId:${query.tenantId}`)
  if (query.traceId !== undefined) parts.push(`traceId:${query.traceId}`)
  if (query.q !== undefined) parts.push(`msg ~ "${query.q}"`)
  return parts.join(' ')
}

/**
 * Parse field-syntax text into the structured fields plus any invalid logKey.
 *
 * @param input - The raw query-bar string.
 * @returns The parsed fields and the offending logKey token (if invalid).
 */
function parseQueryText(input: string): { parsed: ParsedQuery; invalidLogKey: string | null } {
  const parsed: ParsedQuery = { ...EMPTY }
  let invalidLogKey: string | null = null
  let rest = input

  // Free-text: `msg ~ "…"` or `q:"…"`.
  const msgMatch = /(?:msg\s*~|q:)\s*"([^"]*)"/.exec(rest)
  if (msgMatch?.[1] !== undefined) {
    parsed.q = msgMatch[1]
    rest = rest.replace(msgMatch[0], ' ')
  }

  const freeText: string[] = []
  for (const token of rest.split(/\s+/).filter(Boolean)) {
    const gte = /^level>=(.+)$/.exec(token)
    if (gte?.[1] !== undefined) {
      parsed.level = `>=${gte[1]}`
      continue
    }
    const kv = /^(\w+):(.+)$/.exec(token)
    if (kv?.[1] !== undefined && kv[2] !== undefined) {
      const [, key, value] = kv
      switch (key) {
        case 'level':
          parsed.level = value
          break
        case 'logKey':
          if (isValidLogKey(value)) parsed.logKey = value
          else invalidLogKey = value
          break
        case 'service':
          parsed.service = value
          break
        case 'tenantId':
          parsed.tenantId = value
          break
        case 'traceId':
          parsed.traceId = value
          break
        case 'requestId':
          // requestId is not a bar-managed field; fall through to free-text.
          freeText.push(token)
          break
        default:
          freeText.push(token)
      }
      continue
    }
    freeText.push(token)
  }

  // Any leftover bare words become a free-text message contains, unless `msg ~` set it.
  if (parsed.q === '' && freeText.length > 0) parsed.q = freeText.join(' ')

  return { parsed, invalidLogKey }
}

/**
 * The Explorer's structured query bar with teaching toggles.
 *
 * @returns The query bar.
 */
export function QueryBar() {
  const { query, setQuery } = useLogQuery()
  const [text, setText] = useState(() => queryToText(query))
  const [invalidLogKey, setInvalidLogKey] = useState<string | null>(null)
  const [showSql, setShowSql] = useState(false)
  const [showLogQL, setShowLogQL] = useState(false)
  const isFocused = useRef(false)

  // Keep the input in sync when the URL changes from elsewhere (facet clicks,
  // brush) — but never overwrite what the user is actively typing.
  const synced = queryToText(query)
  useEffect(() => {
    if (!isFocused.current) setText(synced)
  }, [synced])

  const submit = (): void => {
    const { parsed, invalidLogKey: invalid } = parseQueryText(text)
    setInvalidLogKey(invalid)
    void setQuery({
      level: parsed.level,
      logKey: parsed.logKey,
      service: parsed.service,
      tenantId: parsed.tenantId,
      traceId: parsed.traceId,
      q: parsed.q,
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => {
              isFocused.current = true
            }}
            onBlur={() => {
              isFocused.current = false
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder='level:error logKey:PAYMENT_* tenantId:acme msg ~ "refund"'
            className={cn('pl-9 font-mono text-xs', invalidLogKey !== null && 'border-destructive')}
            aria-label="Log query"
          />
        </div>
        <Button type="button" size="sm" onClick={submit}>
          Search
        </Button>
      </div>

      {invalidLogKey !== null && (
        <p className="font-mono text-[11px] text-destructive">
          “{invalidLogKey}” is not a valid logKey — expected MODULE_ACTION_RESULT (or PREFIX_*).
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-[11px]">
        <button
          type="button"
          onClick={() => setShowSql((v) => !v)}
          className="font-mono text-white/45 hover:text-brand-500"
        >
          {showSql ? '▾' : '▸'} generated SQL
        </button>
        <button
          type="button"
          onClick={() => setShowLogQL((v) => !v)}
          className="font-mono text-white/45 hover:text-brand-500"
        >
          {showLogQL ? '▾' : '▸'} generated LogQL
        </button>
      </div>

      {showSql && (
        <pre className="overflow-x-auto rounded-lg border border-(--glass-border) bg-black/40 p-3 font-mono text-[11px] text-white/70">
          {toSqlWhere(query)}
        </pre>
      )}
      {showLogQL && (
        <pre className="overflow-x-auto rounded-lg border border-(--glass-border) bg-black/40 p-3 font-mono text-[11px] text-white/70">
          {toLogQL(query)}
        </pre>
      )}
    </div>
  )
}
