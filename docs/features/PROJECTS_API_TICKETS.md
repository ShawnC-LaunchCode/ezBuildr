# Projects API — Hardening Tickets (PROJ-1..6 + backlog)

Source: read-only code audit of the projects API slice, 2026-07-15.
Scope: `server/routes/projects.routes.ts`, `server/services/ProjectService.ts`,
`server/repositories/ProjectRepository.ts`, plus their directly-referenced
helpers (`server/utils/routeErrors.ts`, `server/utils/pagination.ts`,
`server/utils/ownershipAccess.ts`, `AclService.resolveRoleForProject`) read
only as needed to verify findings. Nothing outside this slice was audited.
Overall grade at audit time: **B-** (clean 3-tier layering, consistent
`classifyRouteError` usage, and Zod validation on every body — but one real
authorization bypass, a broken legacy ownership-transfer path, a non-atomic
multi-table cascade, and pagination that advertises a cursor it never accepts).

Every finding below was verified against the working tree at audit time with
file:line evidence, and the four load-bearing claims (PROJ-1/2/3/5) were
independently re-verified by the reviewer on 2026-07-15. Line numbers may
drift as fixes land — search for the quoted code if a reference is stale.

---

## Decisions (resolved by Shawn, 2026-07-15)

The three judgment calls raised during ticket generation were decided before
dispatch; the tickets below are written to these decisions. Do not re-litigate
them inside a ticket — if implementation reveals a conflict, stop and escalate.

1. **PROJ-1 — both halves.** Enforce the org-admin gate inside
   `ProjectService.updateProject` (covers every caller) **and** remove
   `status` from the PUT/PATCH body schema (dedicated `/archive` /
   `/unarchive` become the only way to change archival state). The app's own
   client already uses the dedicated endpoints (`client/src/lib/vault-api.ts:310-314`),
   so in-app impact is nil; external callers PATCHing `status` will start
   getting their field ignored/rejected — acceptable.
2. **PROJ-2 — deprecate the legacy endpoint.** `PUT /:projectId/owner` and
   `ProjectService.transferProjectOwnership` are removed outright rather than
   fixed. Grep verified zero client callers and only the route itself calls
   the service method. `POST /:projectId/transfer` is the one transfer path.
3. **PROJ-5 — keep soft-delete, fix the contract.** DELETE stays an archive;
   docs/comments become honest. The deleted-vs-archived distinction
   (`deletedAt` column + owner-gated resurrect) is parked as Backlog **B6**,
   not smuggled into this ticket.

---

## How to work this document

- **Tickets are grouped into 2 phases**, ordered by risk and dependency. Do
  not start a phase until the previous phase's **Phase Gate** has been
  verified and committed by the reviewer.
- Each ticket has: **Finding** (what is wrong, with evidence), **Preferred
  fix** (the approach the reviewer expects — deviate only with a stated
  reason), **Ties** (related tickets/skills/docs — load the named skills
  before touching code), and **Acceptance criteria** (all must pass).
- Repo-specific rules:
  - Load the `add-api-endpoint` skill before touching anything under
    `server/routes/`, `server/services/`, or `server/repositories/` — it
    carries the error-string contract (`classifyRouteError` maps
    `"not found"` → 404 and `"Access denied"`/`"Only the"` → 403; any other
    wording silently becomes a 500).
  - Load the `run-tests` skill before running any test — naive `npm test` is
    wrong here. The relevant entrypoints are `npm run test:fast` (no DB) and
    `npm run test:integration` (needs the Docker PG on port 5434 via
    `npm run test:docker:up`; `TEST_DATABASE_URL` applies).
  - Existing coverage for this slice lives in
    `tests/integration/api.projects.test.ts` and
    `tests/integration/transferOwnership.test.ts` — extend these rather than
    creating parallel files.
  - Gates: `npm run type-check` (0 errors) and `npm run lint` (0 errors).
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | Authorization & data-integrity correctness | PROJ-1..3 | ~2 dev-days |
| 2 | API contract & route hygiene | PROJ-4..6 | ~1 dev-day |
| 3 | Repository & ACL cleanup (from backlog) | PROJ-7..9 | ~1 dev-day |
| Backlog | Not phase-gated (B4/B6 parked) | B4, B6 | — |

---

# Phase 1 — Authorization & data-integrity correctness

Fixes where the code permits something it shouldn't or can leave the database
in a half-transferred state. Out of scope for this phase: pagination, doc
mismatches, and route-file refactors (Phase 2), and anything outside the
projects slice (workflow/datavault services are touched only where
`ProjectService.transferOwnership` already writes to them).

## PROJ-1 — Generic update bypasses the org-admin archive gate ✅

**Priority: P0 (bug)** · Size: S–M · Files: `server/services/ProjectService.ts`, `server/routes/projects.routes.ts`

> **Verified & closed 2026-07-15 (reviewer).** Both halves of Decision #1 landed:
> service-level gate in `updateProject` (mirrors `archiveProject`'s
> `Access denied:` prefix → 403) + `status` removed from the update body schema
> and both route handlers. Reviewer re-ran the gate independently: `type-check`
> 0 errors, `lint` clean (`--max-warnings 0`), `api.projects.test.ts` **13/13
> passed** on Docker PG 5434. Live path exercised via supertest against the real
> app with real JWT bearer tokens (PATCH & PUT with `status:'archived'` by a
> non-admin edit-role member → 200, row stays `active`; non-admin service
> archive → `Access denied`; admin archive → succeeds). Sole production callers
> of `updateProject` are the two route handlers (now status-free), so no
> regression path. Committed as its own commit.

### Finding

Archive, unarchive, and delete all enforce an extra gate for org-owned
projects — `server/services/ProjectService.ts:150-157`:

```ts
async archiveProject(projectId: string, userId: string): Promise<Project> {
  const project = await this.verifyProjectAccess(projectId, userId, 'edit');
  await this.requireOrgAdminForOrgOwnedProject(project, userId, 'archive');
```

But the generic update path enforces only `edit` —
`server/services/ProjectService.ts:139-146`:

```ts
async updateProject(
  projectId: string,
  userId: string,
  data: Partial<InsertProject>
): Promise<Project> {
  await this.verifyProjectAccess(projectId, userId, 'edit');
  return this.projectRepo.update(projectId, data);
}
```

And both `PUT` and `PATCH /api/projects/:projectId` happily convert a `status`
field into an archive — `server/routes/projects.routes.ts:243` and `:276`:

```ts
...(parsed.status !== undefined && { status: parsed.status, archived: parsed.status === 'archived' }),
```

Consequence: a non-admin org member holding an `edit` ACL entry (granted via
`PUT /:projectId/access`) can archive or unarchive an org-owned project by
sending `PATCH { "status": "archived" }`, even though the dedicated
`/archive` and `/unarchive` endpoints would reject them with 403. The
org-admin gate is decoration.

### Preferred fix

Per Decision #1, both halves:

1. **Service (the security fix):** in `ProjectService.updateProject`, when
   `data.status` or `data.archived` would change the archival state, apply
   the same `requireOrgAdminForOrgOwnedProject(project, userId,
   'archive'|'unarchive')` check the dedicated methods use — mirror
   `archiveProject` at `ProjectService.ts:150-157`, including its exact
   `Access denied:` error prefix so `classifyRouteError` yields 403.
   `verifyProjectAccess` already returns the `Project`, so no extra query is
   needed. This stays even after step 2, as defense-in-depth for any future
   caller of `updateProject`.
2. **Route schema (the hygiene fix):** remove `status` from
   `updateProjectBodySchema` and delete the `status → archived` spread lines
   at `projects.routes.ts:243` and `:276`. `/archive` and `/unarchive` become
   the only route-level way to change archival state. Requests still sending
   `status` get the field ignored (schema strips it) — do not add a bespoke
   400 for it.

### Ties

- Decision #1 above (resolved — implement as written).
- PROJ-6 refactors the same routes' handler bodies — sequence PROJ-6 after
  this ticket to avoid conflicts in `projects.routes.ts`.
- Load skills: `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. Direct service call `updateProject(id, user, { status: 'archived' })` (or
   `archived: true`) by a non-admin org member on an org-owned project throws
   the `Access denied:` error (→ 403); an org admin still succeeds.
2. `PATCH` and `PUT /api/projects/:projectId` no longer accept `status`: a
   body containing `status: 'archived'` results in **no archival change**
   (row stays active) and otherwise-valid fields still apply.
3. Title/description-only updates by an `edit`-role user are unaffected
   (still 200).
4. New integration tests in `tests/integration/api.projects.test.ts` assert
   1–3 (org-owned project fixture + non-admin member, mirroring the existing
   "Tenant Isolation" describe block's fixture style at line 202).
5. `npm run test:integration` green for the projects file;
   `npm run type-check` 0 errors; `npm run lint` clean.

---

## PROJ-2 — Remove the legacy ownership-transfer endpoint (it never actually transfers) ✅

**Priority: P1** · Size: S–M · Files: `server/routes/projects.routes.ts`, `server/services/ProjectService.ts`

> **Verified & closed 2026-07-15 (reviewer).** Per Decision #2 the endpoint was
> removed, not repaired: `PUT /:projectId/owner` handler + inline schema deleted,
> `ProjectService.transferProjectOwnership` deleted, `EPIC4_TEAMS_SHARING_TESTING.md`
> curl example repointed to `POST /:projectId/transfer` (workflow `/owner`
> untouched; API_ENDPOINTS.md/API.md never documented the project endpoint).
> Reviewer re-verified: `grep -rn transferProjectOwnership server/ client/ tests/`
> → nothing; `type-check` 0 errors; `lint` clean (confirms no orphaned imports);
> `api.projects.test.ts` + `transferOwnership.test.ts` **24/24 passed**, the
> latter byte-for-byte unmodified (surviving `/transfer` endpoint intact).

### Finding

`PUT /api/projects/:projectId/owner` calls
`transferProjectOwnership`, which updates only the legacy `ownerId` column —
`server/services/ProjectService.ts:259-268`:

```ts
const project = await this.verifyProjectAccess(projectId, currentOwnerId, 'owner');
await this.requireOrgAdminForOrgOwnedProject(project, currentOwnerId, 'transfer');
return this.projectRepo.update(
  projectId,
  {
    ownerId: newOwnerId,
  },
  tx
);
```

But owner resolution treats *four* fields as owner-grade —
`server/services/AclService.ts:85-92`:

```ts
if (
  project.ownerId === userId ||
  project.createdBy === userId ||
  project.creatorId === userId ||
  (project.ownerType === "user" && project.ownerUuid === userId)
) {
  highestRole = "owner";
}
```

Consequences: (a) the "old" owner keeps full owner rights forever via
`createdBy`/`creatorId`/`ownerUuid`, so the transfer removes nothing; (b) the
new-model `ownerType`/`ownerUuid` columns — which drive list queries
(`ProjectRepository.findByCreatorId:49-52`) and the RLS work — are left
pointing at the old owner, so the transferred project may not even appear in
the new owner's project list; (c) the body validates `userId` as a bare
string with no existence check, so a typo silently "transfers" to nobody.

Reviewer-verified blast radius: **zero client callers** of
`/projects/:id/owner`, and `transferProjectOwnership` has exactly one caller —
the route itself (`projects.routes.ts:474`).

### Preferred fix

Per Decision #2, deprecate rather than repair:

1. Delete the `PUT /api/projects/:projectId/owner` route handler and its
   inline body schema from `projects.routes.ts` (the endpoint 404s like any
   unknown route — no 410 stub needed given zero known callers).
2. Delete `ProjectService.transferProjectOwnership` (`ProjectService.ts:253-268`).
3. Sweep docs: update `docs/claude/API_ENDPOINTS.md`, `docs/api/API.md`, and
   `docs/reference/EPIC4_TEAMS_SHARING_TESTING.md:275` (curl example) to
   remove/redirect references to the project-owner endpoint; point at
   `POST /api/projects/:projectId/transfer` instead. Note: the *workflow*
   `/owner` endpoint is out of scope — projects only.
4. If any test exercises the removed endpoint (grep `tests/` for
   `projects/.*owner`), delete or repoint it to `/transfer`.

### Ties

- Decision #2 above (resolved — remove, don't fix).
- PROJ-3 rewrites `transferOwnership` in the same service file — coordinate;
  both are Phase 1 but touch different methods.
- Backlog B4 (legacy creator fields grant permanent owner) is the surviving
  piece of this problem and is explicitly out of scope here.
- Load skills: `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. `PUT /api/projects/:projectId/owner` no longer exists (route removed;
   request yields the router's standard unknown-route response).
2. `transferProjectOwnership` is gone from `ProjectService` and nothing in
   `server/`, `client/`, or `tests/` references it
   (`grep -rn transferProjectOwnership` returns nothing).
3. Docs listed in the Preferred fix no longer document the endpoint.
4. `POST /api/projects/:projectId/transfer` behavior is untouched
   (`tests/integration/transferOwnership.test.ts` green, unmodified).
5. `npm run test:integration` green for the touched files;
   `npm run type-check` 0 errors; `npm run lint` clean.

---

## PROJ-3 — New-model transfer cascade is not atomic ✅

**Priority: P1** · Size: M · File: `server/services/ProjectService.ts`

> **Verified & closed 2026-07-15 (reviewer).** Everything after `validateTransfer`
> now runs in one `db.transaction`; every in-callback query uses `tx` (reviewer
> read the full diff — no `db.*` leak that would deadlock the size-1 pool), auth
> reads stay outside, and the per-workflow loop is now a single `inArray` bulk
> update. Dynamic imports hoisted to top-level (no TransferService cycle).
> Atomicity test injects a failure via `vi.spyOn(workflowRepository,
> 'findByProjectId').mockRejectedValueOnce` immediately after the project write
> and asserts the project + workflow ownership rolled back — a test that fails
> against the pre-fix code. Reviewer re-ran the gate: `type-check` 0 errors,
> `lint` clean, `transferOwnership.test.ts` + `api.projects.test.ts` **25/25
> passed**. Deviation (accepted): spy targets `findByProjectId`, not
> `workflowRepo.update`, because the fix removed the per-workflow update loop —
> same injection class, retargeted to a query that still exists post-fix.

### Finding

`transferOwnership` (`POST /:projectId/transfer`) performs a long sequence of
independent writes with no transaction — `server/services/ProjectService.ts:300-322`:

```ts
const updatedProject = await this.projectRepo.update(projectId, {
  ownerType: targetOwnerType,
  ownerUuid: targetOwnerUuid,
});
// Cascade: Transfer all child workflows to same owner
const workflows = await this.workflowRepo.findByProjectId(projectId);
const workflowIds = workflows.map(w => w.id);
if (workflowIds.length > 0) {
  // Update workflows
  for (const workflow of workflows) {
    await this.workflowRepo.update(workflow.id, { ... });
  }
```

…followed by further un-wrapped `db.update` calls on `workflow_runs`
(:316-322), `datavault_databases`, and `datavault_tables`. A failure partway
(network blip, constraint violation) leaves the project owned by the target
org while some workflows, runs, and DataVault assets still belong to the old
owner — an inconsistent authorization state that no retry cleans up, since
re-running requires the *caller* to still pass `verifyProjectAccess` on the
half-transferred project. The per-workflow `for` loop is also O(n)
round-trips where a single `inArray` update works (the runs update at
:316-322 already does it correctly).

### Preferred fix

Wrap everything after `validateTransfer` in a single `db.transaction(tx =>
…)`, threading `tx` through the repository calls — `projectRepo.update`,
`workflowRepo.update`, and the raw `db.update` statements all already accept
or can use a `tx`/`DbTransaction` (see the `tx?: DbTransaction` params
throughout `ProjectRepository.ts` and the `getDb(tx)` pattern in
`BaseRepository`). Replace the per-workflow loop with one
`update(workflows).set({...}).where(inArray(workflows.id, workflowIds))`,
mirroring the `workflowRuns` update at :316-322. Keep the dynamic imports if
you must, but hoisting them to top-level imports is preferred (check for an
import cycle with `TransferService` first; if one exists, leave that import
dynamic with a comment). **Gotcha:** repo methods that run pool (`db.*`)
queries while inside a caller's transaction deadlock the size-1 test pool —
every query inside the callback must use `tx`, including any repo call.
Authorization checks before the transaction can stay outside it.

### Ties

- Coordinate with PROJ-2 (same file; PROJ-2 deletes the sibling method).
- Existing coverage: `tests/integration/transferOwnership.test.ts`.
- Load skills: `add-api-endpoint`, `run-tests`. If you conclude any schema
  change is needed (it should not be), stop and load `db-schema-change`
  instead of improvising.

### Acceptance criteria

1. A successful `POST /api/projects/:projectId/transfer` still transfers
   project + workflows + runs + scoped/linked DataVault assets (existing
   tests in `transferOwnership.test.ts` stay green).
2. All cascade writes execute inside one `db.transaction`; a test proves
   atomicity by forcing a failure mid-cascade (e.g. inject a failing repo via
   the service's optional-constructor-params pattern, or spy on
   `workflowRepo.update` to throw) and asserting the project's
   `ownerType`/`ownerUuid` are unchanged afterward.
3. The per-workflow update loop is replaced by a single bulk update.
4. `npm run test:integration` green for the transfer/projects files;
   `npm run type-check` 0 errors; `npm run lint` clean.

---

## Phase 1 Gate — PASSED 2026-07-15 (reviewer)

- [x] PROJ-1, PROJ-2, PROJ-3 all ✅ with dated verification notes
- [x] `api.projects.test.ts` + `transferOwnership.test.ts` **25/25** green
      (Docker PG 5434); `npm run test:fast` **1678 passed / 15 skipped / 0
      failed**; `npm run type-check` 0 errors; `npm run lint` 0 errors
- [x] Live check (reviewer note): all three behaviors are exercised through
      the integration suite, which boots the real Express app via
      `registerRoutes` and drives real JWT-authenticated HTTP —
      PATCH/PUT-with-`status` by a non-admin edit-role member → 200 with no
      archival change; `PUT /:id/owner` removed (no route); `POST /:id/transfer`
      happy path green (11 pre-existing tests). A standalone dev-server smoke
      was deemed redundant for these backend-only endpoints and was skipped to
      avoid colliding with the maintainer's own server on :5000.
- [x] Reviewer committed each passed ticket (2cc1df0b, a5f88f5e, e6e48fb1)
      + this gate

---

# Phase 2 — API contract & route hygiene

Client-visible contract fixes and route-file cleanup. No authorization
changes in this phase. Out of scope: everything in Backlog, and any endpoint
outside `projects.routes.ts`.

## PROJ-4 — GET /api/projects advertises a cursor it never accepts ✅

**Priority: P2** · Size: M · Files: `server/routes/projects.routes.ts`, `server/repositories/ProjectRepository.ts`

> **Verified & closed 2026-07-15 (reviewer).** Real end-to-end keyset
> pagination: `listProjectsQuerySchema` now extends the shared
> `paginationQuerySchema` (cursor+limit), the route decodes via
> `buildCursorWhere` and returns **400 only when a cursor is supplied and
> undecodable** (reviewer confirmed the `if (query.cursor !== undefined)` guard
> means a cursor-less request never 400s), and the in-memory slice is gone. The
> repo pushes the predicate down: `(ownership OR …) AND keyset` — reviewer
> verified the parenthesization is correct (the OR is captured as one
> `ownershipWhere` then AND'd, so the cursor binds all ownership branches, not
> just the last) — with `createdAt < ts OR (createdAt = ts AND id < id)`,
> `ORDER BY createdAt DESC, id DESC`, and `.$dynamic().limit(limit+1)`. Cursor
> round-trip is consistent (`encodeCursor`→`buildCursorWhere`→`buildKeysetCondition`
> all on `(createdAt,id)`). **Behavior change (intended, per ticket):** list
> ordering moved from `updatedAt DESC` to `createdAt DESC` so the cursor is
> stable. All four `listProjects*/findByCreatorId*` callers kept compiling via
> defaulted optional params. Reviewer re-ran the gate: `type-check` 0 errors,
> `lint` clean, `api.projects.test.ts`+`transferOwnership.test.ts` **30/30**,
> `pagination.test.ts` **24/24**. B5 (repo dedup/join asymmetry) remains
> backlog, correctly out of scope.

### Finding

The list endpoint returns a paginated envelope —
`server/routes/projects.routes.ts:117-123`:

```ts
const query = listProjectsQuerySchema.parse(req.query);
...
res.json(createPaginatedResponse(projects.slice(0, query.limit + 1), query.limit));
```

`createPaginatedResponse` (`server/utils/pagination.ts:25-41`) emits
`nextCursor` and `hasMore`, but `listProjectsQuerySchema`
(`projects.routes.ts:42-45`) has no `cursor` field — only `active` and
`limit` — so a client that follows `nextCursor` gets page 1 forever.
Meanwhile `ProjectRepository.findByCreatorId` / `findActiveByCreatorId`
(`ProjectRepository.ts:20-88, 118-186`) load **every** accessible row and the
route slices in memory, so `limit` saves bandwidth but not query cost.

### Preferred fix

Implement real cursor pagination end-to-end: add `cursor: z.string().optional()`
to the query schema (the shared `paginationQuerySchema` at
`pagination.ts:6-9` is the donor), decode with the existing
`decodeCursor`/`buildCursorWhere` helpers (`pagination.ts:53-87`), and push
`limit + 1` plus the cursor predicate down into `findByCreatorId` /
`findActiveByCreatorId` (ordering must become stable and agree with the
cursor helpers' `(createdAt, id)` convention — keep both query paths
consistent). An invalid/undecodable cursor returns **400**, not a silent
first page. If a smaller fix is agreed with the reviewer, the *minimum*
acceptable change is stopping the false advertising (no `nextCursor`
emitted) — but say so explicitly in the turn-in note.

### Ties

- Touches the same route block as PROJ-6's refactor — sequence after PROJ-6
  or coordinate.
- Backlog B5 (repository list-method duplication) may be partially resolved
  as a side effect — note in the turn-in if so.
- Load skills: `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. `GET /api/projects?limit=N` with more than N accessible projects returns
   N items, `hasMore: true`, and a `nextCursor` which, when passed as
   `?cursor=...`, returns the **next** N items with no overlap or gaps;
   iterating to exhaustion yields every project exactly once.
2. The final page returns `hasMore: false, nextCursor: null`.
3. `?active=true` and cursor compose correctly (archived rows excluded on
   every page); a garbage cursor returns 400.
4. Repository no longer returns unbounded rows for this endpoint (fetches at
   most `limit + 1`).
5. New/updated integration tests in `tests/integration/api.projects.test.ts`
   assert 1–3 (extend the existing "should support pagination" test at
   line 129, which currently only checks the envelope shape).
6. `npm run test:integration` green for the file; `npm run type-check` 0
   errors; `npm run lint` clean.

---

## PROJ-5 — DELETE claims hard delete but silently archives ✅

**Priority: P2** · Size: S · Files: `server/routes/projects.routes.ts`, `server/services/ProjectService.ts`

> **Verified & closed 2026-07-15 (reviewer).** Per Decision #3 soft-delete
> stays; only the contract changed. New private `writeArchivedState` helper is
> the single archive write path — both `archiveProject` and `deleteProject`
> delegate to it (can't drift). Route + service doc comments rewritten (no
> "hard delete" / "projectId set to null"); the edit-role-can-unarchive quirk
> is documented on both `unarchiveProject` and `deleteProject` as deliberate,
> pointing at Backlog B6. Behavior unchanged (204, `owner`+org-admin gate).
> API_ENDPOINTS.md/API.md don't document project delete → correctly no-op.
> Reviewer re-ran the gate: `type-check` 0 errors, `lint` clean,
> `api.projects.test.ts` **15/15** (adds the previously-untested 403-for-non-owner
> DELETE case).

### Finding

The route documents a hard delete with workflow detachment —
`server/routes/projects.routes.ts:332-336`:

```ts
/**
 * DELETE /api/projects/:projectId
 * Delete a project (hard delete)
 * Note: Workflows in the project will have their projectId set to null
 */
```

The service does neither — `server/services/ProjectService.ts:170-180`:

```ts
/**
 * Delete project (hard delete)
 * Note: Workflows will have their projectId set to null (on delete set null)
 */
async deleteProject(projectId: string, userId: string): Promise<void> {
  const project = await this.verifyProjectAccess(projectId, userId, 'owner');
  await this.requireOrgAdminForOrgOwnedProject(project, userId, 'delete');
  await this.projectRepo.update(projectId, {
    status: 'archived',
    archived: true,
  });
```

It is byte-for-byte the same write as `archiveProject` (:153-156), just gated
at `owner` instead of `edit`, and returns 204 as if the row were gone. The
existing integration test ("should soft-delete project",
`tests/integration/api.projects.test.ts:189`) confirms soft-delete is the
real, relied-upon behavior. Misleading contract: API consumers and future
devs will assume the row and its workflows are detached/destroyed.

### Preferred fix

Per Decision #3: keep soft-delete, fix the contract. Rewrite both doc
comments to say "soft delete — archives the project; workflows are
retained", and have `deleteProject` delegate to the same archive write path
explicitly (call a shared private helper) so the two can't drift; keep the
stricter `owner` + org-admin gate exactly as is. No behavior change to
responses (204 stays). Add a code comment noting that an `edit`-role user can
unarchive a "deleted" project — deliberate for now; the deleted-vs-archived
distinction is Backlog B6.

### Ties

- Decision #3 above (resolved — soft-delete stays).
- Backlog B6 (deletedAt distinction) is the follow-on, not this ticket.
- Same files as PROJ-1/PROJ-6 — coordinate ordering within the phase.
- Load skills: `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. Route and service doc comments accurately describe soft-delete/archive
   semantics (no "hard delete", no "projectId set to null" claims); API docs
   (`docs/claude/API_ENDPOINTS.md`, `docs/api/API.md`) match if they describe
   project delete.
2. `DELETE /api/projects/:projectId` behavior is unchanged: 204, row remains
   with `status: 'archived'`, workflows keep their `projectId`; requires
   `owner` role (a `view`/`edit`-role caller gets 403).
3. Integration test asserts the 403-for-non-owner case (currently untested)
   alongside the existing soft-delete test at `api.projects.test.ts:189`.
4. `npm run test:integration` green for the file; `npm run type-check` 0
   errors; `npm run lint` clean.

---

## PROJ-6 — PUT and PATCH update handlers are copy-paste duplicates ✅

**Priority: P2** · Size: S · File: `server/routes/projects.routes.ts`

> **Verified & closed 2026-07-15 (reviewer).** Extracted one module-level
> `handleProjectUpdate` (asyncHandler) registered for both PUT and PATCH with
> the identical middleware chain; the duplicated body is gone
> (`updateProjectBodySchema.parse` greps exactly once). Dead no-op ternary at
> the POST handler replaced with `res.status(status)`, and its now-orphaned
> `STATUS_INTERNAL` const removed (accepted deviation — direct consequence of
> removing the ternary). Reviewer re-ran the gate: `type-check` 0 errors,
> `lint` clean incl. `--report-unused-disable-directives` (the pre-existing
> `max-lines-per-function` disable is still live, no new disables),
> `api.projects.test.ts` **14/14** (adds the previously-missing PUT happy-path
> assertion).

### Finding

The `PUT /api/projects/:projectId` handler (`projects.routes.ts:233-259`) and
the `PATCH /api/projects/:projectId` handler (:266-292) are line-for-line
identical — same schema parse, same `updateData` construction:

```ts
const parsed = updateProjectBodySchema.parse(req.body);
const title = parsed.title ?? parsed.name;
const updateData = insertProjectSchema.partial().parse({
  ...(title !== undefined && { title, name: parsed.name ?? title }),
  ...(parsed.description !== undefined && { description: parsed.description }),
  ...(parsed.status !== undefined && { status: parsed.status, archived: parsed.status === 'archived' }),
});
```

Any future change must be made twice; the file already needs a
`max-lines-per-function` eslint-disable (:60) largely because of duplication
like this. There is also a dead conditional in the POST handler
(`projects.routes.ts:101`): `status === STATUS_INTERNAL ? STATUS_INTERNAL :
status` is a no-op.

### Preferred fix

Extract one shared `asyncHandler` handler constant (or a local
`handleProjectUpdate(req, res)` function) and register it for both verbs:
`app.put('/api/projects/:projectId', hybridAuth, requireUser,
validateProjectId(), updateHandler)` and the same for `app.patch`. Replace
the no-op ternary at :101 with `res.status(status)`. Pure refactor — zero
behavior change, identical middleware chain, identical error handling. Do
not "improve" anything else in passing. Note the quoted block above predates
PROJ-1; after PROJ-1 lands the `status` spread line is already gone —
dedupe whatever remains.

### Ties

- Sequence **after** PROJ-1 (it edits these handlers' bodies) and
  before/coordinated with PROJ-4 and PROJ-5, which edit the same file.
- Load skills: `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. `PUT` and `PATCH /api/projects/:projectId` are served by a single shared
   handler; the duplicated block appears once in the file
   (`updateProjectBodySchema.parse` greps exactly once).
2. Behavior identical for both verbs: valid update → 200 with project JSON;
   invalid body → 400 with Zod details; unknown project → 404; insufficient
   role → 403. Existing PATCH test (`api.projects.test.ts:162-179`) still
   green, plus a mirrored PUT assertion (currently PUT has zero coverage).
3. The dead ternary at `projects.routes.ts:101` is gone.
4. `npm run test:integration` green for the file; `npm run type-check` 0
   errors; `npm run lint` clean (no new eslint-disables).

---

## Phase 2 Gate — PASSED 2026-07-15 (reviewer)

- [x] PROJ-4, PROJ-5, PROJ-6 all ✅ with dated verification notes
- [x] `api.projects.test.ts` + `transferOwnership.test.ts` **30/30** green;
      `pagination.test.ts` **24/24**; `npm run test:fast` **1678 passed / 15
      skipped / 0 failed**; `npm run type-check` 0 errors; full-repo
      `npm run lint` clean (`--max-warnings 0`)
- [x] Live check (reviewer note): end-to-end cursor pagination is exercised by
      the integration suite (real app via `registerRoutes`, real JWT) — walks
      the cursor to exhaustion with no overlap/gaps, `?active=true` composes
      with the cursor, and a garbage cursor → 400. Standalone dev-server smoke
      skipped as redundant for a backend-only endpoint already covered by
      real-HTTP tests (same rationale as the Phase 1 gate).
- [x] Reviewer committed each passed ticket (5702f145, 97f3aeba, 1f112fcf)
      + this gate

---

# Phase 3 — Repository & ACL cleanup

Promoted from Backlog B1/B2/B3/B5 on 2026-07-15 at Shawn's direction (B4/B6
stay parked — they're ownership-model decisions for the multi-org work). No
authorization or contract behavior changes in this phase; these are dead-code
removal, type hardening, and input validation. Reviewer merged B2+B5 into one
ticket (PROJ-8) because both rework the same two list methods. All `file:line`
refs re-verified against the working tree after PROJ-1..6 landed.

## PROJ-7 — Remove dead repository methods (was B1) ✅

**Priority: P2 (dead code)** · Size: S · File: `server/repositories/ProjectRepository.ts`

> **Verified & closed 2026-07-15 (reviewer).** `findByStatus` +
> `findByCreatorAndStatus` deleted (26 lines, one file, nothing else touched).
> Reviewer re-verified: `grep` for both names in ProjectRepository.ts →
> nothing; `type-check` 0 errors (proves no caller — a dangling call wouldn't
> compile); `lint` clean. `test:fast` unchanged at 1678 pass. `findByOwner`
> and the two list methods left intact for PROJ-8.

### Finding

`ProjectRepository.findByStatus` (`ProjectRepository.ts:132`) and
`findByCreatorAndStatus` (`:143`) have zero callers repo-wide — a
`grep` for both names returns only their definitions plus the unrelated
same-named methods on `WorkflowRepository` (a different class). They are
plain dead code.

### Preferred fix

Delete both methods and their JSDoc. Nothing else — do not touch the
still-used `findByOwner`/`findByCreatorId`/`findActiveByCreatorId`.

### Ties

- PROJ-8 also edits this file (the list methods) — sequence PROJ-8 after this
  ticket to keep diffs clean.
- Load skills: `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. `findByStatus` and `findByCreatorAndStatus` are gone from
   `ProjectRepository`; `grep -rn "findByStatus\|findByCreatorAndStatus"
   server/repositories/ProjectRepository.ts` returns nothing.
2. No caller anywhere breaks (there were none) — `npm run type-check` 0 errors.
3. `npm run lint` clean; `npm run test:fast` green.

---

## PROJ-8 — Consolidate list methods & type the ownerName join (was B2 + B5) ✅

**Priority: P2** · Size: M · Files: `server/repositories/ProjectRepository.ts`, `server/services/ProjectService.ts`

> **Verified & closed 2026-07-15 (reviewer).** One private
> `buildOwnershipWhere(db, creatorId, orgIds, activeOnly)` helper now backs both
> `findByCreatorId` and `findActiveByCreatorId`; `statusCondition` is `undefined`
> when `activeOnly=false` and `and()` drops it, so each branch reproduces the
> old SQL exactly. Reviewer traced all four ownership branches (user/org/ACL/legacy)
> against the pre-consolidation code — equivalent — and confirmed
> `findActiveByCreatorId` keeps PROJ-4's `.$dynamic().limit(limit+1)` +
> `(createdAt,id)` keyset/ordering (the active list now also does the org join
> and returns `ownerName`, the one intended additive change). `ProjectWithOwnerName`
> exported and used across `findByCreatorId`/`findActiveByCreatorId`/`findByOwner`
> and the three ProjectService list return types; all `as any` gone
> (`grep "as any"` → empty). Reviewer re-ran the gate: `type-check` 0 errors, no
> new suppressions, `lint` clean, `api.projects.test.ts` **19/19** (both PROJ-4
> pagination tests + new active-list `ownerName` assertion green).

### Finding

Two related problems in the same code:

**Duplication + shape asymmetry (B5).** `findByCreatorId`
(`ProjectRepository.ts:47-128`) and `findActiveByCreatorId` (`:158-238`) build
a near-identical ownership `conditions` array + `sharedProjectIds` subquery,
differing only by an `eq(projects.status,'active')` predicate. They have
already drifted: `findByCreatorId` left-joins `organizations` and returns
`ownerName`, but `findActiveByCreatorId` does a plain
`.select().from(projects)` with **no `ownerName`** — so the "all" list and the
"active" list return differently-shaped rows for the same UI.

**Untyped join results (B2).** Because `ownerName` isn't on the `Project`
type, `findByCreatorId` (`:126-127`) and `findByOwner` (`:272-273`) both end
with `return results as any` behind an eslint-disable.

### Preferred fix

1. Define and export `type ProjectWithOwnerName = Project & { ownerName:
   string | null }` in `ProjectRepository.ts`.
2. Extract one private helper that builds the ownership `conditions` +
   `sharedProjectIds` subquery, parameterized by `creatorId`, `orgIds`, and an
   `activeOnly: boolean` that appends `eq(projects.status,'active')` — preserve
   today's exact row set. Reimplement `findByCreatorId` and
   `findActiveByCreatorId` on it; **both** now include the `organizations` left
   join and return `ProjectWithOwnerName[]` (this intentionally fixes the
   missing-`ownerName` asymmetry on the active list — call it out in the
   turn-in). Keep the PROJ-4 keyset/ordering/`limit+1` logic intact and
   identical across both.
3. Type `findByOwner`'s return as `ProjectWithOwnerName[]` too. Remove all
   `as any` casts and their eslint-disable lines — prefer a typed
   `.select({ ...getTableColumns(projects), ownerName: organizations.name })`
   over any cast; if a cast is truly unavoidable, cast to the named type,
   never `any`.
4. Update `ProjectService.listProjects`/`listActiveProjects`/
   `listOrganizationProjects` return types to `Promise<ProjectWithOwnerName[]>`
   (they currently claim `Promise<Project[]>` while returning the wider rows).
   The route JSON shape is unchanged for the "all" list and `findByOwner`; the
   active list *gains* `ownerName`, which is additive — do not change route code.

### Ties

- Sequence **after** PROJ-7 (same file).
- Touches `ProjectService.ts` return types — coordinate with PROJ-9 (also in
  that file); sequence PROJ-9 after this or keep the edits disjoint.
- Backlog B4/B6 are out of scope.
- Load skills: `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. The ownership `conditions`/`sharedProjectIds` logic exists in exactly one
   place; `findByCreatorId`/`findActiveByCreatorId` both call the shared helper.
2. `grep -rn "as any" server/repositories/ProjectRepository.ts` returns
   nothing; the `no-explicit-any` eslint-disables in this file are gone.
3. `findActiveByCreatorId` returns the same **rows** as before for all
   ownership paths (user-owned, org-owned, ACL-shared incl. team, legacy
   fallback) and still excludes archived rows — now with `ownerName` populated
   for org-owned rows. Cursor pagination from PROJ-4 still works on both.
4. Existing `api.projects.test.ts` pagination/list tests stay green; add an
   assertion that the active list now carries `ownerName` for an org-owned
   project.
5. `npm run type-check` 0 errors (no new suppressions anywhere);
   `npm run lint` clean; `api.projects.test.ts` green.

---

## PROJ-9 — Validate ACL principals & make grant/revoke transactional (was B3) ✅

**Priority: P2** · Size: M · Files: `server/routes/projects.routes.ts`, `server/services/ProjectService.ts`

> **Verified & closed 2026-07-16 (reviewer).** Both access endpoints now
> validate `principalId: z.string().uuid()` and cap `entries` `.min(1).max(50)`.
> `grantProjectAccess`'s `role` typed as `Exclude<AccessRole,'none'>`. Grant and
> revoke each keep the owner-gate as the first await (outside any tx), then use
> the `if (tx) reuse; else db.transaction(...)` pattern delegating to a private
> `_impl` where every repo call uses the tx — reviewer confirmed this matches
> the `DatavaultRowsService` precedent and honors the size-1 pool-deadlock rule.
> Rollback test grants `[valid, valid, invalid-role]`, expects rejection, and
> reads back `project_access` = **0 rows** (proves entries 1–2 rolled back, not
> just entry 3 skipped) — fails against non-transactional code. The one `as any`
> is an isolated test fixture deliberately overflowing the role column to force
> the mid-loop DB error (eslint-disable + justification; not production code).
> Reviewer re-ran the gate: `type-check` 0 errors, `lint` clean,
> `api.projects.test.ts` **25/25** (6 new: non-UUID→400 on PUT & DELETE,
> over-cap→400, empty→400, single-entry unchanged, batch rollback).

### Finding

The project-access endpoints under-validate input and write
non-atomically:

- `PUT /:projectId/access` (`projects.routes.ts:374-393`) and
  `DELETE /:projectId/access` (`:417-430`) validate `principalId` as bare
  `z.string()` (`:382`, `:425`) — no UUID check and no existence check in the
  service, so a typo upserts a dead row into `project_access`.
- `grantProjectAccess` (`ProjectService.ts:242-261`) types `role` as
  `string` (`:245`) rather than the `'view'|'edit'|'owner'` union, so a
  non-route caller could write an arbitrary role.
- Both `grantProjectAccess` (`:250-259`) and `revokeProjectAccess`
  (`:272-279`) loop over `entries` doing sequential upserts/deletes with an
  optional `tx` the routes never pass — if entry 3 of 5 fails, entries 1–2 are
  already applied (partial ACL change with a 500).

### Preferred fix

1. Routes: tighten `principalId: z.string().uuid()` on both access endpoints,
   and cap `entries` with `.min(1).max(50)`.
2. Service: change `grantProjectAccess`'s `role: string` to the proper union
   (`Exclude<AccessRole,'none'>` or `'view'|'edit'|'owner'` — match how
   `@shared/schema` defines `AccessRole`). Wrap each entry loop in one
   `db.transaction`, passing `tx` to every `projectAccessRepo` call — but
   preserve the existing optional `tx?` param: if a caller already supplies a
   `tx`, use it instead of opening a nested transaction. **Gotcha:** every
   query inside the transaction callback must use `tx` (size-1 test-pool
   deadlock — same rule PROJ-3 followed).
3. Do not change the owner-gate ordering: `verifyProjectAccess(...,'owner')`
   stays the first await in each method.

### Ties

- Coordinate with PROJ-8 (both edit `ProjectService.ts`, different methods) —
  sequence after it.
- Load skills: `add-api-endpoint`, `run-tests`.

### Acceptance criteria

1. `PUT /:projectId/access` with a non-UUID `principalId` returns **400** with
   Zod details; an out-of-enum `role` is a compile error at the service
   boundary and a 400 at the route.
2. Granting `[valid, valid, invalid-role-or-shape]` applies **nothing** (the
   transaction rolls back) — verified by reading back the ACL list.
3. An `entries` array over the cap returns 400; single-entry grant/revoke
   flows are behaviorally unchanged (same response shapes).
4. New integration tests in `api.projects.test.ts` (or a sibling) assert 1–3;
   existing access tests stay green.
5. `npm run type-check` 0 errors; `npm run lint` clean;
   `npm run test:integration` green for the projects file.

---

## Phase 3 Gate — PASSED 2026-07-16 (reviewer)

- [x] PROJ-7, PROJ-8, PROJ-9 all ✅ with dated verification notes
- [x] `api.projects.test.ts` **25/25** green; `npm run test:fast` **1678
      passed / 15 skipped / 0 failed**; `npm run type-check` 0 errors;
      full-repo `npm run lint` clean (`--max-warnings 0`)
- [x] Reviewer committed each passed ticket (c660c988, 808baa66, 0e295cf0)
      + this gate

---

# Backlog / observations

Too small or too judgment-dependent for tickets now; recorded so they aren't
lost.

- **B1 — Dead repository methods.** → **Promoted to PROJ-7** (2026-07-15).
- **B2 — `as any` returns in ProjectRepository.** → **Promoted to PROJ-8**
  (merged with B5, 2026-07-15).
- **B3 — ACL grant accepts unvalidated principals.** → **Promoted to PROJ-9**
  (2026-07-15).
- **B4 — Legacy creator fields grant permanent owner rights.**
  `AclService.resolveRoleForProject:85-92` treats `createdBy`/`creatorId` as
  owner forever, so no transfer or ACL revocation can ever fully remove the
  original creator. Deliberate-looking (legacy back-compat) but it undermines
  transfer semantics — decide posture when the ownership model is next
  revisited (ties into the multi-org isolation exploration).
- **B5 — `findByCreatorId` vs `findActiveByCreatorId` duplication.** →
  **Promoted to PROJ-8** (merged with B2, 2026-07-15).
- **B6 — Deleted vs archived distinction.** Per Decision #3: DELETE and
  archive currently produce identical rows, so an `edit`-role user can
  unarchive an owner-deleted project. Closing this properly needs a
  `deletedAt` timestamp (schema change) plus owner-gated resurrect for
  deleted projects, and possibly a retention/purge job for true deletion.
  Separate project; load `db-schema-change` when picked up.

---

## Status — Projects API hardening (2026-07-15)

| Ticket | Title | Status | Notes |
|---|---|---|---|
| PROJ-1 | Update bypasses org-admin archive gate | ✅ done | verified + committed 2026-07-15 |
| PROJ-2 | Remove legacy owner-transfer endpoint | ✅ done | verified + committed 2026-07-15 |
| PROJ-3 | Transfer cascade not atomic | ✅ done | verified + committed 2026-07-15 |
| PROJ-4 | Fake cursor pagination | ✅ done | verified + committed 2026-07-15 |
| PROJ-7 | Remove dead repository methods (B1) | ✅ done | verified + committed 2026-07-15 |
| PROJ-8 | Consolidate list methods + type join (B2+B5) | ✅ done | verified + committed 2026-07-15 |
| PROJ-9 | Validate ACL principals + transactional grant/revoke (B3) | ✅ done | verified + committed 2026-07-16 |
| PROJ-5 | DELETE claims hard delete | ✅ done | verified + committed 2026-07-15 |
| PROJ-6 | PUT/PATCH duplicate handlers | ✅ done | verified + committed 2026-07-15 |

**Phases 1–2 (2026-07-15):** PROJ-1..6 dispatched to sonnet dev sessions,
senior-reviewed against the full gate, committed one-per-ticket, both gates
passed, and **pushed** to origin/main (`e4ba8dfb..80ea558d`).

**Phase 3 (2026-07-15/16):** PROJ-7/8/9 (promoted from backlog B1/B2/B3/B5)
dispatched to sonnet dev sessions, senior-reviewed the same way, committed
one-per-ticket, gate passed. Commits `44f60b93` (Phase 3 tickets), `c660c988`
(PROJ-7), `808baa66` (PROJ-8), `0e295cf0` (PROJ-9), + the Phase 3 gate commit.
**Not yet pushed** — awaiting Shawn's go-ahead.

**Escalations needing decisions:** none.
**Remaining:** Backlog B4 (legacy creator = permanent owner) and B6 (deletedAt
distinction) stay parked for the multi-org / ownership-model work.
