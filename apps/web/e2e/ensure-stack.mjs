/**
 * @fileoverview Pre-flight for the Playwright e2e run: make the environment safe and ready.
 *
 * Runs before `playwright test` (wired into the `test:e2e` script) so a local run never
 * fails on stale state. It does three things, each idempotent and non-destructive to a
 * healthy setup:
 *
 *   1. Docker daemon — if it is already running, use it; otherwise start it (Docker Desktop
 *      on macOS) and wait until it answers, instead of letting `docker compose` error out.
 *   2. Test stack — `docker compose -f docker-compose.test.yml up -d --wait` is idempotent:
 *      it reuses already-healthy containers and starts any that are missing.
 *   3. Stale dev servers — Playwright's `reuseExistingServer` reattaches to whatever already
 *      listens on the e2e ports. A server left over from a previous run whose database was
 *      reset underneath it still listens (and `/health` still says ok, since that probe is
 *      a constant), so Playwright would reattach to a process that can no longer serve. Each
 *      port is probed for REAL readiness — the API against a database-backed endpoint — and
 *      a healthy server is kept (fast reuse) while a stale one is killed so Playwright starts
 *      a fresh, correctly-wired one.
 *
 * Exit code is 0 on success; non-zero only when Docker genuinely cannot be made ready.
 *
 * @module e2e/ensure-stack
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Repo root — where `docker compose` resolves the compose file. */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
/** Dedicated, throwaway test stack (Postgres :55432, Loki :53100). */
const COMPOSE_FILE = 'docker-compose.test.yml'
/** How long to wait for the Docker daemon to come up after starting it. */
const DOCKER_READY_TIMEOUT_MS = 90_000
/** Per-probe network timeout when checking whether a server is really serving. */
const PROBE_TIMEOUT_MS = 3000

/**
 * The servers Playwright brings up, each with a readiness probe. The API probe hits a
 * database-backed endpoint (admin role, Postgres source) so a process whose database
 * connection died is correctly judged unhealthy — `/health` cannot reveal that.
 */
const SERVERS = [
  {
    name: 'api',
    port: 3001,
    probe: () => probe('http://127.0.0.1:3001/logs?source=postgres&limit=1', { 'x-role': 'admin' }),
  },
  { name: 'worker', port: 3002, probe: () => probe('http://127.0.0.1:3002/health') },
  { name: 'web', port: 3003, probe: () => probe('http://127.0.0.1:3003/') },
]

/** Emit a single tagged progress line so the prep is visible in the test output. */
function log(message) {
  process.stdout.write(`[e2e:ensure-stack] ${message}\n`)
}

/**
 * Run a command, returning its stdout; throws on a non-zero exit. With `stdio: 'inherit'`
 * `execSync` returns `null` (nothing is captured), so coalesce to an empty string.
 */
function run(cmd, opts = {}) {
  const out = execSync(cmd, { stdio: 'pipe', ...opts })
  return out === null ? '' : out.toString()
}

/** Run a command, swallowing failure into a boolean so callers can branch on it. */
function tryRun(cmd, opts = {}) {
  try {
    run(cmd, opts)
    return true
  } catch {
    return false
  }
}

/** Resolve after `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** True when the Docker daemon answers `docker info` (i.e. it is running). */
function dockerDaemonReady() {
  return tryRun('docker info')
}

/**
 * GET `url` and report whether the server is serving. A status below 500 means the process
 * is alive and handling requests; for the API the URL is database-backed, so a 5xx from a
 * dead database connection correctly reads as not-serving. Network errors read as down.
 *
 * @returns `true` when the server responded below 500, `false` otherwise.
 */
async function probe(url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return res.status < 500
  } catch {
    return false
  }
}

/** PIDs listening on a TCP port (empty when the port is free). macOS/Linux `lsof`. */
function pidsOnPort(port) {
  try {
    return run(`lsof -tiTCP:${port} -sTCP:LISTEN`)
      .split('\n')
      .map((pid) => pid.trim())
      .filter(Boolean)
  } catch {
    // `lsof` exits non-zero when nothing is listening — that is simply "port free".
    return []
  }
}

/** Ensure the Docker daemon is running: reuse it if up, otherwise start it and wait. */
async function ensureDockerDaemon() {
  if (dockerDaemonReady()) {
    log('Docker daemon already running — reusing it.')
    return
  }
  if (process.platform !== 'darwin') {
    log('Docker daemon is not running. Start Docker and re-run the e2e suite.')
    process.exit(1)
  }
  log('Docker daemon not running — starting Docker Desktop…')
  tryRun('open -a Docker')
  const deadline = Date.now() + DOCKER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(3000)
    if (dockerDaemonReady()) {
      log('Docker daemon is up.')
      return
    }
  }
  log('Docker did not become ready in time. Start Docker Desktop and re-run.')
  process.exit(1)
}

/** Bring the test stack up idempotently (reuses healthy containers, starts missing ones). */
function ensureTestStack() {
  log('Ensuring the test stack is up (docker compose up -d --wait)…')
  try {
    run(`docker compose -f ${COMPOSE_FILE} up -d --wait --wait-timeout 180`, {
      cwd: ROOT,
      stdio: 'inherit',
    })
    log('Test stack healthy.')
  } catch {
    log(
      'Failed to bring up the test stack. Inspect `docker compose -f docker-compose.test.yml ps`.',
    )
    process.exit(1)
  }
}

/** Keep healthy e2e servers (fast reuse) and kill stale ones so Playwright restarts them. */
async function reapStaleServers() {
  for (const server of SERVERS) {
    const pids = pidsOnPort(server.port)
    if (pids.length === 0) {
      log(`:${server.port} ${server.name} — free; Playwright will start it.`)
      continue
    }
    if (await server.probe()) {
      log(`:${server.port} ${server.name} — healthy; reusing.`)
      continue
    }
    log(
      `:${server.port} ${server.name} — stale; killing pid(s) ${pids.join(', ')} for a fresh start.`,
    )
    for (const pid of pids) tryRun(`kill -9 ${pid}`)
  }
}

await ensureDockerDaemon()
ensureTestStack()
await reapStaleServers()
log('Environment ready.')
