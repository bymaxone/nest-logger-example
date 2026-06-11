/**
 * @fileoverview Next.js configuration for apps/web.
 *
 * Security headers are applied globally. CSP allows same-origin resources and
 * permits `unsafe-inline` for RSC streaming / React hydration — tighten to
 * nonce-based when API data is wired. `frame-ancestors 'none'` blocks
 * clickjacking; HSTS is enabled in production only.
 *
 * @module next.config
 */

import path from 'node:path'
import process from 'node:process'

const isProduction = process.env['NODE_ENV'] === 'production'

// The dashboard fetches the logs read-API directly from the browser, so its
// origin must be in `connect-src`. The SSE live tail is proxied same-origin
// (`/api/logs/stream`) and is covered by `'self'`.
const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
const apiOrigin = (() => {
  try {
    return new URL(apiBase).origin
  } catch {
    return ''
  }
})()
const connectSrc = ["'self'", apiOrigin].filter(Boolean).join(' ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (`.next/standalone/apps/web/server.js`)
  // so the production image ships only the traced runtime, not the full
  // workspace. `outputFileTracingRoot` points at the monorepo root so pnpm's
  // workspace dependencies are traced correctly into the standalone output.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              `connect-src ${connectSrc}`,
              "frame-ancestors 'none'",
            ].join('; '),
          },
          ...(isProduction
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
    ]
  },
}

export default nextConfig
