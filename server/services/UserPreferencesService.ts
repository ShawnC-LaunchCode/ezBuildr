import type {  } from "@shared/schema";
import { userPreferencesRepository } from "../repositories";
/**
 * Service layer for user preferences business logic
 * Handles user personalization settings management
 */
export class UserPreferencesService {
  /**
   * Get user preferences by user ID
   * Returns default preferences if none exist
   */
  async getByUserId(userId: string): Promise<Record<string, any>> {
    const prefs = await userPreferencesRepository.findByUserId(userId);
    if (!prefs) {
      // Return default preferences if none exist
      return {
        celebrationEffects: true,
        darkMode: "system",
        aiHints: true,
      };
    }
    return prefs.settings as Record<string, any>;
  }
  /**
   * Update user preferences
   * Merges new settings with existing ones
   */
  async update(userId: string, updates: Record<string, any>): Promise<Record<string, any>> {
    const updated = await userPreferencesRepository.upsert(userId, updates);
    return updated.settings as Record<string, any>;
  }
  /**
   * Reset user preferences to defaults
   */
  async reset(userId: string): Promise<Record<string, any>> {
    const defaults = {
      celebrationEffects: true,
      darkMode: "system",
      aiHints: true,
    };
    const updated = await userPreferencesRepository.upsert(userId, defaults);
    return updated.settings as Record<string, any>;
  }
  /**
   * Delete user preferences
   */
  async delete(userId: string): Promise<void> {
    await userPreferencesRepository.deleteByUserId(userId);
  }
}
export const userPreferencesService = new UserPreferencesService();