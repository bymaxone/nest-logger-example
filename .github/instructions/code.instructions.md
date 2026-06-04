---
applyTo: 'apps/**/*.ts,apps/**/*.tsx'
---

# Source code standards (apps/api · apps/worker · apps/web)

## TypeScript flags — practical impact (`tsconfig.base.json`)

- **`noUncheckedIndexedAccess`**: `arr[i]` / `record[k]` is `T | undefined`. Guard every index access; flag unguarded ones.
- **`exactOptionalPropertyTypes`**: `{ x?: T }` ≠ `{ x: T | undefined }`. Build objects with **conditional spreads** (`...(v ? { x: v } : {})`); never assign explicit `undefined` to an optional prop.
- **`verbatimModuleSyntax`**: type-only imports MUST use `import type { … }`; type re-exports use `export type`.
- **`noImplicitOverride` / `noImplicitReturns` / `noFallthroughCasesInSwitch`**: `override` on NestJS lifecycle overrides; every path returns; no switch fall-through.

## ESLint (flat, `recommendedTypeChecked`) — errors

`no-explicit-any`, `no-floating-promises` (mark fire-and-forget with `void`), `no-misused-promises`, `no-unsafe-*`. No suppression comments anywhere in `apps/`. Only test files relax `no-unsafe-*` / `no-explicit-any` — source must not.

## Backend (NestJS — apps/api, apps/worker)

- DI only; inject via the constructor. Validate query/body with a Zod schema through `ZodValidationPipe`.
- DB access via `PrismaService`. Raw SQL uses `Prisma.sql` tagged templates — **never** string-interpolate user input (SQL / LogQL injection). `escapeLogQL` every value placed into a LogQL string.
- RBAC: resolve the restriction from `x-role`/`x-tenant-id` (`buildRbacContext` → `toRestriction`) and thread it into the Prisma `where` / LogQL of **every** read endpoint — the restriction wins over query params.
- OTel SDK starts before NestJS (`import './instrumentation.js'` first in `main.ts`). Context via `AsyncLocalStorage`, never on class instances. `OnApplicationShutdown` where a stream/handle needs teardown.
- Logging: use the bridged `PinoLoggerService`; `logKey` = `MODULE_ACTION_RESULT`; no `console.*` in application code (the bootstrap/shutdown fallback in `main.ts` is the only carve-out); rely on redaction-at-source (never strip PII inline).
- Layered: controller → service → prisma. No cross-feature imports.

## Frontend (Next.js 16 App Router — apps/web)

- `'use client'` only on leaf components — **never** in `layout.tsx`. URL-state pages set `export const dynamic = 'force-dynamic'`.
- Charts read **only** `/logs/aggregate` or `/logs/facets` (server-side). Never aggregate raw rows client-side; group-by only bounded dims (`level` / `status_class` / `logKey` / `service` / `tenantId`).
- Filter state is the **nuqs URL state** (single source of truth) — no parallel Context/`useState` store. Server state via **TanStack Query**.
- Import library types from `@bymax-one/nest-logger/shared` only (never the `.` root).
- Redacted fields render verbatim (`[REDACTED]`) — no client unmask. Severity = colour **+** icon **+** text (`lib/severity.ts`), never colour alone.
- Live tail uses `EventSource` (not WebSocket/polling) through the same-origin proxy route; the buffer is bounded + `requestAnimationFrame`-flushed.

## Security & PII

- RBAC role/tenant come from headers; default to least privilege at the proxy. Never log secrets/tokens/PII. CORS is an explicit allow-list (`WEB_ORIGIN`). Comments timeless — no Phase/task references in code.
