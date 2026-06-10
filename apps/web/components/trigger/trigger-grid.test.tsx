/**
 * @fileoverview Tests for the Trigger Center grid module — the descriptor
 * catalog (count + logKey convention guard), each descriptor's `fire` action
 * (verifying it targets the right `triggerApi` method and threads the ctx) and
 * `explorerTarget` builder (the requestId / traceId / empty pivot branches and
 * the burst time-window), plus the {@link TriggerGrid} component rendering all
 * twelve cards bound to the active tenant from the nuqs URL state.
 *
 * The `triggerApi` client and `sonner` toast are mocked so a fire never touches
 * the network; the grid renders under a `NuqsTestingAdapter`.
 *
 * @module components/trigger/trigger-grid.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactNode } from 'react'

import { isValidLogKey } from '@/lib/log-keys'
import type { TriggerResult } from '@/lib/trigger-api'

/** Records of each mocked `triggerApi` call so a `fire` can be asserted. */
const triggerCalls: Array<{ method: string; args: unknown[] }> = []

/** A stub result resolved by every mocked `triggerApi` method. */
const STUB_RESULT: TriggerResult = {
  requestId: 'req_1',
  traceId: 'trace_1',
  status: 200,
  body: null,
}

/**
 * Mock the API client: every fire method records its call and resolves a stub,
 * so a descriptor's `fire` can be invoked and asserted without a real request.
 */
vi.mock('@/lib/trigger-api', () => {
  const make =
    (method: string) =>
    (...args: unknown[]): Promise<TriggerResult> => {
      triggerCalls.push({ method, args })
      return Promise.resolve(STUB_RESULT)
    }
  return {
    triggerApi: {
      level: make('level'),
      order: make('order'),
      payment: make('payment'),
      piiSignup: make('piiSignup'),
      piiNested: make('piiNested'),
      echoHeaders: make('echoHeaders'),
      huge: make('huge'),
      slow: make('slow'),
      status: make('status'),
      dispatch: make('dispatch'),
      faultLoki: make('faultLoki'),
      burst: make('burst'),
    },
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Imported after the mocks so the module binds the mocked client.
const { TRIGGERS, TriggerGrid } = await import('./trigger-grid')

/** Look up a descriptor by id (every id is unique within the catalog). */
function descriptor(id: string) {
  const found = TRIGGERS.find((t) => t.id === id)
  if (found === undefined) throw new Error(`no descriptor ${id}`)
  return found
}

/** Build a `TriggerResult` with the given correlation ids (status fixed at 200). */
function resultWith(requestId: string | null, traceId: string | null): TriggerResult {
  return { requestId, traceId, status: 200, body: null }
}

beforeEach(() => {
  triggerCalls.length = 0
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TRIGGERS', () => {
  /** There must be exactly twelve cards, one per DASHBOARD.md §8 row. */
  it('declares twelve trigger cards', () => {
    expect(TRIGGERS).toHaveLength(12)
  })

  /** Every declared logKey literal must satisfy the library convention regex. */
  it('only declares convention-valid logKeys', () => {
    for (const trigger of TRIGGERS) {
      for (const key of trigger.logKeys) {
        expect(isValidLogKey(key), `${trigger.id}: ${key}`).toBe(true)
      }
    }
  })

  /**
   * The wildcard branch probes `PREFIX_*` as `PREFIX_XX` so a prefix search key
   * still satisfies the convention — protects the Explorer's prefix-search guard.
   */
  it('accepts a valid trailing-wildcard prefix and rejects an invalid one', () => {
    // Valid wildcard: `PAYMENT_*` is probed as `PAYMENT_XX`, which matches MODULE_ACTION_RESULT.
    expect(isValidLogKey('PAYMENT_*')).toBe(true)
    // Invalid wildcard: lowercase prefix `payment_*` probes to `payment_XX`, which violates the uppercase convention.
    expect(isValidLogKey('payment_*')).toBe(false)
  })

  /** A literal with no segment separator must fail the guard (protects the regex check). */
  it('rejects a logKey literal with no separator', () => {
    // `badkey` is a single lowercase token with no `_` — never matches MODULE_ACTION_RESULT.
    expect(isValidLogKey('badkey')).toBe(false)
  })

  /** A lowercase literal must fail the guard (the convention requires uppercase segments). */
  it('rejects a logKey literal in the wrong case', () => {
    // `lower_case_key` has the right separators but lowercase segments — violates the uppercase convention.
    expect(isValidLogKey('lower_case_key')).toBe(false)
  })
})

describe('descriptor fire actions', () => {
  /** The level card fires `triggerApi.level` with the ctx-selected level. */
  it('fires the level endpoint with the selected level', async () => {
    await descriptor('level').fire({ tenantId: '', level: 'warn', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'level', args: ['warn'] }])
  })

  /** The order card fires `triggerApi.order` with the active tenant when one is set. */
  it('fires the order endpoint with the active tenant id', async () => {
    await descriptor('order').fire({ tenantId: 'globex', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'order', args: ['globex'] }])
  })

  /** The order card falls back to the demo tenant when "All tenants" is selected (empty id). */
  it('fires the order endpoint with the demo tenant when none is selected', async () => {
    await descriptor('order').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'order', args: ['acme'] }])
  })

  /** The payment card fires `triggerApi.payment` (no inputs threaded). */
  it('fires the payment endpoint', async () => {
    await descriptor('payment').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'payment', args: [] }])
  })

  /** The pii-signup card fires `triggerApi.piiSignup`. */
  it('fires the pii-signup endpoint', async () => {
    await descriptor('pii-signup').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'piiSignup', args: [] }])
  })

  /** The pii-nested card fires `triggerApi.piiNested`. */
  it('fires the pii-nested endpoint', async () => {
    await descriptor('pii-nested').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'piiNested', args: [] }])
  })

  /** The pii-headers card fires `triggerApi.echoHeaders`. */
  it('fires the pii-headers endpoint', async () => {
    await descriptor('pii-headers').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'echoHeaders', args: [] }])
  })

  /** The huge card fires `triggerApi.huge`. */
  it('fires the huge endpoint', async () => {
    await descriptor('huge').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'huge', args: [] }])
  })

  /** The slow card fires `triggerApi.slow`. */
  it('fires the slow endpoint', async () => {
    await descriptor('slow').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'slow', args: [] }])
  })

  /** The status card fires `triggerApi.status` with the ctx-selected code. */
  it('fires the status endpoint with the selected code', async () => {
    await descriptor('status').fire({ tenantId: '', level: 'info', code: 503, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'status', args: [503] }])
  })

  /** The dispatch card fires `triggerApi.dispatch`. */
  it('fires the dispatch endpoint', async () => {
    await descriptor('dispatch').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'dispatch', args: [] }])
  })

  /** The fault-loki card fires `triggerApi.faultLoki`. */
  it('fires the fault-loki endpoint', async () => {
    await descriptor('fault-loki').fire({ tenantId: '', level: 'info', code: 400, count: 50 })
    expect(triggerCalls).toEqual([{ method: 'faultLoki', args: [] }])
  })

  /** The burst card fires `triggerApi.burst` with the ctx-selected count. */
  it('fires the burst endpoint with the selected count', async () => {
    await descriptor('burst').fire({ tenantId: '', level: 'info', code: 400, count: 120 })
    expect(triggerCalls).toEqual([{ method: 'burst', args: [120] }])
  })
})

describe('descriptor explorerTarget builders', () => {
  /** byRequest pivots to the requestId when present (the primary id branch). */
  it('pivots to the requestId when present', () => {
    expect(descriptor('order').explorerTarget(resultWith('req_9', 'trace_9'), 0)).toEqual({
      requestId: 'req_9',
    })
  })

  /** byRequest falls back to the traceId when requestId is null (the fallback branch). */
  it('falls back to the traceId when no requestId is present', () => {
    expect(descriptor('order').explorerTarget(resultWith(null, 'trace_9'), 0)).toEqual({
      traceId: 'trace_9',
    })
  })

  /** byRequest yields an empty target when neither id is present (the empty branch). */
  it('yields an empty target when neither correlation id is present', () => {
    expect(descriptor('order').explorerTarget(resultWith(null, null), 0)).toEqual({})
  })

  /** byTrace pivots to the shared traceId for the cross-service card. */
  it('pivots to the traceId for the cross-service card', () => {
    expect(descriptor('dispatch').explorerTarget(resultWith('req_9', 'trace_9'), 0)).toEqual({
      traceId: 'trace_9',
    })
  })

  /** byTrace yields an empty target when the traceId is null (the empty branch). */
  it('yields an empty target for the cross-service card when no traceId is present', () => {
    expect(descriptor('dispatch').explorerTarget(resultWith('req_9', null), 0)).toEqual({})
  })

  /** The burst card pivots to a padded time window keyed on the burst logKey. */
  it('builds a padded time-window target for the burst card', () => {
    const firedAtMs = Date.UTC(2026, 0, 1, 12, 0, 0)
    const target = descriptor('burst').explorerTarget(resultWith(null, null), firedAtMs)
    expect(target.logKey).toBe('TRIGGER_BURST_TICK')
    // The window starts one minute before the fire and ends one minute after "now".
    expect(target.from).toBe(new Date(firedAtMs - 60_000).toISOString())
    expect(typeof target.to).toBe('string')
  })

  /**
   * Every descriptor must expose a working `explorerTarget` — invoking each one
   * with a fully-populated result exercises its per-card pivot wrapper so no
   * descriptor's link builder is left unexecuted.
   */
  it('builds a target for every descriptor', () => {
    for (const trigger of TRIGGERS) {
      const target = trigger.explorerTarget(resultWith('req_x', 'trace_x'), 0)
      // Each builder returns at least one routable field (requestId / traceId / logKey).
      const hasField =
        target.requestId !== undefined ||
        target.traceId !== undefined ||
        target.logKey !== undefined
      expect(hasField, trigger.id).toBe(true)
    }
  })
})

describe('TriggerGrid', () => {
  /** Render the grid under a memory-backed nuqs adapter seeded from `search`. */
  function renderGrid(search = ''): void {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter searchParams={search} hasMemory>
        {children}
      </NuqsTestingAdapter>
    )
    render(<TriggerGrid />, { wrapper })
  }

  /** The grid renders one card per descriptor, each titled by its descriptor. */
  it('renders all twelve trigger cards', () => {
    renderGrid()
    for (const trigger of TRIGGERS) {
      expect(screen.getByRole('heading', { name: trigger.title })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button', { name: 'Fire' })).toHaveLength(TRIGGERS.length)
  })

  /** The grid binds the active tenant from the URL state down to its cards. */
  it('renders with a tenant supplied by the URL state', () => {
    renderGrid('?tenantId=globex')
    // The grid still renders the full catalog regardless of the bound tenant.
    expect(screen.getByRole('heading', { name: 'Structured success' })).toBeInTheDocument()
  })
})

describe('TRIGGERS descriptor catalog fields', () => {
  /** Every demonstrates text must match the literal declared in the source. */
  it('declares the correct demonstrates text for each descriptor', () => {
    const expected: [string, string][] = [
      ['level', 'PinoLoggerService.info/warn/error + level mapping'],
      ['order', 'info(logKey, msg, userId, meta) + ALS requestId/tenantId'],
      ['payment', 'errorStructured(logKey, Error, …) → 402, exception logged once'],
      ['pii-signup', '97-path redaction → [REDACTED] (password/cpf/cardNumber)'],
      ['pii-nested', 'wildcard depth boundary (depth 4 redacted, 5 not)'],
      ['pii-headers', 'header bracket-syntax redaction (authorization, x-api-key)'],
      ['huge', 'maxEntrySizeBytes → LOGGER_ENTRY_TRUNCATED'],
      ['slow', '@LogPerformance → METHOD_SLOW_EXECUTION'],
      ['status', 'HTTP_REQUEST_CLIENT_ERROR / _SERVER_ERROR'],
      ['dispatch', 'one traceId across api + worker'],
      ['fault-loki', 'Loki sink at a dead host → LOGGER_DESTINATION_WRITE_FAILED, fail-soft'],
      ['burst', 'N lines to populate charts / drive RED panels / test live tail'],
    ]
    for (const [id, demonstrates] of expected) {
      expect(descriptor(id).demonstrates, `${id}.demonstrates`).toBe(demonstrates)
    }
  })

  /** Every endpoint badge text must match the literal declared in the source. */
  it('declares the correct endpoint for each descriptor', () => {
    const expected: [string, string][] = [
      ['level', 'POST /trigger/level'],
      ['order', 'POST /orders'],
      ['payment', 'POST /payments'],
      ['pii-signup', 'POST /pii-demo/signup'],
      ['pii-nested', 'POST /pii-demo/nested'],
      ['pii-headers', 'GET /pii-demo/echo-headers'],
      ['huge', 'POST /pii-demo/huge'],
      ['slow', 'GET /orders/slow'],
      ['status', 'GET /trigger/status/:code'],
      ['dispatch', 'POST /downstream/dispatch'],
      ['fault-loki', 'POST /trigger/fault/loki'],
      ['burst', 'POST /trigger/burst'],
    ]
    for (const [id, endpoint] of expected) {
      expect(descriptor(id).endpoint, `${id}.endpoint`).toBe(endpoint)
    }
  })

  /** isExpectedError is true only for payment and status; all others are undefined. */
  it('marks only payment and status as isExpectedError', () => {
    expect(descriptor('payment').isExpectedError).toBe(true)
    expect(descriptor('status').isExpectedError).toBe(true)
    for (const t of TRIGGERS) {
      if (t.id !== 'payment' && t.id !== 'status') {
        expect(t.isExpectedError, `${t.id}.isExpectedError`).toBeUndefined()
      }
    }
  })

  /** The input type on level/status/burst must match their declared string exactly. */
  it('assigns the correct input type to level, status, and burst descriptors', () => {
    expect(descriptor('level').input).toBe('level')
    expect(descriptor('status').input).toBe('status')
    expect(descriptor('burst').input).toBe('burst')
  })

  /** The nine non-input cards declare no input field. */
  it('assigns no input to cards without a control', () => {
    const noInput = [
      'order',
      'payment',
      'pii-signup',
      'pii-nested',
      'pii-headers',
      'huge',
      'slow',
      'dispatch',
      'fault-loki',
    ]
    for (const id of noInput) {
      expect(descriptor(id).input, `${id}.input`).toBeUndefined()
    }
  })

  /** Every title text must match the literal declared in the source. */
  it('declares the correct title for each descriptor', () => {
    const expected: [string, string][] = [
      ['level', 'Emit each level'],
      ['order', 'Structured success'],
      ['payment', 'Error with stack'],
      ['pii-signup', 'PII payload'],
      ['pii-nested', 'Deep-nested PII'],
      ['pii-headers', 'Sensitive headers'],
      ['huge', 'Oversized entry'],
      ['slow', 'Slow method'],
      ['status', 'HTTP 4xx / 5xx'],
      ['dispatch', 'Cross-service'],
      ['fault-loki', 'Fault-inject a destination'],
      ['burst', 'Load burst'],
    ]
    for (const [id, title] of expected) {
      expect(descriptor(id).title, `${id}.title`).toBe(title)
    }
  })

  /** logKeys arrays are asserted per-descriptor so element-level string mutations are caught. */
  it('declares the exact logKeys for every descriptor', () => {
    expect(descriptor('level').logKeys).toEqual(['TRIGGER_LEVEL_FIRED'])
    expect(descriptor('order').logKeys).toEqual(['ORDER_CREATE_SUCCESS'])
    expect(descriptor('payment').logKeys).toEqual([
      'PAYMENT_CHARGE_FAILED',
      'HTTP_EXCEPTION_HANDLED',
    ])
    expect(descriptor('pii-signup').logKeys).toEqual(['USER_SIGNUP_ATTEMPT'])
    expect(descriptor('pii-nested').logKeys).toEqual(['PII_NESTED_ATTEMPT'])
    expect(descriptor('pii-headers').logKeys).toEqual(['PII_HEADERS_ECHO'])
    expect(descriptor('huge').logKeys).toEqual(['PII_HUGE_ATTEMPT', 'LOGGER_ENTRY_TRUNCATED'])
    expect(descriptor('slow').logKeys).toEqual(['ORDER_SLOW_SUCCESS', 'METHOD_SLOW_EXECUTION'])
    expect(descriptor('status').logKeys).toEqual([
      'HTTP_REQUEST_CLIENT_ERROR',
      'HTTP_REQUEST_SERVER_ERROR',
    ])
    expect(descriptor('dispatch').logKeys).toEqual([
      'DOWNSTREAM_DISPATCH_START',
      'DOWNSTREAM_DISPATCH_SUCCESS',
    ])
    expect(descriptor('fault-loki').logKeys).toEqual([
      'TRIGGER_FAULT_REQUESTED',
      'LOGGER_DESTINATION_WRITE_FAILED',
    ])
    expect(descriptor('burst').logKeys).toEqual(['TRIGGER_BURST_TICK'])
  })
})

describe('descriptor ids', () => {
  /** Descriptor ids must be exactly the expected set in declaration order. */
  it('declares all twelve ids in the expected order', () => {
    expect(TRIGGERS.map((t) => t.id)).toEqual([
      'level',
      'order',
      'payment',
      'pii-signup',
      'pii-nested',
      'pii-headers',
      'huge',
      'slow',
      'status',
      'dispatch',
      'fault-loki',
      'burst',
    ])
  })
})

describe('burst explorerTarget — to bound', () => {
  /** The burst `to` bound is padded after the current time, not before it. */
  it('sets the burst to bound to Date.now() + BURST_PAD_MS', () => {
    const fixedNow = Date.UTC(2026, 0, 15, 12, 0, 0)
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)
    const firedAtMs = Date.UTC(2026, 0, 15, 11, 55, 0)
    const target = descriptor('burst').explorerTarget(resultWith(null, null), firedAtMs)
    // to must equal Date.now() + 60_000 with the clock fixed.
    expect(target.to).toBe(new Date(fixedNow + 60_000).toISOString())
    vi.useRealTimers()
  })
})

describe('TriggerGrid demonstrates text', () => {
  /** Render the grid under a memory-backed nuqs adapter seeded from `search`. */
  function renderGrid(search = ''): void {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter searchParams={search} hasMemory>
        {children}
      </NuqsTestingAdapter>
    )
    render(<TriggerGrid />, { wrapper })
  }

  /** Each TriggerCard within the grid renders its demonstrates text from the descriptor. */
  it('renders the demonstrates line for each card in the grid', () => {
    renderGrid()
    expect(
      screen.getByText('PinoLoggerService.info/warn/error + level mapping'),
    ).toBeInTheDocument()
    expect(screen.getByText('one traceId across api + worker')).toBeInTheDocument()
    expect(
      screen.getByText('N lines to populate charts / drive RED panels / test live tail'),
    ).toBeInTheDocument()
  })

  /** Each TriggerCard renders its endpoint badge text from the descriptor. */
  it('renders the endpoint badge text for each card in the grid', () => {
    renderGrid()
    expect(screen.getByText('POST /trigger/level')).toBeInTheDocument()
    expect(screen.getByText('POST /downstream/dispatch')).toBeInTheDocument()
    expect(screen.getByText('POST /trigger/burst')).toBeInTheDocument()
  })

  /** The level card renders a Level select (input: 'level') and the status card a Status select. */
  it('renders input controls for the cards that declare an input type', () => {
    renderGrid()
    expect(screen.getByRole('combobox', { name: 'Level' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status code' })).toBeInTheDocument()
    expect(screen.getByLabelText('Burst count')).toBeInTheDocument()
  })
})

describe('module load guard', () => {
  /**
   * The module rejects any declared logKey that drifts from the library
   * convention at load time. Re-importing with the validator forced to fail
   * exercises the fail-fast `throw` so a typo can never ship silently.
   */
  it('throws on load when a declared logKey is invalid', async () => {
    // Force every logKey to look invalid, then re-evaluate the module fresh.
    vi.resetModules()
    vi.doMock('@/lib/log-keys', () => ({ isValidLogKey: () => false }))
    await expect(import('./trigger-grid')).rejects.toThrow(/Invalid logKey literal/)
    vi.doUnmock('@/lib/log-keys')
    vi.resetModules()
  })
})

describe('TRIGGERS — module-level re-import (kill descriptor mutations at module init)', () => {
  /**
   * Re-importing the module inside the test body forces the TRIGGERS array to
   * be evaluated with Stryker's active mutation injected, so mutations on the
   * object literals and string fields (title, demonstrates, endpoint, logKeys)
   * and on the validation loop conditionals are all caught at run-time.
   *
   * An ObjectLiteral → {} mutation makes logKeys undefined → the validation loop
   * throws → the import rejects → this test fails → mutation killed.
   * A StringLiteral → "" mutation on any required field makes the toBeTruthy
   * assertion fail → mutation killed.
   */
  afterEach(() => {
    vi.resetModules()
  })

  it('re-imports the module and verifies all twelve TRIGGERS descriptors are complete', async () => {
    vi.resetModules()
    const { TRIGGERS: T } = await import('./trigger-grid')
    expect(T).toHaveLength(12)
    for (const t of T) {
      expect(t.id, `${t.id}.id`).toBeTruthy()
      expect(t.title, `${t.id}.title`).toBeTruthy()
      expect(t.demonstrates, `${t.id}.demonstrates`).toBeTruthy()
      expect(t.endpoint, `${t.id}.endpoint`).toBeTruthy()
      expect(t.logKeys.length, `${t.id}.logKeys.length`).toBeGreaterThan(0)
      for (const key of t.logKeys) {
        expect(key, `${t.id} logKey`).toBeTruthy()
      }
    }
  })
})
