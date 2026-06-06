/**
 * @fileoverview Vitest global setup — registers the jest-dom matchers
 * (`toBeInTheDocument`, `toHaveTextContent`, …) and the jsdom polyfills that
 * browser-only APIs (used by recharts, virtualized tables, and Radix UI) expect
 * but jsdom does not implement: `ResizeObserver`, `IntersectionObserver`,
 * `matchMedia`, `scrollIntoView`, and non-zero element dimensions so
 * recharts' `ResponsiveContainer` mounts its chart children under test.
 *
 * @module vitest.setup
 */
import '@testing-library/jest-dom/vitest'

/** Minimal ResizeObserver that reports a fixed 800×400 box on observe. */
class ResizeObserverStub {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element): void {
    this.cb(
      [{ target, contentRect: { width: 800, height: 400 } } as unknown as ResizeObserverEntry],
      this,
    )
  }
  unobserve(): void {}
  disconnect(): void {}
}

/** No-op IntersectionObserver for components that lazy-mount on visibility. */
class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

globalThis.ResizeObserver = ResizeObserverStub
globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// recharts' ResponsiveContainer and @tanstack/react-virtual read element size;
// jsdom reports 0, which prevents chart children from rendering. Report a fixed
// non-zero box so the chart/branch code under test actually executes.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 })
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 })
Element.prototype.getBoundingClientRect = (): DOMRect => ({
  width: 800,
  height: 400,
  top: 0,
  left: 0,
  right: 800,
  bottom: 400,
  x: 0,
  y: 0,
  toJSON: () => {},
})
