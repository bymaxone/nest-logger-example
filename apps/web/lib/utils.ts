/**
 * @fileoverview Tailwind CSS class-merge utility used by every UI primitive.
 *
 * Re-exports `cn()` — the canonical way to compose Tailwind class names while
 * deduplicating conflicting utilities via `tailwind-merge`.
 *
 * @module lib/utils
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS class names, deduplicating conflicting utilities.
 *
 * @param inputs - Any number of class values (strings, objects, arrays).
 * @returns Merged class string with Tailwind conflicts resolved.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
