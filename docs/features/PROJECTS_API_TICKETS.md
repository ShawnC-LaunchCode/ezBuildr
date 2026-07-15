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
| Backlog | Not phase-gated | B1..B6 | — |

---

# Phase 1 — Authorization & data-integrity correctness

Fixes where the code permits something it shouldn't or can leave the database
in a half-transferred state. Out of scope for this phase: pagination, doc
mismatches, and route-file refactors (Phase 2), and anything outside the
projects slice (workflow/datavault services are touched only where
`ProjectService.transferOwnership` already writes to them).

## PROJ-1 — Generic update bypasses the org-admin archive gate 🔲

**Priority: P0 (bug)** · Size: S–M · Files: `server/services/ProjectService.ts`, `server/routes/projects.routes.ts`

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

## PROJ-2 — Remove the legacy ownership-transfer endpoint (it never actually transfers) 🔲

**Priority: P1** · Size: S–M · Files: `server/routes/projects.routes.ts`, `server/services/ProjectService.ts`

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

## PROJ-3 — New-model transfer cascade is not atomic 🔲

**Priority: P1** · Size: M · File: `server/services/ProjectService.ts`

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

## Phase 1 Gate

- [ ] PROJ-1, PROJ-2, PROJ-3 all ✅ with dated verification notes
- [ ] `npm run test:integration` — projects + transferOwnership files green;
      `npm run test:fast` green; `npm run type-check` 0 errors;
      `npm run lint` 0 errors
- [ ] Live check (dev server, real JWT): PATCH-archive as non-admin org
      member → no archival change; `PUT /:id/owner` → gone;
      `POST /:id/transfer` happy path still works
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — API contract & route hygiene

Client-visible contract fixes and route-file cleanup. No authorization
changes in this phase. Out of scope: everything in Backlog, and any endpoint
outside `projects.routes.ts`.

## PROJ-4 — GET /api/projects advertises a cursor it never accepts 🔲

**Priority: P2** · Size: M · Files: `server/routes/projects.routes.ts`, `server/repositories/ProjectRepository.ts`

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

## PROJ-5 — DELETE claims hard delete but silently archives 🔲

**Priority: P2** · Size: S · Files: `server/routes/projects.routes.ts`, `server/services/ProjectService.ts`

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

## PROJ-6 — PUT and PATCH update handlers are copy-paste duplicates 🔲

**Priority: P2** · Size: S · File: `server/routes/projects.routes.ts`

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

## Phase 2 Gate

- [ ] PROJ-4, PROJ-5, PROJ-6 all ✅ with dated verification notes
- [ ] `npm run test:integration` — projects file green; `npm run test:fast`
      green; `npm run type-check` 0 errors; `npm run lint` 0 errors
- [ ] Live check: paginate a >limit project list end-to-end via `nextCursor`
      (dev server, real JWT)
- [ ] Reviewer has committed each passed ticket + this gate

---

# Backlog / observations

Too small or too judgment-dependent for tickets now; recorded so they aren't
lost.

- **B1 — Dead repository methods.** `ProjectRepository.findByStatus`
  (`ProjectRepository.ts:92`) and `findByCreatorAndStatus` (:103) have zero
  callers repo-wide (grep verified). Delete when convenient.
- **B2 — `as any` returns in ProjectRepository.** `findByCreatorId` returns
  `results as any` (:87) and `findByOwner` likewise (:221) because
  `ownerName` isn't on the `Project` type. Type the join result properly
  (define a `ProjectWithOwnerName` return type) — matches the repo-wide
  any-type cleanup effort already in progress.
- **B3 — ACL grant accepts unvalidated principals.** `PUT
  /:projectId/access` takes `principalId: z.string()`
  (`projects.routes.ts:392`) with no UUID check and no existence check in
  `grantProjectAccess` (`ProjectService.ts:210-229`), so garbage rows can be
  upserted into `project_access`. Low blast radius (owner-only endpoint) but
  worth a validation pass; also the loop does N sequential upserts that could
  be one transaction.
- **B4 — Legacy creator fields grant permanent owner rights.**
  `AclService.resolveRoleForProject:85-92` treats `createdBy`/`creatorId` as
  owner forever, so no transfer or ACL revocation can ever fully remove the
  original creator. Deliberate-looking (legacy back-compat) but it undermines
  transfer semantics — decide posture when the ownership model is next
  revisited (ties into the multi-org isolation exploration).
- **B5 — `findByCreatorId` vs `findActiveByCreatorId` duplication.** ~60
  lines of near-identical condition-building
  (`ProjectRepository.ts:20-88` vs :118-186) that will drift; also the
  active variant drops the `ownerName` join the other has, so the two lists
  return differently-shaped rows. Fold into one method with an
  `activeOnly` flag when next touched (PROJ-4 may do this naturally).
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
| PROJ-1 | Update bypasses org-admin archive gate | 🔲 open | Decision #1 resolved — ready to dispatch |
| PROJ-2 | Remove legacy owner-transfer endpoint | 🔲 open | Decision #2 resolved — ready to dispatch |
| PROJ-3 | Transfer cascade not atomic | 🔲 open | coordinate with PROJ-2 (same file) |
| PROJ-4 | Fake cursor pagination | 🔲 open | Phase 2, after PROJ-6 |
| PROJ-5 | DELETE claims hard delete | 🔲 open | Decision #3 resolved — ready to dispatch |
| PROJ-6 | PUT/PATCH duplicate handlers | 🔲 open | Phase 2, after PROJ-1 |

**Escalations needing decisions:** none — all three resolved 2026-07-15.
**Ready to push:** nothing yet — no code changes made; this file is the audit
+ ticket deliverable.
