import { FeatureFlag, getInitialFeatureFlags } from "./definitions";

// On the server, we just compute the initial state once or per-request if needed.
// Since we are using env vars which are static during runtime usually, we can resolve once.
// However, updates to .env would require restart.

const serverFlags = getInitialFeatureFlags();

export const featureFlags = {
    isEnabled: (flag: FeatureFlag): boolean => {
        return serverFlags[flag] ?? false;
    },

    getAll: () => ({ ...serverFlags })
};
