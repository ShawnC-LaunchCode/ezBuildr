import { describe, it, expect } from 'vitest';

import { resolveChoiceDisplay } from '../../../shared/types/stepConfigs';

import type { ChoiceAdvancedConfig } from '../../../shared/types/stepConfigs';

/**
 * `resolveChoiceDisplay` is the single normaliser the builder and the runner
 * both call, so a bug here shows up as a question that edits one way and runs
 * another. These cases pin the two pieces of history it absorbs: the retired
 * `searchable` flag, and the three different ways multi-select was expressed.
 */
const cfg = (partial: Partial<ChoiceAdvancedConfig>): ChoiceAdvancedConfig => ({
    display: 'radio',
    options: [],
    ...partial,
});

describe('resolveChoiceDisplay', () => {
    describe('single-select presentations', () => {
        it('keeps radio', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'radio' }))).toBe('radio');
        });

        it('keeps a plain dropdown as a dropdown', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'dropdown' }))).toBe('dropdown');
        });

        it('keeps an explicit combobox', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'combobox' }))).toBe('combobox');
        });
    });

    describe('legacy `searchable` flag', () => {
        it('promotes dropdown + searchable to combobox', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'dropdown', searchable: true })))
                .toBe('combobox');
        });

        it('leaves dropdown + searchable:false as a dropdown', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'dropdown', searchable: false })))
                .toBe('dropdown');
        });

        it('does not turn a radio into a combobox just because searchable was set', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'radio', searchable: true })))
                .toBe('radio');
        });
    });

    describe('multi-select always wins, and always means checkboxes', () => {
        it('resolves the legacy multiple_choice step type', () => {
            // Its config has no display at all, so the step type is the only signal.
            expect(resolveChoiceDisplay(undefined, 'multiple_choice')).toBe('multiple');
        });

        it('resolves display: multiple', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'multiple' }))).toBe('multiple');
        });

        it('treats a multiple_choice step as multiple whatever the config claims', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'combobox' }), 'multiple_choice'))
                .toBe('multiple');
        });
    });

    describe('defaults', () => {
        it('resolves a pre-STB-7 allowMultiple row even when display still says radio', () => {
            // Restored by the reviewer. STB-7 deleted this case along with the
            // field, but `allowMultiple` was *required* before this ticket, and
            // AI/API/import callers could write it disagreeing with `display`.
            // Such a row is a real multi-select holding a string[]; reading it
            // as a radio would orphan the stored answer.
            expect(resolveChoiceDisplay({ ...cfg({ display: 'radio' }), allowMultiple: true } as never))
                .toBe('multiple');
        });

        it('beats a searchable dropdown rather than becoming a combobox', () => {
            expect(resolveChoiceDisplay(
                { ...cfg({ display: 'dropdown', searchable: true }), allowMultiple: true } as never,
            )).toBe('multiple');
        });

        it('beats an explicit combobox display', () => {
            expect(resolveChoiceDisplay(
                { ...cfg({ display: 'combobox' }), allowMultiple: true } as never,
            )).toBe('multiple');
        });

        it('ignores allowMultiple:false, so display alone decides for new rows', () => {
            expect(resolveChoiceDisplay(
                { ...cfg({ display: 'radio' }), allowMultiple: false } as never,
            )).toBe('radio');
            expect(resolveChoiceDisplay(
                { ...cfg({ display: 'multiple' }), allowMultiple: false } as never,
            )).toBe('multiple');
        });

        it('falls back to radio for a missing config', () => {
            expect(resolveChoiceDisplay(undefined)).toBe('radio');
            expect(resolveChoiceDisplay(null)).toBe('radio');
        });

        it('falls back to radio for an unrecognised display value', () => {
            expect(resolveChoiceDisplay(cfg({ display: 'wat' as never }))).toBe('radio');
        });
    });
});
