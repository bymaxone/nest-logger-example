/**
 * @fileoverview Vitest configuration for the dashboard web app.
 *
 * jsdom environment for component tests, the `@` path alias mirrored from
 * `tsconfig.json`, and v8 coverage scoped to the hand-written `lib/` and
 * `components/` source (UI primitives and generated chrome are excluded). Tests
 * live next to their subject as `*.test.ts(x)`.
 *
 * @module vitest.config
 */
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror tsconfig `paths`: "@/*" → "./*".
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['{app,components,lib,hooks}/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
      exclude: ['components/ui/**', '**/*.{test,spec}.{ts,tsx}'],
    },
  },
})
