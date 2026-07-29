/**
 * @fileoverview Component tests for {@link FeatureInfo} and the feature-info
 * registry.
 *
 * Verifies a registry entry renders through the info button (title + summary +
 * body on open), that a custom label flows through, and that EVERY registered
 * entry's body renders without error — which exercises the inline `Code` token
 * used across the explanations.
 *
 * @module components/common/feature-info.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FeatureInfo } from '@/components/common/feature-info'
import { FEATURE_INFO, type FeatureInfoId } from '@/components/common/feature-info-content'

afterEach(() => {
  cleanup()
})

describe('FeatureInfo', () => {
  /** A known entry renders its title + summary, and the body (with a code token) on open. */
  it('renders a registry entry through the info modal', async () => {
    const user = userEvent.setup()
    const entry = FEATURE_INFO.pipelineHealth
    render(<FeatureInfo id="pipelineHealth" />)
    await user.click(screen.getByRole('button', { name: `About ${entry.title}` }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(entry.title)
    expect(dialog).toHaveTextContent(entry.summary)
    // A reserved logKey rendered through the inline <Code> token.
    expect(dialog).toHaveTextContent('LOGGER_DESTINATION_WRITE_FAILED')
  })

  /** A custom label flows through to the trigger. */
  it('forwards a custom label to the trigger', () => {
    render(<FeatureInfo id="liveTail" label="About live tail" />)
    expect(screen.getByRole('button', { name: 'About live tail' })).toBeInTheDocument()
  })

  /** Every registered explanation renders without throwing — covers all bodies. */
  it('renders every registered entry body', () => {
    const ids = Object.keys(FEATURE_INFO) as FeatureInfoId[]
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      const { unmount } = render(<div>{FEATURE_INFO[id].body}</div>)
      unmount()
    }
  })
})
