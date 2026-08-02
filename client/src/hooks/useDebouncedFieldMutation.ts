import { useState, useEffect, useCallback, useRef } from "react";

interface DebouncedFieldMutation<T> {
    localValue: T;
    onChange: (newValue: T) => void;
    onBlur: () => void;
}

export function useDebouncedFieldMutation<T>(
    serverValue: T,
    onFlush: (val: T) => void,
    debounceMs = 600,
    identity?: unknown
): DebouncedFieldMutation<T> {
    const [localValue, setLocalValue] = useState<T>(serverValue);
    const localValueRef = useRef<T>(serverValue);
    const isDirtyRef = useRef(false);
    const timeoutRef = useRef<NodeJS.Timeout>();
    const onFlushRef = useRef(onFlush);
    const identityRef = useRef(identity);

    // Keep onFlushRef up to date
    useEffect(() => {
        onFlushRef.current = onFlush;
    }, [onFlush]);

    const flush = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = undefined;
        }
        if (isDirtyRef.current) {
            onFlushRef.current(localValueRef.current);
            isDirtyRef.current = false;
        }
    }, []);

    // Flush the previous entity before adopting the next entity's server value.
    // Keeping identity inside T lets that flush remain safe even if onFlush changed.
    useEffect(() => {
        if (!Object.is(identityRef.current, identity)) {
            flush();
            identityRef.current = identity;
            setLocalValue(serverValue);
            localValueRef.current = serverValue;
            return;
        }

        if (!isDirtyRef.current) {
            setLocalValue(serverValue);
            localValueRef.current = serverValue;
        }
    }, [flush, identity, serverValue]);

    const onChange = useCallback((newValue: T) => {
        setLocalValue(newValue);
        localValueRef.current = newValue;
        isDirtyRef.current = true;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            flush();
        }, debounceMs);
    }, [flush, debounceMs]);

    // Flush on unmount
    useEffect(() => {
        return () => {
            // We only want this to run on full unmount, but since flush has no dependencies, 
            // the effect won't re-run.
            flush();
        };
    }, [flush]);

    return {
        localValue,
        onChange,
        onBlur: flush
    };
}
