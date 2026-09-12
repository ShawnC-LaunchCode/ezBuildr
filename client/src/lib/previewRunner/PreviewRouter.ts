import type { ApiPage } from '@/lib/vault-api';

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
     * Move to the next valid page
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    next() {
        const currentState = this.env.getState();
        const pages = this.env.getPages();

        let nextIndex = currentState.currentPageIndex + 1;

        // Loop to find next visible page
        while (nextIndex < pages.length) {
            if (this.isPageVisible(pages[nextIndex])) {
                this.env.setCurrentPage(nextIndex);
                return;
            }
            nextIndex++;
        }

        // If no more pages, complete the run
        if (nextIndex >= pages.length) {
            this.env.completeRun();
        }
    }

    /**
     * Move to the previous valid page
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    prev() {
        const currentState = this.env.getState();
        const pages = this.env.getPages();

        let prevIndex = currentState.currentPageIndex - 1;

        // Loop backwards to find prev visible page
        while (prevIndex >= 0) {
            if (this.isPageVisible(pages[prevIndex])) {
                this.env.setCurrentPage(prevIndex);
                return;
            }
            prevIndex--;
        }
    }

    /**
     * Evaluate visibility logic for a page
     * (Placeholder: Needs integration with LogicEngine from Prompt 13)
     */
    private isPageVisible(_page: ApiPage): boolean {
        // TODO: Integrate real LogicEngine
        // For now, assume all pages are visible unless explicit logic says otherwise

        // Example placeholder logic:
        // if (page.visibleIf) {
        //   return evaluateLogic(page.visibleIf, this.env.getValues());
        // }

        return true;
    }
}
