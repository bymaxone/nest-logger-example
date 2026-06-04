/**
 * @fileoverview Unit test for {@link ScopedDemoCallout} — verifies it renders the
 * feature name and the explainer children.
 *
 * @module components/common/scoped-demo-callout.test
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { ScopedDemoCallout } from './scoped-demo-callout'

describe('ScopedDemoCallout', () => {
  /** The callout must name the demonstrated feature and render its explainer. */
  it('renders the feature and children', () => {
    const { container } = render(
      <ScopedDemoCallout feature="tiered retention">
        Real platforms add cold storage tiers.
      </ScopedDemoCallout>,
    )
    expect(container.textContent).toContain('Scoped demo of tiered retention.')
    expect(container.textContent).toContain('Real platforms add cold storage tiers.')
  })
})
