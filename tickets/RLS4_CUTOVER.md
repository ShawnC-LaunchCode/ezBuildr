# RLS-4 — turning enforcement ON

**Written 2026-08-22, after the restricted suite went 124/124 green.** This is
the procedure, the order, and the rollback. Read `RLS_HANDOFF.md` §1 and §7
first for state.

Everything below has been rehearsed once already: `tests/setup.ts` does exactly
this against the test database on every `RLS_RESTRICTED=true` run. That is the
strongest evidence available that the shape works — it is not a design on paper.

---

## 0. The one thing that must not go wrong

**Provision `ADMIN_DATABASE_URL` BEFORE anything else, and set `FORCE` and
`RLS_ENFORCED` together.**

`AdminAccessService.adminDbOrUndefined()` falls back to the normal pool when
`ADMIN_DATABASE_URL` is unset, and only refuses to do so when `RLS_ENFORCED` is
true. So:

| Order | Result |
|---|---|
| admin URL → FORCE + RLS_ENFORCED together | ✅ correct |
| FORCE first, RLS_ENFORCED later | ❌ **the guard is blind** — the admin console silently shows one tenant |
| RLS_ENFORCED first, FORCE later | Safe but pointless: the app throws on admin reads while nothing is actually enforced |

The middle row is the dangerous one. It produces a short, plausible-looking
admin list rather than an error, which is the exact failure RLS-6 was built to
prevent.

---

## 1. ⚠️ The bypass role does not exist yet

`server/db/adminDb.ts` says the role is *"created in migration
0024_certain_nightcrawler.sql"*. **That is wrong.** Migration 0024 in this repo
is `0024_repair_rls_coverage.sql`, and no migration in the chain creates a
BYPASSRLS role. Grepped the whole `migrations/` tree: the only hits for
`BYPASSRLS` are prose in 0034's header.

So step one is creating it. Deliberately NOT as a migration — roles are
cluster-level, migrations run per-database, and the password must not live in
git. Run it once per environment as an admin:

```sql
CREATE ROLE ezbuildr_admin_bypass LOGIN PASSWORD '<generated>' BYPASSRLS NOSUPERUSER;
GRANT USAGE ON SCHEMA public TO ezbuildr_admin_bypass;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ezbuildr_admin_bypass;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ezbuildr_admin_bypass;
```

**SELECT only.** RLS-7's ruling is that the bypass pool is read-only: it
resolves *which* tenant owns a target, and every admin write then runs on the
normal pool pinned to that tenant. Granting it write access would quietly
delete that property. (`tests/setup.ts`'s `provisionAdminBypassRole` grants
more than this because the test harness reuses one role for setup; production
should not copy it.)

Then set `ADMIN_DATABASE_URL` in Railway for that environment, pointing at this
role. Note `VITE_`-style build-arg problems do not apply — this is server-side.

---

## 2. Choose how the app stops being the table owner

Postgres exempts a table's OWNER from RLS unless `FORCE` is set. Prod currently
connects to Neon **as the owner**, so policies are defined and inert. Two ways
to fix that, and they are not equivalent:

**Option A — least-privilege app role (recommended).** Create a non-owner role,
grant it DML only, repoint `DATABASE_URL`. This is exactly what the test
harness does (`rls5_app_role`, `NOBYPASSRLS NOSUPERUSER`), so it is the shape
124/124 tests have actually proven.

```sql
CREATE ROLE ezbuildr_app LOGIN PASSWORD '<generated>' NOBYPASSRLS NOSUPERUSER;
GRANT USAGE ON SCHEMA public TO ezbuildr_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ezbuildr_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ezbuildr_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ezbuildr_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ezbuildr_app;
```

Migrations keep using the owner connection — they must, since the app role
cannot run DDL. That is already true of `db:migrate`.

**Option B — `FORCE ROW LEVEL SECURITY` on every covered table.** Keeps one
role, makes the owner subject to its own policies. Simpler to roll out, but it
also applies to anything else using that connection, including migrations and
one-off scripts, which then need the tenant GUC or they silently see nothing.

**Do both, in this order: A first, then B.** A is the isolation; B is the
backstop that stops a future owner-credentialled process from bypassing it.
Doing B alone is the riskier half.

---

## 3. Sequence

1. Create the bypass role (§1) in **dev**. Set `ADMIN_DATABASE_URL`.
2. Redeploy dev (`railway redeploy` — env-var changes need it) and confirm the
   log line `Admin DB: initialized.` appears at boot. If it does not, stop.
3. Create the app role (§2 Option A) in dev. Repoint `DATABASE_URL`. Redeploy.
4. Set `RLS_ENFORCED=true` in dev **in the same deploy** as the `FORCE`
   statements if you are doing Option B, or immediately after step 3 for A.
5. Exercise dev for a day: the admin console, a document run, an upload, a
   DocuSign webhook if reachable. Watch for "not found" on things that exist —
   that is what an unscoped read looks like now.
6. Repeat 1-5 on **test**, then **production**.

Each Railway environment has its **own Neon database and secrets**, so every
role must be created three times. Verify the branch → environment mapping in
Railway's Settings → Source pane rather than assuming it.

---

## 4. Verification, per environment

```sql
-- The app role must NOT be able to bypass.
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles
WHERE rolname IN ('ezbuildr_app', 'ezbuildr_admin_bypass');
--   ezbuildr_app          | f | f
--   ezbuildr_admin_bypass | t | f

-- Every covered table still has its policy.
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname IN ('projects','users','connections','signature_requests');
```

And the real check, from the app: log in as a user in tenant A and confirm you
cannot see tenant B's projects — then confirm the admin console still lists
**all** tenants. The second half is the one that fails quietly.

---

## 5. Rollback

Fast and total: set `RLS_ENFORCED=false` and repoint `DATABASE_URL` back to the
owner role, then redeploy. Owner + no FORCE = policies inert, exactly as today.
If Option B was applied, also `ALTER TABLE … NO FORCE ROW LEVEL SECURITY`.

No migration needs reverting. Every policy added in 0026-0036 is inert while
the connection is the owner and FORCE is off, which is why they have been safe
to ship incrementally all along.

---

## 6. Known open item

`RLS_HANDOFF.md` §4 documents an intermittent "Registration failed" in full
restricted test runs, cause not yet found, with same-connection instrumentation
left in `auth.routes.ts` to catch it. It has never been observed outside the
test harness. **It is not a reason to delay dev**, but get it understood before
production — a registration path that fails one time in N is not something to
discover from customer reports.
