/**
 * Unit tests for `EventBusLogDestination` — the live-tail fan-out `ILogDestination`.
 *
 * Covers: the `name`/`minLevel` contract (default `info`, overridable via options) and that
 * `write()` forwards the already-serialized line verbatim to `LogEventBus.publish()`. The bus
 * itself owns parsing and the never-throw guard; this destination is a thin side-effect sink.
 */
import { describe, expect, it, jest } from '@jest/globals'

import type { LogEventBus } from '../logs/log-event.bus.js'
import { EventBusLogDestination } from './event-bus.destination.js'

/** Minimal `LogEventBus` stand-in exposing only the `publish` method this sink calls. */
function makeBus(): { bus: LogEventBus; publish: jest.Mock } {
  const publish = jest.fn()
  const bus = { publish } as unknown as LogEventBus
  return { bus, publish }
}

describe('EventBusLogDestination', () => {
  it('exposes the destination name', () => {
    /** The router identifies the destination by `name`. */
    const { bus } = makeBus()
    expect(new EventBusLogDestination(bus).name).toBe('event-bus')
  })

  it('defaults minLevel to info when no options are given', () => {
    /** Default `info` mirrors the full-fidelity Loki tier for the live tail. */
    const { bus } = makeBus()
    expect(new EventBusLogDestination(bus).minLevel).toBe('info')
  })

  it('defaults minLevel to info when options omit minLevel', () => {
    /** An options object without `minLevel` still resolves to the `info` default. */
    const { bus } = makeBus()
    expect(new EventBusLogDestination(bus, {}).minLevel).toBe('info')
  })

  it('honors an explicit minLevel from options', () => {
    /** A configured `minLevel` overrides the default so callers can raise the floor. */
    const { bus } = makeBus()
    expect(new EventBusLogDestination(bus, { minLevel: 'warn' }).minLevel).toBe('warn')
  })

  it('write() forwards the serialized line verbatim to the bus', () => {
    /** The sink must publish the exact (already-redacted) line — no mutation, no re-parse. */
    const { bus, publish } = makeBus()
    const dest = new EventBusLogDestination(bus)
    const line = '{"level":"info","logKey":"X","msg":"hello"}\n'
    dest.write(line)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith(line)
  })
})
