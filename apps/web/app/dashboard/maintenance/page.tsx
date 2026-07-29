/**
 * @fileoverview Maintenance & Governance page — retention, export, RBAC,
 * redaction-at-source, and the audit trail (`DASHBOARD.md` §10).
 *
 * A thin server-component shell that mounts each section (every one a `'use client'`
 * component reading the global RBAC identity) under a stable anchor id so the
 * surfaces can be deep-linked.
 *
 * @module app/maintenance/page
 */

import { AppShell } from '@/components/layout/app-shell'
import { Section } from '@/components/common/section'
import { FeatureInfo } from '@/components/common/feature-info'
import { RetentionPanel } from '@/components/maintenance/retention-panel'
import { ExportPanel } from '@/components/maintenance/export-panel'
import { RbacPanel } from '@/components/maintenance/rbac-panel'
import { RedactionHero } from '@/components/maintenance/redaction-hero'
import { AuditTable } from '@/components/maintenance/audit-table'

// RBAC-driven: the sections read role/tenant from the URL, so render dynamically.
export const dynamic = 'force-dynamic'

/**
 * Maintenance & Governance page.
 *
 * @returns The retention / export / RBAC / redaction / audit sections in the shell.
 */
export default function MaintenancePage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Maintenance &amp; Governance</h1>
          <p className="text-sm text-white/55">
            How the logger is operated in a real deployment — retention, export, access control,
            redaction proof, and the audit trail.
          </p>
        </header>

        <Section
          id="retention"
          title="Retention &amp; storage"
          info={<FeatureInfo id="retention" />}
        >
          <RetentionPanel />
        </Section>

        <Section id="export" title="Export" info={<FeatureInfo id="export" />}>
          <ExportPanel />
        </Section>

        <Section
          id="rbac"
          title="RBAC (query-based, multi-tenant)"
          info={<FeatureInfo id="rbac" />}
        >
          <RbacPanel />
        </Section>

        <Section
          id="redaction"
          title="Governance — redaction at source"
          info={<FeatureInfo id="redaction" />}
        >
          <RedactionHero />
        </Section>

        <Section id="audit" title="Audit trail" info={<FeatureInfo id="audit" />}>
          <AuditTable />
        </Section>
      </div>
    </AppShell>
  )
}
