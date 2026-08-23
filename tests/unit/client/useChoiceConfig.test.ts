// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { ApiStep } from '../../../client/src/lib/vault-api';

import { useChoiceConfig } from '../../../client/src/hooks/useChoiceConfig';

describe('useChoiceConfig integration', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.restoreAllMocks();
    });

    it('protects typed values from settling refetches (lost-edit race)', () => {
        const onSaveConfig = vi.fn();
        let step: ApiStep = {
            id: 'step-1',
            pageId: 'page-1',
            type: 'multiple_choice',
            title: 'Choice Step',
            config: {
                options: [{ id: 'opt1', label: 'Initial', alias: 'opt1' }]
            }
        } as any as ApiStep;

        const { result, rerender } = renderHook(() => useChoiceConfig(step, onSaveConfig));

        // 1. User starts typing
        act(() => {
            const currentConfig = result.current.localConfig;
            result.current.setLocalConfig({
                ...currentConfig!,
                staticOptions: [{ id: 'opt1', label: 'Typing...', alias: 'opt1' }]
            });
        });

        // Value should update locally immediately
        expect(result.current.localConfig?.staticOptions[0].label).toBe('Typing...');

        // 2. A settling refetch arrives (from an earlier save or concurrent edit)
        step = {
            ...step,
            config: {
                options: [{ id: 'opt1', label: 'Refetch Value', alias: 'opt1' }]
            }
        } as any;

        act(() => {
            rerender();
        });

        // The hook MUST NOT overwrite the dirty local state with the refetched value
        expect(result.current.localConfig?.staticOptions[0].label).toBe('Typing...');

        // 3. User finishes typing and blur/flush occurs
        act(() => {
            result.current.setLocalConfig({
                ...result.current.localConfig!,
                staticOptions: [{ id: 'opt1', label: 'Final Value', alias: 'opt1' }]
            });
            result.current.flushConfig();
        });

        // The save function should be called with the FINAL typed value
        expect(onSaveConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                staticOptions: [{ id: 'opt1', label: 'Final Value', alias: 'opt1' }]
            }),
            'static'
        );
    });
});
