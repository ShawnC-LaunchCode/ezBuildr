# Organization Invites System Tickets

**Created:** 2026-08-01  
**Context:** Organization invitation system audit revealed state management inconsistencies between the admin invite list and user pending invites. Accepted invites remain visible in the "Pending Invitations" admin view, causing confusion and user-visible state conflicts.

**Status Summary:**
| Ticket | Title | Severity | Status |
|--------|-------|----------|--------|
| ORG-001 | Admin pending invites shows all statuses, not just pending | Medium | ✅ Done (2026-08-01) |

---

## ORG-001 — Admin pending invites shows all statuses, not just pending ✅ Done (2026-08-01)

**Severity:** Medium  
**Type:** Bug / State Management  

### Problem

The admin "Pending Invitations" list shows invites of ALL statuses (`pending`, `accepted`, `expired`, `revoked`), not just pending invites. When a user accepts an invite:

1. ✅ A membership is created (user shows as Active)
2. ✅ Invite status is marked `accepted`
3. ❌ But invite still appears in admin's "Pending Invitations" list

This causes users to appear in two places simultaneously:
- **Members tab** = Active ✓ Correct
- **Pending Invitations tab** = Showing accepted invite ✗ Incorrect

### Root Cause

The `getOrganizationInvites()` endpoint (line 778-807 in `server/services/OrganizationService.ts`) returns ALL invites regardless of status:

```typescript
// Line 794-806: no status filter
return db
  .select({...})
  .from(organizationInvites)
  .innerJoin(users, eq(users.id, organizationInvites.invitedByUserId))
  .where(eq(organizationInvites.orgId, orgId));  // ← Returns all statuses
```

**Background:** When invites are accepted, revoked, or expire, their `status` column is updated but they remain in the table. The query returns everything, and the UI displays all of them under "Pending Invitations."

### Impact

- **Admin confusion:** Accepted members appear in the pending list, unclear which are actually pending
- **User experience:** Unclear state after accepting an invite (still shows in pending section despite successful acceptance)
- **Data integrity:** No functional bug, but state visibility is incorrect

### Affected Files

- `server/services/OrganizationService.ts` — `getOrganizationInvites()` method (line 778-807)
- `server/routes/organizations.routes.ts` — `GET /api/organizations/:orgId/invites` endpoint (line 363-382)
- `client/src/pages/OrganizationDetail.tsx` — displays invite results in "Pending Invitations" section
- `client/src/hooks/useOrganizations.ts` — `useOrganizationInvites()` hook

### Solution

Filter the `getOrganizationInvites()` query to return only `pending` invites by adding a status filter to the where clause:

```typescript
// Current (line 794-806):
.where(eq(organizationInvites.orgId, orgId))

// Fixed:
.where(
  and(
    eq(organizationInvites.orgId, orgId),
    eq(organizationInvites.status, 'pending')
  )
)
```

This ensures only invites with `status = 'pending'` are returned by the endpoint.

### Acceptance Criteria

- [ ] `getOrganizationInvites()` method filters to return only invites with `status = 'pending'`
- [ ] Admin "Pending Invitations" list no longer shows accepted invites
- [ ] After a user accepts an invite and refreshes, they no longer appear in pending list
- [ ] Revoked and expired invites are not returned by the endpoint
- [ ] Existing integration tests still pass: `npm run test:integration`
- [ ] New test verifies accepted/revoked/expired invites don't appear in `getOrganizationInvites()` results

### Expected Behavior After Fix

**Invitation Flow:**
1. Admin creates invite for new@example.com
   - Invite appears in "Pending Invitations" ✓

2. User accepts invite (via `/invites/:token/accept`)
   - Membership created
   - Invite status → `'accepted'`
   - Invite **removed** from pending list ✓

3. User appears only as Active member
   - **Members tab:** Shows as Active ✓
   - **Pending Invitations tab:** Not listed ✓

### Testing Strategy

**Existing Test Coverage:**
- `tests/integration/organizationInvites.test.ts:313-325` already covers "should not return accepted invites" for `getPendingInvitesForUser()` (user's side)
- Verify this test still passes after the fix

**New Test to Add:**
- Test `getOrganizationInvites()` does not return invites with `status = 'accepted'`
- Test `getOrganizationInvites()` does not return invites with `status = 'expired'`
- Test `getOrganizationInvites()` does not return invites with `status = 'revoked'`
- Test that only pending invites are returned for a given organization

### Implementation Notes

- **No schema changes required** — `status` column already exists with values: pending, accepted, expired, revoked
- **Backwards compatible** — only affects what the endpoint returns, not acceptance/revocation logic
- **Data not deleted** — invites are status-marked but never removed, enabling audit trails
- **No client changes needed** — the filtering is entirely backend-side
- If historical audit trail is needed in future, a separate admin-only endpoint can be added to view all statuses

### Verification Checklist

After implementation:
- [ ] Run `npm run test:integration` — all tests pass
- [ ] Manually create invite → accept it → refresh page → invite no longer in pending list
- [ ] Verify revoked invite doesn't appear in pending list
- [ ] Verify expired invite doesn't appear in pending list
- [ ] Type-check passes: `npm run type-check`
- [ ] Lint passes: `npm run lint`

---

### Verification (2026-08-01) — committed `ce33986e`

Worked by a Gemini session in the isolated `org-001` worktree; reviewed
independently rather than on the dev's report.

- **Fix uses `and()`, not a second chained `.where()`.** That matters more than
  it looks: Drizzle treats a second `.where()` as a *replacement*, not a
  conjunction, so the chained form would have silently dropped the `orgId`
  filter and returned every pending invite across all organizations — a
  cross-tenant leak dressed as a bug fix. `and` was already imported.
- **The new tests were proven load-bearing.** Three of the four assert absence
  (`toHaveLength(0)`), which passes trivially when the fixture never creates
  the row — the exact trap recorded in the mutation-testing notes. Verified by
  reverting the fix and re-running: **3 of 4 fail without it, all pass with
  it.** The fourth is a positive-case test and correctly passes either way.
- Scope was exactly the two files the ticket named; nothing outside it touched.
  No client change, matching the ticket's "backend-only" call.
- Reviewer-run gates, in the worktree and again on `main` after applying:
  targeted file 22/22, full integration project **420 tests across 18 files**,
  `tsc --noEmit` 0 errors, `eslint` 0 problems, pre-commit 4/4.
- The ticket's manual checks (create invite → accept → refresh) were not
  performed by the dev, which was the correct call given they could not drive
  the running app. The integration tests cover the same three transitions
  (accepted / expired / revoked) at the service boundary.

**Note for future tickets in this file:** it does not follow the ticket-flow
house format — no **Ties** section, no **Preferred fix** heading, and checkbox
criteria rather than numbered ones. It was detailed enough to work from, but
the dispatch prompt had to carry the skill and test-command context the format
normally supplies.

