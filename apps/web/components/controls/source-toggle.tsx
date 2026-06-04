/**
 * @fileoverview SourceToggle — `[ Loki | Postgres ]` segmented control.
 *
 * Writes the global `source` to the URL and renders the persistent two-tier
 * callout so the differing row volumes per source read as a lesson, not missing
 * data (`DASHBOARD.md` §4).
 *
 * @module components/controls/source-toggle
 */

'use client'

import { useQueryStates } from 'nuqs'
import { Database, GraduationCap } from 'lucide-react'

import { logQueryParsers, SOURCES } from '@/lib/filters'
import { cn } from '@/lib/utils'

/** Human labels for each source. */
const SOURCE_LABEL: Record<(typeof SOURCES)[number], string> = {
  loki: 'Loki',
  postgres: 'Postgres',
}

/**
 * Segmented `[ Loki | Postgres ]` control + the two-tier source callout.
 *
 * @returns The source toggle with its teaching callout.
 */
export function SourceToggle() {
  const [{ source }, setQuery] = useQueryStates(logQueryParsers)

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center rounded-full border border-(--glass-border) bg-(--glass-bg) p-0.5"
        role="group"
        aria-label="Log source"
      >
        {SOURCES.map((value) => {
          const isActive = source === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              onClick={() => void setQuery({ source: value })}
              className={cn(
                'rounded-full px-3 py-1 font-mono text-xs transition-colors',
                isActive
                  ? 'bg-brand-500/20 font-semibold text-brand-500'
                  : 'text-white/55 hover:text-white/80',
              )}
            >
              {SOURCE_LABEL[value]}
            </button>
          )
        })}
      </div>
      <span
        className="hidden items-center gap-1.5 text-[10px] leading-tight text-white/40 xl:flex"
        title={
          source === 'postgres'
            ? "You're viewing Postgres (warn+, durable). info/debug lines live only in Loki."
            : "You're viewing Loki (info+, full fidelity). The durable warn+ audit tier lives in Postgres."
        }
      >
        {source === 'postgres' ? (
          <Database className="h-3 w-3 shrink-0 text-amber-400" />
        ) : (
          <GraduationCap className="h-3 w-3 shrink-0 text-secondary" />
        )}
        <span className="max-w-64">
          {source === 'postgres'
            ? 'Postgres = warn+ durable tier · info/debug live in Loki'
            : 'Loki = info+ full fidelity · warn+ audit lives in Postgres'}
        </span>
      </span>
    </div>
  )
}
