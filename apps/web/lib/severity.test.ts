/**
 * @fileoverview Unit tests for the severity metadata map and {@link getSeverity}.
 *
 * Verifies that every {@link LogLevel} resolves to a complete, accessible
 * descriptor (colour token, lucide icon, human label) and that the lookup helper
 * returns the same object held in the {@link SEVERITY} table for each level.
 *
 * @module lib/severity.test
 */
import { describe, expect, it } from 'vitest'
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

describe('SEVERITY map', () => {
  it.each(ALL_LEVELS)(
    /* Every level must expose the exact colour + label and a callable icon component —
       protects the accessibility contract that severity is never colour-alone. */
    'exposes colour, label, and an icon for "%s"',
    (level) => {
      const meta = SEVERITY[level]
      expect(meta.color).toBe(EXPECTED[level].color)
      expect(meta.label).toBe(EXPECTED[level].label)
      // Lucide icons are forwardRef components — objects/functions, never null.
      expect(meta.icon).toBeTruthy()
      expect(['function', 'object']).toContain(typeof meta.icon)
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
