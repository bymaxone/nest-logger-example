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

import process from 'node:process'

const isProduction = process.env['NODE_ENV'] === 'production'

/** @type {import('next').NextConfig} */
const nextConfig = {
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
              "connect-src 'self'",
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
