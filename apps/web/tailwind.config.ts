/**
 * @fileoverview Optional Tailwind v4 JS config — bridged into `app/globals.css`
 * via `@config '../tailwind.config.ts'`. In v4 only `keyframes` and `animation`
 * extensions are placed here; all colour/radius/font tokens live in the
 * `@theme inline` block in CSS (the v4-standard location).
 *
 * `darkMode` is intentionally absent — v4 reads the strategy from the
 * `@custom-variant dark` directive in `globals.css`, not from this file.
 *
 * @module tailwind.config
 */

import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'glow-float': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(20px, -20px)' },
        },
        'glow-drift': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(-15px, 15px)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'glow-float': 'glow-float 10s ease-in-out infinite',
        'glow-drift': 'glow-drift 12s ease-in-out infinite',
        'fade-in': 'fade-in 0.5s ease-out forwards',
      },
    },
  },
}

export default config
