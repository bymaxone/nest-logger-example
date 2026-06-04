/**
 * @fileoverview Accessible severity metadata for each log level — colour token,
 * Lucide icon, and human label. Imports only from the isomorphic
 * `@bymax-one/nest-logger/shared` subpath; safe to use in the browser bundle.
 *
 * @module lib/severity
 */

import { type LucideIcon, Bug, Info, TriangleAlert, CircleX, Skull, Microscope } from 'lucide-react'
// Isomorphic subpath ONLY — never import from the server `.` root in the browser.
import { type LogLevel } from '@bymax-one/nest-logger/shared'

/** Visual descriptor for a log level — colour token + lucide icon + label. */
export interface SeverityMeta {
  /** CSS colour (hex or token) for the left-border accent / pill / chart slice. */
  color: string
  /** Leading lucide icon (accessibility: never colour alone). */
  icon: LucideIcon
  /** Human label for the level pill. */
  label: string
}

/** Level → accessible severity descriptor (colour + icon + label for accessibility). */
export const SEVERITY = {
  trace: { color: '#93c5fd', icon: Microscope, label: 'Trace' },
  debug: { color: '#60a5fa', icon: Bug, label: 'Debug' },
  info: { color: '#22c55e', icon: Info, label: 'Info' },
  warn: { color: '#f59e0b', icon: TriangleAlert, label: 'Warn' },
  error: { color: '#ef4444', icon: CircleX, label: 'Error' },
  fatal: { color: '#a855f7', icon: Skull, label: 'Fatal' },
} satisfies Record<LogLevel, SeverityMeta>

/**
 * Returns the accessible severity descriptor for a log level.
 *
 * @param level - The log level from `@bymax-one/nest-logger/shared`.
 * @returns The `{ color, icon, label }` descriptor.
 */
export function getSeverity(level: LogLevel): SeverityMeta {
  return SEVERITY[level]
}
