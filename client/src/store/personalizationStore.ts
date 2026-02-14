
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserPersonalizationSettings } from '@shared/schema';

// Define the store state
interface PersonalizationState {
    settings: UserPersonalizationSettings | null;
    isOpen: boolean; // For the AI Assist panel
    // Actions
    setSettings: (settings: Partial<UserPersonalizationSettings>) => void;
    loadSettings: () => Promise<void>;
    togglePanel: () => void;
}

export const usePersonalizationStore = create<PersonalizationState>()(
    persist(
        (set, _get) => ({
            settings: null,
            isOpen: false,

            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            setSettings: async (newSettings) => {
                // Optimistic update
                set((state) => ({
                    settings: state.settings ? { ...state.settings, ...newSettings } : newSettings as UserPersonalizationSettings
                }));

                // Sync with backend
                try {
                    // We assume api service is available globally or we use fetch directly
                    await fetch('/api/ai/personalize/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newSettings)
                    });
                } catch (error) {
                    console.error("Failed to sync personalization settings", error);
                }
            },

            loadSettings: async () => {
                try {
                    const res = await fetch('/api/ai/personalize/settings');
                    if (res.ok) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        const data = await res.json();
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        set({ settings: data.settings });
                    }
                } catch (error) {
                    console.error("Failed to load settings", error);
                }
            },

            togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
        }),
        {
            name: 'personalization-settings',
            partialize: (state) => ({ settings: state.settings }), // Persist settings to localStorage as backup
        }
    )
);
