# Phase 8 — PII Redaction Proofs — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-8--pii-redaction-proofs) §Phase 8
> **Total tasks:** 5
> **Progress:** 🔴 0 / 5 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                                                 | Status | Priority | Size | Depends on             |
| ---- | ---------------------------------------------------------------------------------------------------- | ------ | -------- | ---- | ---------------------- |
| P8-1 | `pii-demo` default-path redaction (fields + sensitive headers → `[REDACTED]`)                        | 🔴     | High     | M    | Phase 6                |
| P8-2 | Custom `redactPaths` merged with the 97 defaults (`*.webhookSignature`, `payload.creditCard.*`)      | 🔴     | High     | S    | P8-1                   |
| P8-3 | Deep-nested depth 1→5 payload — depth-4 redacted vs depth-5 NOT-redacted boundary                    | 🔴     | High     | M    | P8-2                   |
| P8-4 | `LogAuditService.listEffectiveRedactPaths()` + CI "required PII paths present" assertion             | 🔴     | High     | M    | P8-1                   |
| P8-5 | Oversized-entry proof (`POST /pii-demo/huge` → `LOGGER_ENTRY_TRUNCATED`) + end-to-end no-raw-PII e2e | 🔴     | High     | L    | P8-1, P8-2, P8-3, P8-4 |

---

## P8-1 — `pii-demo` Default-Path Redaction (fields + sensitive headers → `[REDACTED]`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–3 h)
- **Depends on:** `Phase 6`

### Description

Prove the library's **97 default redact paths** scrub real PII end to end on the hot path. The `pii-demo` module already exists from Phase 6 (`POST /pii-demo/signup`, `GET /pii-demo/echo-headers`); this task makes those endpoints log a representative PII payload and the sensitive HTTP headers, then asserts every secret renders as `[REDACTED]` in the serialized output. The five canonical fields (`password`, `email`, `cpf`, `cardNumber`, `cardCvv`) and the absolute header paths (`authorization`, `x-api-key`, `set-cookie`) are all covered by the defaults the library auto-applies via `fast-redact` — no custom `redactPaths` are needed here (those land in P8-2). This is the first proof in §13 "PII Redaction Showcase".

### Acceptance Criteria

- [ ] `POST /pii-demo/signup` logs a DTO containing `password`, `email`, `cpf`, `cardNumber`, `cardCvv` (and a nested `payment.cardNumber` at depth 2) as structured `meta` under a `MODULE_ACTION_RESULT` log key (e.g. `USER_SIGNUP_ATTEMPT`).
- [ ] `GET /pii-demo/echo-headers` logs the inbound request headers so `req.headers.authorization`, `req.headers["x-api-key"]`, and `res.headers["set-cookie"]` are present in the entry.
- [ ] A person's `nome` (name) is logged in **cleartext** alongside the redacted fields to demonstrate the LGPD boundary (`nome` is NOT a default path).
- [ ] An e2e spec spies on `process.stdout.write`, fires both endpoints, and asserts the joined output `.toContain('[REDACTED]')` for every PII field and header, and `.not.toContain(...)` for each raw secret value.
- [ ] No custom `redactPaths` are added in this task — only the library defaults are exercised.
- [ ] `pnpm --filter api test` and `pnpm --filter api test:e2e` pass for the new specs.

### Files to create / modify

- `apps/api/src/pii-demo/pii-demo.controller.ts` — ensure `signup` + `echo-headers` routes exist.
- `apps/api/src/pii-demo/pii-demo.service.ts` — log the PII payload + cleartext `nome`.
- `apps/api/src/pii-demo/dto/signup.dto.ts` — the PII-bearing DTO.
- `apps/api/test/pii-redaction.e2e-spec.ts` — stdout-capture assertions.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer demonstrating `@bymax-one/nest-logger@0.1.0`.
> Context: Task P8-1 of `docs/DEVELOPMENT_PLAN.md` §Phase 8 (Prereq: Phase 6). The library auto-applies **97 default redact paths** (`23 common fields × depths 1–4 + 5 absolute header paths`) compiled into one `fast-redact` function. The canonical default fields include `password`, `email`, `cpf`, `cardNumber`, `cardCvv`; the absolute header paths include `req.headers.authorization`, `req.headers["x-api-key"]`, `res.headers["set-cookie"]`. The censor is the string `'[REDACTED]'` (set in `apps/api/src/logger/logger.config.ts` — `redactCensor: '[REDACTED]'`). See `docs/OVERVIEW.md` §13 for the full default table. **LGPD note:** `cpf`/`cnpj`/`rg`/`email` are redacted by default, but a person's `nome` is NOT — log it in cleartext to make the boundary explicit.
> Objective: Make `pii-demo` emit PII + sensitive headers and prove the defaults redact them.
> Steps:
>
> 1. In `apps/api/src/pii-demo/dto/signup.dto.ts`, declare the PII DTO:
>    ```typescript
>    export class SignupDto {
>      readonly nome!: string // logged in CLEARTEXT on purpose (LGPD boundary — not a default path)
>      readonly email!: string
>      readonly password!: string
>      readonly cpf!: string
>      readonly cardNumber!: string
>      readonly cardCvv!: string
>      readonly payment!: { cardNumber: string } // nested at depth 2 → still redacted by defaults
>    }
>    ```
> 2. In `apps/api/src/pii-demo/pii-demo.service.ts`, inject the logger and log the DTO as structured `meta`:
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
>      signup(dto: SignupDto): { status: 'accepted' } {
>        // `nome` stays in cleartext (boundary demo); every other field is a default redact path.
>        this.logger.info('USER_SIGNUP_ATTEMPT', 'Signup initiated', undefined, {
>          nome: dto.nome,
>          email: dto.email,
>          password: dto.password,
>          cpf: dto.cpf,
>          cardNumber: dto.cardNumber,
>          cardCvv: dto.cardCvv,
>          payment: { cardNumber: dto.payment.cardNumber },
>        })
>        return { status: 'accepted' }
>      }
>    }
>    ```
>
> 3. In `apps/api/src/pii-demo/pii-demo.controller.ts`, expose `POST /pii-demo/signup` (calls `service.signup(dto)`) and `GET /pii-demo/echo-headers` that logs the request headers (so the HTTP interceptor's `req`/`res` serializers carry `authorization` / `x-api-key` / `set-cookie` through redaction), e.g.:
>    ```typescript
>    @Get('echo-headers')
>    echoHeaders(@Req() req: Request, @Res({ passthrough: true }) res: Response): { ok: true } {
>      res.setHeader('set-cookie', 'session=topsecret; HttpOnly')
>      this.logger.info('PII_HEADERS_ECHO', 'Echoing request headers', undefined, { req })
>      return { ok: true }
>    }
>    ```
> 4. Add `apps/api/test/pii-redaction.e2e-spec.ts` using stdout capture:
>    ```typescript
>    it('redacts default PII fields and sensitive headers', async () => {
>      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      await request(app.getHttpServer())
>        .post('/pii-demo/signup')
>        .send({
>          nome: 'Ada Lovelace',
>          email: 'ada@example.com',
>          password: 'p@ss',
>          cpf: '123.456.789-09',
>          cardNumber: '4111111111111111',
>          cardCvv: '123',
>          payment: { cardNumber: '4111111111111111' },
>        })
>        .expect(201)
>      await request(app.getHttpServer())
>        .get('/pii-demo/echo-headers')
>        .set('authorization', 'Bearer leak-me')
>        .set('x-api-key', 'sk_live_leak')
>        .expect(200)
>      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')
>      stdout.mockRestore()
>      expect(logs).toContain('[REDACTED]')
>      expect(logs).not.toContain('p@ss')
>      expect(logs).not.toContain('ada@example.com')
>      expect(logs).not.toContain('123.456.789-09')
>      expect(logs).not.toContain('4111111111111111')
>      expect(logs).not.toContain('leak-me')
>      expect(logs).not.toContain('sk_live_leak')
>      expect(logs).toContain('Ada Lovelace') // `nome` is intentionally NOT redacted
>    })
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions (English-only, `MODULE_ACTION_RESULT` log keys validated vs `LOG_KEYS_CONVENTION_REGEX`, never reuse a `RESERVED_LOG_KEYS`).
> - Use ONLY the public `0.1.0` API: `InjectLogger`, `PinoLoggerService.info(logKey, msg, userId?, meta?)`. Do NOT add any `redactPaths` here — defaults only.
> - `redactCensor` is the STRING `'[REDACTED]'`; a censor **function** does not typecheck in `0.1.0`.
> - Do NOT assert on Loki/Postgres yet — that is P8-5. This task asserts on stdout only.
>   Verification:
> - `pnpm --filter api test:e2e` — expected: the redaction spec passes (every secret `[REDACTED]`, `nome` cleartext).
> - `pnpm --filter api lint && pnpm --filter api typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P8-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P8-2 — Custom `redactPaths` Merged with the 97 Defaults

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P8-1`

### Description

Demonstrate **extending** redaction without losing the defaults. The library **merges** `redactPaths` with the 97 defaults (it never replaces them), so app-specific secrets can be added with a one-liner. This task wires `*.webhookSignature` and `payload.creditCard.*` (driven by the `LOG_EXTRA_REDACT_PATHS` env var, comma-split in `logger.config.ts`) and proves both the custom paths **and** a default path redact in the same entry — confirming the merge semantics.

### Acceptance Criteria

- [ ] `apps/api/src/logger/logger.config.ts` merges `LOG_EXTRA_REDACT_PATHS` (comma-split, trimmed, empties filtered) into `redactPaths` — no replacement of defaults.
- [ ] The example/test value of `LOG_EXTRA_REDACT_PATHS` includes `*.webhookSignature` and `payload.creditCard.*`.
- [ ] A `pii-demo` route (e.g. `POST /pii-demo/signup` extended, or a dedicated webhook route) logs an object with a top-level `webhookSignature`, a nested `payload.creditCard.number`, AND a default field (`cardNumber`).
- [ ] An e2e spec asserts the custom paths render `[REDACTED]` AND a default field (`cardNumber`) is still `[REDACTED]` in the same line — proving merge, not replace.
- [ ] The hyphenated header example in the prompt (`req.headers["x-service-token"]`) uses **bracket** syntax (documented as the rule for hyphenated keys).
- [ ] `pnpm --filter api test:e2e` passes.

### Files to create / modify

- `apps/api/src/logger/logger.config.ts` — confirm/extend the `LOG_EXTRA_REDACT_PATHS` merge.
- `apps/api/src/pii-demo/pii-demo.service.ts` — log `webhookSignature` + `payload.creditCard.*`.
- `apps/api/test/pii-redaction.e2e-spec.ts` — assert custom + default both redacted.
- `.env.example` — document `LOG_EXTRA_REDACT_PATHS=*.webhookSignature,payload.creditCard.*`.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer demonstrating `@bymax-one/nest-logger@0.1.0`.
> Context: Task P8-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 8 (depends on P8-1). The library **merges** `redactPaths` with the 97 defaults — it never replaces them. `apps/api/src/logger/logger.config.ts` already comma-splits `LOG_EXTRA_REDACT_PATHS` into `redactPaths` (see `docs/OVERVIEW.md` §9). Wildcard `*` matches **one** level only (non-recursive — there is no `**`). Hyphenated header keys MUST use bracket syntax, e.g. `req.headers["x-service-token"]`.
> Objective: Extend redaction with `*.webhookSignature` + `payload.creditCard.*` and prove the merge.
> Steps:
>
> 1. Confirm `apps/api/src/logger/logger.config.ts` builds `redactPaths` from the env (it does in §9):
>    ```typescript
>    const extraPaths = (config.get<string>('LOG_EXTRA_REDACT_PATHS') ?? '')
>      .split(',')
>      .map((p) => p.trim())
>      .filter(Boolean)
>    // ...
>    redactPaths: extraPaths, // MERGED with the 97 defaults by the library (never replaces them)
>    ```
>    Add `*.webhookSignature` and `payload.creditCard.*` to `.env.example` as the documented value:
>    ```ini
>    LOG_EXTRA_REDACT_PATHS=*.webhookSignature,payload.creditCard.*,req.headers["x-service-token"]
>    ```
> 2. In `apps/api/src/pii-demo/pii-demo.service.ts`, log a payload that mixes a custom path, a nested custom path, and a default field in ONE entry:
>    ```typescript
>    this.logger.info('WEBHOOK_RECEIVE_VERIFIED', 'Inbound webhook', undefined, {
>      webhookSignature: 't=1700000000,v1=deadbeef', // matched by `*.webhookSignature`
>      payload: { creditCard: { number: '4111111111111111', brand: 'visa' } }, // `payload.creditCard.*`
>      cardNumber: '4111111111111111', // a DEFAULT path — must STILL be redacted (proves merge)
>    })
>    ```
> 3. Extend `apps/api/test/pii-redaction.e2e-spec.ts`:
>    ```typescript
>    it('merges custom redactPaths with the defaults (extend, not replace)', async () => {
>      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      await request(app.getHttpServer()).post('/pii-demo/webhook').send({}).expect(201)
>      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')
>      stdout.mockRestore()
>      expect(logs).not.toContain('deadbeef') // custom: *.webhookSignature
>      expect(logs).not.toContain('"brand":"visa"') // not redacted is fine, but the number must be gone
>      expect(logs).not.toContain('4111111111111111') // BOTH the custom-nested and the default `cardNumber`
>      expect(logs).toContain('[REDACTED]')
>    })
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use ONLY the public `0.1.0` API. The extension is via the `redactPaths: ['*.webhookSignature', 'payload.creditCard.*', 'req.headers["x-service-token"]']` option — MERGED, never a replacement of the defaults.
> - Do NOT set `shouldDisableDefaultRedact` here (that belongs to P8-4's dedicated test module only). The whole point is defaults + extensions coexist.
> - `redactCensor` stays the STRING `'[REDACTED]'`.
>   Verification:
> - `pnpm --filter api test:e2e` — expected: the merge spec passes (custom paths AND a default field both `[REDACTED]`).
> - `pnpm --filter api typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P8-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P8-3 — Deep-Nested Depth 1→5 Boundary (depth-4 redacted vs depth-5 NOT-redacted)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–3 h)
- **Depends on:** `P8-2`

### Description

Make the **wildcard depth boundary** observable. The defaults list each common field at depths 1–4 (`*.field`, `*.*.field`, `*.*.*.field`, `*.*.*.*.field`) because `fast-redact`'s `*` matches **one** level only (no recursive `**`); the internal `REDACT_MAX_DEPTH = 4`. Therefore the **same** secret nested **five** levels deep is **not** redacted by default. `POST /pii-demo/nested` logs an object placing an identical `cardNumber` at depths 1 through 5; the e2e asserts depths 1–4 are `[REDACTED]` and the depth-5 value leaks (the documented, intentional boundary). This is the teaching moment for "why the default list is depth-bounded".

### Acceptance Criteria

- [ ] `POST /pii-demo/nested` logs a single object with a default field (`cardNumber`) at depth 1, 2, 3, 4, AND 5, each with a **distinguishable** value (e.g. `card-d1` … `card-d5`) so the test can tell which depth leaked.
- [ ] An e2e spec asserts the depth-1..4 values are absent (`[REDACTED]`) and the depth-5 value is **present** in the serialized output.
- [ ] A code comment + the task doc explain the boundary: `*` is single-level, `REDACT_MAX_DEPTH = 4`, so depth-5 secrets are not covered by defaults (and the remediation: add an explicit deeper path if a real app nests that deep).
- [ ] The leaking depth-5 secret is a **synthetic** value (never a realistic credential) so the proof never ships real PII.
- [ ] `pnpm --filter api test:e2e` passes.

### Files to create / modify

- `apps/api/src/pii-demo/pii-demo.controller.ts` — `POST /pii-demo/nested`.
- `apps/api/src/pii-demo/pii-demo.service.ts` — build the depth 1→5 payload.
- `apps/api/test/pii-redaction.e2e-spec.ts` — depth-boundary assertions.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer demonstrating `@bymax-one/nest-logger@0.1.0`.
> Context: Task P8-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 8 (depends on P8-2). The 97 defaults list each field at depths 1–4 only; `fast-redact`'s `*` is **single-level** (no `**`), and the library's internal `REDACT_MAX_DEPTH = 4`. So a default field at **depth 5** is **NOT** redacted — this is documented and intentional (it trades exhaustiveness for realistic nesting). See `docs/OVERVIEW.md` §13 ("Wildcard depth boundary 1–4") and §11 (the pipeline). This task DEMONSTRATES that boundary; it does not "fix" it.
> Objective: Emit one `cardNumber` at depths 1→5 and assert 1–4 redacted, 5 leaked.
> Steps:
>
> 1. In `apps/api/src/pii-demo/pii-demo.service.ts`, build the nested payload with distinguishable values:
>    ```typescript
>    nested(): { ok: true } {
>      // Each level uses a SYNTHETIC, distinguishable value so the test can pinpoint the leak.
>      // `cardNumber` is a default redact path at depths 1–4; depth 5 is BEYOND REDACT_MAX_DEPTH.
>      this.logger.info('PII_NESTED_PROBE', 'Depth boundary probe', undefined, {
>        cardNumber: 'card-d1', // depth 1 → redacted
>        a: {
>          cardNumber: 'card-d2', // depth 2 → redacted
>          b: {
>            cardNumber: 'card-d3', // depth 3 → redacted
>            c: {
>              cardNumber: 'card-d4', // depth 4 → redacted (REDACT_MAX_DEPTH)
>              d: {
>                cardNumber: 'card-d5', // depth 5 → NOT redacted (boundary demo — synthetic only)
>              },
>            },
>          },
>        },
>      })
>      return { ok: true }
>    }
>    ```
> 2. Expose `POST /pii-demo/nested` in the controller calling `service.nested()`.
> 3. Add the boundary assertions to `apps/api/test/pii-redaction.e2e-spec.ts`:
>    ```typescript
>    it('redacts cardNumber at depths 1–4 but NOT at depth 5 (wildcard boundary)', async () => {
>      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      await request(app.getHttpServer()).post('/pii-demo/nested').send({}).expect(201)
>      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')
>      stdout.mockRestore()
>      expect(logs).not.toContain('card-d1') // depth 1 redacted
>      expect(logs).not.toContain('card-d2') // depth 2 redacted
>      expect(logs).not.toContain('card-d3') // depth 3 redacted
>      expect(logs).not.toContain('card-d4') // depth 4 redacted (REDACT_MAX_DEPTH)
>      expect(logs).toContain('card-d5') // depth 5 LEAKS — the documented boundary
>      expect(logs).toContain('[REDACTED]')
>    })
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use ONLY the public `0.1.0` API. Do NOT add a depth-5 `redactPaths` entry to "make the test pass" — the test EXISTS to prove the default boundary. (You MAY note in the doc that a real app nesting that deep would add `'*.*.*.*.*.cardNumber'` explicitly.)
> - The depth-5 value MUST be synthetic (`card-d5`), never a realistic card/credential — the proof must never emit real PII.
> - `REDACT_MAX_DEPTH` is INTERNAL — reference it as an observed behavior, never import it.
>   Verification:
> - `pnpm --filter api test:e2e` — expected: depths 1–4 absent, depth 5 present.
> - `pnpm --filter api typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P8-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P8-4 — `LogAuditService.listEffectiveRedactPaths()` + CI "Required PII Paths Present" Assertion

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (1–3 h)
- **Depends on:** `P8-1`

### Description

Surface the **effective** redact-path list and gate it in CI. `LogAuditService` injects the resolved module options via `@Inject(LOGGER_OPTIONS_TOKEN)` and returns `[...DEFAULT_REDACT_PATHS, ...opts.redactPaths]` from `listEffectiveRedactPaths()`. Referencing the exported `DEFAULT_REDACT_PATHS` here also satisfies the export-usage audit (§6). A CI-asserted test then verifies the **required** PII coverage via `EXPECTED_REDACTED_FIELDS = ['password','email','cpf','cardNumber','authorization']` — both by checking each appears in the effective path list AND by emitting a payload with those fields and asserting the serialized output is `[REDACTED]`. A second, isolated assertion covers the dangerous opt-out: a **dedicated test module** sets `shouldDisableDefaultRedact: true` and asserts the `LOGGER_BOOTSTRAP_WARNING` is emitted — never wired into the running app.

### Acceptance Criteria

- [ ] `apps/api/src/logger/log-audit.service.ts` exists with `@Inject(LOGGER_OPTIONS_TOKEN)` and a `listEffectiveRedactPaths(): readonly string[]` returning `[...DEFAULT_REDACT_PATHS, ...(this.opts.redactPaths ?? [])]`.
- [ ] It also exposes `listConfiguredRedactPaths()` (the app extras only) and `hasDefaultRedactionDisabled()`.
- [ ] `EXPECTED_REDACTED_FIELDS = ['password','email','cpf','cardNumber','authorization'] as const` is declared and used by the CI gate.
- [ ] A unit/e2e gate asserts every entry in `EXPECTED_REDACTED_FIELDS` is covered by `listEffectiveRedactPaths()` (a field name appears as a path or path suffix) AND is effectively `[REDACTED]` when logged.
- [ ] A **dedicated test module** (never the running app) sets `shouldDisableDefaultRedact: true`, and a test asserts `LOGGER_BOOTSTRAP_WARNING` is emitted (and that `hasDefaultRedactionDisabled()` returns `true`).
- [ ] `DEFAULT_REDACT_PATHS` and `LOGGER_OPTIONS_TOKEN` are imported from the `.` subpath — exercising those exports for the audit.
- [ ] `pnpm --filter api test` passes.

### Files to create / modify

- `apps/api/src/logger/log-audit.service.ts` — the audit service + `EXPECTED_REDACTED_FIELDS`.
- `apps/api/test/log-audit.e2e-spec.ts` (or `*.spec.ts`) — required-paths gate.
- `apps/api/test/redaction-disabled.e2e-spec.ts` — dedicated `shouldDisableDefaultRedact` module + warning assertion.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer demonstrating `@bymax-one/nest-logger@0.1.0`.
> Context: Task P8-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 8 (depends on P8-1). The library exports its 97 defaults as **`DEFAULT_REDACT_PATHS`** from the `.` subpath and exposes the resolved options under **`LOGGER_OPTIONS_TOKEN`**. The effective list is `[...DEFAULT_REDACT_PATHS, ...opts.redactPaths]`. `shouldDisableDefaultRedact: true` removes the defaults AND emits a `LOGGER_BOOTSTRAP_WARNING` — wire it ONLY in a dedicated test module, never the app. See `docs/OVERVIEW.md` §13 ("Auditing what's active").
> Objective: Build `LogAuditService`, the required-paths CI gate, and the opt-out warning test.
> Steps:
>
> 1. Create `apps/api/src/logger/log-audit.service.ts`:
>
>    ```typescript
>    import { Inject, Injectable } from '@nestjs/common'
>    import {
>      DEFAULT_REDACT_PATHS,
>      LOGGER_OPTIONS_TOKEN,
>      type BymaxLoggerModuleOptions,
>    } from '@bymax-one/nest-logger'
>
>    // The CI gate asserts every field here is effectively redacted (path present + serialized [REDACTED]).
>    export const EXPECTED_REDACTED_FIELDS = [
>      'password',
>      'email',
>      'cpf',
>      'cardNumber',
>      'authorization',
>    ] as const
>
>    @Injectable()
>    export class LogAuditService {
>      constructor(@Inject(LOGGER_OPTIONS_TOKEN) private readonly opts: BymaxLoggerModuleOptions) {}
>
>      /** Effective redact paths = the library's exported defaults + the app-supplied extensions. */
>      listEffectiveRedactPaths(): readonly string[] {
>        return [...DEFAULT_REDACT_PATHS, ...(this.opts.redactPaths ?? [])]
>      }
>
>      /** Just the app-supplied extra redact paths merged on top of the defaults. */
>      listConfiguredRedactPaths(): readonly string[] {
>        return this.opts.redactPaths ?? []
>      }
>
>      /** Whether the dangerous opt-out is active (should only ever be true in a test module). */
>      hasDefaultRedactionDisabled(): boolean {
>        return this.opts.shouldDisableDefaultRedact === true
>      }
>    }
>    ```
>
> 2. Register `LogAuditService` as a provider in the appropriate module (e.g. a `LoggerSupportModule` or `AppModule`) so `LOGGER_OPTIONS_TOKEN` resolves.
> 3. Create `apps/api/test/log-audit.e2e-spec.ts` — the required-paths gate:
>
>    ```typescript
>    it('covers every EXPECTED_REDACTED_FIELDS path', () => {
>      const effective = audit.listEffectiveRedactPaths()
>      for (const field of EXPECTED_REDACTED_FIELDS) {
>        // each required field appears as a path or path suffix in the effective list
>        expect(
>          effective.some(
>            (p) => p === field || p.endsWith(`.${field}`) || p.includes(`"${field}"`),
>          ),
>        )
>          .withContext(`missing required redact path for "${field}"`)
>          .toBe(true)
>      }
>    })
>
>    it('actually redacts every required field end to end', async () => {
>      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      await request(app.getHttpServer())
>        .post('/pii-demo/signup')
>        .send({
>          nome: 'X',
>          email: 'a@b.com',
>          password: 'p',
>          cpf: 'c',
>          cardNumber: 'n',
>          cardCvv: 'v',
>          payment: { cardNumber: 'n2' },
>        })
>        .set('authorization', 'Bearer required-leak')
>        .expect(201)
>      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')
>      stdout.mockRestore()
>      expect(logs).not.toContain('required-leak')
>      expect(logs).toContain('[REDACTED]')
>    })
>    ```
>
> 4. Create `apps/api/test/redaction-disabled.e2e-spec.ts` — dedicated opt-out module:
>    ```typescript
>    it('emits LOGGER_BOOTSTRAP_WARNING when defaults are disabled', async () => {
>      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
>      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      const moduleRef = await Test.createTestingModule({
>        imports: [
>          BymaxLoggerModule.forRoot({
>            service: { name: 'redaction-disabled-test', version: 'test' },
>            shouldDisableDefaultRedact: true, // DANGEROUS — test module ONLY
>          }),
>        ],
>      }).compile()
>      await moduleRef.init()
>      const audit = new LogAuditService({
>        shouldDisableDefaultRedact: true,
>      } as BymaxLoggerModuleOptions)
>      const out = stdout.mock.calls
>        .concat(stderr.mock.calls)
>        .map((c) => String(c[0]))
>        .join('')
>      stdout.mockRestore()
>      stderr.mockRestore()
>      expect(out).toContain('LOGGER_BOOTSTRAP_WARNING')
>      expect(audit.hasDefaultRedactionDisabled()).toBe(true)
>      await moduleRef.close()
>    })
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use ONLY the public `0.1.0` API: `DEFAULT_REDACT_PATHS`, `LOGGER_OPTIONS_TOKEN`, `BymaxLoggerModuleOptions`, `BymaxLoggerModule.forRoot`. The effective list MUST be `[...DEFAULT_REDACT_PATHS, ...opts.redactPaths]` — do NOT hardcode the 97 paths.
> - `shouldDisableDefaultRedact: true` appears ONLY in the dedicated test module — NEVER in `apps/api/src/**`.
> - Keep the method names exactly `listEffectiveRedactPaths` / `listConfiguredRedactPaths` / `hasDefaultRedactionDisabled` (the dashboard's redaction panel consumes them).
>   Verification:
> - `pnpm --filter api test` — expected: required-paths gate + opt-out warning test pass.
> - `pnpm --filter api typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P8-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P8-5 — Oversized-Entry Proof + End-to-End No-Raw-PII Assertion

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** L (3–6 h)
- **Depends on:** `P8-1`, `P8-2`, `P8-3`, `P8-4`

### Description

Close Phase 8 with the two remaining proofs. (a) **Oversized entry:** `POST /pii-demo/huge` logs a payload larger than `maxEntrySizeBytes` (64 KB) so the library's size guard replaces it with a `LOGGER_ENTRY_TRUNCATED` envelope instead of a multi-MB line. (b) **End-to-end redaction across all sinks:** an e2e test captures stdout, fires the PII endpoints, and asserts `[REDACTED]` everywhere AND that **no raw PII** reaches **Postgres** (`application_logs.payload` via Prisma) **or Loki** (queried through the `/logs/loki` proxy, or the `LokiDestination` flush body). This is the Phase 8 **Definition of done**: "e2e captures stdout and asserts `[REDACTED]` everywhere + no raw PII in Postgres/Loki."

### Acceptance Criteria

- [ ] `POST /pii-demo/huge` logs an object whose serialized size exceeds `maxEntrySizeBytes` (64 KB), and the emitted line is the truncated envelope carrying `LOGGER_ENTRY_TRUNCATED` (not the multi-MB payload).
- [ ] An e2e spec asserts the huge request produces a `LOGGER_ENTRY_TRUNCATED` entry and that stdout does **not** contain the multi-MB raw blob.
- [ ] An e2e spec fires `signup` / `nested` / `echo-headers` / `webhook`, then asserts **Postgres** `application_logs` rows (read back via Prisma) contain `[REDACTED]` and **no** raw secret values.
- [ ] The same proof asserts **Loki** carries no raw PII — via the `GET /logs/loki` proxy query OR by inspecting the captured `LokiDestination` flush body — both `[REDACTED]`.
- [ ] The test waits for / flushes the `PrismaLogDestination` and `LokiDestination` batches (they buffer) before asserting, so the assertion is not racing the flush timer.
- [ ] `pnpm --filter api test:e2e` passes; this task's specs are the Phase 8 DoD gate.

### Files to create / modify

- `apps/api/src/pii-demo/pii-demo.controller.ts` — `POST /pii-demo/huge`.
- `apps/api/src/pii-demo/pii-demo.service.ts` — build the >64 KB payload.
- `apps/api/test/pii-redaction.e2e-spec.ts` — truncation + cross-sink no-raw-PII assertions.
- `apps/api/test/fixtures/*` — helpers to read back `application_logs` + flush destinations.

### Agent Execution Prompt

> Role: Senior TypeScript / NestJS engineer demonstrating `@bymax-one/nest-logger@0.1.0`.
> Context: Task P8-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 8 (depends on P8-1..P8-4) — the phase's Definition of done. The library's size guard compares `Buffer.byteLength` against `maxEntrySizeBytes` (set to `65_536` in `logger.config.ts`) and replaces oversized entries with a `LOGGER_ENTRY_TRUNCATED` envelope. The two durable sinks buffer: `PrismaLogDestination` (warn+ → `application_logs`) and `LokiDestination` (info+, batched HTTP). `ApplicationLog.payload` stores the POST-redaction entry, so no raw PII must ever land there (see `docs/OVERVIEW.md` §10 + §13 + §16). Reuse the stdout-capture technique from `docs/OVERVIEW.md` §16.
> Objective: Prove oversized-entry truncation AND no-raw-PII across stdout, Postgres, and Loki.
> Steps:
>
> 1. In `apps/api/src/pii-demo/pii-demo.service.ts`, build a payload that blows past 64 KB:
>    ```typescript
>    huge(): { ok: true } {
>      const big = 'x'.repeat(80_000) // > maxEntrySizeBytes (65_536)
>      this.logger.info('PII_HUGE_PAYLOAD', 'Oversized entry', undefined, { blob: big })
>      return { ok: true }
>    }
>    ```
>    Expose `POST /pii-demo/huge` in the controller.
> 2. Add the truncation assertion to `apps/api/test/pii-redaction.e2e-spec.ts`:
>    ```typescript
>    it('truncates an oversized entry to LOGGER_ENTRY_TRUNCATED', async () => {
>      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
>      await request(app.getHttpServer()).post('/pii-demo/huge').send({}).expect(201)
>      const logs = stdout.mock.calls.map((c) => String(c[0])).join('')
>      stdout.mockRestore()
>      expect(logs).toContain('LOGGER_ENTRY_TRUNCATED')
>      expect(logs).not.toContain('x'.repeat(80_000)) // the multi-MB blob never hits stdout
>    })
>    ```
> 3. Add the cross-sink no-raw-PII assertion. Fire the PII endpoints, FLUSH the buffered destinations (trigger a graceful drain via `app.close()` in a dedicated test app, or expose a test-only flush), then read back:
>    ```typescript
>    it('writes [REDACTED] (never raw PII) to Postgres and Loki', async () => {
>      // fire a warn-level PII log so it reaches the Postgres (warn+) tier
>      await request(app.getHttpServer())
>        .post('/pii-demo/signup')
>        .send({
>          nome: 'Y',
>          email: 'leak@db.com',
>          password: 'leak-pass',
>          cpf: 'leak-cpf',
>          cardNumber: 'leak-card',
>          cardCvv: 'leak-cvv',
>          payment: { cardNumber: 'leak-card2' },
>        })
>        .expect(201)
>      await flushDestinations(app) // drain PrismaLogDestination + LokiDestination buffers
>      const rows = await prisma.applicationLog.findMany()
>      const dbDump = JSON.stringify(rows)
>      expect(dbDump).not.toContain('leak-pass')
>      expect(dbDump).not.toContain('leak@db.com')
>      expect(dbDump).not.toContain('leak-card')
>      // Loki: query the proxy (or assert on the captured push body)
>      const loki = await request(app.getHttpServer())
>        .get('/logs/loki')
>        .query({ query: '{service=~".+"}' })
>      expect(JSON.stringify(loki.body)).not.toContain('leak-pass')
>    })
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions.
> - Use ONLY the public `0.1.0` API. `maxEntrySizeBytes` → `LOGGER_ENTRY_TRUNCATED` is the documented behavior; do NOT reimplement the size guard.
> - You MUST flush/drain the buffered `PrismaLogDestination`/`LokiDestination` before asserting — otherwise the read races the flush timer and the test is flaky. Prefer `app.close()` (reverse-order drain via `enableShutdownHooks`) in a dedicated test instance, or a small test-only flush hook.
> - The leaking-candidate values MUST be synthetic markers (`leak-pass`, `leak-card`, …), never realistic credentials.
> - Do NOT lower `maxEntrySizeBytes` or any threshold to make a test pass.
>   Verification:
> - `pnpm --filter api test:e2e` — expected: truncation spec + cross-sink no-raw-PII spec pass.
> - `pnpm --filter api lint && pnpm --filter api typecheck` — expected: exit 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P8-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 8 is 5/5 — switch the Phase 8 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
