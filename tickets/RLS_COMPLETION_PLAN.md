# RLS completion plan — bounded scope, 2-month runway

**Written 2026-08-21.** Owner constraint: real client data lands in ~2 months
(≈2026-10-21); security is a priority; feature work must proceed in parallel.

This exists because the epic *felt* unbounded. It is not, and §1 is the proof.
Live state and findings: [`RLS_HANDOFF.md`](RLS_HANDOFF.md).

---

## 1. Why it kept growing, and why that stops now

It genuinely was open-ended until today, for a real reason: **the failure mode is
discovery-by-execution.** An unscoped read is invisible until some test drives
that exact path, so "what's left" could only be answered by running the suite,
fixing, and running again. Every pass found more because every pass got further.

Three things closed that off:

1. **The unnamed categories are now named.** The original rollout scoped itself
   to "services that reference `tenantId`" and was structurally blind to three
   things: ownership-derived tables (`sections`/`steps`/`workflows` have no
   `tenant_id`, so their services never mention it), services outside
   `server/services/*.ts`, and route middleware — a whole layer no category
   covered. All three are now known and searched for.
2. **The surface is statically bounded** (§2). It is a finite checklist, not a
   discovery process.
3. **The largest confounder is gone.** `tests/helpers/ownerDb.ts` separated the
   test observer from the application, so a failing test now means "the app
   could not do this under RLS" rather than "the harness could not see it."
   That one change moved passing tests 495 → 736.

**Honest caveat:** a static scan can miss a call reached only dynamically, and
the audit's tx-detection is textual. Expect the real number to be somewhat above
§2's, not multiples of it. The *shape* of the work is now known even where an
individual site is not.

---

## 2. The measured remaining surface

Audited 2026-08-21 across `server/**/*.ts`:

| Category | Call sites | Files |
|---|---|---|
| Repository calls on RLS-covered tables, no `tx` passed | **97** | 22 |
| Direct `db.select/insert/update/delete` on covered tables | **25** | 11 |
| **Total** | **~122** | **~28 distinct** |

Concentration is high — the top five files hold over half:

```
27  server/services/WorkflowPatchService.ts
14  server/routes/admin.routes.ts        ← mostly belongs on RLS-6's adminDb, not tenant-scoped
11  server/routes/auth.routes.ts
 9  server/services/esign/SignatureBlockService.ts
 6  server/services/portability/ImportService.ts
 5  server/services/scripting/{Lifecycle,Document}HookService.ts
```

Two of those are not conversions at all: `admin.routes.ts` and
`middleware/adminAuth.ts` are cross-tenant admin reads that should route through
`AdminAccessService`/`adminDb`, which already exists. Decide per site.

---

## 3. Phases

Sized in **focused days** — days actually spent on this, not calendar days.

### Phase 1 — Production conversion (~3 days) · the bulk
Work §2's checklist file by file, highest count first. Patterns are established;
nothing here needs inventing. Per file: thread `tx`, or wrap at the service
boundary with the ambient-only `withTx`, or route to `adminDb`. Commit per file
or small cluster.

**Watch for the two traps that cost real time today** — both in `RLS_HANDOFF.md` §5:
the async store and the transaction GUC are independent (`runWithTenantContext`
does not make a bare pool read work), and a pool query issued while a
transaction holds the only connection *hangs* rather than fails against the
`max:1` test pool.

### Phase 2 — Test tail (~1–2 days)
85 files still fail under the restricted role, but a large share are downstream
of Phase 1 and will fall out for free. Re-measure after Phase 1 before
estimating this; do not work it in parallel. Remaining fixture work: apply
`ownerDb`, and `enterTenantContextForTests` inside test bodies for suites that
call services directly.

### Phase 3 — CI gate (~0.5 day) · **do this as early as it will hold**
RLS-5 as a required check running the suite as the restricted role.

**This is the phase that buys the runway back.** Once it is green and required,
new feature work cannot reintroduce an unscoped path — the gate catches it at
PR time instead of at enforcement time. Everything after this can be scheduled
around features rather than blocking them. If Phase 1 slips, land this in
reporting-only mode first so the signal exists.

### Phase 4 — Dev rollout (~1 day)
Provision `ADMIN_DATABASE_URL` and the least-privilege app role, then set
`FORCE` **and** `RLS_ENFORCED=true` together — a FORCE-without-the-flag leaves
`AdminAccessService`'s guard blind and the admin console silently truncates.
Repoint `DATABASE_URL`, prove AC4 (cross-tenant read impossible) and AC5
(non-vacuous with the GUC unset) with pasted output, document the rollback.

### Phase 5 — test, then production (~1 day, calendar-spread)
Same sequence in `test`, soak, then a **PR-only** promotion to `main`.
**Target: FORCE live in production ~2 weeks before client data**, not the day
before. That fortnight is the point — it is when a silent truncation surfaces
while it is still cheap.

**Total: ~6–8 focused days**, against a ~40-working-day runway.

---

## 4. Recommended sequencing against feature work

```
Weeks 1–2   Phases 1–2, concentrated. Painful to interleave — the measure/fix
            loop needs continuity, and a full restricted run is ~19 minutes.
Week 3      Phase 3. Gate lands. ← RETURN TO FEATURE WORK HERE
Weeks 4–6   Features. Gate holds the line.
Week 7      Phase 4 (dev), soak a week under real use.
Week 8      Phase 5 (test → prod). ~2 weeks of margin before clients.
```

The single highest-value scheduling decision is **front-loading to the CI gate**,
then leaving. Trickling this out over eight weeks is worse than two hard weeks
followed by a gate, because without the gate every feature branch can silently
add to §2's count.

---

## 5. The fallback, if it slips

If Phase 1–2 are not done by ~week 5, **do not push FORCE toward the client
date.** Ship Phases 1–3 only: the app becomes RLS-clean, the gate stays green,
and the policies stay defined-but-unenforced — exactly today's posture, minus
the latent breakage.

That keeps every option open and costs nothing later, because the expensive part
(the conversion) is what carries forward. Flipping `FORCE` is then a one-day
change whenever it is wanted.

**What that fallback does and does not buy.** It does not give a database-level
backstop. It does give a codebase where every tenant-scoped query is scoped, a
CI gate that keeps it that way, and a one-day path to enforcement. Given the
service layer already enforces isolation with explicit `eq(tenantId, …)`
predicates, that is a defensible place to meet real client data — it is strictly
better than today, and materially better than a half-enforced state.

**What is NOT an acceptable end state:** stopping mid-Phase-1. Policies defined,
some services converted, some not, no gate. That has no security value and is a
trap for the next person in these files.

---

## 6. The one thing to re-examine before Phase 4

The bootstrap escape clauses have accumulated: `users` (self-id + login-email),
`workflows` (workflow-id + public visibility), `signature_requests` (token
hash), `projects` and `organizations` (verified foreign key). Each is a
narrow, read-only `OR` in `USING`, keyed on a GUC **application code sets**.

That is a real reduction in surface — five auditable clauses instead of every
query site — but it is not the original "the database enforces it regardless of
what the app does." Worth 30 minutes of deliberate review before enforcement,
with `0032` (keyed on an *unverified*, caller-supplied email) getting the most
attention. The documented alternative, if it reads too thin: a dedicated
low-privilege auth connection that may read `users` and nothing else, which
moves containment from convention into the connection and needs no call-site
changes.
