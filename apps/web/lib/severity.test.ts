/**
 * @fileoverview Unit tests for the severity metadata map and {@link getSeverity}.
 *
 * Verifies that every {@link LogLevel} resolves to a complete, accessible
 * descriptor (colour token, lucide icon, human label) and that the lookup helper
 * returns the same object held in the {@link SEVERITY} table for each level.
 *
 * @module lib/severity.test
 */
import { describe, expect, it, vi } from 'vitest'
import type { LogLevel } from '@bymax-one/nest-logger/shared'

import { SEVERITY, getSeverity } from './severity'

/** The full ordered level set the severity map must cover. */
const ALL_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

/** Expected colour token + human label per level (icon identity checked structurally). */
const EXPECTED: Record<LogLevel, { color: string; label: string }> = {
  trace: { color: '#93c5fd', label: 'Trace' },
  debug: { color: '#60a5fa', label: 'Debug' },
  info: { color: '#22c55e', label: 'Info' },
  warn: { color: '#f59e0b', label: 'Warn' },
  error: { color: '#ef4444', label: 'Error' },
  fatal: { color: '#a855f7', label: 'Fatal' },
}

/**
 * Re-imports the module from scratch so the top-level `SEVERITY` object literal
 * is re-evaluated *inside* this test. The colour/label/object-shape values are
 * produced by a module-load initializer; a hoisted top-level import would read a
 * value captured before any mutation is applied, leaving those mutants alive. A
 * fresh `import()` after `resetModules()` forces the initializer to run now, so
 * the asserted values reflect the (possibly mutated) source.
 */
async function freshSeverity(): Promise<typeof import('./severity')> {
  vi.resetModules()
  return import('./severity')
}

describe('SEVERITY map', () => {
  it.each(ALL_LEVELS)(
    /* Each level must expose its exact colour and label, plus a real icon component,
       from a freshly evaluated module — kills the per-level `{}` object-literal mutant
       and the colour/label string-literal mutants. */
    'exposes the exact colour, label, and icon for "%s"',
    async (level) => {
      const { SEVERITY: fresh } = await freshSeverity()
      expect(fresh[level].color).toBe(EXPECTED[level].color)
      expect(fresh[level].label).toBe(EXPECTED[level].label)
      // Lucide icons are forwardRef components — objects/functions, never null/undefined.
      expect(fresh[level].icon).toBeTruthy()
      expect(['function', 'object']).toContain(typeof fresh[level].icon)
    },
  )

  it(/* The map must cover exactly the six known levels — guards against a level being
       added to the union without a descriptor (or a stray extra key). */
  'covers every log level and no others', () => {
    expect(Object.keys(SEVERITY).sort()).toEqual([...ALL_LEVELS].sort())
  })
})

describe('getSeverity', () => {
  it.each(ALL_LEVELS)(
    /* The lookup helper must return the identical descriptor object held in the
       table for each level — confirms it is a pure indexed read, not a copy. */
    'returns the SEVERITY entry for "%s"',
    (level) => {
      expect(getSeverity(level)).toBe(SEVERITY[level])
    },
  )
})
