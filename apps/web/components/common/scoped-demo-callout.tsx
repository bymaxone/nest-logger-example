/**
 * @fileoverview ScopedDemoCallout — the "scoped demo of <prod feature>"
 * banner that frames a feature honestly.
 *
 * Shared by every scoped-demo surface (alerting + on-call, tiered retention,
 * query-based RBAC, log export) so the framing reads identically. Lives in
 * `components/common` because it is cross-feature by design — never import a
 * feature folder's copy from another feature.
 *
 * @module components/common/scoped-demo-callout
 */

import type { ReactNode } from 'react'

import { GraduationCap } from 'lucide-react'

/** Props for {@link ScopedDemoCallout}. */
interface ScopedDemoCalloutProps {
  /** The production capability this surface is a scoped demo of. */
  feature: string
  /** The honest-scope explainer (what real platforms add / where to go next). */
  children: ReactNode
}

/**
 * Render a "scoped demo of <feature>" callout.
 *
 * @param props - The demonstrated feature and its explainer copy.
 * @returns The framed callout banner.
 */
export function ScopedDemoCallout({ feature, children }: ScopedDemoCalloutProps) {
  return (
    <div className="flex gap-2 rounded-md border border-(--glass-border) bg-(--glass-bg) p-3 text-sm text-white/60">
      <GraduationCap aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
      <p>
        <strong className="text-white/80">Scoped demo of {feature}.</strong> {children}
      </p>
    </div>
  )
}
