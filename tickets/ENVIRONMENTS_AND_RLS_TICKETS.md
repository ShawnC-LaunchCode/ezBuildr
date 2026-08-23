# Environment split & real tenant isolation (ENV / RLS)

**Status:** one open ticket — **RLS-4, production only** · **Updated:** 2026-08-23

> **Most of this initiative is closed and its detail has moved.** ENV-1..4 and
> RLS-1, 2a–2f, 3, 5, 6 and 7 all shipped between 2026-08-15 and 2026-08-22;
> their closure record, the withdrawn findings, and every parked observation are
> in [`tickets/backlog/ENVIRONMENTS_AND_RLS.md`](backlog/ENVIRONMENTS_AND_RLS.md).
> Full original text of any closed ticket:
> `git log -p -- tickets/ENVIRONMENTS_AND_RLS_TICKETS.md`.
>
> **Do not re-file** anything in that file's *Closed* or *Withdrawn findings*
> tables — several of the withdrawn ones misled multiple earlier audits.

**Where the durable knowledge lives** (none of it is in this file):

| | |
|---|---|
| The patterns, §2a–§2g | [`docs/architecture/TENANT_ISOLATION_RLS.md`](../docs/architecture/TENANT_ISOLATION_RLS.md) |
| Current state + the traps that cost real time | [`tickets/RLS_HANDOFF.md`](RLS_HANDOFF.md) |
| The cutover procedure, per environment | [`tickets/RLS4_CUTOVER.md`](RLS4_CUTOVER.md) |
| Phased scope against the client date | [`tickets/RLS_COMPLETION_PLAN.md`](RLS_COMPLETION_PLAN.md) |

## Where enforcement actually stands

| environment | app role | RLS enforcing | notes |
|---|---|---|---|
| dev | `ezbuildr_app` | ✅ 2026-08-22 | 37 migrations |
| test | `ezbuildr_app` | ✅ 2026-08-23 | 37 migrations, 36 RLS tables |
| **production** | `neondb_owner` | ❌ **not enforcing** | 24 migrations, 9 RLS tables — needs a `test` → `main` PR first |

Production is the whole of the remaining work, and it is gated on promotion
rather than on anything RLS-specific.

---

## How to work this document

- Read this header and **your ticket only**.
- Line numbers are advisory; the **quoted code plus the symbol name** is the locator. Grep
  for the quote.
- Load the project skills named in each ticket's **Ties** before touching code.
- **Devs do not commit or stage.** The reviewer commits, one commit per passed ticket.
- Run `npm run test:integration`, and **as the non-owner role** via
  `npm run test:rls-gate` (RLS-5). ⚠️ **Also run `npm run test:fast`.** An earlier
  version of this line said the no-DB project covered nothing here and could be
  skipped — that was true when written and is now false: converting a service to
  open a tenant-scoped transaction breaks its mocked-repository unit tests, which
  is exactly how 32 failures reached CI on 2026-08-22. It costs 74 seconds.
- Clear the shared type-check cache before trusting `tsc`: `rm -f node_modules/typescript/tsbuildinfo`.
- **`npm run test:docker:up` starts postgres (5434) *and* gotenberg (3009).** Re-run it after
  any pull; a missing service produces failures that read like code defects. See the
  `run-tests` skill.

---

## Why this initiative exists

Three facts, each verified 2026-08-12:

1. **Local development shares one database with production.** `.env` `DATABASE_URL` points at
   the Neon production instance. A local `npm run db:migrate` hits production. Already
   recorded as `LU-B1` in `tickets/BACKLOG.md` and never resolved.
2. ~~**`main` auto-deploys to production with no staging gate, and branch protection is off**~~
   **WRONG — corrected 2026-08-15.** Protection is enforced by a *ruleset*, which the legacy
   `…/branches/main/protection` endpoint cannot see; it returns 404 "Branch protection has
   been disabled" regardless. Query `gh api repos/ShawnC-LaunchCode/ezBuildr/rulesets`
   instead. `main-protection` is active with deletion, non-fast-forward, PR-required and 4
   required checks. See ENV-4.
3. **Row-level security is defined but structurally inert.** Details in Phase 2.

Phase 1 must land before Phase 2 starts. Making RLS real requires connecting as a
non-owner role and running a full integration suite against a database you are willing to
break — doing that against the production database is the hazard Phase 1 removes.

## Withdrawn findings — do not re-file

Five claims from earlier audits were investigated and proved **wrong**, two of
them after misleading several passes ("branch protection is off", "migration
0001 is broken"). They are listed with their disproof in
[`backlog/ENVIRONMENTS_AND_RLS.md`](backlog/ENVIRONMENTS_AND_RLS.md#withdrawn-findings--these-were-wrong-do-not-re-file).
Check that table before filing anything against this area.

---

## RLS-4 — Add `FORCE ROW LEVEL SECURITY` and move off the owner role 🔄 dev + test DONE; production remains

### Progress — 2026-08-22 · **dev is cut over and enforcing**

Procedure, measured Neon facts and rollback: [`RLS4_CUTOVER.md`](RLS4_CUTOVER.md).

| AC | State |
|---|---|
| 1. Migration sets `FORCE` on every policy table | ❌ **not done — and read this before doing it.** `neondb_owner` holds `BYPASSRLS` *directly*, and BYPASSRLS beats FORCE, so a FORCE migration alone changes nothing here. The isolation comes from AC2. FORCE is still worth adding as defence against a future non-bypassing owner, but it is not what makes this work. |
| 2. Least-privilege role, not owner, no BYPASSRLS | ✅ `ezbuildr_app` on the dev branch — `rolbypassrls=false`, no role memberships |
| 3. `DATABASE_URL` uses it in dev and test | ✅ **both done** — dev 2026-08-22, test 2026-08-23. `production` is the only one left, and this AC gates it on exactly what has now happened |
| 4. Cross-tenant read proven impossible | ✅ as the app role with tenant A pinned: that tenant's rows only, **0** from any other |
| 5. Proven non-vacuous, incl. the empty-string trap | ✅ GUC unset → **0**; GUC `''` → **0**; real tenant → its rows. Both fail-closed |
| 6. Documented rollback | ✅ `RLS4_CUTOVER.md` §5 — variable change + redeploy, no migration to revert |

⚠️ Cutting over broke the first deploy: container start runs `db:migrate`, which
needs DDL the app role does not have. Fixed by `MIGRATION_DATABASE_URL`
(`scripts/runMigrations.ts`), which `test`/`production` must also set.

### ✅ `test` CUT OVER 2026-08-23 — the block below is resolved, kept for the lesson

Promoting `dev` → `test` (138 commits, fast-forward) ran the migrations at
deploy time and took the test database from 24 migrations to **37**, and from
**0** RLS-enabled tables to **36**. The same enforcement check that failed
before then passed:

| as `ezbuildr_app` on test | before promotion | after |
|---|---|---|
| no tenant GUC | 2 projects | **0** |
| GUC = `''` | 2 projects | **0** |

Cut over with all four variables set together — including
`MIGRATION_DATABASE_URL`, which is why it booted first try where dev took two
attempts. Verified: `Admin DB: initialized.` in the boot log, `/health` healthy,
and `pg_stat_activity` showing `ezbuildr_app` ×3 (app) alongside `neondb_owner`
×3 (admin pool + migrations).

**The lesson to keep:** the verification step is what caught this. Setting the
four variables without running the check would have produced a green-looking
cutover on a database with no policies at all — enforcement "on", isolation
absent, and nothing to indicate it.

### 🔴 The original block (resolved) — `test` had no RLS policies at all

Attempted 2026-08-22 and stopped on the verification step, which is what that
step is for. As `ezbuildr_app` on the test branch with **no** tenant GUC:
`SELECT count(*) FROM projects` returned **2**, not 0.

Cause: the test database is **13 migrations behind**.

| branch | `drizzle.__drizzle_migrations` | latest |
|---|---|---|
| dev | **37** | 2026-08-22 |
| test | **24** | ~2026-08-09 |

Everything from 0024 to 0036 is missing there — which is the entire RLS policy
chain (0026–0036) plus the coverage repair (0024). `pg_class.relrowsecurity` is
`false` and there are zero policies on `projects`, `users`, `workflows` and
`connections`. Nothing to enforce, so a non-owner role changes nothing.

The test environment only runs migrations when something deploys to it, and the
`test` git branch is **131 commits behind `dev`**.

**The order was forced, and all three steps are now done:**

1. ✅ CI green on `dev` (2026-08-23).
2. ✅ Promote `dev` → `test` — the deploy ran `db:migrate` to 0036.
3. ✅ Cut `test` over and re-verify.

**Production needs the same three steps**, and step 1 there is a `test` → `main`
pull request, not a push.

The `ezbuildr_app` role already exists on the test branch (created 2026-08-22,
`rolbypassrls=false`, no memberships) and `ALTER DEFAULT PRIVILEGES` is set, so
tables created by migrations 0024–0036 will be granted to it automatically. Only
the four Railway variables and the redeploy remain.

Running the migrations against test out of band would work, but it would put the
schema ahead of the code it is meant to be a snapshot of, which is the one thing
the promotion model exists to prevent.

**Priority: P0** · Size: M · **BLOCKED on RLS-2, RLS-3, and now the admin-access path below** · Files: a new migration, Railway/Neon role configuration, `.env.example`

> ### 🔴 DISCOVERED 2026-08-18 — this ticket silently breaks the admin console
>
> Measured, not theorised. Three facts that combine badly:
>
> - The policy is bare `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`
>   with **no platform-admin clause** (`migrations/0001_enable_rls.sql`).
> - **`users` is in the covered table list**, along with `projects`, `organizations`, `files`,
>   `records` and the rest.
> - Admin endpoints read **globally**: `userRepository.findAllUsers()`,
>   `findAllUsersWithWorkflowCounts()`, and `workflowRepository.findAttributedToUser(userId)`
>   for any user regardless of tenant (`server/routes/admin.routes.ts`).
>
> The moment `FORCE` lands and the app runs as a non-owner role, `/api/admin` returns **only
> the admin's own tenant** — not an error, just a truncated list. **That is the worst failure
> shape: a console that looks like it is working.**
>
> Note this also answers "does RLS stop admin seeing everything?" — **today it does not**,
> because owners bypass RLS until `FORCE` is set, so admin access is gated purely by
> `users.role` in the application layer. Enforcing RLS constrains admin *harder than intended*
> unless an explicit path is built first.
>
> **Repo owner requirement, 2026-08-18:** admins must keep the ability to see and help users —
> including **running a workflow to replicate a reported problem** and **working inside the
> user's account for testing**. That is a support-access feature, not a flag on this ticket.
>
> **Therefore: the admin-access path must land BEFORE this ticket — it is now `RLS-6`**, added
> 2026-08-18 and scoped by the owner to the minimum that unblocks `FORCE` (cross-tenant read
> path + audit). Tenant-switching support sessions and impersonation are a separate initiative
> afterwards. Shipping `FORCE` first would break support at exactly the moment tenant
> isolation starts being enforced.
>
> **Do not resolve this by giving the application role `BYPASSRLS`.** That would return the
> system to "one connection sees everything" and delete the property this whole phase exists to
> create. AC2 below stays as written.
>
> ### 🛑 BLOCKING (measured 2026-08-20): the policies raise instead of filtering
>
> **Do not set `FORCE` anywhere until this is fixed.** Proven by
> `tests/integration/rls4-forceEnforcement.test.ts` against a real non-owner role:
> with `FORCE` on and no tenant pinned, a query does **not** return zero rows — it
> **raises** `invalid input syntax for type uuid: ""`.
>
> Once a custom GUC has been touched on a connection it reverts to **empty string**, not
> unset, and every policy casts unguarded:
> `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`.
> `''::uuid` raises. **No policy in `0001` or `0024` wraps it in `NULLIF`** (verified).
>
> Fail-closed either way — nothing leaks — but the operational difference is large. The app
> uses a **pooled** connection, so any query running outside a tenant transaction on a
> connection that previously served one returns a hard **500** rather than an empty result.
> That is most of the app, on day one of enforcement.
>
> **Fix before FORCE:** rewrite the policies as
> `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`, which yields NULL,
> filters the row, and does not raise. It needs a new migration recreating the policies —
> `0001`/`0024` are applied and immutable.
>
> ### 🔴 Three preconditions, all discovered after this ticket was written
>
> **1. Ordering (from RLS-6).** Provision `ADMIN_DATABASE_URL` **first**, then set `FORCE` and
> `RLS_ENFORCED` **together**. `AdminAccessService` throws if `RLS_ENFORCED` is on without the
> admin pool — but `RLS_ENFORCED` is an application flag, **not** `FORCE` itself, so setting
> FORCE while the flag is false leaves that guard blind and the admin console truncates
> silently.
>
> **2. ✅ CLOSED 2026-08-19 — `AdminOrgStatsService` now reads through the admin path.**
> `AdminOrgStatsRepository` gained an `adminDbOverride`, `AdminAccessService` gained an audited
> `listOrgStats`, and the service reads through it, preserving RLS-6's containment (it never
> imports `adminDb` itself). Original finding follows.
>
> ~~**`AdminOrgStatsService` is not on the admin path (from RLS-2d).**~~
> `AdminOrgStatsRepository` imports the **normal** `db` pool and is **not** in RLS-6's `adminDb`
> allowlist. It is an admin-only cross-tenant aggregate, so under `FORCE` it returns only the
> acting admin's own tenant's organizations — no error, just a short list. **Route it through
> `AdminAccessService`/`adminDb` and add it to the containment allowlist before FORCE.**
>
> **UPDATED 2026-08-20 — the rollout finished and the list grew to five. Treat this as a
> checklist to verify, not a note to have read.** Precondition 2 is already CLOSED; the other
> four are open. Every one of them is a *silent* failure: no error, just wrong or missing data.
>
> **4. `BrandingService.resolveForWorkflow` (from RLS-2e).** `resolveTenantIdForWorkflow` reads
> **`workflows`** — RLS-covered — on the pool with no GUC, so it returns zero rows, `tenantId`
> comes back null, and the client portal renders **default branding instead of the tenant's**.
> Wrong logo and colours on a customer-facing page. Note it is `workflows` that is exposed, not
> the branding column: `tenants` has no policy, so checking there finds nothing and misleads.
>
> **5. `VariableService.listVariables` (from RLS-2e).** Called by
> `TemplateValidationService.validate`. Under `FORCE` it sees **zero variables** for the
> workflow's sections and steps, so validation reports a template **clean when it is not** —
> and template validation is the gate that stops broken documents reaching customers.
>
> **Also flagged, and this one is acceptable as-is:** `WorkflowClonerService.copyWorkflowAsAdmin`
> is a genuine cross-tenant admin path left with no GUC. Under `FORCE` it **fails closed**
> (throws or copies nothing) rather than leaking. Give it RLS-6-style bypass treatment when
> convenient; it is not a correctness risk in the meantime.
>
> **3. Token-authenticated bootstrap lookups (from RLS-2c).**
> `SignatureRequestService`'s `getSignatureRequestByToken` / `signDocument` /
> `declineSignature` and the `markExpiredRequests` cron perform an **unscoped initial SELECT** —
> the token is the authorization, and the row's own `tenantId` then drives every write. Under
> `FORCE` that bootstrap runs with **no tenant GUC**. `RunFileUploadService` has the same shape
> and was left unconverted for the same reason. Decide deliberately how these read under FORCE;
> they are the public signing portal, so getting it wrong is a customer-visible outage.

### Finding

Postgres exempts a table's owner from RLS unless the table is set to
`FORCE ROW LEVEL SECURITY`. There is no `FORCE` anywhere in the repo, and the application
connects as `neondb_owner` — the owner. Both conditions must change or the policies stay
decorative.

### Preferred fix

Two changes that must land together, and **never on production first**:

1. A migration setting `FORCE ROW LEVEL SECURITY` on every table with a policy.
2. A dedicated least-privilege application role — `SELECT/INSERT/UPDATE/DELETE` on the
   application tables, **not** the owner, no `BYPASSRLS` — with `DATABASE_URL` repointed to it
   per environment.

Migrations continue to run as the owner; only the application runtime uses the restricted role.

Sequence: dev → test → production, with RLS-5 green at each step. This is the ticket that can
take the product down, and the blast radius is "every query returns zero rows".

### Ties

- Depends on **RLS-2** (GUC is set) and **RLS-3** (coverage known).
- Load `db-schema-change`.
- ⚠️ `LU-B1` — until ENV-1 lands, a local `db:migrate` hits production. Phase 1 must be done.

### Acceptance criteria

1. A migration sets `FORCE ROW LEVEL SECURITY` on every table carrying a policy.
2. A least-privilege application role exists; it is not the table owner and lacks `BYPASSRLS`.
3. `DATABASE_URL` uses that role in dev and test; production only after RLS-5 passes in both.
4. **A cross-tenant read is proven impossible at the database level**: as the app role with the
   GUC pinned to tenant A, a direct query for a tenant-B row returns zero rows — pasted output.
5. **Proven non-vacuous**: with the GUC unset, the same query also returns zero rows (fail-closed,
   not accidentally-permissive). Note the known trap that an **empty-string** GUC behaves
   differently from an unset one — cover both.
6. A documented rollback: how to revert to the owner role if production degrades.

---

---

## Phase 2 Gate

- [~] RLS-1 ✅, RLS-2a ✅, RLS-2b ✅, RLS-2c ✅, RLS-2d ✅, RLS-2e ✅, RLS-2f ✅, RLS-3 ✅,
      RLS-5 ✅, RLS-6 ✅, RLS-7 ✅ (2026-08-22) — **RLS-4 is the only ticket still open**,
      and only for `test`/`production`, both gated on the promotion chain
- [x] **RLS-2's shape ruled on by the repo owner** — service boundary, 2026-08-18 — now
      needs delivering
- [x] A cross-tenant read proven impossible at the database level, with fail-closed evidence
      — **dev, 2026-08-22.** As `ezbuildr_app`: tenant pinned -> that tenant's rows only,
      0 from any other; GUC unset -> 0; GUC `''` -> 0. Both fail-closed, covering the
      empty-string trap. Not yet true of `test`/`production` (no policies there yet)
- [~] **The admin console still shows every tenant** after `FORCE` — proven in the test
      suite (`api.admin-user-workflows` green under `RLS_RESTRICTED=true` with a real
      BYPASSRLS pool, and `rls7-adminDb-readonly` proves that pool cannot write).
      **Not yet exercised against the live dev environment**, which is the remaining half
- [~] Full integration green as the restricted role in CI — **yes, 124/124, allowlist
      empty**. NOT required by branch protection: deliberately advisory until the
      "Registration failed" flake in RLS_HANDOFF §4 is understood (see RLS-5)
- [~] `docs/architecture/TENANT_ISOLATION_RLS.md` covers §2a–§2g and the admin
      `BYPASSRLS` path. **Needs a pass for what 2026-08-22 changed**: the multer
      async-context hazard, `forEachTenant` for background jobs, and the fact that in
      Neon the bypass role is `neondb_owner` (so the read-only property rests on code
      containment plus a test, not on privileges)
- [ ] Reviewer has committed each passed ticket

**Dispatch order (updated 2026-08-18 after RLS-1 landed and RLS-2 was split):**

```
RLS-1  ✅ done bc90cc3e
RLS-2a    pilot: the pattern, on CollectionService
RLS-2b    rollout: the remaining ~35 tenant-scoped services  ─┐ parallel with
RLS-3     policy coverage repair                              ├─ each other and
RLS-6     admin cross-tenant read path                        ─┘ with RLS-2b
RLS-2f ✅ done 2026-08-21 — the call-site sweep (121 -> 25 sites)
RLS-7     admin.routes' remaining cross-tenant ops  (blocks RLS-4, needs an owner ruling)
RLS-4     FORCE + restricted role   (blocked on 2b, 2f, 3, 6 and 7)
RLS-5     gate: full integration as the restricted role
```

RLS-2b, RLS-3 and RLS-6 are mutually disjoint — services, migrations and the admin path
respectively — so they can run concurrently once RLS-2a fixes the pattern. **RLS-4 needs all
three**: without 2b it returns zero rows, without 3 the coverage is wrong, without 6 the admin
console silently truncates.

**Added 2026-08-21:** RLS-2f closed the gap the service-by-service rollout could not see —
call sites that never went through a service. RLS-7 is the same argument as RLS-6, applied to
the admin operations RLS-6 did not cover, and it blocks RLS-4 for the identical reason.

---
