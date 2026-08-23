import type { ApiStep } from '@/lib/vault-api';

/**
 * Common props shared by every step card editor and the StepEditorRouter.
 *
 * This type lives in a leaf module (it imports only `ApiStep`) so the router
 * and the individual card editors can both depend on it without forming an
 * `import/no-cycle` back-edge. Previously this interface was declared inside
 * StepEditorRouter.tsx, which every editor imported back from — the cycle that
 * required ~9 `eslint-disable import/no-cycle` comments (ICW-B1).
 */
export interface StepEditorCommonProps {
    stepId: string;
    pageId: string;
    workflowId: string;
    step: ApiStep;
}
