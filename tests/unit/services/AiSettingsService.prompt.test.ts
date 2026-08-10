import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_PROMPT } from '../../../server/services/AiSettingsService';
import { buildWorkflowVocabulary } from '../../../shared/aiVocabulary';

describe('DEFAULT_SYSTEM_PROMPT rendering (AISL-11)', () => {
    it('places all placeholders after the vocabulary catalog', () => {
        // Assert AC2: The set of placeholders is unchanged
        const placeholders = ['{{interviewerRole}}', '{{readingLevel}}', '{{tone}}'];
        for (const p of placeholders) {
            expect(DEFAULT_SYSTEM_PROMPT).toContain(p);
            // Assert exactly once each
            const count = (DEFAULT_SYSTEM_PROMPT.match(new RegExp(p, 'g')) || []).length;
            expect(count).toBe(1);
        }

        const vocabCatalog = buildWorkflowVocabulary();
        const indexOfVocab = DEFAULT_SYSTEM_PROMPT.indexOf(vocabCatalog);
        expect(indexOfVocab).toBeGreaterThan(-1);

        const lastIndexOfVocab = indexOfVocab + vocabCatalog.length;

        // Find the index of the first placeholder
        const firstPlaceholderIndex = Math.min(
            ...placeholders.map(p => DEFAULT_SYSTEM_PROMPT.indexOf(p))
        );

        // Assert AC5: index of the first placeholder is greater than the index of the vocabulary catalog's last line
        expect(firstPlaceholderIndex).toBeGreaterThan(lastIndexOfVocab);
    });

    it('replaces all three placeholders when rendering (AC3)', () => {
        const preferences = {
            interviewerRole: 'workflow tester',
            readingLevel: 'simple',
            tone: 'friendly'
        };

        const rendered = DEFAULT_SYSTEM_PROMPT
            .replace(/{{interviewerRole}}/g, preferences.interviewerRole)
            .replace(/{{readingLevel}}/g, preferences.readingLevel)
            .replace(/{{tone}}/g, preferences.tone);

        // Should not contain any unresolved placeholder syntax
        expect(rendered).not.toContain('{{');
        expect(rendered).not.toContain('}}');

        // Should contain the substituted values
        expect(rendered).toContain(preferences.interviewerRole);
        expect(rendered).toContain(preferences.readingLevel);
        expect(rendered).toContain(preferences.tone);

        // Should still contain the vocab catalog (AC4)
        expect(rendered).toContain(buildWorkflowVocabulary());
        
        // Should still contain a guideline line (AC4)
        expect(rendered).toContain('- Generate clear, concise operation steps');
    });
});
