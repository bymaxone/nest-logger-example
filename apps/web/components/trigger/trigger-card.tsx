/**
 * @fileoverview TriggerCard — one Log Playground card.
 *
 * Presentational + local fire state only: renders the title, a "Demonstrates"
 * line, the target endpoint as a mono badge, the emitted `logKey`(s) as badges,
 * an optional input control (level / status code / burst count), and a Fire
 * button. Firing runs the injected `fire` callback, toggles a loading state,
 * toasts the outcome, and — on success — reveals the returned correlation ids
 * with a "View in Explorer →" deep-link. All log reading happens in the Explorer;
 * this card only fires and reports.
 *
 * @module components/trigger/trigger-card
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'

import type { TriggerResult } from '@/lib/trigger-api'
import { explorerHref, type ExplorerTarget } from '@/lib/explorer-link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FireContext, TriggerDescriptor } from './trigger-grid'

/** HTTP status codes offered by the 4xx/5xx card. */
const STATUS_CODES = [400, 404, 500, 503] as const

/** Levels offered by the "Emit each level" card (the endpoint's accepted enum). */
const LEVELS = ['info', 'warn', 'error'] as const

/** Initial burst line count — a lively-but-bounded default for the demo. */
const DEFAULT_BURST_COUNT = 50

/** Characters of a correlation id shown in the compact post-fire summary. */
const ID_PREVIEW_LEN = 12

/** Burst input bounds (mirrors the `/trigger/burst` Zod schema). */
const BURST_MIN = 1
const BURST_MAX = 500

interface TriggerCardProps {
  /** The trigger definition this card fires. */
  descriptor: TriggerDescriptor
  /** Active tenant id (from the global control) used by tenant-scoped fires. */
  tenantId: string
}

/**
 * A single Trigger Center card.
 *
 * @param props - The descriptor to fire and the active tenant id.
 * @returns The card with its input control, Fire button, and post-fire result.
 */
export function TriggerCard({ descriptor, tenantId }: TriggerCardProps) {
  const [isFiring, setIsFiring] = useState(false)
  const [result, setResult] = useState<{ value: TriggerResult; target: ExplorerTarget } | null>(
    null,
  )
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('info')
  const [code, setCode] = useState<(typeof STATUS_CODES)[number]>(400)
  const [count, setCount] = useState(DEFAULT_BURST_COUNT)

  const onFire = async (): Promise<void> => {
    setIsFiring(true)
    const firedAtMs = Date.now()
    try {
      const ctx: FireContext = { tenantId, level, code, count }
      const value = await descriptor.fire(ctx)
      if (value.status >= 400 && descriptor.isExpectedError !== true) {
        toast.error(`${descriptor.title} returned ${value.status}`)
      } else {
        toast.success(`${descriptor.title} fired`, {
          description: value.requestId ? `requestId ${value.requestId}` : undefined,
        })
      }
      setResult({ value, target: descriptor.explorerTarget(value, firedAtMs) })
    } catch (err) {
      toast.error(`${descriptor.title} failed`, {
        description: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setIsFiring(false)
    }
  }

  return (
    <div
      data-testid={`trigger-${descriptor.id}`}
      className="flex flex-col gap-3 rounded-xl border border-(--glass-border) bg-(--glass-bg) p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{descriptor.title}</h3>
          <p className="mt-0.5 text-xs text-white/55">{descriptor.demonstrates}</p>
        </div>
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {descriptor.endpoint}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1">
        {descriptor.logKeys.map((key) => (
          <Badge key={key} variant="secondary" className="font-mono text-[10px]">
            {key}
          </Badge>
        ))}
      </div>

      {descriptor.input === 'level' && (
        <Select value={level} onValueChange={(v) => setLevel(v as (typeof LEVELS)[number])}>
          <SelectTrigger className="h-8 w-full font-mono text-xs" aria-label="Level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {descriptor.input === 'status' && (
        <Select
          value={String(code)}
          onValueChange={(v) => setCode(Number(v) as (typeof STATUS_CODES)[number])}
        >
          <SelectTrigger className="h-8 w-full font-mono text-xs" aria-label="Status code">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_CODES.map((c) => (
              <SelectItem key={c} value={String(c)}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {descriptor.input === 'burst' && (
        <label className="flex items-center gap-2 text-xs text-white/55">
          Count
          <Input
            type="number"
            min={BURST_MIN}
            max={BURST_MAX}
            value={count}
            onChange={(e) =>
              setCount(
                Math.max(BURST_MIN, Math.min(BURST_MAX, Number(e.target.value) || BURST_MIN)),
              )
            }
            className="h-8 w-24 font-mono text-xs"
            aria-label="Burst count"
          />
        </label>
      )}

      <Button
        type="button"
        size="sm"
        onClick={() => void onFire()}
        disabled={isFiring}
        className="mt-auto w-full"
      >
        {isFiring ? (
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap aria-hidden className="h-3.5 w-3.5" />
        )}
        {isFiring ? 'Firing…' : 'Fire'}
      </Button>

      {result !== null && (
        <div
          aria-live="polite"
          className="flex flex-col gap-1 border-t border-(--glass-border) pt-2 text-[11px]"
        >
          <span
            className={cn(
              'font-mono',
              result.value.status >= 400 ? 'text-destructive' : 'text-white/55',
            )}
          >
            HTTP {result.value.status}
            {result.value.requestId
              ? ` · req ${result.value.requestId.slice(0, ID_PREVIEW_LEN)}`
              : ''}
            {result.value.traceId
              ? ` · trace ${result.value.traceId.slice(0, ID_PREVIEW_LEN)}`
              : ''}
          </span>
          <Link
            href={explorerHref(result.target)}
            className="inline-flex items-center gap-1 font-medium text-brand-500 hover:underline"
          >
            View in Explorer <ArrowRight aria-hidden className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  )
}
