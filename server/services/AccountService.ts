import type { } from "@shared/schema";
import { userRepository } from '../repositories';
import { findSelfUser, updateSelfUser } from "../utils/selfUser";
/**
 * Service layer for account-related operations
 * Handles user account preferences including mode settings
 */
export class AccountService {
  private userRepo: typeof userRepository;
  constructor(userRepo?: typeof userRepository) {
    this.userRepo = userRepo ?? userRepository;
  }
  /**
   * Get user account preferences
   */
  async getPreferences(userId: string): Promise<{ defaultMode: 'easy' | 'advanced' }> {
    // Same self-row read as updatePreferences below.
    const user = await findSelfUser(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return {
      defaultMode: (user.defaultMode as 'easy' | 'advanced') || 'easy',
    };
  }
  /**
   * Update user account preferences
   */
  async updatePreferences(
    userId: string,
    preferences: { defaultMode: 'easy' | 'advanced' }
  ): Promise<{ defaultMode: 'easy' | 'advanced' }> {
    // RLS-5: the caller's OWN row. `users` is covered, so the unscoped read
    // found nothing and every preferences update answered "User not found" —
    // a 404 for the account making the request. `selfUser` exists for exactly
    // this shape; it pins the self-identification GUC (migration 0028) for the
    // read and both GUCs for the write, since the self-id clause is read-only.
    const user = await findSelfUser(userId);
    if (!user) {
      throw new Error("User not found");
    }
    // Validate mode value
    if (!['easy', 'advanced'].includes(preferences.defaultMode)) {
      throw new Error("Invalid mode value. Must be 'easy' or 'advanced'");
    }
    await updateSelfUser(userId, user.tenantId ?? null, {
      defaultMode: preferences.defaultMode,
      updatedAt: new Date(),
    });
    return {
      defaultMode: preferences.defaultMode,
    };
  }
}
// Singleton instance
export const accountService = new AccountService();