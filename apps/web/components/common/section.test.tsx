/**
 * @fileoverview Component tests for {@link Section} — the titled page section.
 *
 * Covers the heading + anchor id, the optional info-affordance slot (present and
 * absent), and the default vs overridden spacing class.
 *
 * @module components/common/section.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { Section } from '@/components/common/section'

afterEach(() => {
  cleanup()
})

describe('Section', () => {
  /** The heading and body render, and the anchor id lands on the <section>. */
  it('renders the title, body, and anchor id', () => {
    const { container } = render(
      <Section id="rules" title="Alert rules">
        <p>section body</p>
      </Section>,
    )
    expect(screen.getByRole('heading', { name: 'Alert rules' })).toBeInTheDocument()
    expect(screen.getByText('section body')).toBeInTheDocument()
    expect(container.querySelector('section#rules')).not.toBeNull()
  })

  /** The optional info node renders beside the title when provided. */
  it('renders the optional info node', () => {
    render(
      <Section id="export" title="Export" info={<button type="button">why</button>}>
        <p>b</p>
      </Section>,
    )
    expect(screen.getByRole('button', { name: 'why' })).toBeInTheDocument()
  })

  /** Without an info node, no extra control appears beside the title. */
  it('omits the info slot when not provided', () => {
    render(
      <Section id="audit" title="Audit">
        <p>b</p>
      </Section>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  /** The default spacing class applies when `className` is omitted. */
  it('applies the default spacing class', () => {
    const { container } = render(
      <Section id="d" title="Default">
        <p>b</p>
      </Section>,
    )
    const section = container.querySelector('section')
    expect(section).toHaveClass('space-y-4')
    expect(section).toHaveClass('scroll-mt-20')
  })

  /** A provided `className` overrides the default spacing. */
  it('applies a provided className over the default', () => {
    const { container } = render(
      <Section id="c" title="Custom" className="space-y-3">
        <p>b</p>
      </Section>,
    )
    const section = container.querySelector('section')
    expect(section).toHaveClass('space-y-3')
    expect(section).not.toHaveClass('space-y-4')
  })
})
