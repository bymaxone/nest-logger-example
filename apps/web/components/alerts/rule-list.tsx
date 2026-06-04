/**
 * @fileoverview RuleList — the table of existing alert rules.
 *
 * Lists rules from `GET /alerts/rules` and lets editors enable/disable each via
 * `PATCH /alerts/rules/:id`. Read-only for viewers. The query key is shared with
 * the form so a create refreshes the table.
 *
 * @module components/alerts/rule-list
 */

'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useRbac } from '@/hooks/use-rbac'
import { type AlertRule, listRules, updateRule } from '@/lib/alerts-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * The existing-rules table with per-row enable/disable.
 *
 * @returns The rules table bound to the active RBAC identity.
 */
export function RuleList() {
  const rbac = useRbac()
  const queryClient = useQueryClient()
  const canEdit = rbac.role !== 'viewer'

  // Track the row whose toggle is in flight so only that row shows busy — the
  // mutation's shared `isPending` would otherwise disable every row at once.
  const [pendingId, setPendingId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<AlertRule[]>({
    queryKey: ['alert-rules', rbac.role, rbac.tenantId],
    queryFn: () => listRules(rbac),
  })

  const toggle = useMutation({
    mutationFn: (rule: AlertRule) => updateRule(rule.id, { isEnabled: !rule.isEnabled }, rbac),
    onMutate: (rule: AlertRule) => setPendingId(rule.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
    },
    onError: (err: unknown) => {
      toast.error('Could not update rule', {
        description: err instanceof Error ? err.message : undefined,
      })
    },
    onSettled: () => setPendingId(null),
  })

  if (isLoading) return <p className="text-sm text-white/40">Loading rules…</p>
  if (isError) return <p className="text-sm text-destructive">Failed to load rules.</p>
  if (!data || data.length === 0) return <p className="text-sm text-white/40">No rules yet.</p>

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Expression</TableHead>
          <TableHead>For</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((rule) => {
          const isRowPending = pendingId === rule.id
          return (
            <TableRow key={rule.id} aria-busy={isRowPending}>
              <TableCell className="font-medium">{rule.name}</TableCell>
              <TableCell className="max-w-80 truncate font-mono text-xs text-white/60">
                {rule.expr}
              </TableCell>
              <TableCell className="font-mono text-xs">{rule.forDuration}</TableCell>
              <TableCell>
                <Badge variant={rule.severity === 'critical' ? 'destructive' : 'secondary'}>
                  {rule.severity}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={rule.isEnabled ? 'default' : 'outline'}>
                  {rule.isEnabled ? 'enabled' : 'disabled'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit || isRowPending}
                  onClick={() => toggle.mutate(rule)}
                >
                  {rule.isEnabled ? 'Disable' : 'Enable'}
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
