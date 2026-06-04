/**
 * @fileoverview RulerYamlPreview — live "Loki ruler YAML" panel.
 *
 * Renders {@link ruleToRulerYaml} for the current form draft in a mono code block,
 * updating as the form changes. It is the "verify in Grafana" teaching device:
 * the same rule, expressed as the ruler group you would commit to Loki.
 *
 * @module components/alerts/ruler-yaml
 */

'use client'

import { type RuleDraft, ruleToRulerYaml } from '@/lib/ruler-yaml'

/**
 * Live ruler-YAML preview for an alert-rule draft.
 *
 * @param props - The current rule draft.
 * @returns A labelled mono code block of the equivalent ruler group.
 */
export function RulerYamlPreview({ draft }: { draft: RuleDraft }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-white/55">Equivalent Loki ruler YAML</span>
      <pre className="overflow-x-auto rounded-lg border border-(--glass-border) bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/80">
        <code>{ruleToRulerYaml(draft)}</code>
      </pre>
    </div>
  )
}
