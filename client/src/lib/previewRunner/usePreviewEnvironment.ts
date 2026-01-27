import { useSyncExternalStore, useCallback } from 'react';

import { PreviewEnvironment } from './PreviewEnvironment';
export function usePreviewEnvironment(env: PreviewEnvironment | null) {
    // Use useSyncExternalStore to prevent infinite loops with getState()
    const subscribe = useCallback(
        (callback: () => void) => {
            if (!env) {return () => {};}
            return env.subscribe(callback);
        },
        [env]
    );
    const getSnapshot = useCallback(() => {
        return env ? env.getState() : null;
    }, [env]);
    const getServerSnapshot = useCallback(() => {
        return null;
    }, []);
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}