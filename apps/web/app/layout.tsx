/**
 * @fileoverview Root App Router layout — loads Geist fonts, forces the dark
 * class on `<html>` (design system is dark-only), and wraps the tree in
 * `<NuqsAdapter>` (mandatory in nuqs v2) and `<Providers>` (QueryClient +
 * Sonner Toaster). `suppressHydrationWarning` is placed on `<html>` to
 * prevent React hydration mismatches from the statically injected font-variable
 * class names and the hard-coded `dark` class.
 *
 * @module app/layout
 */

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'nest-logger-example — Log Observability',
  description:
    'A first-class log observability dashboard for @bymax-one/nest-logger — fire, stream, and explore logs.',
}

/**
 * Root App Router layout — Geist fonts, forced dark class, NuqsAdapter,
 * and the QueryClient/Toaster provider boundary.
 *
 * @param props - Layout props.
 * @param props.children - Page or nested layout subtree.
 * @returns The full HTML document shell.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
      suppressHydrationWarning
    >
      <body>
        {/* nuqs v2 made the adapter MANDATORY — without it every useQueryState() throws
            at runtime, breaking the shareable-deep-link filters. */}
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </body>
    </html>
  )
}
