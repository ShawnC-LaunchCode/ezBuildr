import type { } from "@shared/schema";
import { userRepository } from '../repositories';
/**
 * Service layer for account-related operations
 * Handles user account preferences including mode settings
 */
export class AccountService {
  private userRepo: typeof userRepository;
  constructor(userRepo?: typeof userRepository) {
    this.userRepo = userRepo || userRepository;
  }
  /**
   * Get user account preferences
   */
  async getPreferences(userId: string): Promise<{ defaultMode: 'easy' | 'advanced' }> {
    const user = await this.userRepo.findById(userId);
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
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    // Validate mode value
    if (!['easy', 'advanced'].includes(preferences.defaultMode)) {
      throw new Error("Invalid mode value. Must be 'easy' or 'advanced'");
    }
    await this.userRepo.update(userId, {
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