import { useSyncExternalStore, useCallback } from 'react';

import type { PreviewEnvironment, PreviewRunState } from './PreviewEnvironment';

export function usePreviewEnvironment(env: PreviewEnvironment | null): PreviewRunState | null {
    const subscribe = useCallback((callback: () => void) => {
        if (!env) {return () => { };}
        return env.subscribe(callback);
    }, [env]);

    const getSnapshot = useCallback((): PreviewRunState | null => {
        if (!env) {return null;}
        return env.getState();
    }, [env]);

    const getServerSnapshot = useCallback((): PreviewRunState | null => {
        return null;
    }, []);

    return useSyncExternalStore<PreviewRunState | null>(subscribe, getSnapshot, getServerSnapshot);
}