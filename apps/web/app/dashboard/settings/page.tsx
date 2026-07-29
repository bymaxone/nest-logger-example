/**
 * @fileoverview Settings & Environment page.
 *
 * A read-only reference surface for how this dashboard is wired: the backend
 * endpoints it talks to, the two-tier log model, and the header-based RBAC roles.
 * Live, mutable controls intentionally live elsewhere (data source / tenant / role
 * in the top bar; retention / redaction in Maintenance) — this page documents the
 * environment rather than duplicating those controls. Replaces the previously
 * dead `/settings` navigation entry.
 *
 * @module app/settings/page
 */

import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/app-shell'
import { Section } from '@/components/common/section'
import { FeatureInfo } from '@/components/common/feature-info'

// AppShell's top bar reads source/tenant/role from the URL (useSearchParams), so this
// page must render dynamically rather than be statically prerendered (matches the other pages).
export const dynamic = 'force-dynamic'

/** Default backend endpoints, mirroring `.env.example`, used when the env var is unset. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const GRAFANA_URL = process.env.NEXT_PUBLIC_GRAFANA_URL ?? 'http://localhost:3000'

/** A single label/value row inside a card. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <span className="text-white/55">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  )
}

/** A bordered glass card wrapper. */
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-(--glass-border) bg-(--glass-bg) p-4">{children}</div>
  )
}

/**
 * Settings & Environment page.
 *
 * @returns The environment, data-tier, and access-role reference sections in the shell.
 */
export default function SettingsPage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Settings &amp; Environment</h1>
          <p className="text-sm text-white/55">
            How this dashboard is wired. Live controls live in the top bar (data source, tenant,
            role) and on the Maintenance page (retention, redaction).
          </p>
        </header>

        <Section
          id="endpoints"
          title="Backend endpoints"
          info={<FeatureInfo id="endpoints" />}
          className="space-y-3"
        >
          <Card>
            <Row label="Logs read-API (apps/api)" value={API_URL} />
            <Row label="Grafana (traces / dashboards)" value={GRAFANA_URL} />
            <Row label="Live tail" value="SSE via /api/logs/stream (same-origin proxy)" />
          </Card>
        </Section>

        <Section
          id="tiers"
          title="Log tiers"
          info={<FeatureInfo id="logTiers" />}
          className="space-y-3"
        >
          <Card>
            <Row label="Loki" value="info+ — full-fidelity aggregation tier" />
            <Row label="Postgres" value="warn+ — durable / audit tier (TTL-swept)" />
            <p className="mt-2 text-xs text-white/45">
              The differing volumes are by design: switch the source in the top bar to compare.
            </p>
          </Card>
        </Section>

        <Section
          id="roles"
          title="Access roles (header-based RBAC)"
          info={<FeatureInfo id="accessRoles" />}
          className="space-y-3"
        >
          <Card>
            <Row label="viewer" value="read logs & aggregates" />
            <Row label="operator" value="viewer + redaction governance" />
            <Row label="admin" value="operator + audit trail & maintenance" />
            <p className="mt-2 text-xs text-white/45">
              Demo RBAC is header-driven and hard-fails in production — wire real auth before
              relying on it.
            </p>
          </Card>
        </Section>
      </div>
    </AppShell>
  )
}
