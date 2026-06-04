/**
 * @fileoverview Alerts & Incidents page — rule authoring, notification channels,
 * and the incident lifecycle (`DASHBOARD.md` §9).
 *
 * A thin server-component shell that frames the surface as a scoped demo of
 * log-based alerting + on-call, then mounts the Rules, Channels, and Incidents
 * sections (each a `'use client'` component reading the global RBAC identity).
 *
 * @module app/alerts/page
 */

import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/app-shell'
import { ScopedDemoCallout } from '@/components/common/scoped-demo-callout'
import { RuleForm } from '@/components/alerts/rule-form'
import { RuleList } from '@/components/alerts/rule-list'
import { ChannelRegistry } from '@/components/alerts/channel-registry'
import { IncidentList } from '@/components/alerts/incident-list'

// RBAC-driven: the sections read role/tenant from the URL, so render dynamically.
export const dynamic = 'force-dynamic'

/** A titled page section with an anchor id. */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-4 scroll-mt-20">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

/**
 * Alerts & Incidents page.
 *
 * @returns The rules / channels / incidents sections inside the app shell.
 */
export default function AlertsPage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold text-foreground">Alerts &amp; Incidents</h1>
          <ScopedDemoCallout feature="log-based alerting + on-call">
            In production you&apos;d use the Loki ruler → Alertmanager → PagerDuty/Slack; here the
            same shape runs as a NestJS cron over the <code className="font-mono">/logs</code> query
            layer with mockable channels.
          </ScopedDemoCallout>
        </header>

        <Section id="rules" title="Alert rules">
          <RuleForm />
          <RuleList />
        </Section>

        <Section id="channels" title="Notification channels">
          <ChannelRegistry />
        </Section>

        <Section id="incidents" title="Incidents">
          <IncidentList />
        </Section>
      </div>
    </AppShell>
  )
}
