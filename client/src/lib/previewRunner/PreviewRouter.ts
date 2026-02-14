import type { ApiSection, _ApiStep } from '@/lib/vault-api';

import { PreviewEnvironment } from './PreviewEnvironment';

/**
 * PreviewRouter
 * 
 * Manages navigation and logic evaluation for the Preview Environment.
 * Determines which page to show next based on:
 * - Current position
 * - Visibility rules (skip logic)
 * - Validation status (optional blocking)
 */
export class PreviewRouter {
    constructor(private env: PreviewEnvironment) { }

    /**
     * Move to the next valid section
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    next() {
        const currentState = this.env.getState();
        const sections = this.env.getSections();

        let nextIndex = currentState.currentSectionIndex + 1;

        // Loop to find next visible section
        while (nextIndex < sections.length) {
            if (this.isSectionVisible(sections[nextIndex])) {
                this.env.setCurrentSection(nextIndex);
                return;
            }
            nextIndex++;
        }

        // If no more sections, complete the run
        if (nextIndex >= sections.length) {
            this.env.completeRun();
        }
    }

    /**
     * Move to the previous valid section
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    prev() {
        const currentState = this.env.getState();
        const sections = this.env.getSections();

        let prevIndex = currentState.currentSectionIndex - 1;

        // Loop backwards to find prev visible section
        while (prevIndex >= 0) {
            if (this.isSectionVisible(sections[prevIndex])) {
                this.env.setCurrentSection(prevIndex);
                return;
            }
            prevIndex--;
        }
    }

    /**
     * Evaluate visibility logic for a section
     * (Placeholder: Needs integration with LogicEngine from Prompt 13)
     */
    private isSectionVisible(_section: ApiSection): boolean {
        // TODO: Integrate real LogicEngine
        // For now, assume all sections are visible unless explicit logic says otherwise

        // Example placeholder logic:
        // if (section.visibleIf) {
        //   return evaluateLogic(section.visibleIf, this.env.getValues());
        // }

        return true;
    }
}
