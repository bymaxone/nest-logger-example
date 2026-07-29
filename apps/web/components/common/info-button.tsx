/**
 * @fileoverview InfoButton — an icon-only "info" affordance that opens a modal
 * explaining a feature.
 *
 * Used across the dashboard to document what each panel / resource means and how
 * the `@bymax-one/nest-logger` library produces it. The trigger is an explicit,
 * keyboard- and touch-reachable button (not a hover-only tooltip) opening a
 * focused modal — the accessible pattern for explaining computed metrics and
 * jargon on a data dashboard.
 *
 * @module components/common/info-button
 */

'use client'

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface InfoButtonProps {
  /** Modal heading — what this feature is. */
  title: string
  /** One-line summary shown directly under the title. */
  summary?: ReactNode
  /** Rich body content (paragraphs, lists). */
  children: ReactNode
  /** Accessible label for the trigger (defaults to `About {title}`). */
  label?: string | undefined
  /** Extra classes for the trigger button. */
  className?: string | undefined
}

/**
 * Icon-only info trigger that opens a focused explanation modal.
 *
 * @param props - {@link InfoButtonProps}.
 * @returns The info button and its dialog.
 */
export function InfoButton({ title, summary, children, label, className }: InfoButtonProps) {
  return (
    <Dialog>
      <DialogTrigger
        aria-label={label ?? `About ${title}`}
        className={cn(
          'inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full',
          'text-white/35 transition-colors hover:bg-white/10 hover:text-white/80',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {summary !== undefined ? <DialogDescription>{summary}</DialogDescription> : null}
        </DialogHeader>
        <div className="mt-1 space-y-3 text-sm leading-relaxed text-white/70">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
