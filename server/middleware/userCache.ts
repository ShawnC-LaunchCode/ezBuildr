import type { User } from '@shared/schema';

import { userRepository } from '../repositories';

/**
 * Shared in-process TTL cache for user lookups.
 *
 * Used by both `requireUser` (attaching the full user) and the auth layer (sourcing
 * authoritative role/tenant from the DB rather than trusting the JWT payload). Centralizing
 * it here keeps a single source of truth and lets role-changing endpoints invalidate it so a
 * demotion/removal takes effect immediately instead of lingering until the JWT expires.
 *
 * 30-second TTL is safe for low-churn user data; role changes call invalidateUserCache().
 */
const USER_CACHE_TTL_MS = 30_000;
const MAX_CACHE_SIZE = 2_000;
const userCache = new Map<string, { user: User; expiresAt: number }>();

export function getCachedUser(userId: string): User | undefined {
  const entry = userCache.get(userId);
  if (!entry) { return undefined; }
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId);
    return undefined;
  }
  return entry.user;
}

export function setCachedUser(user: User): void {
  // If at capacity, evict expired entries first, then the oldest entry if still full.
  if (userCache.size >= MAX_CACHE_SIZE) {
    const now = Date.now();
    for (const [key, entry] of userCache) {
      if (now > entry.expiresAt) { userCache.delete(key); }
    }
    if (userCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = userCache.keys().next().value;
      if (oldestKey !== undefined) { userCache.delete(oldestKey); }
    }
  }
  userCache.set(user.id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

/** Invalidate a specific user from the cache (e.g. after a role/tenant change). */
export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

/** Fetch a user by id, using the TTL cache and falling back to the database. */
export async function getUserById(userId: string): Promise<User | undefined> {
  const cached = getCachedUser(userId);
  if (cached) { return cached; }
  const user = (await userRepository.findById(userId)) ?? undefined;
  if (user) { setCachedUser(user); }
  return user;
}
