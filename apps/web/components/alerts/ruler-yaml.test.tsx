/**
 * @fileoverview Component tests for {@link RulerYamlPreview} — the live Loki
 * ruler-YAML panel that mirrors the current rule draft.
 *
 * `ruleToRulerYaml` is the real implementation so the rendered code block is
 * asserted against the exact YAML it produces. The preview is a pure presenter,
 * so there is no network or RBAC to mock.
 *
 * @module components/alerts/ruler-yaml.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { type RuleDraft, ruleToRulerYaml } from '@/lib/ruler-yaml'
import { RulerYamlPreview } from './ruler-yaml'

afterEach(() => {
  cleanup()
})

/** A representative draft exercising levels, logKey grouping, and severity. */
const DRAFT: RuleDraft = {
  name: 'Error spike by logKey',
  metric: 'count',
  levels: ['error', 'fatal'],
  shouldGroupByLogKey: true,
  comparator: '>',
  threshold: 10,
  window: '5m',
  forDuration: '2m',
  severity: 'critical',
}

describe('RulerYamlPreview', () => {
  /** The panel renders its heading label — proves the body is not stripped to `{}`. */
  it('renders the "Equivalent Loki ruler YAML" heading', () => {
    render(<RulerYamlPreview draft={DRAFT} />)
    expect(screen.getByText('Equivalent Loki ruler YAML')).toBeInTheDocument()
  })

  /** The code block renders the exact YAML that ruleToRulerYaml produces for the draft. */
  it('renders the exact ruler YAML for the given draft', () => {
    const { container } = render(<RulerYamlPreview draft={DRAFT} />)
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code?.textContent).toBe(ruleToRulerYaml(DRAFT))
    // The derived alert id, the threshold expression, and the severity label all
    // appear — so the draft is genuinely threaded through the preview body.
    expect(code?.textContent).toContain('alert: ErrorSpikeByLogKey')
    expect(code?.textContent).toContain('> 10')
    expect(code?.textContent).toContain('severity: critical')
  })
})
