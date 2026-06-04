/**
 * @fileoverview Sonner toast wrapper — dark theme matching design system.
 *
 * The Toaster is placed in the root layout. Individual toasts are triggered
 * via `toast()` from the `sonner` package.
 */

'use client'

import type { ComponentProps } from 'react'
import { Toaster as SonnerToaster } from 'sonner'

export type ToasterProps = ComponentProps<typeof SonnerToaster>

/**
 * App-wide toast container styled for the dark design system.
 *
 * Place this once inside RootLayout, after the main content.
 *
 * @param props - Forwarded to the underlying Sonner `Toaster`. Override
 *   `position` or `theme` to change per-use defaults.
 */
function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--glass-card-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(16px)',
          fontFamily: 'var(--font-mono)',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
