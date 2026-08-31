import { describe, expect, it } from 'vitest';

import { buildWorkflowVocabulary } from '../../../shared/aiVocabulary';
import {
    buildDefaultSystemPrompt,
    DEFAULT_SYSTEM_PROMPT,
    renderWorkflowVocabulary,
} from '../../../server/services/AiSettingsService';

describe('mode-aware system prompt rendering', () => {
    it('places the selected vocabulary before all personalization placeholders', () => {
        const rendered = buildDefaultSystemPrompt('easy');
        const vocabulary = buildWorkflowVocabulary('easy');
        const placeholders = ['{{interviewerRole}}', '{{readingLevel}}', '{{tone}}'];
        const vocabularyEnd = rendered.indexOf(vocabulary) + vocabulary.length;

        for (const placeholder of placeholders) {
            expect(rendered.match(new RegExp(placeholder, 'g'))).toHaveLength(1);
            expect(rendered.indexOf(placeholder)).toBeGreaterThan(vocabularyEnd);
        }
    });

    it('renders distinct Easy and Advanced canonical catalogs', () => {
        const easy = buildDefaultSystemPrompt('easy');
        const advanced = buildDefaultSystemPrompt('advanced');
        expect(easy).toContain(buildWorkflowVocabulary('easy'));
        expect(easy).not.toContain('- js_question:');
        expect(advanced).toContain(buildWorkflowVocabulary('advanced'));
        expect(advanced).toContain('- js_question:');
    });

    it('appends the enforced vocabulary to a saved override without a catalog slot', () => {
        const override = 'Custom workflow rules. Role: {{interviewerRole}}';
        const rendered = renderWorkflowVocabulary(override, 'advanced');
        expect(rendered).toContain(override);
        expect(rendered).toContain(buildWorkflowVocabulary('advanced'));
        expect(rendered.match(/Available operations:/g)).toHaveLength(1);
        expect(DEFAULT_SYSTEM_PROMPT).toContain('{{workflowVocabulary}}');
    });
});
