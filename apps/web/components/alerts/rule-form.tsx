/**
 * @fileoverview RuleForm — author an alert rule (`expr + threshold + for`).
 *
 * A controlled builder whose draft feeds both the persisted `expr` string and the
 * live ruler-YAML preview. Four preset buttons fill the canonical `DASHBOARD.md`
 * §9 shapes (error spike / any FATAL / specific failure / heartbeat-absence). The
 * `logKey` field validates against the library convention and the `window` / `for`
 * fields validate against the Prometheus/Loki duration grammar. Submitting persists
 * via `POST /alerts/rules` and invalidates the rules query. Best-practice guidance
 * (prefer rate over raw count, combine error-rate AND volume, aggregate, auto-resolve)
 * is surfaced inline. The cron evaluation lives server-side — this only authors.
 *
 * @module components/alerts/rule-form
 */

'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useRbac } from '@/hooks/use-rbac'
import { isValidLogKey } from '@/lib/log-keys'
import {
  type AlertRuleInput,
  createRule,
  listChannels,
  type NotificationChannel,
} from '@/lib/alerts-api'
import {
  type AlertComparator,
  type AlertMetric,
  type AlertSeverity,
  buildExpr,
  isValidDuration,
  RULE_PRESETS,
  type RuleDraft,
} from '@/lib/ruler-yaml'
import type { LogLevel } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { RulerYamlPreview } from './ruler-yaml'

/** Levels offerable as a rule filter (highest-signal first). */
const LEVEL_OPTIONS: LogLevel[] = ['fatal', 'error', 'warn', 'info']

/** Comparator options for the threshold. */
const COMPARATORS: AlertComparator[] = ['>', '>=', '==', '<']

/** The starting draft when no preset is applied (the error-spike default). */
const INITIAL_DRAFT: RuleDraft = RULE_PRESETS[0]!.draft

interface RuleFormProps {
  /** Called after a rule is created so the parent can scroll/highlight if needed. */
  onCreated?: () => void
}

/** The complete state + handlers the form renders against, owned by {@link useRuleForm}. */
interface RuleFormState {
  /** The current rule draft. */
  draft: RuleDraft
  /** The notification channel ids selected for this rule. */
  channels: string[]
  /** Whether the active identity may create rules (non-viewer). */
  canEdit: boolean
  /** Whether the create request is in flight. */
  isPending: boolean
  /** Whether the current `logKey` violates the convention. */
  isLogKeyInvalid: boolean
  /** Whether the evaluation `window` is not a valid duration literal. */
  isWindowInvalid: boolean
  /** Whether the `for` sustain duration is not a valid duration literal. */
  isForDurationInvalid: boolean
  /** Editor-only channels query (viewers cannot list channels). */
  channelsQuery: ReturnType<typeof useQuery<NotificationChannel[]>>
  /** Apply a preset draft and clear the selected channels. */
  applyPreset: (draft: RuleDraft) => void
  /** Merge a partial patch into the draft. */
  update: (patch: Partial<RuleDraft>) => void
  /** Toggle a level filter on/off. */
  toggleLevel: (level: LogLevel) => void
  /** Toggle a notification channel on/off. */
  toggleChannel: (id: string) => void
  /** Submit handler — guards validity then fires the create mutation. */
  onSubmit: (event: React.FormEvent) => void
}

/**
 * Own the alert-rule draft, channel selection, the editor channels query, the
 * create mutation, and every form handler. Keeping this off the component body
 * lets {@link RuleForm} stay a thin layout shell.
 *
 * @returns The form state and handlers consumed by {@link RuleForm}.
 */
function useRuleForm(onCreated?: () => void): RuleFormState {
  const rbac = useRbac()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<RuleDraft>(INITIAL_DRAFT)
  const [channels, setChannels] = useState<string[]>([])

  const canEdit = rbac.role !== 'viewer'

  // Viewers cannot list channels (403) and cannot create rules, so only fetch for editors.
  const channelsQuery = useQuery<NotificationChannel[]>({
    queryKey: ['alert-channels', rbac.role, rbac.tenantId],
    queryFn: () => listChannels(rbac),
    enabled: canEdit,
  })

  const isLogKeyInvalid =
    draft.logKey !== undefined && draft.logKey !== '' && !isValidLogKey(draft.logKey)
  const isWindowInvalid = !isValidDuration(draft.window)
  const isForDurationInvalid = !isValidDuration(draft.forDuration)

  const mutation = useMutation({
    mutationFn: (input: AlertRuleInput) => createRule(input, rbac),
    onSuccess: () => {
      toast.success('Alert rule created')
      void queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
      onCreated?.()
    },
    onError: (err: unknown) => {
      toast.error('Could not create rule', {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const applyPreset = (next: RuleDraft): void => {
    setDraft(next)
    setChannels([])
  }

  const update = (patch: Partial<RuleDraft>): void => setDraft((prev) => ({ ...prev, ...patch }))

  const toggleLevel = (level: LogLevel): void =>
    setDraft((prev) => ({
      ...prev,
      levels: prev.levels.includes(level)
        ? prev.levels.filter((l) => l !== level)
        : [...prev.levels, level],
    }))

  const toggleChannel = (id: string): void =>
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))

  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (isLogKeyInvalid || isWindowInvalid || isForDurationInvalid || draft.name.trim() === '') {
      return
    }
    mutation.mutate({
      name: draft.name.trim(),
      expr: buildExpr(draft),
      threshold: draft.threshold,
      forDuration: draft.forDuration,
      severity: draft.severity,
      channels,
    })
  }

  return {
    draft,
    channels,
    canEdit,
    isPending: mutation.isPending,
    isLogKeyInvalid,
    isWindowInvalid,
    isForDurationInvalid,
    channelsQuery,
    applyPreset,
    update,
    toggleLevel,
    toggleChannel,
    onSubmit,
  }
}

/** Preset quick-fill buttons that seed the draft with a canonical §9 shape. */
function PresetButtons({ onApply }: { onApply: (draft: RuleDraft) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {RULE_PRESETS.map((preset) => (
        <Button
          key={preset.id}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onApply(preset.draft)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}

/** Metric + severity selects (the count-vs-rate guidance lives under metric). */
function MetricSeverityFields({
  draft,
  update,
}: {
  draft: RuleDraft
  update: (patch: Partial<RuleDraft>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label>Metric</Label>
        <Select value={draft.metric} onValueChange={(v) => update({ metric: v as AlertMetric })}>
          <SelectTrigger aria-label="Metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="count">count</SelectItem>
            <SelectItem value="rate">rate</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-white/40">Prefer rate over raw count for spiky traffic.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Severity</Label>
        <Select
          value={draft.severity}
          onValueChange={(v) => update({ severity: v as AlertSeverity })}
        >
          <SelectTrigger aria-label="Severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="critical">critical</SelectItem>
            <SelectItem value="warning">warning</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/** Level toggle-button group, labelled for assistive tech via the visible Label. */
function LevelToggles({
  levels,
  toggleLevel,
}: {
  levels: LogLevel[]
  toggleLevel: (level: LogLevel) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label id="rule-levels-label">Levels</Label>
      <div role="group" aria-labelledby="rule-levels-label" className="flex flex-wrap gap-1.5">
        {LEVEL_OPTIONS.map((level) => {
          const isActive = levels.includes(level)
          return (
            <button
              key={level}
              type="button"
              onClick={() => toggleLevel(level)}
              aria-pressed={isActive}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-xs',
                isActive
                  ? 'border-brand-500 bg-brand-500/15 text-brand-500'
                  : 'border-(--glass-border) text-white/55 hover:text-white/80',
              )}
            >
              {level}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** logKey input + the aggregate-by-logKey toggle, with convention validation. */
function LogKeyField({
  draft,
  isLogKeyInvalid,
  update,
}: {
  draft: RuleDraft
  isLogKeyInvalid: boolean
  update: (patch: Partial<RuleDraft>) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="rule-logkey">logKey (optional)</Label>
      <Input
        id="rule-logkey"
        value={draft.logKey ?? ''}
        onChange={(e) => update({ logKey: e.target.value })}
        placeholder="PAYMENT_CHARGE_FAILED or PAYMENT_*"
        className="font-mono"
        aria-invalid={isLogKeyInvalid}
      />
      {isLogKeyInvalid && (
        <p className="text-[11px] text-destructive">
          Invalid logKey — must match MODULE_ACTION_RESULT (or PREFIX_*).
        </p>
      )}
      <label className="flex items-center gap-2 text-[11px] text-white/55">
        <input
          type="checkbox"
          checked={draft.shouldGroupByLogKey}
          onChange={(e) => update({ shouldGroupByLogKey: e.target.checked })}
        />
        Aggregate by logKey (one notification per pattern)
      </label>
    </div>
  )
}

/** Comparator + threshold + window + for fields, with duration validation. */
function ThresholdFields({
  draft,
  isWindowInvalid,
  isForDurationInvalid,
  update,
}: {
  draft: RuleDraft
  isWindowInvalid: boolean
  isForDurationInvalid: boolean
  update: (patch: Partial<RuleDraft>) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <div className="space-y-1.5">
        <Label>Comparator</Label>
        <Select
          value={draft.comparator}
          onValueChange={(v) => update({ comparator: v as AlertComparator })}
        >
          <SelectTrigger aria-label="Comparator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARATORS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rule-threshold">Threshold</Label>
        <Input
          id="rule-threshold"
          type="number"
          value={draft.threshold}
          onChange={(e) => update({ threshold: Number(e.target.value) || 0 })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rule-window">Window</Label>
        <Input
          id="rule-window"
          value={draft.window}
          onChange={(e) => update({ window: e.target.value })}
          className="font-mono"
          aria-invalid={isWindowInvalid}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rule-for">For</Label>
        <Input
          id="rule-for"
          value={draft.forDuration}
          onChange={(e) => update({ forDuration: e.target.value })}
          className="font-mono"
          aria-invalid={isForDurationInvalid}
        />
      </div>
    </div>
  )
}

/** Notify-channels checkbox group, labelled for assistive tech via its Label. */
function ChannelToggles({
  channels,
  options,
  toggleChannel,
}: {
  channels: string[]
  options: NotificationChannel[]
  toggleChannel: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label id="rule-channels-label">Notify channels</Label>
      <div role="group" aria-labelledby="rule-channels-label" className="flex flex-wrap gap-2">
        {options.map((ch) => (
          <label key={ch.id} className="flex items-center gap-1.5 text-[11px] text-white/70">
            <input
              type="checkbox"
              checked={channels.includes(ch.id)}
              onChange={() => toggleChannel(ch.id)}
            />
            {ch.name}
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * The alert-rule authoring form + live ruler-YAML preview.
 *
 * @param props - Optional post-create callback.
 * @returns The two-pane form (builder + YAML) wired to `POST /alerts/rules`.
 */
export function RuleForm({ onCreated }: RuleFormProps) {
  const form = useRuleForm(onCreated)
  const { draft, channelsQuery } = form
  const isInvalid = form.isLogKeyInvalid || form.isWindowInvalid || form.isForDurationInvalid

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
        <PresetButtons onApply={form.applyPreset} />
        <div className="space-y-1.5">
          <Label htmlFor="rule-name">Name</Label>
          <Input
            id="rule-name"
            value={draft.name}
            onChange={(e) => form.update({ name: e.target.value })}
            placeholder="Error spike by logKey"
          />
        </div>
        <MetricSeverityFields draft={draft} update={form.update} />
        <LevelToggles levels={draft.levels} toggleLevel={form.toggleLevel} />
        <LogKeyField draft={draft} isLogKeyInvalid={form.isLogKeyInvalid} update={form.update} />
        <ThresholdFields
          draft={draft}
          isWindowInvalid={form.isWindowInvalid}
          isForDurationInvalid={form.isForDurationInvalid}
          update={form.update}
        />
        {channelsQuery.data && channelsQuery.data.length > 0 && (
          <ChannelToggles
            channels={form.channels}
            options={channelsQuery.data}
            toggleChannel={form.toggleChannel}
          />
        )}
        <p className="text-[11px] text-white/40">
          Tip: combine an error-rate-high rule AND a volume-above-floor rule, and rely on
          auto-resolve so incidents clear when the signal returns to normal.
        </p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!form.canEdit || form.isPending || isInvalid}>
            {form.isPending ? 'Saving…' : 'Create rule'}
          </Button>
          {!form.canEdit && (
            <Badge variant="outline" className="text-[11px]">
              Viewers cannot create rules
            </Badge>
          )}
        </div>
      </form>

      <RulerYamlPreview draft={draft} />
    </div>
  )
}
