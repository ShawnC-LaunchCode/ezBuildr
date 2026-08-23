# Environment split & real tenant isolation (ENV / RLS) — closed portion

**Partial retire, 2026-08-23.** This initiative is **not fully closed**: `RLS-4`
is still open for **production** and lives on in
[`tickets/ENVIRONMENTS_AND_RLS_TICKETS.md`](../ENVIRONMENTS_AND_RLS_TICKETS.md).
Everything else — ENV-1..4 and RLS-1, 2a–2f, 3, 5, 6, 7 — is shipped, and its
detail moved here so the active board is one open ticket instead of 2,400 lines.

**Recovering a closed ticket's full text** — Finding, Preferred fix, acceptance
criteria and dated verification notes:

```bash
git log -p -- tickets/ENVIRONMENTS_AND_RLS_TICKETS.md
```

That works whether or not the file still exists.

**Durable engineering lessons are NOT here.** They are in
[`docs/architecture/TENANT_ISOLATION_RLS.md`](../../docs/architecture/TENANT_ISOLATION_RLS.md)
(§2a–§2g: the patterns), [`tickets/RLS_HANDOFF.md`](../RLS_HANDOFF.md) (state and
the traps that cost real time) and [`tickets/RLS4_CUTOVER.md`](../RLS4_CUTOVER.md)
(the enforcement cutover procedure). This file is the closure record.

---

## What the initiative achieved

Tenant isolation moved from *"service-layer `eq(tenantId, …)` predicates that a
developer must remember"* to *"the database refuses"*, on dev and test.

| | before | after |
|---|---|---|
| RLS policies | defined, inert (owner bypasses) | enforced on dev + test |
| Integration suite as a non-owner role | 26 of 124 files passing | **124 / 124**, allowlist empty |
| Enforcement regression gate | none | `npm run test:rls-gate`, green in CI |
| Production defects found | — | ~20, nearly all failing **silently** |

The defects are the part worth remembering, because they share a shape: under
enforcement an unscoped read returns **empty** rather than erroring, so features
fail by going quiet. API integrations 404'd, Read Table blocks returned empty
lists, every background job processed nothing while reporting success, the admin
console showed one tenant, external sends could not find their destination,
DocuSign webhooks retried forever, and run analytics silently stopped recording.

---

## Closed — do not re-file

| ID | Title | Closed |
|---|---|---|
| ENV-1 | dev/test Railway environments, each with its own database | 2026-08-22 |
| ENV-2 | Prove the migration chain reproduces production's schema | 2026-08-15 |
| ENV-3 | Per-environment secrets + the live storage configuration | 2026-08-22 |
| ENV-4 | Branch protection, and making `test` mean something | 2026-08-15 |
| RLS-1 | Register the tenant-context middleware | 2026-08-18 |
| RLS-2a | Service-boundary tenant transaction, piloted on CollectionService | 2026-08-18 |
| RLS-2b | Rollout: DataVault cluster + TransferService | 2026-08-19 |
| RLS-2c | Rollout: collections/records + misc clusters | 2026-08-19 |
| RLS-2d | Rollout: org/access cluster | 2026-08-19 |
| RLS-2e | Rollout: workflow/template cluster — rollout complete | 2026-08-20 |
| RLS-2f | The call-site sweep | 2026-08-21 |
| RLS-3 | Repair policy coverage (24 of 26 tenant tables unprotected) | 2026-08-18 |
| RLS-5 | Gate: full integration as the non-owner role | 2026-08-22 |
| RLS-6 | Cross-tenant read path for the admin console, audited | 2026-08-19 |
| RLS-7 | Route admin cross-tenant operations through `adminDb` | 2026-08-22 |

### Withdrawn findings — these were WRONG, do not re-file

- **"RLS is enabled on more tables than the policies cover, so those tables
  deny-all."** False. `migrations/0001_enable_rls.sql`'s `FOREACH` loop runs
  *both* `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` for every table in its
  array. The error came from counting literal `CREATE POLICY` occurrences (4)
  without noticing one sits inside a loop covering 24 tables.
- **"Branch protection is off."** False, and it misled several audits. The
  legacy `…/branches/main/protection` API returns 404 *"Branch protection has
  been disabled"* for a repo using **rulesets**, which this one has since
  2026-08-13. Query `gh api repos/ShawnC-LaunchCode/ezBuildr/rulesets`.
- **"Migration 0001 is broken — production has 9 policies, the chain yields
  36."** The chain is correct; production is simply behind on migrations. Same
  for `test` until 2026-08-23.
- **"`STORAGE_DRIVER=s3` is unset in production, causing 404s on documents."**
  It has been set since 2026-08-04. There was no 404 incident — only missing
  evidence, which ENV-3 AC4 finally supplied.
- **"A stale `gotenberg:8` image explains the CI-only `pdfFidelity` failure."**
  Tested and false: pulling the current image still passes locally. See the
  scoped-retry rationale in `tests/integration/hardening/pdfFidelity.test.ts`.

---

## Parked entries

### ENV-B1 — `dev.ezbuildr.com` / `test.ezbuildr.com` do not resolve · `operational`

Both are registered on the Railway service with `sync_status: ACTIVE`, but the
registrar records were never created, so certificates sit at
`CERTIFICATE_STATUS_TYPE_VALIDATING_OWNERSHIP` (NXDOMAIN verified 2026-08-15).
Records required:

```
CNAME dev  → t46dsnmf.up.railway.app   TXT _railway-verify.dev  = railway-verify=4c13d8da…
CNAME test → aiq8x4lt.up.railway.app   TXT _railway-verify.test = railway-verify=0e402974…
```

Both environments are reachable meanwhile at their `.up.railway.app` hosts.
**Owner decision 2026-08-15: leave for now.**

**Next step:** create the DNS records at the registrar, then ENV-B2 below.

### ENV-B2 — activating those subdomains requires moving `BASE_URL`/`ALLOWED_ORIGIN` · `operational`

Both currently point at `ezbuildr-prod-{dev,test}.up.railway.app` while
`RAILWAY_PUBLIC_DOMAIN` is the branded host, so OAuth callbacks and CORS would
reject the branded host — the same class of defect as O-2.

**Next step:** do it in the same change as ENV-B1, never separately.

### ENV-B3 — `/health` cannot distinguish environments · `informational`

All three environments run `NODE_ENV=production`, so every one reports
`"environment": "production"`. Anything verifying *"am I hitting dev or prod?"*
must compare the **host or the database**, not `/health`. Confirmed again
2026-08-22 — dev, test and production all report `production`.

**Next step:** none. Recorded so it is not rediscovered as a bug.

### RLS-B1 — the restricted integration suite is not deterministic · `needs-initiative`

Roughly two files per full restricted run die in `setupIntegrationTest` with
`Registration failed`, and *which* files differ every run. The underlying error
is `users`' WITH CHECK rejecting registration's `tenant_id = NULL` insert, which
can only happen if `app_current_tenant()` is non-NULL on that connection.

Three explanations are **eliminated** — do not re-test them: an async-context
leak (`setupIntegrationTest` mounts `rlsContext`, which opens a fresh store per
request), a session-level GUC (every `set_config` in the repo passes
`is_local = true`), and a leaked open transaction (probed: no older transaction,
no assigned xid, across 196 registrations).

Same-connection instrumentation is left in `server/routes/auth.routes.ts` to
capture it next time it fires. **This is why the RLS gate is advisory rather
than a required check** (RLS-5 AC3).

**Next step:** read the `RLS-5: registration insert rejected` log the next time
a full restricted run goes red; it prints the schema, role and GUC on the
failing connection.

### RLS-B2 — `records` · **not a separate entry — see `DV-B3`**

Tracked as `DV-B3` (`backlog/DATAVAULT.md`), where it has been filed twice
already. This initiative adds one fact: it is in the RLS table array and now
carries a policy. Whether it holds real tenant data or is vestigial was never
established. **Do not open a third entry for it.**

**Next step:** decide vestigial-or-not before anyone builds on it. Note
`db-holds-only-test-data` applies — there are no legacy production rows to
migrate.

### RLS-B3 — `DEBT-11` is superseded by this initiative · `wont-fix`

`DEBT-11` ("RLS policies defined but not enforced", `product-decision`) described
exactly the state this initiative removed on dev and test. Resolve it as
**promoted and delivered** rather than leaving it parked, or the next audit
re-files it.

**Next step:** strike `DEBT-11` from `backlog/TECH_DEBT.md` when production is
cut over.

### RLS-B4 — background workers are not requests · `informational` (delivered)

Filed as a warning that `RunCompletionJobWorker` and friends run outside any
HTTP request and would need a tenant path of their own. **This happened exactly
as predicted** and is now solved by `server/utils/forEachTenant.ts`: jobs
enumerate tenants and run once per tenant in that tenant's scoped transaction,
rather than being handed a bypass role.

Kept because the reasoning still governs any *new* background job, and because
the failure mode is invisible — an unscoped job completes successfully having
processed nothing.

**Next step:** none. Read `forEachTenant`'s header before adding a scheduled job.
