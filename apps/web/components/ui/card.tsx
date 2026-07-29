/**
 * @fileoverview Card primitive — glassmorphism style matching design system.
 *
 * All card sub-components use the glass surface pattern:
 *   bg: var(--glass-card-bg), border: var(--glass-border), backdrop-blur
 *
 * An optional top accent gradient line (brand orange) can be added via the
 * `accent` prop on CardHeader.
 */

import * as React from 'react'

import { cn } from '@/lib/utils'

/** The brand-orange hairline drawn across the top edge of every card. */
export const CARD_ACCENT_LINE_CLASS =
  'bg-linear-to-r pointer-events-none absolute inset-x-0 top-0 h-px from-transparent via-[rgba(255,98,36,0.4)] to-transparent'

/** The glass surface itself. */
export const CARD_SURFACE_CLASS =
  'relative overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] text-card-foreground backdrop-blur-lg'

/**
 * Glassmorphism card container.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn(CARD_SURFACE_CLASS, className)} {...props}>
      <span aria-hidden="true" className={CARD_ACCENT_LINE_CLASS} />
      {children}
    </div>
  ),
)
Card.displayName = 'Card'

/**
 * Card header region — contains title and description.
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6 pb-4', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

/**
 * Card title — monospace font, bold.
 */
const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]',
        className,
      )}
      {...props}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

/**
 * The override a card whose title is real content applies, restoring a
 * readable display heading in place of the muted section label.
 */
export const CARD_TITLE_CONTENT_CLASS = 'normal-case tracking-tight text-[rgba(255,255,255,0.9)]'

/**
 * Card description — muted secondary text.
 */
const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

/**
 * Card content region.
 */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

/**
 * Card footer region — typically holds actions.
 */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
