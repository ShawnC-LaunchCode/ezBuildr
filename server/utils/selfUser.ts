import type { User } from "@shared/schema";

import { userRepository } from "../repositories";

import { withCurrentUserId, withTenantAsUser } from "./rlsContext";

/**
 * Reading and writing the CALLER'S OWN `users` row, before any tenant is
 * pinned (RLS-5).
 *
 * A handful of paths — the auth routes, MFA enable/disable — act on the row of
 * the user making the request, from an id that some verification step already
 * produced (a `hybridAuth` JWT, a verified refresh-token rotation, a
 * password-reset or MFA-pending token). None of those establishes a tenant, so
 * `users`' ordinary tenant-scoped policy hides the row for any user who has
 * one, and every such route fails as "user not found" under enforcement.
 * `users`' self-identification clause (migration 0028) exists for exactly this.
 *
 * ⚠️ Never pass an id that came from request input, and never use these for
 * an admin acting on SOMEONE ELSE'S row — the self-id GUC trusts the id it is
 * given completely and grants no isolation of its own. Cross-tenant admin
 * access is RLS-6's `adminDb` path, deliberately somewhere else.
 *
 * Deliberately NOT `getUserById` (server/middleware/userCache.ts), which is
 * the same read plus a 30-second TTL cache: callers here read mutable auth
 * state (`mfaEnabled`, `isPlaceholder`) immediately around writing it, and a
 * cached row would make those checks stale.
 */
export async function findSelfUser(userId: string): Promise<User | undefined> {
  return withCurrentUserId(userId, (tx) => userRepository.findById(userId, tx));
}

/**
 * Update the caller's own row from a pre-tenant path.
 *
 * The self-identification clause is read-only by design, so `USING` sees the
 * row but `WITH CHECK` still demands the written `tenant_id` match the pinned
 * tenant. For a user who already has one that means pinning BOTH GUCs
 * (`withTenantAsUser`); for a not-yet-assigned user there is nothing to pin
 * and the NULL-safe comparison from migration 0027 accepts the row.
 */
export async function updateSelfUser(
  userId: string,
  tenantId: string | null,
  updates: Partial<User>,
): Promise<void> {
  if (tenantId !== null && tenantId !== '') {
    await withTenantAsUser(tenantId, userId, (tx) => userRepository.updateUser(userId, updates, tx));
    return;
  }
  await withCurrentUserId(userId, (tx) => userRepository.updateUser(userId, updates, tx));
}
