/**
 * @fileoverview Route-level error boundary for the dashboard.
 *
 * Catches render/runtime errors thrown by a page subtree and offers a retry,
 * so a single failing panel never takes down the whole tab.
 *
 * @module app/error
 */

'use client'

import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  /** The error that was thrown. */
  error: Error & { digest?: string }
  /** Re-render the segment to attempt recovery. */
  reset: () => void
}

/**
 * Dashboard error boundary.
 *
 * @param props - {@link ErrorBoundaryProps}.
 * @returns A recoverable error panel.
 */
export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 p-12">
      <h2 className="font-mono text-lg font-bold text-destructive">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        {error.message || 'An unexpected error occurred while rendering this page.'}
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
