/**
 * @fileoverview SSE proxy for the live tail — injects RBAC headers.
 *
 * A browser `EventSource` cannot attach custom headers, so the dashboard cannot
 * send `x-role` / `x-tenant-id` directly to the API's `GET /logs/stream`. This
 * same-origin route handler reads `role` / `tenantId` from the query string,
 * injects them as headers (plus `Last-Event-ID` for resume), and pipes the
 * upstream `text/event-stream` straight through with anti-buffering headers.
 *
 * @module app/api/logs/stream/route
 */

import type { NextRequest } from 'next/server'

import { streamQuerySchema } from '@/lib/schemas'

/** Always run dynamically — this is a long-lived streaming connection. */
export const dynamic = 'force-dynamic'

/** Node runtime so the upstream `fetch` body can be streamed unbuffered. */
export const runtime = 'nodejs'

/** Upstream API base (the `apps/api` `logs/` read-API). */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Recognized RBAC roles; an unknown value falls back to least privilege. */
const VALID_ROLES = new Set(['viewer', 'operator', 'admin'])

/**
 * Proxy the API's SSE log stream, injecting RBAC headers from query params.
 *
 * @param req - The incoming streaming request.
 * @returns A `text/event-stream` response piping the upstream stream.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const incoming = new URL(req.url)

  // Reject an obviously-malformed query at the edge before forwarding it.
  if (!streamQuerySchema.safeParse(Object.fromEntries(incoming.searchParams)).success) {
    return new Response('invalid query', { status: 400 })
  }

  // Translate `role` / `tenantId` query params into RBAC headers; the API
  // resolves both from headers, so strip them from the upstream query. An
  // absent or unrecognized role falls back to the least-privileged `viewer`
  // (role order: viewer < operator < admin) so a missing param never escalates.
  const rawRole = incoming.searchParams.get('role') ?? 'viewer'
  const role = VALID_ROLES.has(rawRole) ? rawRole : 'viewer'
  const tenantId = incoming.searchParams.get('tenantId') ?? ''
  const upstreamParams = new URLSearchParams(incoming.searchParams)
  upstreamParams.delete('role')
  upstreamParams.delete('tenantId')

  const headers: Record<string, string> = { Accept: 'text/event-stream', 'x-role': role }
  if (tenantId !== '') headers['x-tenant-id'] = tenantId
  const lastEventId = req.headers.get('last-event-id')
  if (lastEventId !== null) headers['last-event-id'] = lastEventId

  const upstream = await fetch(`${API_BASE}/logs/stream?${upstreamParams.toString()}`, {
    headers,
    signal: req.signal,
  })

  if (upstream.body === null) {
    return new Response('upstream stream unavailable', { status: 502 })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
