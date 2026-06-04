/**
 * @fileoverview ChannelRegistry — notification channel receivers.
 *
 * Lists channels from `GET /alerts/channels` with their type, **masked** endpoint,
 * and routed severities; admins can register new `slack` / `webhook` / `email-mock`
 * channels with per-severity routing; everyone (operator+) can test-fire a channel
 * (`POST /alerts/channels/:id/test`). Deliveries are mocked/logged server-side so
 * the demo runs offline. Sensitive endpoints never render in full (see
 * {@link maskEndpoint}). Viewers cannot list channels.
 *
 * @module components/alerts/channel-registry
 */

'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

import { useRbac } from '@/hooks/use-rbac'
import {
  type ChannelType,
  createChannel,
  listChannels,
  maskEndpoint,
  type NotificationChannel,
  testChannel,
} from '@/lib/alerts-api'
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

/** Selectable channel types. */
const CHANNEL_TYPES: ChannelType[] = ['slack', 'webhook', 'email-mock']

/** Severities a channel can route. */
const SEVERITIES = ['critical', 'warning'] as const

/** A blank create-form draft (seeds the `DASHBOARD.md` §9 routing default: both severities). */
const EMPTY_DRAFT: NotificationChannel = {
  id: '',
  type: 'slack',
  name: '',
  endpoint: '',
  severities: ['critical', 'warning'],
}

/**
 * The channel registry — list + admin create form + per-row test-fire.
 *
 * @returns The Channels section bound to the active RBAC identity.
 */
export function ChannelRegistry() {
  const rbac = useRbac()
  const queryClient = useQueryClient()
  const isAdmin = rbac.role === 'admin'
  const canList = rbac.role !== 'viewer'

  const { data, isLoading, isError } = useQuery<NotificationChannel[]>({
    queryKey: ['alert-channels', rbac.role, rbac.tenantId],
    queryFn: () => listChannels(rbac),
    enabled: canList,
  })

  const [draft, setDraft] = useState<NotificationChannel>(EMPTY_DRAFT)

  const create = useMutation({
    mutationFn: (channel: NotificationChannel) => createChannel(channel, rbac),
    onSuccess: () => {
      toast.success('Channel registered')
      setDraft(EMPTY_DRAFT)
      void queryClient.invalidateQueries({ queryKey: ['alert-channels'] })
    },
    onError: (err: unknown) =>
      toast.error('Could not register channel', {
        description: err instanceof Error ? err.message : undefined,
      }),
  })

  const test = useMutation({
    mutationFn: (id: string) => testChannel(id, rbac),
    onSuccess: (res) =>
      res.ok ? toast.success('Test delivery dispatched') : toast.error('Test delivery failed'),
    onError: (err: unknown) =>
      toast.error('Test-fire failed', {
        description: err instanceof Error ? err.message : undefined,
      }),
  })

  const toggleSeverity = (severity: 'critical' | 'warning'): void =>
    setDraft((prev) => ({
      ...prev,
      severities: prev.severities.includes(severity)
        ? prev.severities.filter((s) => s !== severity)
        : [...prev.severities, severity],
    }))

  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (draft.id.trim() === '' || draft.name.trim() === '' || draft.endpoint.trim() === '') return
    if (draft.severities.length === 0) return
    create.mutate(draft)
  }

  if (!canList) {
    return <p className="text-sm text-white/40">Viewers cannot see notification channels.</p>
  }

  return (
    <div className="space-y-5">
      {isLoading && <p className="text-sm text-white/40">Loading channels…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load channels.</p>}

      {data && data.length > 0 && (
        <ul className="divide-y divide-(--glass-border) rounded-lg border border-(--glass-border)">
          {data.map((ch) => (
            <li key={ch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {ch.type}
              </Badge>
              <div className="min-w-0">
                <p className="text-sm font-medium">{ch.name}</p>
                <p className="truncate font-mono text-[11px] text-white/45">
                  {maskEndpoint(ch.endpoint)}
                </p>
              </div>
              <div className="flex gap-1">
                {ch.severities.map((s) => (
                  <Badge key={s} variant={s === 'critical' ? 'destructive' : 'secondary'}>
                    {s}
                  </Badge>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={test.isPending}
                onClick={() => test.mutate(ch.id)}
              >
                <Send aria-hidden className="h-3.5 w-3.5" /> Send test
              </Button>
            </li>
          ))}
        </ul>
      )}

      {isAdmin ? (
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-lg border border-(--glass-border) bg-(--glass-bg) p-4"
        >
          <p className="text-sm font-medium">Register a channel</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ch-id">Id</Label>
              <Input
                id="ch-id"
                value={draft.id}
                onChange={(e) => setDraft((p) => ({ ...p, id: e.target.value }))}
                placeholder="slack-critical"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-type">Type</Label>
              <Select
                value={draft.type}
                onValueChange={(v) => setDraft((p) => ({ ...p, type: v as ChannelType }))}
              >
                <SelectTrigger id="ch-type" aria-label="Channel type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-name">Name</Label>
              <Input
                id="ch-name"
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="Slack #alerts-critical"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-endpoint">
                {draft.type === 'email-mock' ? 'Address' : 'Webhook URL'}
              </Label>
              <Input
                id="ch-endpoint"
                value={draft.endpoint}
                onChange={(e) => setDraft((p) => ({ ...p, endpoint: e.target.value }))}
                placeholder={
                  draft.type === 'email-mock'
                    ? 'ops@example.com'
                    : 'https://hooks.slack.com/services/…'
                }
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Routed severities</Label>
            <div className="flex gap-4">
              {SEVERITIES.map((s) => (
                <label
                  key={s}
                  htmlFor={`ch-severity-${s}`}
                  className="flex items-center gap-1.5 text-xs text-white/70"
                >
                  <input
                    id={`ch-severity-${s}`}
                    type="checkbox"
                    checked={draft.severities.includes(s)}
                    onChange={() => toggleSeverity(s)}
                    className="accent-(--color-primary) focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Registering…' : 'Add channel'}
          </Button>
        </form>
      ) : (
        <p className="text-[11px] text-white/40">Only admins can register new channels.</p>
      )}
    </div>
  )
}
