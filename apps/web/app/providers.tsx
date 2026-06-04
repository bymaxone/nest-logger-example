/**
 * @fileoverview Root client provider boundary — TanStack Query cache and
 * Sonner toast portal. Kept separate from `layout.tsx` so only this leaf
 * is a Client Component while the layout tree stays a Server Component.
 *
 * @module app/providers
 */

'use client'

import { type ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'

/** Default query stale-time in milliseconds — balances freshness vs network chatter. */
const DEFAULT_STALE_TIME_MS = 30_000

interface ProvidersProps {
  /** Page or nested layout content rendered inside the provider tree. */
  children: ReactNode
}

/**
 * Root client provider — TanStack Query cache + the Sonner toast portal.
 *
 * The QueryClient is created once per browser tab (lazy `useState` init) so it
 * survives re-renders without being recreated.
 *
 * @param props - Provider props.
 * @param props.children - The subtree to wrap.
 * @returns A `QueryClientProvider` enclosing the children and a `Toaster` portal.
 */
export default function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: DEFAULT_STALE_TIME_MS, refetchOnWindowFocus: false },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  )
}
