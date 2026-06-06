/**
 * @fileoverview Unit tests for the shared Recharts styling constants.
 *
 * These exported objects are consumed inline by every dashboard chart, so the
 * tests pin their exact shape (the dark-glass tooltip surface, the muted axis
 * tick, and the faint grid stroke) to catch accidental design-token drift.
 *
 * @module components/charts/chart-style.test
 */
import { describe, expect, it } from 'vitest'

import { AXIS_TICK, CHART_TOOLTIP_STYLE, GRID_STROKE } from '@/components/charts/chart-style'

describe('chart-style', () => {
  /** The tooltip surface must carry the full dark-glass token set (background, border, radius, font). */
  it('exposes the dark-glass tooltip style', () => {
    expect(CHART_TOOLTIP_STYLE).toEqual({
      background: 'rgba(20,20,20,0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      fontSize: 12,
    })
  })

  /** The axis tick token must keep the muted fill + 10px size used by every X/Y axis. */
  it('exposes the muted axis tick style', () => {
    expect(AXIS_TICK).toEqual({ fill: 'rgba(255,255,255,0.4)', fontSize: 10 })
  })

  /** The grid stroke is a single faint rgba string shared by every cartesian grid. */
  it('exposes the faint grid stroke', () => {
    expect(GRID_STROKE).toBe('rgba(255,255,255,0.06)')
  })
})
