/**
 * @fileoverview Section — a titled page section with an anchor id and an optional
 * info affordance.
 *
 * Shared by the governance-style pages (Alerts, Maintenance, Settings) so a
 * section heading can carry a `<FeatureInfo id=… />` explainer without each page
 * re-declaring the same shell.
 *
 * @module components/common/section
 */

import type { ReactNode } from 'react'

interface SectionProps {
  /** Anchor id for in-page deep links. */
  id: string
  /** Section heading. */
  title: string
  /** Optional info affordance (e.g. `<FeatureInfo id=… />`) shown beside the title. */
  info?: ReactNode
  /** Section body. */
  children: ReactNode
  /** Extra classes for the `<section>` (defaults preserve the page rhythm). */
  className?: string
}

/**
 * A titled page section with an anchor id and an optional info modal trigger.
 *
 * @param props - {@link SectionProps}.
 * @returns The section wrapper.
 */
export function Section({ id, title, info, children, className = 'space-y-4' }: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-20 ${className}`}>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {info}
      </div>
      {children}
    </section>
  )
}
