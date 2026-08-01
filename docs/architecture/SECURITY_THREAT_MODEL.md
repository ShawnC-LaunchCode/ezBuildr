# Security Threat Model — Route Layer

This document captures the two bug classes the route-layer security review of Q1 2026 hardened against, the invariants that keep them closed, and the concrete patterns to follow when adding new routes. If you touch a route handler, an outbound HTTP call, or a Zod schema for user input, read the relevant section first.

The goal is not to teach web security in general — it is to preserve the specific decisions that were made, so they survive future refactors.

---

## 1. SSRF (Server-Side Request Forgery)

### What it is in this codebase

Anywhere the server dials a URL that came from user input — webhooks, connection `tokenUrl`, data-source `apiUrl`, OAuth2 endpoints, esign providers, external destinations — that URL is attacker-controllable. Without protection, an authenticated tenant user can point the server at:

- Cloud metadata services (`169.254.169.254`) to steal IAM credentials
- Internal databases and admin panels (`127.0.0.1:5432`, `10.0.0.x`)
- Other tenants' internal services

### Two flavors we had to close

**Flavor A — creation-time bypass.** User submits a URL, we validate it, we store it. Standard Zod `.url()` alone accepts internal IPs. Fixed by `validateSafeUrl` (`server/utils/ssrfValidator.ts`), which resolves DNS and rejects RFC1918, loopback, link-local, and IPv6 unique-local ranges.

**Flavor B — TOCTOU via DNS rebinding.** The attacker owns a domain. At creation time the domain resolves to a public IP (validation passes). At dispatch time — minutes or hours later — the attacker flips DNS to `127.0.0.1`. Node's default `fetch` re-resolves DNS on connect, so the delivery hits the internal address. This is not theoretical. It defeats any validate-then-store design.

### The invariant

**Every outbound HTTP request whose URL originated from user input must go through `safeFetch` (`server/utils/safeFetch.ts`).**

`safeFetch` closes both flavors in one place:
1. Resolves DNS itself.
2. Rejects any resolved IP that `isInternalIp` flags.
3. Pins the socket to the resolved IP via `undici` `Agent.connect.lookup`, so the actual connect cannot be re-routed by a DNS flip between validation and connection.

Creation-time validation (`validateSafeUrl` or `assertOutboundUrlAllowed`) is still useful for user-facing error messages — reject bad URLs at insert time with 400, not at dispatch time silently — but `safeFetch` is what enforces the invariant.

### What this looks like in practice

**Good:**
```ts
import { safeFetch } from '../utils/safeFetch';

const response = await safeFetch(userSuppliedUrl, { method: 'POST', ... });
```

**Bad — will silently reintroduce SSRF:**
```ts
const response = await fetch(userSuppliedUrl, { method: 'POST', ... });
```

**Also bad — check-only, no socket pinning:**
```ts
await assertOutboundUrlAllowed(userSuppliedUrl);
const response = await fetch(userSuppliedUrl, { method: 'POST', ... });  // TOCTOU
```

### Current adopters (grep to keep this list honest)

- `server/lib/webhooks/dispatcher.ts` — webhook delivery
- `server/engine/nodes/webhook.ts` — workflow webhook nodes
- `server/engine/nodes/http.ts` — workflow http nodes
- `server/lib/external/ExternalSendRunner.ts` — external destinations
- `server/lib/external/adapters/WebhookAdapter.ts` — external webhook adapter
- `server/services/oauth2.ts` — three token-exchange call sites (auth code, client credentials, refresh)

### Rules for future changes

1. **Never call `fetch(url, ...)` directly if `url` traces back to `req.body`, `req.query`, `req.params`, or a DB column that was populated from any of those.** Use `safeFetch` instead.
2. **Adding a new source type in `dataSource.routes.ts`? Update `NETWORK_KEYS`.** The map at the top of the POST/PATCH handlers lists every field the discriminator considers "network-facing." A new source type that adds a URL/host field but forgets to register it in `NETWORK_KEYS` will pass validation and skip the SSRF check. See §3.
3. **`ALLOW_LOCALHOST_WEBHOOKS=true` is a dev-only escape hatch.** Do not set it in staging or production. It exists so local integration tests can call `http://localhost:...` mock servers.
4. **`safeFetch` supports http and https only.** If a new integration needs `ftp://`, `smb://`, or anything exotic, discuss the SSRF model before implementing — those protocols have their own attack surfaces the current guard does not model.

### CI/lint enforcement (recommended, not yet in place)

A regression here is very cheap to make and very hard to spot in review. Add a lint or CI check:

```bash
grep -rn "await fetch(" server/ \
  | grep -v safeFetch.ts \
  | grep -v test
```

Any hit is a bug or a required exception (in which case add a comment explaining why the URL is not user-controlled and route through `safeFetch` anyway if there's any doubt).

### Files to touch when extending

- Adding an outbound HTTP call: use `safeFetch`.
- Adding a new SSRF-relevant CIDR: update `isInternalIp` in `server/utils/ssrfValidator.ts`.
- Widening `ALLOW_LOCALHOST_WEBHOOKS` semantics: don't — add a separate flag.

---

## 2. Mass Assignment via `req.body` Spread

### What it is in this codebase

Any handler that does something like:

```ts
const settings = req.body;
await db.insert(userPersonalizationSettings).values({ ...settings, userId });
```

…lets an authenticated user set every column the ORM will accept. In the original review, this was the personalization settings endpoint. The specific bug was: the user could inject any column name (`role`, `tenantId`, `isAdmin`) into a settings-object insert and the ORM would happily write it.

The class of bug is broader than that specific endpoint. Any spread of `req.body` (or `...req.body`) into an ORM call is a mass-assignment vector. Any `z.record(z.any())` on a `config`-like field is one, because the record allows arbitrary keys the service layer may consume.

### The invariant

**No `req.body` value reaches an ORM write without passing through an explicit Zod schema that enumerates every field.**

Two forms of Zod schema meet the bar:

1. **Explicit `z.object({ field1: ..., field2: ... })`** with no `.passthrough()` — the safest form. Extra keys are silently stripped by Zod's default behavior. Downstream service code cannot see keys the schema didn't declare.
2. **`z.discriminatedUnion('type', [...])`** — required for polymorphic configs. Each variant declares its own schema; the discriminator ensures the right variant is applied. See §3 for the dataSource pattern.

**Neither of these is safe:**

- `z.record(z.any())` — accepts arbitrary keys, defeats the invariant. Only permissible if the value is opaque metadata (logged, never dereferenced) and even then, cap the size.
- `.passthrough()` — explicitly opts out of key stripping. Only use if the service layer treats the extra keys as opaque and has been reviewed for that assumption.

### What this looks like in practice

**Good — explicit schema:**
```ts
const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});
const data = updateSchema.parse(req.body);
await db.update(table).set(data).where(eq(table.id, id));
```

**Also good — discriminated union for polymorphic input:**
```ts
const schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('a'), config: aConfigSchema }),
  z.object({ type: z.literal('b'), config: bConfigSchema }),
]);
const data = schema.parse(req.body);
```

**Bad — the original personalization bug:**
```ts
const settings = req.body;                                    // no validation
await db.insert(table).values({ ...settings, userId });       // mass assignment
```

**Also bad — schema exists but is too permissive:**
```ts
const schema = z.object({
  name: z.string(),
  config: z.record(z.any()),   // arbitrary keys under `config` — bypass
});
```

### Rules for future changes

1. **Never `const x = req.body`.** Always `const x = someSchema.parse(req.body)` or `.safeParse(req.body)`.
2. **Never `.values({ ...req.body, ... })`.** Spread a Zod-parsed object instead.
3. **`z.record(z.any())` is a red flag.** It is sometimes correct (opaque metadata blobs), but every use should have a comment justifying why the values are never dereferenced as URLs, code, or ORM columns.
4. **When adding a field the user may set, add it to the schema explicitly.** Do not rely on "the ORM will just accept it." That's how the personalization bug shipped.
5. **Server-computed fields override, they don't co-exist.** Handlers that build an insert typically do `{ ...validated, userId, tenantId }` — put the server-computed fields *after* the spread so they can't be overridden by an attacker who guesses the field name and includes it in the body.

### Cross-reference with SSRF (§3)

Mass assignment and SSRF intersect on `config` blobs. The dataSource fix pattern — discriminated union + `NETWORK_KEYS` — is the canonical example of closing both classes at the same time: the schema decides which keys are legal (mass-assignment defense), and the map decides which of those keys must go through `safeFetch` before dispatch (SSRF defense).

---

## 3. Combined Pattern: `dataSource.routes.ts`

The data-source router is the reference implementation for endpoints that accept polymorphic config and later dial the config's URLs. If you're adding a similar pattern — connections, integrations, external adapters — read this section first.

### Structure

```ts
// One config schema per variant. No `z.record(z.any())`. No `.passthrough()`.
const externalConfigSchema = z.object({ url: z.string().url() });
const postgresConfigSchema = z.object({ connectionString: z.string().optional(), host: z.string().optional(), ... });
const airtableConfigSchema = z.object({ apiUrl: z.string().url().optional(), baseId: z.string(), apiKey: z.string() });

// One discriminated union tying variants to their config.
const dataSourceConfigUnion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('external'), name: ..., config: externalConfigSchema }),
  z.object({ type: z.literal('postgres'), name: ..., config: postgresConfigSchema }),
  z.object({ type: z.literal('airtable'), name: ..., config: airtableConfigSchema }),
  // ...
]);

// Per-variant map of "which config keys are network-facing."
// If you add a variant with a URL/host field, you MUST add it here or SSRF is skipped.
const NETWORK_KEYS: Record<string, string[]> = {
  external:      ['url'],
  postgres:      ['connectionString', 'host'],
  airtable:      ['apiUrl'],
  google_sheets: [],
  native:        [],
  native_table:  [],
};

// Handler flow:
const data = dataSourceConfigUnion.parse(req.body);   // mass-assignment defense
for (const key of NETWORK_KEYS[data.type] ?? []) {    // SSRF defense
  const val = (data.config as Record<string, unknown>)[key];
  if (typeof val === 'string' && !(await checkSsrf(val, protocolsFor(data.type, key)))) {
    return res.status(400).json({ message: `Invalid or unsafe ${key}` });
  }
}
// Later, when dispatching:
await safeFetch(userSuppliedUrl, ...);                // SSRF TOCTOU defense
```

### Why this shape

- **Discriminated union** forces every new variant to be a named type, not a `{ [key: string]: unknown }` blob.
- **`NETWORK_KEYS`** is a compile-adjacent invariant: it lives right next to the schema, so a reviewer adding a variant sees the map immediately and either registers the URL field or explicitly leaves the array empty.
- **`safeFetch` at dispatch** guarantees the check-then-use gap can't be exploited.

### When adding a variant, the checklist is

1. Define a Zod schema for the variant's config. No `.passthrough()`, no `z.record(z.any())` unless the value is opaque metadata.
2. Add the variant to `dataSourceConfigUnion`.
3. Add the variant to `NETWORK_KEYS` — even if the array is `[]` (the empty array is a positive statement that this variant has no network-facing fields, not an oversight).
4. If the service layer will dispatch to any URL from this variant's config, use `safeFetch`.
5. Add an integration test that submits an internal IP for each field in `NETWORK_KEYS[<variant>]` and expects 400.

---

## 4. Anti-patterns to reject in code review

If you see these in a diff, block the review:

| Anti-pattern | Why it's dangerous | Fix |
|---|---|---|
| `const x = req.body` (unvalidated) | Mass assignment | Zod schema, `.parse(req.body)` |
| `.values({ ...req.body })` | Mass assignment | Spread a validated object instead |
| `z.record(z.any())` on a config field | Mass assignment + SSRF | Discriminated union per variant |
| `.passthrough()` on user-input schema | Mass assignment | Whitelist keys explicitly |
| `fetch(userUrl, ...)` | SSRF (both flavors) | `safeFetch(userUrl, ...)` |
| `await validateSafeUrl(url); await fetch(url, ...)` | SSRF TOCTOU | `safeFetch(url, ...)` |
| Handler spread order `{ userId, ...req.body }` | Attacker can override userId | `{ ...validated, userId }` |
| `NODE_ENV`-gated security check | Staging often isn't `production` | Explicit env flag with safe default |
| Ambient `req.user` check without prior auth middleware | Fails-closed today, fragile forever | Chain auth middleware explicitly |

---

## 5. Files that enforce the invariants

Change with care. Modifying any of these is a security-relevant change and should have a threat-model impact statement in the PR description.

| File | Role |
|---|---|
| `server/utils/safeFetch.ts` | Enforces SSRF invariant at dispatch time (DNS resolve + `isInternalIp` + socket pin) |
| `server/utils/ssrfValidator.ts` | Enforces SSRF invariant at validation time (`validateSafeUrl`, `isInternalIp`) |
| `server/lib/security/ssrfGuard.ts` | `assertOutboundUrlAllowed` — check-only variant used for user-facing pre-checks |
| `server/middleware/auth.ts` | JWT + cookie auth strategies; DB re-hydration of role/tenant on every request |
| `server/middleware/requireUser.ts` | Attaches user to request; the only source of truth for `req.user` |
| `server/middleware/rateLimiter.ts` | Named rate limiters; use these, don't define new `rateLimit(...)` inline unless the shape is genuinely different |

---

## 6. What to do when threat-modelling a new route

Five questions to answer before merging:

1. **Auth.** What middleware chain guards this route? Is it `hybridAuth` + a role/tenant check, or just `hybridAuth`? If unauthenticated, why?
2. **Validation.** Every field consumed from `req.body`, `req.query`, `req.params`, `req.headers` — where is it validated? By what schema? Any `z.record(z.any())`?
3. **Outbound HTTP.** Does the handler (or anything it calls transitively) dial a URL that came from user input? If yes, is it going through `safeFetch`?
4. **Authorization.** Does the handler correctly scope by tenant/project/user? Any `.where()` clause that could be widened by a missing predicate?
5. **Error surface.** Do error responses leak stack traces, DB errors, internal hostnames, or existence of resources the caller shouldn't know about?

If any answer is "I'm not sure," get a review before merging.

---

## 7. Tenant Isolation (defense in depth)

Cross-tenant data separation is enforced in the service layer (every query scopes
by `tenant_id`). That is a convention, so two structural backstops were added under
SEC-051:

1. **`withTenant` query helper** (`server/repositories/tenantWrapper.ts`) — builds a
   WHERE condition that always includes the tenant predicate and **fails closed** on
   a missing `tenantId` column or an empty/blank tenant id (an empty value would
   otherwise match every row).
2. **Postgres Row-Level Security** — migration `0001_enable_rls.sql` defines a
   `tenant_isolation` policy on every direct-`tenant_id` table. It is **defined but
   not yet enforced** (the app connects as the table owner, which bypasses RLS until
   `FORCE` or a restricted role is used). The full design, the connection-pooling
   hazard, and the enforcement runbook are in
   [TENANT_ISOLATION_RLS.md](./TENANT_ISOLATION_RLS.md).

Rules for new routes/tables: a new tenant-scoped table must get an RLS policy in a
new migration, and its queries should run through `withTenant`. Never set the tenant
GUC with a session-level `SET` — only transaction-scoped `set_config(..., true)` via
`server/utils/rlsContext.ts`, because the app runs on a connection pool.

## Change history

| Date | Change | Author |
|---|---|---|
| 2026-07-06 | Initial version — captures decisions from the Q1 2026 route-layer security review (21 findings across five fix passes) | Route-layer security review |
| 2026-07-11 | Added §7 Tenant Isolation — `withTenant` helper + staged Postgres RLS (SEC-051) | Proactive hardening |
