# Redaction

`@bymax-one/nest-logger` auto-applies **97 default redact paths**, compiled once into a single `fast-redact`
function (< 3% throughput impact). Sensitive values are replaced with the string `'[REDACTED]'` at
serialization time — the original in-memory object is never mutated, and no raw secret reaches stdout, Loki,
or Postgres. This page documents the 97 paths, where their coverage stops, and how to extend them safely.

See **[FEATURES.md → PII never leaks](./FEATURES.md#2-pii-never-leaks)** for the live demo and
**[OVERVIEW.md §13](./OVERVIEW.md#13-pii-redaction-showcase)** for the product framing.

---

## The 97 defaults

```
23 common fields × 4 wildcard depths  +  5 absolute header paths  =  97
```

| Category                | Count  | Fields                                                                                                                                    |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords               | 5      | `password`, `passwordHash`, `passwordConfirm`, `newPassword`, `oldPassword`                                                               |
| Tokens                  | 6      | `token`, `accessToken`, `refreshToken`, `idToken`, `apiKey`, `apiSecret`                                                                  |
| MFA                     | 3      | `mfaSecret`, `mfaRecoveryCodes`, `totpSecret`                                                                                             |
| Payment / PCI DSS       | 5      | `cardNumber`, `cardCvv`, `cvv`, `cvc`, `cardExpiry`                                                                                       |
| BR documents / LGPD     | 3      | `cpf`, `cnpj`, `rg`                                                                                                                       |
| Conservative PII        | 1      | `email`                                                                                                                                   |
| **Common subtotal**     | **23** |                                                                                                                                           |
| HTTP headers (absolute) | 5      | `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-api-key"]`, `req.headers["x-auth-token"]`, `res.headers["set-cookie"]` |

Each of the 23 common fields is listed at **four** wildcard depths (`*.field`, `*.*.field`, `*.*.*.field`,
`*.*.*.*.field`), which is `23 × 4 = 92`; plus the 5 absolute header paths = **97**. The full list is the
exported `DEFAULT_REDACT_PATHS` constant.

---

## The depth boundary: why depth 5 leaks

`fast-redact`'s `*` matches **a single level** — there is no recursive `**`. The defaults therefore enumerate
each field at depths 1–4, and the deepest entry is `*.*.*.*.password`. A secret nested **one level deeper than
that is not redacted by default:**

```jsonc
// matched by *.*.*.*.password (4 wildcard levels) → redacted
{ "a": { "b": { "c": { "d": { "password": "[REDACTED]" } } } } }

// one level deeper — no default path reaches it → CLEARTEXT
{ "a": { "b": { "c": { "d": { "e": { "password": "leaks" } } } } } }
```

This is a deliberate trade: the path list optimizes for **realistic** nesting depth rather than exhaustive
coverage (every extra depth multiplies the path count by 23). If your payloads nest secrets deeper than four
levels, add the deeper paths yourself (next section). The `POST /pii-demo/nested` endpoint demonstrates this
boundary directly — see [FEATURES.md → depth boundary](./FEATURES.md#3-depth-boundary-4-vs-5).

---

## Extending safely

Extra paths are **merged** with the 97 defaults — they never replace them:

```typescript
// apps/api/src/logger/logger.config.ts
redactPaths: [
  '*.webhookSignature',              // depth-1 wildcard
  'payload.creditCard.*',            // every field inside a subobject
  'req.headers["x-service-token"]',  // hyphenated header → MUST use bracket syntax
],
redactCensor: '[REDACTED]',          // public type is `string` ONLY — a censor function would not typecheck
```

Two rules to internalize:

- **Hyphenated keys need bracket syntax.** A header like `x-service-token` cannot be written with dot
  notation; use `req.headers["x-service-token"]`. (In this repo, `LOG_EXTRA_REDACT_PATHS` in `.env` feeds
  exactly these — see [ENVIRONMENT.md](./ENVIRONMENT.md#extra-redact-paths-are-merged-never-replaced).)
- **The censor is a string.** `redactCensor` is typed `string` in `0.1.0`. `fast-redact` itself can take a
  censor _function_, but the public option does not — passing a function would not compile.

---

## Auditing what's active

`DEFAULT_REDACT_PATHS` is **exported** from the `.` subpath. `LogAuditService` imports it (alongside the
resolved options token) to report the **effective** path list — defaults plus the app's extensions — which a
CI gate asserts covers the critical PII fields. The runtime list is also surfaced at
`GET /logger/redact-paths`:

```typescript
import {
  DEFAULT_REDACT_PATHS,
  LOGGER_OPTIONS_TOKEN,
  type BymaxLoggerModuleOptions,
} from '@bymax-one/nest-logger'

@Injectable()
export class LogAuditService {
  constructor(@Inject(LOGGER_OPTIONS_TOKEN) private readonly opts: BymaxLoggerModuleOptions) {}

  /** Effective redact paths = the library's exported defaults + the app-supplied extensions. */
  listEffectiveRedactPaths(): readonly string[] {
    return [...DEFAULT_REDACT_PATHS, ...(this.opts.redactPaths ?? [])]
  }
}
```

---

## The dangerous opt-out

`shouldDisableDefaultRedact: true` removes **all 97** defaults and emits a `LOGGER_BOOTSTRAP_WARNING`, so a
security review can see exactly when PII protection was intentionally reduced. The example wires this **only**
inside a dedicated test module — **never** in the running app — and asserts the warning fires. Treat any
occurrence of this flag in real config as a finding to review against your
[redaction posture](./DEPLOYMENT.md#redaction-posture).

---

## LGPD note

`cpf`, `cnpj`, `rg`, and `email` are redacted by default. A person's `nome` (name) **alone** is not, under
LGPD Art. 5 III, sensitive enough to warrant default redaction — so it is intentionally **not** in the
defaults, and the example logs a name in cleartext to make this explicit. If your threat model treats names as
sensitive, add `*.nome` (and the deeper depths you need) to `redactPaths`.

---

## See also

- **[FEATURES.md](./FEATURES.md#2-pii-never-leaks)** — redaction fired and shown post-scrub.
- **[ENVIRONMENT.md](./ENVIRONMENT.md#extra-redact-paths-are-merged-never-replaced)** — extending via `LOG_EXTRA_REDACT_PATHS`.
- **[DATABASE.md](./DATABASE.md#the-two-tier-model)** — why no raw PII reaches Postgres.
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md#logger_bootstrap_warning)** — what the bootstrap warning means.
