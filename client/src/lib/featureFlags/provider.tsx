import React, { createContext, useContext, ReactNode, useState } from "react";

import { FeatureFlag, getInitialFeatureFlags } from "./definitions";

interface FeatureFlagsContextType {
    flags: Record<FeatureFlag, boolean>;
    isEnabled: (flag: FeatureFlag) => boolean;
    setFlag: (flag: FeatureFlag, enabled: boolean) => void; // For testing/dev tools
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
    const [flags, setFlags] = useState<Record<FeatureFlag, boolean>>(getInitialFeatureFlags());

    const isEnabled = (flag: FeatureFlag) => {
        return flags[flag] ?? false;
    };

    const setFlag = (flag: FeatureFlag, enabled: boolean) => {
        setFlags(prev => ({ ...prev, [flag]: enabled }));
    };

    return (
        <FeatureFlagsContext.Provider value={{ flags, isEnabled, setFlag }}>
            {children}
        </FeatureFlagsContext.Provider>
    );
}

export function useFeatureFlags() {
    const context = useContext(FeatureFlagsContext);
    if (context === undefined) {
        throw new Error("useFeatureFlags must be used within a FeatureFlagsProvider");
    }
    return context;
}

/**
 * Component to conditionally render children based on a feature flag.
 */
export function FeatureFeature({ flag, children, fallback = null }: { flag: FeatureFlag, children: ReactNode, fallback?: ReactNode }) {
    const { isEnabled } = useFeatureFlags();

    if (isEnabled(flag)) {
        return <>{children}</>;
    }

    return <>{fallback}</>;
}
