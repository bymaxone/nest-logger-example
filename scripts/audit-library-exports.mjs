#!/usr/bin/env node
/**
 * @fileoverview Export-usage audit for `@bymax-one/nest-logger`.
 *
 * Proves that every public export of the library — the `.` subpath
 * (`dist/server/index.d.ts`) and the `/shared` subpath (`dist/shared/index.d.ts`)
 * — is actually referenced somewhere in the `apps/` corpus. Any export that
 * appears nowhere fails the build unless it is allow-listed in `.audit-ignore.json`
 * with a reason + issue link (reserved strictly for symbols that leak into the
 * published `.d.ts` but are internal-only).
 *
 * Dependency-free: parses the shipped declaration files as text with regex and
 * word-boundary-searches the source tree. The library `dist/` must be built and
 * linked (local `link:`/`file:`) before this runs.
 *
 * Exit codes: 0 = every non-ignored export referenced; 1 = unused export(s);
 * 2 = a declaration file is missing (library not built/linked).
 *
 * @module scripts/audit-library-exports
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import process from 'node:process'

/** Root of the linked library's compiled output. */
const PKG = 'node_modules/@bymax-one/nest-logger/dist'

/** The two published subpaths, each with its declaration file. */
const SUBPATHS = [
  { name: '.', dts: join(PKG, 'server', 'index.d.ts') },
  { name: '/shared', dts: join(PKG, 'shared', 'index.d.ts') },
]

/** Application source roots searched for references. */
const APP_ROOTS = ['apps/api', 'apps/worker', 'apps/web']

/** Directories never walked (build output / deps). */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', 'reports', '.stryker-tmp'])

/** Source extensions considered part of the searchable corpus. */
const SRC_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs'])

/** Allow-list path: internal-only symbols leaked into the public `.d.ts`. */
const IGNORE_FILE = '.audit-ignore.json'

/**
 * Extract every outward-facing exported symbol name from a `.d.ts` source string.
 *
 * Handles three forms: `export declare <kind> NAME`, `export type|interface NAME`,
 * and `export { A, B as C, type D } [from '...']` blocks (the form this library
 * actually emits — a single re-export block per subpath).
 *
 * @param {string} dts - Raw declaration-file text.
 * @returns {Set<string>} The set of exported symbol names.
 */
function extractExports(dts) {
  const names = new Set()
  const add = (n) => n && /^[A-Za-z_$][\w$]*$/.test(n) && names.add(n)

  // export declare const/let/var/class/function/enum/interface/type/namespace NAME
  for (const m of dts.matchAll(
    /export\s+declare\s+(?:abstract\s+)?(?:const|let|var|class|function|enum|interface|type|namespace)\s+([A-Za-z_$][\w$]*)/g,
  ))
    add(m[1])

  // export type NAME = ... / export interface NAME
  for (const m of dts.matchAll(/export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g)) add(m[1])

  // export { A, B as C, type D } [from '...'] — take the OUTWARD name of each entry.
  for (const block of dts.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of block[1].split(',')) {
      const seg = part.trim().replace(/^type\s+/, '')
      if (!seg) continue
      const exported = seg
        .split(/\s+as\s+/)
        .pop()
        .trim()
      add(exported)
    }
  }

  return names
}

/**
 * Recursively collect readable source files under a root.
 *
 * @param {string} root - Directory to walk.
 * @returns {string[]} Absolute-or-relative file paths of source files.
 */
function collectSources(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      const stat = lstatSync(full)
      if (stat.isSymbolicLink()) continue // never follow symlinks (guards circular links)
      if (stat.isDirectory()) walk(full)
      else if (SRC_EXT.has(extname(entry)) && !/\.d\.[mc]?ts$/.test(full)) files.push(full)
    }
  }
  if (existsSync(root)) walk(root)
  return files
}

const corpus = APP_ROOTS.flatMap(collectSources).map((f) => readFileSync(f, 'utf8'))

/**
 * Word-boundary test for a symbol across the whole corpus.
 *
 * @param {string} name - Exported symbol name.
 * @returns {boolean} True when the symbol is referenced in at least one file.
 */
const isUsed = (name) => {
  const re = new RegExp(`\\b${name}\\b`)
  return corpus.some((text) => re.test(text))
}

let ignore
try {
  ignore = new Set(
    (JSON.parse(readFileSync(IGNORE_FILE, 'utf8')).ignored ?? []).map((e) => e.symbol),
  )
} catch (err) {
  console.error(`✗ could not read/parse ${IGNORE_FILE}: ${err.message}`)
  process.exit(2)
}

let unused = 0
for (const { name: subpath, dts } of SUBPATHS) {
  if (!existsSync(dts)) {
    console.error(`✗ missing declaration file: ${dts} — build & link the library first`)
    process.exit(2)
  }
  const exports = [...extractExports(readFileSync(dts, 'utf8'))].sort()
  console.log(`\n# @bymax-one/nest-logger '${subpath}' — ${exports.length} exports`)
  for (const name of exports) {
    if (ignore.has(name)) console.log(`  – ignored  ${name}`)
    else if (isUsed(name)) console.log(`  ✓ used     ${name}`)
    else {
      console.log(`  ✗ UNUSED   ${name}`)
      unused++
    }
  }
}

console.log(
  `\n${unused === 0 ? '✓ all exports referenced in apps/' : `✗ ${unused} unused export(s)`}`,
)
process.exit(unused === 0 ? 0 : 1)
