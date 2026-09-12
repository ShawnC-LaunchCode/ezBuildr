# RLS-4 — turning enforcement ON

**Written 2026-08-22, after the restricted suite went 124/124 green.** This is
the procedure, the order, and the rollback. Read [`RLS_HANDOFF.md`](../architecture/RLS_HANDOFF.md) §1 and §7
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

## 1. What Neon's actual configuration changes (measured 2026-08-22)

Inspected on the `dev` branch of project `billowing-base-67211686`. Two facts
here invalidate the obvious plan, so check them again before you start rather
than trusting this file:

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolcanlogin;
--  neondb_owner | f | TRUE | t
SELECT g.rolname FROM pg_auth_members m
  JOIN pg_roles r ON r.oid=m.member JOIN pg_roles g ON g.oid=m.roleid
 WHERE r.rolname='neondb_owner';
--  neon_superuser        (which itself has rolbypassrls = true)
SELECT tableowner, count(*) FROM pg_tables WHERE schemaname='public' GROUP BY 1;
--  neondb_owner | 107
```

**(a) `FORCE ROW LEVEL SECURITY` on its own would achieve NOTHING here.**
`neondb_owner` — the role the app connects as, and the owner of all 107 tables
— has `BYPASSRLS` directly, and **BYPASSRLS beats FORCE**. Setting FORCE and
changing nothing else leaves the app seeing every tenant, while every dashboard
says RLS is on. An earlier version of this document offered FORCE as a
"backstop"; against a BYPASSRLS role it is not one.

So the app MUST move to a new role that has neither BYPASSRLS nor membership in
`neon_superuser`. That is not the belt-and-braces option, it is the only one.

**(b) The admin bypass role already exists — it is `neondb_owner`.** It has
BYPASSRLS today, which is exactly what `ADMIN_DATABASE_URL` needs. So
`ADMIN_DATABASE_URL` is simply **the current value of `DATABASE_URL`**, and no
new role is created for it at all.

The trade-off, stated plainly: RLS-7's design wants the bypass pool read-only,
and `neondb_owner` can obviously write. Neon does not really offer a
"BYPASSRLS but read-only" role — `CREATE ROLE … BYPASSRLS` requires superuser,
which `neondb_owner` is not, so the only way to confer it is
`GRANT neon_superuser`, which also brings `pg_write_all_data`. The read-only
property therefore rests on code containment (`adminDb.containment.test.ts`
allows exactly one importer) rather than on database privileges. Worth knowing;
not worth blocking on.

> ⚠️ **Do not create the app role through the Neon Console, API, or CLI.**
> `neondb_owner`, which Neon created for this project, is a member of
> `neon_superuser` — so assume a console-created role inherits the same and
> silently bypasses RLS. Create it with SQL, then VERIFY (§2). A role that
> bypasses RLS looks identical to a working one until a tenant sees another
> tenant's data.

---

## 2. Create the application role (per Neon branch)

> ✅ **DONE ON `dev` (branch `br-shy-rain-ahpucki7`) on 2026-08-22.** The role
> `ezbuildr_app` exists there and was proven to enforce, connecting as it
> directly rather than via `SET ROLE`:
>
> | Check | Result |
> |---|---|
> | `rolbypassrls` / `rolsuper` | `false` / `false` |
> | role memberships | none — **not** in `neon_superuser` |
> | `SELECT count(*)` with no tenant GUC | `projects`, `users`, `connections`, `datavault_databases` all **0** |
> | with a tenant pinned | 2 of 3 projects — exactly that tenant's |
> | rows from other tenants | **0** |
>
> That is tenant isolation actually enforced by Postgres rather than by
> application predicates. `test` and `production` still need the same treatment.


Neon branches copy roles from the parent at branch time, so a role created on
`dev` does **not** appear on `test` or `production`. Run this once per branch:
`dev` (br-shy-rain-ahpucki7), then `test` (br-cool-tree-ah2jvrqf), then
`production` (br-fancy-band-ahrwpxhj).

Run it as `neondb_owner` — it has CREATEROLE and owns every table, so it can
both create the role and grant on them.

```sql
CREATE ROLE ezbuildr_app LOGIN PASSWORD '<generate a strong one>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO ezbuildr_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ezbuildr_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ezbuildr_app;

-- Future tables created by migrations (which keep running as neondb_owner).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ezbuildr_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ezbuildr_app;
```

Deliberately no DDL rights: migrations continue to run as `neondb_owner`, which
is already how `db:migrate` is wired.

**Verify before going further — this is the step that catches the UI mistake:**

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='ezbuildr_app';
-- MUST be: f | f

SELECT g.rolname FROM pg_auth_members m
  JOIN pg_roles r ON r.oid=m.member JOIN pg_roles g ON g.oid=m.roleid
 WHERE r.rolname='ezbuildr_app';
-- MUST be EMPTY. Any row here — especially neon_superuser — means it bypasses RLS.
```

Then prove it actually enforces, rather than assuming:

```sql
SET ROLE ezbuildr_app;
SELECT count(*) FROM projects;                      -- expect 0 (no tenant GUC set)
SELECT set_config('app.current_tenant_id', '<a real tenant uuid>', false);
SELECT count(*) FROM projects;                      -- expect only that tenant's rows
RESET ROLE;
```

A zero on the first count is the whole initiative working. If it returns
everything, the role bypasses RLS and nothing below is safe to do.

---

## 3. Sequence, per environment

> ✅ **`dev` IS CUT OVER — enforcement is live there as of 2026-08-22 21:19 UTC.**
>
> | | |
> |---|---|
> | `DATABASE_URL` | `ezbuildr_app` (NOBYPASSRLS) |
> | `ADMIN_DATABASE_URL` | `neondb_owner` (BYPASSRLS) |
> | `MIGRATION_DATABASE_URL` | `neondb_owner` |
> | `RLS_ENFORCED` | `true` |
> | boot log | `Admin DB: initialized.` ✅ |
> | `/health` | healthy, `database.connected: true` |
> | live connections | `ezbuildr_app` ×4 (app), `neondb_owner` ×5 (admin + migrations) |
>
> It took **two** deploys. The first FAILED on
> `CREATE SCHEMA IF NOT EXISTS "drizzle"` — see §3 step 2 on
> `MIGRATION_DATABASE_URL`. `test` and `production` are untouched.


Do **dev** end to end and live on it before touching `test`, then `production`.

1. **Neon:** create and verify `ezbuildr_app` on the branch (§2).
2. **Railway** (that environment's variables). Set all four in ONE change, so
   there is never a window where the app role is live without the admin URL:
   - `ADMIN_DATABASE_URL` = the **current** `DATABASE_URL` value (the
     `neondb_owner` string). Copy it before changing anything.
   - `MIGRATION_DATABASE_URL` = the same owner string. **Do not skip this.**
     Container start runs `npm run db:migrate`, which needs DDL; the app role
     has none, so without it the deploy dies on
     `CREATE SCHEMA IF NOT EXISTS "drizzle"` and the release never boots.
     Measured on dev — production would have failed identically.
   - `DATABASE_URL` = the new `ezbuildr_app` string.
   - `RLS_ENFORCED` = `true`.
   Set all three, then `railway redeploy` — env-var changes do not take effect
   without it.
3. **Confirm at boot:** the log must contain `Admin DB: initialized.` If it
   does not, `ADMIN_DATABASE_URL` did not take and the admin console is about
   to show one tenant. Stop and fix before anyone uses it.
4. **Exercise it** (§4).

Use the same connection host as the existing `DATABASE_URL` — if it is a
`-pooler` host, keep the pooler. The app's tenant GUC is set with
`set_config(…, is_local => true)`, which is transaction-scoped and therefore
safe under PgBouncer transaction pooling. (A session-level `SET` would not be,
which is why CLAUDE.md forbids one. Nothing to change here — just do not
"simplify" it later.)

---

## 4. Verification, per environment

### 4.0 Pre-flight: is there anything to enforce? (added 2026-08-25)

**Run this BEFORE the role swap, on every branch, and do not skip it.** Every
other check on this page passes trivially against a database whose policies are
inert, because a non-owner role seeing "only its tenant's rows" and a non-owner
role seeing rows that were never filtered are indistinguishable when the tenant
happens to own them.

```sql
SELECT count(*) FILTER (WHERE true)                    AS policy_tables,
       count(*) FILTER (WHERE c.relrowsecurity)        AS enabled,
       count(*) FILTER (WHERE c.relforcerowsecurity)   AS forced
  FROM (SELECT DISTINCT polrelid FROM pg_policy) p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public';
```

**All three numbers must be equal.** Anything else means policies exist that
Postgres is not evaluating.

This is not hypothetical. Measured on the `dev` branch 2026-08-25:
`policy_tables = 37, enabled = 1, forced = 0` — 36 policies defined and inert,
including `projects`, `users`, `workflows` and `connections`. The app role had
already been live there for three days against tables with RLS switched off.
`0041_rls_enable_all_policy_tables` repairs it and fails loudly if any table is
left behind; this query is how you confirm the repair reached a given branch.

Rollback for 0041 alone, if a branch needs to be stood down without reverting
the role swap:

```sql
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT c.oid::regclass AS t FROM pg_policy p
             JOIN pg_class c ON c.oid=p.polrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public'
  LOOP
    EXECUTE format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY', r.t);
    EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', r.t);
  END LOOP;
END $$;
```

### 4.1 Roles

Database side:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
 WHERE rolname IN ('ezbuildr_app','neondb_owner');
--  ezbuildr_app | f | f     <- the app
--  neondb_owner | f | t     <- the admin bypass path
```

Application side — both halves matter, and the second is the one that fails
quietly:

- Sign in as a user in tenant A: you must **not** see tenant B's projects.
- Open the admin console: it must still list **all** tenants. A short but
  plausible list here means `ADMIN_DATABASE_URL` is not in effect.
- Run one interview end to end, upload a template, and generate a document.
  Those exercise the multipart, run-token and background paths that this
  initiative found the most bugs in.

Watch the logs for `not found` on things that plainly exist — under
enforcement that is what an unscoped read looks like, and it is the signature
of anything still missed.

---

## 5. Rollback

Fast and total: repoint `DATABASE_URL` back to the `neondb_owner` string you
copied in §3, set `RLS_ENFORCED=false`, redeploy. `neondb_owner` has BYPASSRLS,
so every policy goes inert immediately — exactly today's behaviour. Nothing is
dropped and no data moves, so the rollback is a variable change and a redeploy,
not a migration.

No migration needs reverting. Every policy added in 0026-0036 is inert while
the connection is the owner and FORCE is off, which is why they have been safe
to ship incrementally all along.

---

## 6. Known open item

[`RLS_HANDOFF.md`](../architecture/RLS_HANDOFF.md) §4 documents an intermittent "Registration failed" in full
restricted test runs, cause not yet found, with same-connection instrumentation
left in `auth.routes.ts` to catch it. It has never been observed outside the
test harness. **It is not a reason to delay dev**, but get it understood before
production — a registration path that fails one time in N is not something to
discover from customer reports.
