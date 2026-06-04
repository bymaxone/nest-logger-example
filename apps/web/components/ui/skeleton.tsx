/**
 * @fileoverview Skeleton placeholder primitive for loading states.
 *
 * Used while async data is fetching (log list, metrics, charts).
 */

import { cn } from '@/lib/utils'

/**
 * Animated skeleton placeholder that pulses in the dark glass theme.
 *
 * @param className - Shape and size utilities (e.g. `h-4 w-48 rounded-full`).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-pulse rounded-md bg-(--glass-bg-raised)', className)} {...props} />
  )
}

export { Skeleton }
