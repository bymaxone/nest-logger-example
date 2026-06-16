/**
 * @fileoverview FeatureInfo — a one-liner that drops the right explanation modal
 * onto a panel.
 *
 * Looks the copy up in the `lib/feature-info` registry by id and renders it
 * through `InfoButton`, so a component only needs `<FeatureInfo id="latency" />`
 * to gain a documented, accessible info affordance.
 *
 * @module components/common/feature-info
 */

'use client'

import { InfoButton } from './info-button'
import { FEATURE_INFO, type FeatureInfoId } from './feature-info-content'

interface FeatureInfoProps {
  /** Which registry entry to render. */
  id: FeatureInfoId
  /** Optional override for the trigger's accessible label. */
  label?: string
  /** Extra classes for the trigger button. */
  className?: string
}

/**
 * Render the info button + modal for a registered feature.
 *
 * @param props - {@link FeatureInfoProps}.
 * @returns The feature's info affordance.
 */
export function FeatureInfo({ id, label, className }: FeatureInfoProps) {
  const entry = FEATURE_INFO[id]
  return (
    <InfoButton title={entry.title} summary={entry.summary} label={label} className={className}>
      {entry.body}
    </InfoButton>
  )
}
