/**
 * @fileoverview Landing page — public entry point of nest-logger-example.
 *
 * Mirrors the landing surface of the sibling `nest-auth-example` so every
 * reference app reads as one product: dark background with three ambient glow
 * layers, an orange brand gradient headline, glassmorphism feature cards, and
 * pill CTA buttons. Only the copy differs, because the library demonstrated
 * here is the structured logger.
 *
 * A pure server component: the landing surface needs no client-side JavaScript,
 * so it renders outside the dashboard shell.
 *
 * @module app/page
 */

import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** One feature card rendered in the coverage grid. */
interface Feature {
  readonly icon: React.ReactNode
  readonly badge: string
  readonly title: string
  readonly description: string
}

/** The library capabilities the dashboard demonstrates, in reading order. */
const FEATURES: readonly Feature[] = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 4h16v12H5.5L4 18V4z"
          stroke="#ff6224"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 9h8M8 12h5" stroke="#ff6224" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    badge: 'Core',
    title: 'Structured calls',
    description:
      'Every line is a MODULE_ACTION_RESULT key with typed metadata, not an interpolated string. Per-class child loggers, context labels, and slow-method detection come from decorators.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2l8 4v6c0 5-3.4 8.5-8 10c-4.6-1.5-8-5-8-10V6l8-4z"
          stroke="#ff6224"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.5 12.5h5" stroke="#ff6224" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    badge: 'Privacy',
    title: 'PII redaction',
    description:
      'Ninety-seven default paths are compiled once and censored at the source, before any destination sees the record — proven identical in Postgres and in Loki.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="2.5" stroke="#ff6224" strokeWidth="1.5" />
        <path
          d="M12 2v6M12 16v6M2 12h6M16 12h6"
          stroke="#ff6224"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    badge: 'Context',
    title: 'Request context',
    description:
      'AsyncLocalStorage carries requestId, tenantId and userId onto every line with no hot-path cost, and the HTTP lifecycle plus its exception filter never double-log a failure.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 3v12a3 3 0 0 0 3 3h9M18 3v6M6 21h.01"
          stroke="#ff6224"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    badge: 'Fan-out',
    title: 'Pluggable destinations',
    description:
      'One record fans out to stdout, a pretty dev writer, batched Loki, durable Postgres and a rolling file — each with its own minimum level, fail-soft writes and an ordered shutdown drain.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="2.5" stroke="#ff6224" strokeWidth="1.5" />
        <circle cx="18" cy="18" r="2.5" stroke="#ff6224" strokeWidth="1.5" />
        <path d="M8 7.5l8 9" stroke="#ff6224" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    badge: 'Tracing',
    title: 'OpenTelemetry correlation',
    description:
      'traceId and spanId land on every line while the SDK is active, and a trace crossing from the API into the worker stays one trace — clickable straight through to Tempo.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 3v18h18" stroke="#ff6224" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M7 15l3.5-4l3 2.5L20 7"
          stroke="#ff6224"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    badge: 'Console',
    title: 'Explorer & live tail',
    description:
      'Facet search over a virtualized table with trace deep-links, a server-sent live tail, golden-signal charts, and a Trigger Center that fires every feature on demand.',
  },
]

/** The `/` route: the public landing surface. */
export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      {/* ── Ambient glow layers (decorative only) ── */}
      <div
        aria-hidden="true"
        className="animate-glow-float pointer-events-none fixed -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-[#ff6224] opacity-[0.08] blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="animate-glow-drift pointer-events-none fixed -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-[#60a5fa] opacity-[0.06] blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-16 left-1/2 h-[350px] w-[350px] -translate-x-1/2 rounded-full bg-[#f97316] opacity-[0.04] blur-[120px]"
      />

      <main className="relative z-10">
        {/* ── Hero ── */}
        {/* `relative` is load-bearing: the scroll hint below is absolutely
            positioned and must anchor to the hero, not to the whole page. */}
        <section className="relative flex min-h-screen flex-col items-center justify-center px-4 py-24 text-center">
          <div className="flex max-w-3xl flex-col items-center gap-6">
            <div
              className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(255,98,36,0.3)] bg-[rgba(255,98,36,0.15)]"
              aria-hidden="true"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="#ff6224"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="animate-fade-in bg-gradient-to-r from-[#ff6224] to-amber-200 bg-clip-text font-mono text-4xl font-bold leading-tight tracking-tight text-transparent md:text-5xl lg:text-6xl">
              nest-logger-example
            </h1>

            <p className="max-w-xl font-sans text-base leading-relaxed text-[rgba(255,255,255,0.7)] md:text-lg">
              A runnable reference application demonstrating every feature of{' '}
              <span className="font-mono text-[#ff6224]">@bymax-one/nest-logger</span> — end-to-end,
              from the NestJS API and worker to this Next.js observability console.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard">Open the console</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a
                  href="https://github.com/bymaxone/nest-logger"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View library
                </a>
              </Button>
            </div>
          </div>

          <div className="absolute bottom-8 flex flex-col items-center gap-1.5 text-xs uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
            <span>scroll</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 3v10M3 8l5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </section>

        {/* ── Features grid ── */}
        <section id="features" className="px-4 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <h2 className="mb-3 font-mono text-3xl font-bold text-white">Feature coverage</h2>
              <p className="font-sans text-[rgba(255,255,255,0.6)]">
                Every public export of the library, demonstrated in a running app.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card
                  key={feature.title}
                  className="group transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_32px_rgba(255,98,36,0.12)]"
                >
                  <CardHeader>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(255,98,36,0.3)] bg-[rgba(255,98,36,0.12)]">
                        {feature.icon}
                      </div>
                      <Badge variant="outline" className="text-[rgba(255,255,255,0.5)]">
                        {feature.badge}
                      </Badge>
                    </div>
                    <CardTitle className="text-base normal-case tracking-tight text-[rgba(255,255,255,0.9)]">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="leading-relaxed text-[rgba(255,255,255,0.55)]">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="px-4 py-24 text-center">
          <div className="mx-auto max-w-xl">
            <h2 className="mb-4 font-mono text-3xl font-bold text-white">Ready to explore?</h2>
            <p className="mb-8 font-sans text-[rgba(255,255,255,0.6)]">
              Fire a request from the Trigger Center, watch it land on the live tail, then follow
              its traceId across the API and the worker.
            </p>
            <Button asChild size="lg">
              <Link href="/dashboard">Open the console</Link>
            </Button>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-[rgba(255,255,255,0.06)] px-4 py-8 text-center font-mono text-xs text-[rgba(255,255,255,0.3)]">
          <p>
            nest-logger-example — reference implementation for{' '}
            <a
              href="https://github.com/bymaxone/nest-logger"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#ff6224] hover:underline"
            >
              @bymax-one/nest-logger
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}
