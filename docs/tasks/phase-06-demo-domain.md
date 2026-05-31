# Phase 6 — Demo Domain — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6
> **Total tasks:** 8
> **Progress:** 🔴 0 / 8 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                  | Status | Priority | Size | Depends on       |
| ---- | --------------------------------------------------------------------- | ------ | -------- | ---- | ---------------- |
| P6-1 | `orders/` module (hot-path `info`, `:id` norm, slow path)             | 🔴     | High     | M    | Phase 4, Phase 5 |
| P6-2 | `payments/` module (`@LogPerformance`, `errorStructured`, throw)      | 🔴     | High     | M    | P6-1             |
| P6-3 | `pii-demo/` module (signup/nested/echo-headers/huge surfaces)         | 🔴     | High     | M    | P6-1             |
| P6-4 | `downstream/` module (`@LogContext` + ctor `setContext`, worker stub) | 🔴     | High     | M    | P6-1             |
| P6-5 | `trigger/` module (level/status/fault/burst Playground hooks)         | 🔴     | High     | M    | P6-1             |
| P6-6 | `admin/` module (`PATCH /admin/log-level` → `getRawLogger().level`)   | 🔴     | Medium   | S    | P6-1             |
| P6-7 | Shared demo wiring (DTOs, error helpers, AppModule registration)      | 🔴     | High     | S    | P6-1..P6-6       |
| P6-8 | Verification gate (each endpoint emits expected `logKey`s + context)  | 🔴     | High     | M    | P6-1..P6-7       |

---

## P6-1 — `orders/` Module (hot-path `info`, `:id` normalization, slow path)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `Phase 4`, `Phase 5`

### Description

Create the `orders/` feature — the canonical "structured logging on the hot path" demo. `POST /orders` persists an `Order` (Prisma, from Phase 5) and emits a single `ORDER_CREATE_SUCCESS` `info` line carrying the `userId` argument plus an `{ orderId, amount }` meta object; `GET /orders/:id` reads one back and exercises the library's URL `:id` normalization (the access log shows `"url":"/orders/:id"`, not the raw id); `GET /orders/slow` is decorated with `@LogPerformance(50)` so a deliberate >50 ms delay emits `METHOD_SLOW_EXECUTION`. This module establishes the `@InjectLogger(Context.name)` child-logger + `@LogPerformance` patterns every later demo module reuses, so get the host-property naming right here (the decorator reads `this.logger`).

### Acceptance Criteria

- [ ] `apps/api/src/orders/orders.module.ts`, `orders.controller.ts`, `orders.service.ts` exist and the module is importable.
- [ ] `OrdersService` injects its child logger via `@InjectLogger(OrdersService.name)` into a `private readonly logger` field (the exact name `logger` is required by `@LogPerformance`).
- [ ] `POST /orders` validates `{ amount, tenantId }`, creates an `Order` via `PrismaService`, and emits exactly one `ORDER_CREATE_SUCCESS` line: `this.logger.info('ORDER_CREATE_SUCCESS', 'Order created', userId, { orderId, amount })`.
- [ ] `GET /orders/:id` returns the order (404 → `HttpException` if absent) and its access log shows `"url":"/orders/:id"` (library normalization, not code-side).
- [ ] `GET /orders/slow` is annotated `@LogPerformance(50)`, sleeps ≥75 ms, and emits a `METHOD_SLOW_EXECUTION` line on stdout.
- [ ] Every app log key is `MODULE_ACTION_RESULT` and matches `LOG_KEYS_CONVENTION_REGEX`; none collides with a `RESERVED_LOG_KEYS` value.
- [ ] `pnpm --filter api typecheck` and `pnpm --filter api lint` pass.

### Files to create / modify

- `apps/api/src/orders/orders.module.ts`
- `apps/api/src/orders/orders.controller.ts`
- `apps/api/src/orders/orders.service.ts`
- `apps/api/src/orders/dto/create-order.dto.ts`
- `apps/api/src/app.module.ts` — register `OrdersModule` (final wiring consolidated in P6-7).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer demonstrating `@bymax-one/nest-logger@0.1.0` structured logging.
> Context: Task P6-1 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6, building on Phase 4 (logger wired via `BymaxLoggerModule.forRootAsync`, `RequestIdMiddleware` opening the ALS scope) and Phase 5 (Prisma `Order` model + `PrismaService`). See `docs/OVERVIEW.md` §10 (demo-domain table) + §15 (journey 1 "first request → first correlated trace" and journey 4 "slow-path detection"). The library API you may use is **only**: `PinoLoggerService.info(logKey, msg, userId?, meta?)` / `warnStructured(...)` / `errorStructured(...)` / `getRawLogger()` / `setContext()` / `child()`, the `@InjectLogger(context)` child-logger decorator, and `@LogPerformance(thresholdMs?)`.
> Objective: Build the `orders/` module proving hot-path `info`, URL `:id` normalization, and `@LogPerformance` slow detection.
> Steps:
>
> 1. Create `apps/api/src/orders/dto/create-order.dto.ts` — a Zod schema (matching the Phase 3 `config` Zod convention) for the request body:
>
>    ```typescript
>    import { z } from 'zod'
>
>    export const createOrderSchema = z.object({
>      amount: z.number().int().positive(), // cents
>      tenantId: z.string().min(1),
>      userId: z.string().min(1).optional(),
>    })
>
>    export type CreateOrderDto = z.infer<typeof createOrderSchema>
>    ```
>
> 2. Create `apps/api/src/orders/orders.service.ts`. Inject the child logger into a field **named `logger`** (required: `@LogPerformance` reads `this.logger`) and the `PrismaService`:
>
>    ```typescript
>    import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
>    import { InjectLogger, LogPerformance, PinoLoggerService } from '@bymax-one/nest-logger'
>    import { PrismaService } from '../prisma/prisma.service'
>    import type { CreateOrderDto } from './dto/create-order.dto'
>
>    @Injectable()
>    export class OrdersService {
>      constructor(
>        // The host property MUST be named `logger` — @LogPerformance reads `this.logger`.
>        @InjectLogger(OrdersService.name) private readonly logger: PinoLoggerService,
>        private readonly prisma: PrismaService,
>      ) {}
>
>      async create(dto: CreateOrderDto): Promise<{ id: string; amount: number }> {
>        const order = await this.prisma.order.create({
>          data: { amount: dto.amount, tenantId: dto.tenantId },
>        })
>        // Hot-path structured log: logKey, message, userId (4th-arg meta is the structured payload).
>        this.logger.info('ORDER_CREATE_SUCCESS', 'Order created', dto.userId, {
>          orderId: order.id,
>          amount: order.amount,
>        })
>        return { id: order.id, amount: order.amount }
>      }
>
>      async findOne(id: string): Promise<{ id: string; amount: number; status: string }> {
>        const order = await this.prisma.order.findUnique({ where: { id } })
>        if (!order) {
>          this.logger.warnStructured('ORDER_LOOKUP_MISS', 'Order not found', undefined, {
>            orderId: id,
>          })
>          throw new HttpException('Order not found', HttpStatus.NOT_FOUND)
>        }
>        this.logger.info('ORDER_LOOKUP_SUCCESS', 'Order fetched', undefined, { orderId: order.id })
>        return { id: order.id, amount: order.amount, status: order.status }
>      }
>
>      // @LogPerformance emits METHOD_EXECUTION normally and METHOD_SLOW_EXECUTION past the threshold.
>      @LogPerformance(50)
>      async slow(): Promise<{ ok: true }> {
>        await new Promise((resolve) => setTimeout(resolve, 75)) // exceed the 50ms threshold
>        this.logger.info('ORDER_SLOW_SUCCESS', 'Slow path completed', undefined, {})
>        return { ok: true }
>      }
>    }
>    ```
>
> 3. Create `apps/api/src/orders/orders.controller.ts`. Place the static `slow` route **before** the `:id` route so it is not captured as an id:
>
>    ```typescript
>    import { Body, Controller, Get, Param, Post } from '@nestjs/common'
>    import { OrdersService } from './orders.service'
>    import { createOrderSchema } from './dto/create-order.dto'
>
>    @Controller('orders')
>    export class OrdersController {
>      constructor(private readonly orders: OrdersService) {}
>
>      @Post()
>      create(@Body() body: unknown) {
>        return this.orders.create(createOrderSchema.parse(body))
>      }
>
>      @Get('slow') // declared before ':id' so '/orders/slow' is not matched as an id
>      slow() {
>        return this.orders.slow()
>      }
>
>      @Get(':id')
>      findOne(@Param('id') id: string) {
>        return this.orders.findOne(id)
>      }
>    }
>    ```
>
> 4. Create `apps/api/src/orders/orders.module.ts` (import the `PrismaModule`/`PrismaService` per the Phase 5 wiring):
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { OrdersController } from './orders.controller'
>    import { OrdersService } from './orders.service'
>    import { PrismaModule } from '../prisma/prisma.module'
>
>    @Module({
>      imports: [PrismaModule],
>      controllers: [OrdersController],
>      providers: [OrdersService],
>    })
>    export class OrdersModule {}
>    ```
>
> 5. Register `OrdersModule` in `apps/api/src/app.module.ts` `imports` (P6-7 consolidates the final module list).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions (strict TS, ESM, log-key convention, English-only).
> - Use **only** the `0.1.0` logger API listed above. The host property for the child logger MUST be `logger` (do not rename it — `@LogPerformance` reads `this.logger`).
> - Do NOT hand-roll URL `:id` normalization — it is the library `HttpLoggingInterceptor`'s job; your route param just needs to be `:id`.
> - Do NOT reuse any `RESERVED_LOG_KEYS` value (`HTTP_REQUEST_*`, `LOGGER_*`, `METHOD_EXECUTION`, `METHOD_SLOW_EXECUTION`, etc.) as an app log key.
> - Do NOT use `fatalStructured` (it does not exist) or any `http.slowThresholdMs` option (use `@LogPerformance(ms)`).
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - With the stack up (`pnpm infra:up`) and the API running, `curl -s -XPOST localhost:3001/orders -H 'content-type: application/json' -d '{"amount":1299,"tenantId":"t_acme","userId":"u_1"}'` — expected: the stdout JSON contains `"logKey":"ORDER_CREATE_SUCCESS"` plus a propagated `requestId`.
> - `curl -s localhost:3001/orders/slow` then grep stdout — expected: a line with `"logKey":"METHOD_SLOW_EXECUTION"`.
> - `curl -s localhost:3001/orders/<some-id>` — expected: the access log line shows `"url":"/orders/:id"`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P6-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P6-2 — `payments/` Module (`@LogPerformance`, `errorStructured`, throw → `HTTP_EXCEPTION_HANDLED`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P6-1`

### Description

Create the `payments/` feature — the "error path + performance" demo. `POST /payments` is decorated with `@LogPerformance()` (so it always emits `METHOD_EXECUTION`), runs a deliberately failing charge, logs the caught `Error` via `errorStructured` with a real log key (`PAYMENT_REFUND_FAILED` / `PAYMENT_CHARGE_FAILED`), then throws an `HttpException`. The library's `HttpExceptionFilter` (wired in Phase 4 via `http.shouldCaptureExceptions`) turns that throw into a single `HTTP_EXCEPTION_HANDLED` line — proving double-log avoidance (the interceptor and filter coordinate so the failure is logged once). This is `docs/OVERVIEW.md` §15 journey 5.

### Acceptance Criteria

- [ ] `apps/api/src/payments/payments.module.ts`, `payments.controller.ts`, `payments.service.ts` exist and the module is importable.
- [ ] `PaymentsService` injects its child logger into `private readonly logger` via `@InjectLogger(PaymentsService.name)`.
- [ ] `POST /payments` is decorated `@LogPerformance()` so a `METHOD_EXECUTION` line is emitted for the handler.
- [ ] On the forced failure the service calls `this.logger.errorStructured('PAYMENT_CHARGE_FAILED', error, userId?, meta?)` with the **Error object** as the 2nd argument (never a string), then throws an `HttpException` (e.g. `HttpStatus.PAYMENT_REQUIRED` / `BAD_GATEWAY`).
- [ ] The thrown `HttpException` surfaces as exactly one `HTTP_EXCEPTION_HANDLED` line (filter ↔ interceptor double-log avoidance) — no duplicate failure log.
- [ ] All app log keys match `LOG_KEYS_CONVENTION_REGEX` and reuse no `RESERVED_LOG_KEYS` value.
- [ ] `pnpm --filter api typecheck` and `pnpm --filter api lint` pass.

### Files to create / modify

- `apps/api/src/payments/payments.module.ts`
- `apps/api/src/payments/payments.controller.ts`
- `apps/api/src/payments/payments.service.ts`
- `apps/api/src/payments/dto/create-payment.dto.ts`
- `apps/api/src/app.module.ts` — register `PaymentsModule` (consolidated in P6-7).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer demonstrating error logging + performance logging with `@bymax-one/nest-logger@0.1.0`.
> Context: Task P6-2 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6. Phase 4 wired the `HttpExceptionFilter` (via `http.shouldCaptureExceptions: true`) and the `HttpLoggingInterceptor`; they coordinate via `__bymax_logger_handled` so a thrown exception is logged once as `HTTP_EXCEPTION_HANDLED`. See `docs/OVERVIEW.md` §10 (payments row), §15 journey 5, and Feature-Coverage rows 6/11/16. Use **only** the `0.1.0` API: `errorStructured(logKey, Error, userId?, meta?)`, `info(...)`, `warnStructured(...)`, `@InjectLogger(context)`, `@LogPerformance(thresholdMs?)`.
> Objective: Build `payments/` proving `@LogPerformance`, `errorStructured` with a real `Error`, and a thrown `HttpException` that the library filter logs as `HTTP_EXCEPTION_HANDLED`.
> Steps:
>
> 1. Create `apps/api/src/payments/dto/create-payment.dto.ts`:
>
>    ```typescript
>    import { z } from 'zod'
>
>    export const createPaymentSchema = z.object({
>      orderId: z.string().min(1),
>      amount: z.number().int().positive(),
>      userId: z.string().min(1).optional(),
>    })
>
>    export type CreatePaymentDto = z.infer<typeof createPaymentSchema>
>    ```
>
> 2. Create `apps/api/src/payments/payments.service.ts`. Decorate the handler with `@LogPerformance()` (no threshold = always emits `METHOD_EXECUTION`), and in the catch block call `errorStructured` with the caught `Error`:
>
>    ```typescript
>    import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
>    import { InjectLogger, LogPerformance, PinoLoggerService } from '@bymax-one/nest-logger'
>    import type { CreatePaymentDto } from './dto/create-payment.dto'
>
>    @Injectable()
>    export class PaymentsService {
>      constructor(
>        @InjectLogger(PaymentsService.name) private readonly logger: PinoLoggerService,
>      ) {}
>
>      // No threshold → emits METHOD_EXECUTION for every charge attempt.
>      @LogPerformance()
>      async charge(dto: CreatePaymentDto): Promise<never> {
>        this.logger.info('PAYMENT_CHARGE_ATTEMPT', 'Charge initiated', dto.userId, {
>          orderId: dto.orderId,
>          amount: dto.amount,
>        })
>        try {
>          // Deliberate failure to demonstrate the error path.
>          throw new Error(`Gateway declined charge for order ${dto.orderId}`)
>        } catch (error) {
>          // errorStructured takes the Error OBJECT as the 2nd arg (never a string).
>          this.logger.errorStructured('PAYMENT_CHARGE_FAILED', error as Error, dto.userId, {
>            orderId: dto.orderId,
>          })
>          // Throw → the library HttpExceptionFilter logs HTTP_EXCEPTION_HANDLED once.
>          throw new HttpException('Payment failed', HttpStatus.BAD_GATEWAY)
>        }
>      }
>    }
>    ```
>
> 3. Create `apps/api/src/payments/payments.controller.ts`:
>
>    ```typescript
>    import { Body, Controller, Post } from '@nestjs/common'
>    import { PaymentsService } from './payments.service'
>    import { createPaymentSchema } from './dto/create-payment.dto'
>
>    @Controller('payments')
>    export class PaymentsController {
>      constructor(private readonly payments: PaymentsService) {}
>
>      @Post()
>      create(@Body() body: unknown) {
>        return this.payments.charge(createPaymentSchema.parse(body))
>      }
>    }
>    ```
>
> 4. Create `apps/api/src/payments/payments.module.ts`:
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { PaymentsController } from './payments.controller'
>    import { PaymentsService } from './payments.service'
>
>    @Module({ controllers: [PaymentsController], providers: [PaymentsService] })
>    export class PaymentsModule {}
>    ```
>
> 5. Register `PaymentsModule` in `app.module.ts` (final list in P6-7).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - `errorStructured`'s 2nd argument is the **`Error` object** — never pass a message string there (that is the `info`/`warnStructured` shape).
> - Do NOT add your own try/catch-and-log around the `HttpException` at the controller level — let the library `HttpExceptionFilter` emit `HTTP_EXCEPTION_HANDLED` so double-log avoidance is genuinely demonstrated.
> - Do NOT use `fatalStructured` (absent) — for a truly fatal path use variadic `fatal()` or `errorStructured`.
> - The child-logger host property MUST be named `logger`.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `curl -s -XPOST localhost:3001/payments -H 'content-type: application/json' -d '{"orderId":"o_1","amount":500,"userId":"u_1"}'` returns 502; stdout contains `"logKey":"PAYMENT_CHARGE_FAILED"`, `"logKey":"METHOD_EXECUTION"`, and exactly **one** `"logKey":"HTTP_EXCEPTION_HANDLED"`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P6-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P6-3 — `pii-demo/` Module (signup / nested / echo-headers / huge redaction surfaces)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P6-1`

### Description

Create the `pii-demo/` feature — the endpoints that **emit** PII so Phase 8 can prove redaction end to end. This task only builds the surfaces and logs the payloads; the full `[REDACTED]` proofs (e2e stdout capture + "no raw PII in Postgres/Loki") land in Phase 8. `POST /pii-demo/signup` logs a DTO containing `password`/`email`/`cpf`/`cardNumber`/`cardCvv`; `POST /pii-demo/nested` logs a payload with a secret at depths 1–4 (and one at depth 5 to mark the boundary); `GET /pii-demo/echo-headers` logs the request headers (so `authorization`/`x-api-key`/`set-cookie` show redaction); `POST /pii-demo/huge` logs a >64 KB object so the library's `maxEntrySizeBytes` guard emits `LOGGER_ENTRY_TRUNCATED`.

### Acceptance Criteria

- [ ] `apps/api/src/pii-demo/pii-demo.module.ts`, `pii-demo.controller.ts`, `pii-demo.service.ts` exist and the module is importable.
- [ ] `POST /pii-demo/signup` logs `USER_SIGNUP_ATTEMPT` with a meta object containing `password`, `email`, `cpf`, `cardNumber`, `cardCvv` (and a nested `payment.cardNumber`).
- [ ] `POST /pii-demo/nested` logs a payload with a secret-bearing field at depths 1, 2, 3, 4, and 5 (so the depth-4 vs depth-5 boundary is observable in Phase 8).
- [ ] `GET /pii-demo/echo-headers` logs the incoming request headers under a `req.headers` shape so the absolute header paths redact.
- [ ] `POST /pii-demo/huge` builds and logs an object whose serialized size exceeds `maxEntrySizeBytes` (default 65 536) so the library emits `LOGGER_ENTRY_TRUNCATED`.
- [ ] All app log keys match `LOG_KEYS_CONVENTION_REGEX` and reuse no `RESERVED_LOG_KEYS` value (`LOGGER_ENTRY_TRUNCATED` is library-emitted, not authored by you).
- [ ] `pnpm --filter api typecheck` and `pnpm --filter api lint` pass.

### Files to create / modify

- `apps/api/src/pii-demo/pii-demo.module.ts`
- `apps/api/src/pii-demo/pii-demo.controller.ts`
- `apps/api/src/pii-demo/pii-demo.service.ts`
- `apps/api/src/pii-demo/dto/signup.dto.ts`
- `apps/api/src/app.module.ts` — register `PiiDemoModule` (consolidated in P6-7).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer building the PII-emitting surfaces for `@bymax-one/nest-logger@0.1.0` redaction proofs.
> Context: Task P6-3 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6. The library auto-applies 97 default redact paths (23 fields × depths 1–4 + 5 absolute header paths) and truncates entries over `maxEntrySizeBytes`. See `docs/OVERVIEW.md` §13 (PII showcase — the signup payload example + the depth-4/5 boundary) and §10 (pii-demo rows). **This task only emits the surfaces; the `[REDACTED]` assertions are Phase 8 (`phase-08-redaction.md`).** Use **only** the `0.1.0` API: `info(logKey, msg, userId?, meta?)`, `warnStructured(...)`, `@InjectLogger(context)`.
> Objective: Build the four `pii-demo` endpoints that log PII-bearing payloads, nested-depth payloads, headers, and an oversized object.
> Steps:
>
> 1. Create `apps/api/src/pii-demo/dto/signup.dto.ts`:
>
>    ```typescript
>    import { z } from 'zod'
>
>    export const signupSchema = z.object({
>      email: z.string().email(),
>      password: z.string().min(1),
>      cpf: z.string().min(1),
>      cardNumber: z.string().min(1),
>      cardCvv: z.string().min(1),
>    })
>
>    export type SignupDto = z.infer<typeof signupSchema>
>    ```
>
> 2. Create `apps/api/src/pii-demo/pii-demo.service.ts`. Each method logs a payload designed to exercise a redaction surface:
>
>    ```typescript
>    import { Injectable } from '@nestjs/common'
>    import { InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'
>    import type { SignupDto } from './dto/signup.dto'
>
>    @Injectable()
>    export class PiiDemoService {
>      constructor(@InjectLogger(PiiDemoService.name) private readonly logger: PinoLoggerService) {}
>
>      signup(dto: SignupDto): { ok: true } {
>        // All of password/email/cpf/cardNumber/cardCvv are default redact paths (Phase 8 asserts).
>        this.logger.info('USER_SIGNUP_ATTEMPT', 'Signup initiated', undefined, {
>          email: dto.email,
>          password: dto.password,
>          cpf: dto.cpf,
>          cardNumber: dto.cardNumber,
>          cardCvv: dto.cardCvv,
>          payment: { cardNumber: dto.cardNumber }, // redacted at depth 2
>        })
>        return { ok: true }
>      }
>
>      nested(): { ok: true } {
>        // A `password` field at depths 1..5. Defaults redact depths 1-4; depth 5 is the boundary.
>        this.logger.info('PII_NESTED_ATTEMPT', 'Nested payload logged', undefined, {
>          password: 'd1',
>          a: { password: 'd2' },
>          b: { c: { password: 'd3' } },
>          d: { e: { f: { password: 'd4' } } },
>          g: { h: { i: { j: { password: 'd5' } } } }, // depth 5 → NOT redacted by default
>        })
>        return { ok: true }
>      }
>
>      echoHeaders(headers: Record<string, unknown>): { ok: true } {
>        // Log under a `req.headers` shape so the absolute header paths apply.
>        this.logger.info('PII_HEADERS_ECHO', 'Headers echoed', undefined, { req: { headers } })
>        return { ok: true }
>      }
>
>      huge(): { ok: true } {
>        // >64 KB payload → library emits LOGGER_ENTRY_TRUNCATED (maxEntrySizeBytes default 65536).
>        const big = 'x'.repeat(70_000)
>        this.logger.info('PII_HUGE_ATTEMPT', 'Oversized payload logged', undefined, { blob: big })
>        return { ok: true }
>      }
>    }
>    ```
>
> 3. Create `apps/api/src/pii-demo/pii-demo.controller.ts`:
>
>    ```typescript
>    import { Body, Controller, Get, Headers, Post } from '@nestjs/common'
>    import { PiiDemoService } from './pii-demo.service'
>    import { signupSchema } from './dto/signup.dto'
>
>    @Controller('pii-demo')
>    export class PiiDemoController {
>      constructor(private readonly pii: PiiDemoService) {}
>
>      @Post('signup')
>      signup(@Body() body: unknown) {
>        return this.pii.signup(signupSchema.parse(body))
>      }
>
>      @Post('nested')
>      nested() {
>        return this.pii.nested()
>      }
>
>      @Get('echo-headers')
>      echoHeaders(@Headers() headers: Record<string, string>) {
>        return this.pii.echoHeaders(headers)
>      }
>
>      @Post('huge')
>      huge() {
>        return this.pii.huge()
>      }
>    }
>    ```
>
> 4. Create `apps/api/src/pii-demo/pii-demo.module.ts`:
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { PiiDemoController } from './pii-demo.controller'
>    import { PiiDemoService } from './pii-demo.service'
>
>    @Module({ controllers: [PiiDemoController], providers: [PiiDemoService] })
>    export class PiiDemoModule {}
>    ```
>
> 5. Register `PiiDemoModule` in `app.module.ts` (final list in P6-7).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Do NOT assert `[REDACTED]` here and do NOT add custom `redactPaths` — that is Phase 8. This task only **emits** the surfaces.
> - Do NOT set `shouldDisableDefaultRedact` anywhere in the running app (Phase 8 covers that only inside a dedicated test module).
> - Field NAMES matter: use the exact default-path field names (`password`, `email`, `cpf`, `cardNumber`, `cardCvv`) so Phase 8's assertions line up.
> - `LOGGER_ENTRY_TRUNCATED` is emitted by the library — do not author a log key with that name.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `curl -s -XPOST localhost:3001/pii-demo/signup -H 'content-type: application/json' -d '{"email":"a@b.com","password":"p@ss","cpf":"000","cardNumber":"4111","cardCvv":"123"}'` — expected: a `"logKey":"USER_SIGNUP_ATTEMPT"` line on stdout (Phase 8 asserts the values are `[REDACTED]`).
> - `curl -s -XPOST localhost:3001/pii-demo/huge` then grep stdout — expected: a `"logKey":"LOGGER_ENTRY_TRUNCATED"` envelope rather than a 70 KB line.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P6-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P6-4 — `downstream/` Module (`@LogContext(name)` class label + ctor `setContext()`, worker stub)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P6-1`

### Description

Create the `downstream/` feature — the cross-service-correlation surface. `POST /downstream/dispatch` will (in Phase 9) call `apps/worker` over HTTP so a single `traceId` flows across the hop; **`apps/worker` does not exist until Phase 9**, so this task stubs the outbound HTTP call (a guarded `fetch` to a configured worker URL, swallowing connection failures with a `warnStructured` rather than crashing). The teaching point owned by this task is the context decorator: in `0.1.0` `@LogContext(name)` is a **class** decorator that only records a metadata label — it does **not** set the active context — so the real context is applied with `setContext()` in the constructor. Get that distinction right; it is the single most-misused part of the `0.1.0` API.

### Acceptance Criteria

- [ ] `apps/api/src/downstream/downstream.module.ts`, `downstream.controller.ts`, `downstream.service.ts` exist and the module is importable.
- [ ] `DownstreamService` is annotated with the **class** decorator `@LogContext(DownstreamService.name)` (label only) AND calls `this.logger.setContext(DownstreamService.name)` in its constructor (the call that actually applies the context in `0.1.0`).
- [ ] The child logger is injected into `private readonly logger` via `@InjectLogger(DownstreamService.name)`.
- [ ] `POST /downstream/dispatch` emits `DOWNSTREAM_DISPATCH_ATTEMPT` then performs a **stubbed** outbound HTTP call to a `WORKER_URL` (env, optional) and emits `DOWNSTREAM_DISPATCH_SUCCESS` on success.
- [ ] The outbound call is fail-soft: a connection error logs `warnStructured('DOWNSTREAM_DISPATCH_DEGRADED', …)` and the endpoint still returns 2xx (worker is built in Phase 9; the call must not crash now).
- [ ] All app log keys match `LOG_KEYS_CONVENTION_REGEX` and reuse no `RESERVED_LOG_KEYS` value.
- [ ] `pnpm --filter api typecheck` and `pnpm --filter api lint` pass.

### Files to create / modify

- `apps/api/src/downstream/downstream.module.ts`
- `apps/api/src/downstream/downstream.controller.ts`
- `apps/api/src/downstream/downstream.service.ts`
- `apps/api/src/app.module.ts` — register `DownstreamModule` (consolidated in P6-7).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer wiring the cross-service surface for `@bymax-one/nest-logger@0.1.0`.
> Context: Task P6-4 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6. `apps/worker` is **built in Phase 9** (`phase-09-otel-correlation.md`) — so the outbound HTTP call is **stubbed** now (guarded `fetch`, fail-soft). Critical API note (from `docs/OVERVIEW.md` reconciliation table + §10/§14): in `0.1.0` **`@LogContext(name)` is a CLASS decorator that only records a metadata label** (`LOG_CONTEXT_METADATA_KEY`); it does NOT activate the context. Apply the real context with **`setContext()` in the constructor**. Use **only** the `0.1.0` API: `info(...)`, `warnStructured(...)`, `errorStructured(...)`, `@InjectLogger(context)`, `@LogContext(name)` (class label), `setContext()`, `LogContextService.run/set/get/getStore` (manual ALS, available if you need it).
> Objective: Build `downstream/` proving the `@LogContext` class-label + `setContext()` idiom and a fail-soft stubbed worker hop.
> Steps:
>
> 1. Create `apps/api/src/downstream/downstream.service.ts`. Apply the class label AND set the real context in the constructor:
>
>    ```typescript
>    import { Injectable } from '@nestjs/common'
>    import { InjectLogger, LogContext, PinoLoggerService } from '@bymax-one/nest-logger'
>
>    // @LogContext is a CLASS decorator in 0.1.0 — it only records a metadata label.
>    @LogContext(DownstreamService.name)
>    @Injectable()
>    export class DownstreamService {
>      constructor(
>        @InjectLogger(DownstreamService.name) private readonly logger: PinoLoggerService,
>      ) {
>        // The label alone does NOT apply context in 0.1.0 — setContext() is what actually does.
>        this.logger.setContext(DownstreamService.name)
>      }
>
>      async dispatch(): Promise<{ ok: boolean }> {
>        this.logger.info('DOWNSTREAM_DISPATCH_ATTEMPT', 'Dispatching to worker', undefined, {})
>        // STUB: apps/worker is built in Phase 9. The W3C traceparent propagation + real worker
>        // round-trip land there; for now do a fail-soft outbound call so the endpoint is real
>        // without depending on a service that does not exist yet.
>        const workerUrl = process.env.WORKER_URL ?? 'http://localhost:3002/tasks/dispatch'
>        try {
>          await fetch(workerUrl, {
>            method: 'POST',
>            headers: { 'content-type': 'application/json' },
>            body: JSON.stringify({ kind: 'demo' }),
>          })
>          this.logger.info(
>            'DOWNSTREAM_DISPATCH_SUCCESS',
>            'Worker accepted dispatch',
>            undefined,
>            {},
>          )
>          return { ok: true }
>        } catch (error) {
>          // Worker not up yet (Phase 9) → degrade gracefully, never crash the request.
>          this.logger.warnStructured(
>            'DOWNSTREAM_DISPATCH_DEGRADED',
>            'Worker unreachable (stub)',
>            undefined,
>            {
>              workerUrl,
>              reason: (error as Error).message,
>            },
>          )
>          return { ok: false }
>        }
>      }
>    }
>    ```
>
> 2. Create `apps/api/src/downstream/downstream.controller.ts`:
>
>    ```typescript
>    import { Controller, Post } from '@nestjs/common'
>    import { DownstreamService } from './downstream.service'
>
>    @Controller('downstream')
>    export class DownstreamController {
>      constructor(private readonly downstream: DownstreamService) {}
>
>      @Post('dispatch')
>      dispatch() {
>        return this.downstream.dispatch()
>      }
>    }
>    ```
>
> 3. Create `apps/api/src/downstream/downstream.module.ts`:
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { DownstreamController } from './downstream.controller'
>    import { DownstreamService } from './downstream.service'
>
>    @Module({ controllers: [DownstreamController], providers: [DownstreamService] })
>    export class DownstreamModule {}
>    ```
>
> 4. Register `DownstreamModule` in `app.module.ts` (final list in P6-7). Add `WORKER_URL` to the env registry / `.env.example` as an **optional** variable (the worker is Phase 9).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use `@LogContext(name)` as a **class** decorator ONLY — it is NOT a method/store decorator in `0.1.0` and does NOT activate context. The activating call is `setContext()` in the constructor. Do NOT write `@LogContext(store)` (that signature does not exist in `0.1.0`).
> - The stubbed worker call MUST be fail-soft (worker is Phase 9). Do NOT block the phase on a running worker; do NOT throw on connection refusal.
> - Do NOT manually inject `traceparent` here — auto-instrumentation + the manual `propagation.inject` example are Phase 9 deliverables.
> - The child-logger host property MUST be named `logger`.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - With the worker NOT running, `curl -s -XPOST localhost:3001/downstream/dispatch` — expected: HTTP 2xx; stdout shows `"logKey":"DOWNSTREAM_DISPATCH_ATTEMPT"` and `"logKey":"DOWNSTREAM_DISPATCH_DEGRADED"` (proving fail-soft) without crashing the API.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P6-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P6-5 — `trigger/` Module (level / status / fault / burst Playground hooks)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P6-1`

### Description

Create the `trigger/` feature — the backend hooks the `apps/web` Trigger Center (Phase 13) drives to fire every log type on demand. `POST /trigger/level` emits a log at an arbitrary level (`info`/`warn`/`error` via the structured methods); `GET /trigger/status/:code` returns the given HTTP status (so the library's `HTTP_REQUEST_*` keys for 2xx/3xx/4xx/5xx are exercised); `POST /trigger/fault/loki` flags a destination-fault scenario (the actual `LOGGER_DESTINATION_WRITE_FAILED` proof is wired with the Loki destination in Phase 7 — here it is a labelled hook); `POST /trigger/burst` fires N logs in a tight loop to feed the live-tail load demo. These are intentionally thin — they are remote-control surfaces, not domain logic.

### Acceptance Criteria

- [ ] `apps/api/src/trigger/trigger.module.ts`, `trigger.controller.ts`, `trigger.service.ts` exist and the module is importable.
- [ ] `POST /trigger/level` accepts a body `{ level, count? }` and emits that many lines at the requested level using `info` / `warnStructured` / `errorStructured` (mapped from the level string).
- [ ] `GET /trigger/status/:code` responds with the requested status code (clamped to a sane range) so the library emits the matching `HTTP_REQUEST_*` key (2xx success / 3xx redirect / 4xx client-error / 5xx).
- [ ] `POST /trigger/fault/loki` emits a labelled `TRIGGER_FAULT_REQUESTED` line (the real `LOGGER_DESTINATION_WRITE_FAILED` proof is Phase 7 — this is only the Playground hook).
- [ ] `POST /trigger/burst` accepts `{ count }` and emits `count` `TRIGGER_BURST_TICK` lines in a loop (capped, e.g. ≤500).
- [ ] All app log keys match `LOG_KEYS_CONVENTION_REGEX` and reuse no `RESERVED_LOG_KEYS` value.
- [ ] `pnpm --filter api typecheck` and `pnpm --filter api lint` pass.

### Files to create / modify

- `apps/api/src/trigger/trigger.module.ts`
- `apps/api/src/trigger/trigger.controller.ts`
- `apps/api/src/trigger/trigger.service.ts`
- `apps/api/src/trigger/dto/trigger.dto.ts`
- `apps/api/src/app.module.ts` — register `TriggerModule` (consolidated in P6-7).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer building the Playground trigger hooks for `@bymax-one/nest-logger@0.1.0`.
> Context: Task P6-5 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6. These endpoints are driven by the `apps/web` Trigger Center (Phase 13) and the live tail. See `docs/OVERVIEW.md` §10 (trigger row) + §13 dashboard "Trigger Center (Playground)". The `LOGGER_DESTINATION_*` fail-soft proof itself is Phase 7 — `/trigger/fault/loki` is only a labelled hook now. Use **only** the `0.1.0` API: `info(logKey, msg, userId?, meta?)`, `warnStructured(...)`, `errorStructured(logKey, Error, …)`, `@InjectLogger(context)`.
> Objective: Build the four `trigger/` Playground hooks (level, status code, fault, burst).
> Steps:
>
> 1. Create `apps/api/src/trigger/dto/trigger.dto.ts`:
>
>    ```typescript
>    import { z } from 'zod'
>
>    export const triggerLevelSchema = z.object({
>      level: z.enum(['info', 'warn', 'error']),
>      count: z.number().int().min(1).max(100).default(1),
>    })
>    export type TriggerLevelDto = z.infer<typeof triggerLevelSchema>
>
>    export const triggerBurstSchema = z.object({
>      count: z.number().int().min(1).max(500),
>    })
>    export type TriggerBurstDto = z.infer<typeof triggerBurstSchema>
>    ```
>
> 2. Create `apps/api/src/trigger/trigger.service.ts`:
>
>    ```typescript
>    import { Injectable } from '@nestjs/common'
>    import { InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'
>    import type { TriggerLevelDto } from './dto/trigger.dto'
>
>    @Injectable()
>    export class TriggerService {
>      constructor(@InjectLogger(TriggerService.name) private readonly logger: PinoLoggerService) {}
>
>      fireLevel(dto: TriggerLevelDto): { fired: number } {
>        for (let i = 0; i < dto.count; i += 1) {
>          if (dto.level === 'info') {
>            this.logger.info('TRIGGER_LEVEL_FIRED', 'Triggered info log', undefined, { i })
>          } else if (dto.level === 'warn') {
>            this.logger.warnStructured('TRIGGER_LEVEL_FIRED', 'Triggered warn log', undefined, {
>              i,
>            })
>          } else {
>            this.logger.errorStructured(
>              'TRIGGER_LEVEL_FIRED',
>              new Error('Triggered error log'),
>              undefined,
>              { i },
>            )
>          }
>        }
>        return { fired: dto.count }
>      }
>
>      requestFault(): { requested: true } {
>        // Hook only — the real LOGGER_DESTINATION_WRITE_FAILED proof is Phase 7 (Loki destination).
>        this.logger.warnStructured(
>          'TRIGGER_FAULT_REQUESTED',
>          'Destination fault requested',
>          undefined,
>          {
>            destination: 'loki',
>          },
>        )
>        return { requested: true }
>      }
>
>      burst(count: number): { fired: number } {
>        for (let i = 0; i < count; i += 1) {
>          this.logger.info('TRIGGER_BURST_TICK', 'Burst tick', undefined, { i })
>        }
>        return { fired: count }
>      }
>    }
>    ```
>
> 3. Create `apps/api/src/trigger/trigger.controller.ts`. For `/status/:code`, set the response status explicitly so the library access log records the right `HTTP_REQUEST_*` key:
>
>    ```typescript
>    import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common'
>    import type { Response } from 'express'
>    import { TriggerService } from './trigger.service'
>    import { triggerBurstSchema, triggerLevelSchema } from './dto/trigger.dto'
>
>    @Controller('trigger')
>    export class TriggerController {
>      constructor(private readonly trigger: TriggerService) {}
>
>      @Post('level')
>      level(@Body() body: unknown) {
>        return this.trigger.fireLevel(triggerLevelSchema.parse(body))
>      }
>
>      @Get('status/:code')
>      status(@Param('code') code: string, @Res() res: Response): void {
>        const parsed = Number.parseInt(code, 10)
>        const status = Number.isFinite(parsed) && parsed >= 200 && parsed <= 599 ? parsed : 400
>        res.status(status).json({ status }) // library interceptor maps this to the right HTTP_REQUEST_* key
>      }
>
>      @Post('fault/loki')
>      fault() {
>        return this.trigger.requestFault()
>      }
>
>      @Post('burst')
>      burst(@Body() body: unknown) {
>        return this.trigger.burst(triggerBurstSchema.parse(body).count)
>      }
>    }
>    ```
>
> 4. Create `apps/api/src/trigger/trigger.module.ts`:
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { TriggerController } from './trigger.controller'
>    import { TriggerService } from './trigger.service'
>
>    @Module({ controllers: [TriggerController], providers: [TriggerService] })
>    export class TriggerModule {}
>    ```
>
> 5. Register `TriggerModule` in `app.module.ts` (final list in P6-7).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Cap `burst`/`level` counts (no unbounded loops) so the Playground cannot DoS the dev box.
> - `/trigger/fault/loki` is a HOOK only here — do NOT wire the real destination fault (that is Phase 7's `LOGGER_DESTINATION_WRITE_FAILED` proof).
> - Reuse the same `TRIGGER_LEVEL_FIRED` key across levels (the level field disambiguates) — but do NOT reuse any `RESERVED_LOG_KEYS` value.
> - The child-logger host property MUST be named `logger`.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `curl -s -XPOST localhost:3001/trigger/level -H 'content-type: application/json' -d '{"level":"warn","count":3}'` — expected: three `"logKey":"TRIGGER_LEVEL_FIRED"` warn lines on stdout.
> - `curl -s -o /dev/null -w '%{http_code}' localhost:3001/trigger/status/503` — expected: `503`, and stdout shows the library's 5xx `HTTP_REQUEST_*` key.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P6-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P6-6 — `admin/` Module (`PATCH /admin/log-level` → `getRawLogger().level` runtime change)

- **Status:** 🔴 Not Started
- **Priority:** Medium
- **Size:** S (30–90 min)
- **Depends on:** `P6-1`

### Description

Create the `admin/` feature — the runtime-level-change demo. `PATCH /admin/log-level` flips the live Pino level via the `getRawLogger()` escape hatch (`getRawLogger().level = newLevel`), so `debug` lines start or stop appearing without a restart. This is the only sanctioned use of the raw-Pino escape hatch in the example and exercises Feature-Coverage row 43 + `docs/OVERVIEW.md` §15 journey 10. Validate the requested level against the six Pino levels before assigning.

### Acceptance Criteria

- [ ] `apps/api/src/admin/admin.module.ts`, `admin.controller.ts`, `admin.service.ts` exist and the module is importable.
- [ ] `PATCH /admin/log-level` accepts `{ level }` constrained to `fatal|error|warn|info|debug|trace`, sets `this.logger.getRawLogger().level = level`, and returns the new level.
- [ ] An invalid level returns a 400 (validation), never assigns, and the running level is unchanged.
- [ ] A `ADMIN_LOG_LEVEL_CHANGED` line is emitted recording the old → new level transition.
- [ ] All app log keys match `LOG_KEYS_CONVENTION_REGEX` and reuse no `RESERVED_LOG_KEYS` value.
- [ ] `pnpm --filter api typecheck` and `pnpm --filter api lint` pass.

### Files to create / modify

- `apps/api/src/admin/admin.module.ts`
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/admin/dto/log-level.dto.ts`
- `apps/api/src/app.module.ts` — register `AdminModule` (consolidated in P6-7).

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer demonstrating the raw-Pino escape hatch of `@bymax-one/nest-logger@0.1.0`.
> Context: Task P6-6 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6. The library exposes `getRawLogger()` to reach the underlying Pino instance for advanced use such as a live level change (`docs/OVERVIEW.md` §10 admin row, §15 journey 10, Feature-Coverage row 43). Use **only** the `0.1.0` API: `getRawLogger()`, `info(...)`, `warnStructured(...)`, `@InjectLogger(context)`.
> Objective: Build `admin/` proving a runtime log-level change via `getRawLogger().level`.
> Steps:
>
> 1. Create `apps/api/src/admin/dto/log-level.dto.ts`:
>
>    ```typescript
>    import { z } from 'zod'
>
>    export const logLevelSchema = z.object({
>      level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
>    })
>    export type LogLevelDto = z.infer<typeof logLevelSchema>
>    ```
>
> 2. Create `apps/api/src/admin/admin.service.ts`. Read the current level, assign the new one on the raw Pino instance, and log the transition:
>
>    ```typescript
>    import { Injectable } from '@nestjs/common'
>    import { InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'
>    import type { LogLevelDto } from './dto/log-level.dto'
>
>    @Injectable()
>    export class AdminService {
>      constructor(@InjectLogger(AdminService.name) private readonly logger: PinoLoggerService) {}
>
>      setLogLevel(dto: LogLevelDto): { previous: string; current: string } {
>        const raw = this.logger.getRawLogger()
>        const previous = raw.level
>        raw.level = dto.level // runtime change — debug lines start/stop appearing without a restart
>        this.logger.info('ADMIN_LOG_LEVEL_CHANGED', 'Runtime log level changed', undefined, {
>          previous,
>          current: dto.level,
>        })
>        return { previous, current: dto.level }
>      }
>    }
>    ```
>
> 3. Create `apps/api/src/admin/admin.controller.ts`:
>
>    ```typescript
>    import { Body, Controller, Patch } from '@nestjs/common'
>    import { AdminService } from './admin.service'
>    import { logLevelSchema } from './dto/log-level.dto'
>
>    @Controller('admin')
>    export class AdminController {
>      constructor(private readonly admin: AdminService) {}
>
>      @Patch('log-level')
>      setLogLevel(@Body() body: unknown) {
>        return this.admin.setLogLevel(logLevelSchema.parse(body))
>      }
>    }
>    ```
>
> 4. Create `apps/api/src/admin/admin.module.ts`:
>
>    ```typescript
>    import { Module } from '@nestjs/common'
>    import { AdminController } from './admin.controller'
>    import { AdminService } from './admin.service'
>
>    @Module({ controllers: [AdminController], providers: [AdminService] })
>    export class AdminModule {}
>    ```
>
> 5. Register `AdminModule` in `app.module.ts` (final list in P6-7).
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Validate the level with the Zod enum BEFORE assigning — never assign an unvalidated string to `raw.level`.
> - Use `getRawLogger().level = …` for the change — do NOT invent a `setLevel()` method (it does not exist; the escape hatch is the sanctioned path).
> - The child-logger host property MUST be named `logger`.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `curl -s -XPATCH localhost:3001/admin/log-level -H 'content-type: application/json' -d '{"level":"debug"}'` — expected: `{"previous":"info","current":"debug"}` and an `ADMIN_LOG_LEVEL_CHANGED` line; subsequent `debug` logs now appear.
> - `curl -s -o /dev/null -w '%{http_code}' -XPATCH localhost:3001/admin/log-level -H 'content-type: application/json' -d '{"level":"loud"}'` — expected: `400` (invalid level rejected).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P6-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P6-7 — Shared Demo Wiring (DTOs, error helpers, AppModule registration)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P6-1`, `P6-2`, `P6-3`, `P6-4`, `P6-5`, `P6-6`

### Description

Tie the six demo modules into `AppModule` and factor out the small amount of shared plumbing they have in common so the per-module code stays focused on logger usage. This task adds: a shared Zod-validation pipe (or a tiny `parseOrThrow` helper) so each controller's `schema.parse(body)` raises a clean 400 with a `DOMAIN_VALIDATION_FAILED` log instead of an unhandled `ZodError`; a shared `app-log-keys.ts` constant listing every app log key used in Phase 6 (single source the Phase 18 `audit-log-keys.mjs` and the Phase 8 redaction tests can import); and the consolidated `AppModule.imports` list. After this task the demo domain boots as one coherent app.

### Acceptance Criteria

- [ ] `apps/api/src/app.module.ts` imports all six demo modules (`OrdersModule`, `PaymentsModule`, `PiiDemoModule`, `DownstreamModule`, `TriggerModule`, `AdminModule`) alongside the Phase 3/4 modules — no duplication, no missing module.
- [ ] A shared validation helper/pipe maps `ZodError` → HTTP 400 and emits a `DOMAIN_VALIDATION_FAILED` log; every controller uses it (no raw unhandled `ZodError` reaching the client).
- [ ] `apps/api/src/common/app-log-keys.ts` exports a frozen array/record of every Phase 6 app log key (e.g. `ORDER_CREATE_SUCCESS`, `PAYMENT_CHARGE_FAILED`, `USER_SIGNUP_ATTEMPT`, `DOWNSTREAM_DISPATCH_ATTEMPT`, `TRIGGER_LEVEL_FIRED`, `ADMIN_LOG_LEVEL_CHANGED`, …).
- [ ] Every key in `app-log-keys.ts` matches `LOG_KEYS_CONVENTION_REGEX` (imported from `@bymax-one/nest-logger/shared`) and none equals a `RESERVED_LOG_KEYS` value — assert this in a tiny unit test.
- [ ] `pnpm --filter api build` succeeds and `pnpm --filter api dev` boots the app with every demo route mounted.
- [ ] `pnpm --filter api typecheck` and `pnpm --filter api lint` pass.

### Files to create / modify

- `apps/api/src/common/zod-validation.pipe.ts` (or `common/parse-or-throw.ts`) — shared Zod → 400 mapping + `DOMAIN_VALIDATION_FAILED` log.
- `apps/api/src/common/app-log-keys.ts` — the frozen list of Phase 6 app log keys.
- `apps/api/src/common/app-log-keys.spec.ts` — assert each key vs `LOG_KEYS_CONVENTION_REGEX` and not in `RESERVED_LOG_KEYS`.
- `apps/api/src/app.module.ts` — consolidated `imports`.
- The six demo controllers — switch to the shared validation helper/pipe.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer consolidating the Phase 6 demo domain.
> Context: Task P6-7 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6. The six demo modules (P6-1..P6-6) are built; wire them into `AppModule` and factor out their shared plumbing. The Phase 18 `audit-log-keys.mjs` and the Phase 8 redaction tests both want a single source of the app's log keys — provide it here. Use **only** the `0.1.0` server API plus the `/shared` subpath constants `LOG_KEYS_CONVENTION_REGEX` and `RESERVED_LOG_KEYS` (the `/shared` import is the zero-dependency isomorphic surface).
> Objective: Register all demo modules in `AppModule`, add a shared Zod-validation helper that logs `DOMAIN_VALIDATION_FAILED`, and publish the canonical Phase 6 log-key list.
> Steps:
>
> 1. Create `apps/api/src/common/app-log-keys.ts` — the single source of truth for app log keys (the audit script + redaction tests import it):
>
>    ```typescript
>    /** Every application log key emitted by the Phase 6 demo domain. MODULE_ACTION_RESULT format. */
>    export const APP_LOG_KEYS = [
>      'ORDER_CREATE_SUCCESS',
>      'ORDER_LOOKUP_SUCCESS',
>      'ORDER_LOOKUP_MISS',
>      'ORDER_SLOW_SUCCESS',
>      'PAYMENT_CHARGE_ATTEMPT',
>      'PAYMENT_CHARGE_FAILED',
>      'USER_SIGNUP_ATTEMPT',
>      'PII_NESTED_ATTEMPT',
>      'PII_HEADERS_ECHO',
>      'PII_HUGE_ATTEMPT',
>      'DOWNSTREAM_DISPATCH_ATTEMPT',
>      'DOWNSTREAM_DISPATCH_SUCCESS',
>      'DOWNSTREAM_DISPATCH_DEGRADED',
>      'TRIGGER_LEVEL_FIRED',
>      'TRIGGER_FAULT_REQUESTED',
>      'TRIGGER_BURST_TICK',
>      'ADMIN_LOG_LEVEL_CHANGED',
>      'DOMAIN_VALIDATION_FAILED',
>    ] as const
>
>    export type AppLogKey = (typeof APP_LOG_KEYS)[number]
>    ```
>
> 2. Create `apps/api/src/common/app-log-keys.spec.ts` asserting convention + no reserved reuse (this is the local mirror of the Phase 18 CI gate):
>
>    ```typescript
>    import { LOG_KEYS_CONVENTION_REGEX, RESERVED_LOG_KEYS } from '@bymax-one/nest-logger/shared'
>    import { APP_LOG_KEYS } from './app-log-keys'
>
>    describe('APP_LOG_KEYS', () => {
>      // Every app key must follow MODULE_ACTION_RESULT (the library's convention regex).
>      it.each(APP_LOG_KEYS)('%s matches the convention regex', (key) => {
>        expect(LOG_KEYS_CONVENTION_REGEX.test(key)).toBe(true)
>      })
>
>      // No app key may collide with a library-reserved key.
>      it('reuses no RESERVED_LOG_KEYS value', () => {
>        const reserved = new Set<string>(RESERVED_LOG_KEYS as readonly string[])
>        for (const key of APP_LOG_KEYS) expect(reserved.has(key)).toBe(false)
>      })
>    })
>    ```
>
> 3. Create `apps/api/src/common/zod-validation.pipe.ts` — a shared pipe (or a `parseOrThrow(schema, body, logger)` helper) that catches `ZodError`, logs `DOMAIN_VALIDATION_FAILED` via the injected logger, and throws `new BadRequestException(...)`. Wire it into the six demo controllers in place of the inline `schema.parse(body)` calls (keep the schemas where they are).
> 4. Edit `apps/api/src/app.module.ts` to register every demo module in `imports`, preserving the Phase 3/4 wiring (`ConfigModule.forRoot`, `BymaxLoggerModule.forRootAsync`, `PrismaModule`, and `configure(consumer)` applying `RequestIdMiddleware`):
>    ```typescript
>    imports: [
>      ConfigModule.forRoot({ isGlobal: true }),
>      BymaxLoggerModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService, PrismaService], useFactory: buildLoggerOptions }),
>      OrdersModule,
>      PaymentsModule,
>      PiiDemoModule,
>      DownstreamModule,
>      TriggerModule,
>      AdminModule,
>    ],
>    ```
> 5. Boot the app and confirm every demo route is mounted.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Do NOT change the Phase 4 logger options (`buildLoggerOptions`) — only add modules + the validation helper.
> - `app-log-keys.ts` MUST list exactly the keys the six modules emit — keep it in sync (the Phase 18 audit reads it). Do NOT add reserved keys to it.
> - Import `LOG_KEYS_CONVENTION_REGEX` / `RESERVED_LOG_KEYS` from the `@bymax-one/nest-logger/shared` subpath (not the server subpath).
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `pnpm --filter api test -- app-log-keys` — expected: the convention + reserved-reuse specs pass.
> - `pnpm --filter api build` — expected: exit 0; `pnpm --filter api dev` boots with `/orders`, `/payments`, `/pii-demo`, `/downstream`, `/trigger`, `/admin` all mounted.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P6-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P6-8 — Verification Gate (each endpoint emits the expected `logKey`s + propagated context)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P6-1`, `P6-2`, `P6-3`, `P6-4`, `P6-5`, `P6-6`, `P6-7`

### Description

Phase 6 "Definition of done" gate per `DEVELOPMENT_PLAN.md`: prove that hitting each demo endpoint emits the expected app `logKey`(s) on stdout, and that every line carries the propagated correlation fields (`requestId`, `tenantId` when the `x-tenant-id` header is sent, and `traceId` when the OTel SDK is active). This is the stdout-capture pattern the §16 testing strategy mandates (spy `process.stdout.write`, fire a request with supertest, assert the serialized JSON). It closes the phase; it adds no domain code.

### Acceptance Criteria

- [ ] A small e2e suite (supertest + stdout-capture) covers every Phase 6 endpoint and asserts its documented `logKey`(s) appear on stdout.
- [ ] `POST /orders` → asserts `ORDER_CREATE_SUCCESS`; `GET /orders/:id` access log shows `"url":"/orders/:id"`; `GET /orders/slow` → `METHOD_SLOW_EXECUTION`.
- [ ] `POST /payments` → asserts `PAYMENT_CHARGE_FAILED`, `METHOD_EXECUTION`, and exactly one `HTTP_EXCEPTION_HANDLED`.
- [ ] `POST /pii-demo/huge` → asserts `LOGGER_ENTRY_TRUNCATED`; `POST /pii-demo/signup` → asserts `USER_SIGNUP_ATTEMPT` (full `[REDACTED]` assertions deferred to Phase 8).
- [ ] `POST /downstream/dispatch` (worker down) → asserts `DOWNSTREAM_DISPATCH_ATTEMPT` + `DOWNSTREAM_DISPATCH_DEGRADED` and a 2xx (fail-soft).
- [ ] `POST /trigger/level` and `GET /trigger/status/:code` → assert `TRIGGER_LEVEL_FIRED` and the matching `HTTP_REQUEST_*` key; `PATCH /admin/log-level` → asserts `ADMIN_LOG_LEVEL_CHANGED`.
- [ ] Context propagation asserted: a request sent with `X-Request-Id` / `X-Tenant-Id` produces log lines carrying that `requestId` / `tenantId`; with the OTel SDK active, lines carry a non-zero `traceId`.
- [ ] `pnpm --filter api typecheck`, `pnpm --filter api lint`, and the new e2e suite all pass.

### Files to create / modify

- `apps/api/test/demo-domain.e2e-spec.ts` — stdout-capture assertions across all Phase 6 endpoints.
- `apps/api/test/fixtures/` — any shared supertest bootstrap helper (reuse the Phase 4 harness if present).
- _(no domain code — fix the relevant P6-1..P6-7 file if a check fails.)_

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer writing stdout-capture e2e tests for the `@bymax-one/nest-logger@0.1.0` demo domain.
> Context: Task P6-8 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-6--demo-domain) §Phase 6. DoD: "each endpoint emits the expected `logKey`(s) on stdout with propagated requestId/tenantId/traceId." Use the §16 stdout-capture technique (`docs/OVERVIEW.md` §16 shows the canonical `jest.spyOn(process.stdout, 'write')` snippet). This is the **phase verification** — do not add domain features; if a check fails, fix the relevant P6-1..P6-7 file and re-run. The full redaction proofs are Phase 8 and the cross-service `traceId` round-trip is Phase 9; here you assert the keys + context propagation only.
> Objective: Add an e2e suite asserting every Phase 6 endpoint's log keys + correlation fields, and close the phase.
> Steps:
>
> 1. Create `apps/api/test/demo-domain.e2e-spec.ts`. Boot the Nest app (reuse the Phase 4 e2e bootstrap if one exists), spy on `process.stdout.write`, fire each endpoint with supertest, and assert the captured JSON. Example shape:
>    ```typescript
>    it('POST /orders emits ORDER_CREATE_SUCCESS with a propagated requestId', async () => {
>      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      await request(app.getHttpServer())
>        .post('/orders')
>        .set('X-Request-Id', 'r_test_1')
>        .set('X-Tenant-Id', 't_acme')
>        .send({ amount: 1299, tenantId: 't_acme', userId: 'u_1' })
>        .expect(201)
>      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')
>      expect(logs).toContain('"logKey":"ORDER_CREATE_SUCCESS"')
>      expect(logs).toContain('r_test_1') // requestId propagated from the header via the ALS scope
>      expect(logs).toContain('t_acme') // tenantId resolved from x-tenant-id
>      stdout.mockRestore()
>    })
>    ```
> 2. Add the analogous cases for: `GET /orders/:id` (assert `"url":"/orders/:id"`), `GET /orders/slow` (`METHOD_SLOW_EXECUTION`), `POST /payments` (`PAYMENT_CHARGE_FAILED` + `METHOD_EXECUTION` + exactly one `HTTP_EXCEPTION_HANDLED` — count occurrences), `POST /pii-demo/huge` (`LOGGER_ENTRY_TRUNCATED`), `POST /pii-demo/signup` (`USER_SIGNUP_ATTEMPT`), `POST /downstream/dispatch` (`DOWNSTREAM_DISPATCH_ATTEMPT` + `DOWNSTREAM_DISPATCH_DEGRADED`, 2xx), `POST /trigger/level` (`TRIGGER_LEVEL_FIRED`), `GET /trigger/status/404` (a 4xx `HTTP_REQUEST_*` key), `PATCH /admin/log-level` (`ADMIN_LOG_LEVEL_CHANGED`).
> 3. Assert double-log avoidance for payments by counting matches: `expect(logs.match(/"logKey":"HTTP_EXCEPTION_HANDLED"/g)?.length).toBe(1)`.
> 4. If any assertion fails, diagnose and fix the owning P6-1..P6-7 file (wrong log key, missing host-property `logger`, route ordering, etc.), then re-run. Do NOT weaken an assertion to make it pass.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use stdout capture (spy `process.stdout.write`) — do NOT assert against Loki/Postgres here (those tiers are Phases 7/8/10).
> - Do NOT assert `[REDACTED]` values (Phase 8) or a cross-service shared `traceId` (Phase 9) — only the keys + same-service requestId/tenantId/traceId presence.
> - Do NOT add `@ts-ignore` / `eslint-disable` or lower any threshold to make a test pass.
>   Verification:
> - `pnpm --filter api typecheck` — expected: exit 0.
> - `pnpm --filter api lint` — expected: exit 0.
> - `pnpm --filter api test:e2e -- demo-domain` — expected: all Phase 6 endpoint assertions pass.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P6-8 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 6 is 8/8 — switch the Phase 6 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
