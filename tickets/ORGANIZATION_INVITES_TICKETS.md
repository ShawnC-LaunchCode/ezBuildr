# Organization Invites System Tickets

**Created:** 2026-08-01  
**Context:** Organization invitation system audit revealed state management inconsistencies between the admin invite list and user pending invites. Accepted invites remain visible in the "Pending Invitations" admin view, causing confusion and user-visible state conflicts.

**Status Summary:**
| Ticket | Title | Severity | Status |
|--------|-------|----------|--------|
| ORG-001 | Admin pending invites shows all statuses, not just pending | Medium | 🔴 Not started |

---

## ORG-001 — Admin pending invites shows all statuses, not just pending

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