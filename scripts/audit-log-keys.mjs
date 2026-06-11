#!/usr/bin/env node
/**
 * @fileoverview Log-key convention audit for `apps/`.
 *
 * Statically discovers every application-authored log key — the first string
 * argument of the key-first structured methods `.info()` / `.warnStructured()` /
 * `.errorStructured()`, plus `MODULE_ACTION_RESULT`-shaped key constants — across the
 * server-side emitters (`apps/api`, `apps/worker`), then asserts each:
 *   - matches the canonical `LOG_KEYS_CONVENTION_REGEX`, and
 *   - is not one of the `RESERVED_LOG_KEYS` (framework-owned keys an app must not
 *     re-define as a business key).
 *
 * The convention regex and reserved set are imported LIVE from
 * `@bymax-one/nest-logger/shared` — never re-declared — so the gate always tracks
 * the library. Exit 0 only when every app key is valid and non-reserved.
 *
 * @module scripts/audit-log-keys
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import process from 'node:process'

import { LOG_KEYS_CONVENTION_REGEX, RESERVED_LOG_KEYS } from '@bymax-one/nest-logger/shared'

/** Server-side log emitters (the dashboard does not author structured log keys). */
const APP_ROOTS = ['apps/api', 'apps/worker']

/** Directories never walked (build output / deps). */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', 'reports', '.stryker-tmp'])

/** TypeScript source extensions (the emitters are ESM TypeScript). */
const SRC_EXT = new Set(['.ts', '.mts', '.cts'])

/**
 * Reserved keys as a value Set. `RESERVED_LOG_KEYS` ships as a frozen object whose
 * keys equal their values, so the reserved *values* are `Object.values(...)`.
 */
const reserved = new Set(Object.values(RESERVED_LOG_KEYS))

/**
 * First string arg of the key-first structured logging methods. `fatal(message, …)`
 * is intentionally excluded — its signature is message-first, not key-first, so its
 * first arg is not a log key. The capture is the raw literal (not pre-filtered to
 * uppercase) so a malformed key like `'badkey'` is caught by the regex check below
 * rather than silently skipped.
 */
const CALL_KEY = /\??\.(?:info|warnStructured|errorStructured)\(\s*['"]([^'"]+)['"]/g

/**
 * `const|readonly NAME = 'MODULE_ACTION_...'` log-key constant declarations.
 * Intentionally conservative: it does NOT span a `: Type` annotation before the `=`,
 * because a typed assignment of a reserved-key string is indistinguishable from a
 * type-demonstration constant (e.g. the export probe's `const k: ReservedLogKey =
 * 'HTTP_REQUEST_COMPLETED'`) and would false-positive. App log keys are authored as
 * call arguments (see `CALL_KEY`), not typed constants, so this is sufficient here.
 */
const CONST_KEY =
  /\b(?:const|readonly)\s+[A-Za-z_$][\w$]*\s*[:=]\s*['"]([A-Z][A-Z0-9_]*_[A-Z0-9_]+)['"]/g

/**
 * Recursively collect each discovered log key mapped to the file it was found in.
 *
 * @param {string} root - Directory to walk.
 * @param {Map<string, string>} keys - Accumulator of key → first source file.
 * @returns {void}
 */
function collect(root, keys) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      const stat = lstatSync(full)
      if (stat.isSymbolicLink()) continue // never follow symlinks (guards circular links)
      if (stat.isDirectory()) walk(full)
      else if (SRC_EXT.has(extname(entry)) && !/\.d\.[mc]?ts$/.test(full)) {
        const text = readFileSync(full, 'utf8')
        for (const re of [CALL_KEY, CONST_KEY])
          for (const m of text.matchAll(re)) if (!keys.has(m[1])) keys.set(m[1], full)
      }
    }
  }
  if (existsSync(root)) walk(root)
}

const keys = new Map()
for (const r of APP_ROOTS) collect(r, keys)

let bad = 0
for (const [key, file] of [...keys].sort()) {
  if (reserved.has(key)) {
    console.log(`  ✗ ${key} — RESERVED (${file})`)
    bad++
  } else if (!LOG_KEYS_CONVENTION_REGEX.test(key)) {
    console.log(`  ✗ ${key} — fails LOG_KEYS_CONVENTION_REGEX (${file})`)
    bad++
  } else {
    console.log(`  ✓ ${key}`)
  }
}

console.log(
  `\n${keys.size} app log key(s); ${bad === 0 ? 'all valid + non-reserved' : `${bad} violation(s)`}`,
)
process.exit(bad === 0 ? 0 : 1)
