/**
 * @fileoverview IncidentList — the PagerDuty-style incident lifecycle.
 *
 * Lists incidents from `GET /incidents` and drives the lifecycle via
 * `PATCH /incidents/:id`. From an open incident (`triggered` or `snoozed`) the
 * responder can Acknowledge or Snooze; Resolve is available until resolved.
 * Actions are state-gated (no "Resolve" on a resolved incident) and RBAC-gated
 * (viewers cannot transition).
 * Each row shows an immutable timeline and a "View in Explorer →" deep-link built
 * from the shared {@link explorerHref} helper (logKey + firing window). The server
 * scopes listing to admins; non-admins receive an empty list.
 *
 * @module components/alerts/incident-list
 */

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

import { useRbac } from '@/hooks/use-rbac'
import {
  type Incident,
  type IncidentStatus,
  listIncidents,
  type SnoozeDuration,
  transitionIncident,
} from '@/lib/alerts-api'
import { explorerHref } from '@/lib/explorer-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IncidentTimeline } from './incident-timeline'

/** Snooze durations offered in the lifecycle menu. */
const SNOOZE_DURATIONS: SnoozeDuration[] = ['1h', '4h', '8h', '24h']

/** Poll cadence (ms) for cron-opened incidents. */
const INCIDENT_POLL_MS = 10_000

/** Badge variant per lifecycle state. */
const STATUS_VARIANT: Record<IncidentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> =
  {
    triggered: 'destructive',
    acknowledged: 'secondary',
    snoozed: 'outline',
    resolved: 'default',
  }

/**
 * The incident table with state-gated, RBAC-gated lifecycle actions.
 *
 * @returns The Incidents section bound to the active RBAC identity.
 */
export function IncidentList() {
  const rbac = useRbac()
  const queryClient = useQueryClient()
  const canTransition = rbac.role !== 'viewer'

  const { data, isLoading, isError } = useQuery<Incident[]>({
    queryKey: ['incidents', rbac.role, rbac.tenantId],
    queryFn: () => listIncidents(rbac),
    // Incidents are opened by a server-side cron, so poll to surface new ones
    // without a manual refresh.
    refetchInterval: INCIDENT_POLL_MS,
  })

  const transition = useMutation({
    mutationFn: (vars: {
      id: string
      action: 'acknowledge' | 'snooze' | 'resolve'
      snooze?: SnoozeDuration
    }) => transitionIncident(vars.id, vars.action, rbac, vars.snooze),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents'] })
    },
    onError: (err: unknown) =>
      toast.error('Transition failed', {
        description: err instanceof Error ? err.message : undefined,
      }),
  })

  if (isLoading) return <p className="text-sm text-white/40">Loading incidents…</p>
  if (isError) return <p className="text-sm text-destructive">Failed to load incidents.</p>
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-white/40">
        No incidents. As admin, create a rule and fire its trigger to open one.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {data.map((incident) => {
        // Acknowledge / Snooze apply while the incident is open (triggered or snoozed);
        // Snooze also remains available once acknowledged. Resolve until resolved.
        const isOpen = incident.status === 'triggered' || incident.status === 'snoozed'
        // Only the row whose transition is in flight is blocked — not the whole list.
        const rowPending = transition.isPending && transition.variables?.id === incident.id
        const canAck = canTransition && isOpen
        const canSnooze = canTransition && (isOpen || incident.status === 'acknowledged')
        const canResolve = canTransition && incident.status !== 'resolved'
        return (
          <li
            key={incident.id}
            className="space-y-2 rounded-lg border border-(--glass-border) bg-(--glass-bg) p-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={STATUS_VARIANT[incident.status]}>{incident.status}</Badge>
              <span className="font-medium">{incident.rule?.name ?? 'Unknown rule'}</span>
              {incident.logKey && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {incident.logKey}
                </Badge>
              )}
              {incident.status === 'snoozed' && incident.resolvedAt && (
                <span className="text-[11px] text-white/45">
                  snoozed until {new Date(incident.resolvedAt).toLocaleString()}
                </span>
              )}
              <Link
                href={explorerHref({
                  ...(incident.logKey ? { logKey: incident.logKey } : {}),
                  from: incident.openedAt,
                })}
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline"
              >
                View in Explorer <ArrowRight aria-hidden className="h-3 w-3" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canAck || rowPending}
                onClick={() => transition.mutate({ id: incident.id, action: 'acknowledge' })}
              >
                Acknowledge
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canSnooze || rowPending}
                  >
                    Snooze <ChevronDown aria-hidden className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {SNOOZE_DURATIONS.map((duration) => (
                    <DropdownMenuItem
                      key={duration}
                      onSelect={() =>
                        transition.mutate({ id: incident.id, action: 'snooze', snooze: duration })
                      }
                    >
                      {duration}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canResolve || rowPending}
                onClick={() => transition.mutate({ id: incident.id, action: 'resolve' })}
              >
                Resolve
              </Button>
            </div>

            <div className="border-t border-(--glass-border) pt-2">
              <IncidentTimeline timeline={incident.timeline} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
