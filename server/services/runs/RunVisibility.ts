import { evaluateWorkflowVisibility } from '@shared/workflowLogic';

import type { RunDefinition } from '../workflow-runs/RunDefinitionProvider';

/** Shared visibility for page validation and Code Block readiness, including pinned runs. */
export function getVisibleStepIds(definition: RunDefinition, data: Record<string, unknown>): string[] {
    const visibility = evaluateWorkflowVisibility({
        sections: definition.sections,
        pages: definition.pages,
        steps: definition.steps,
        rules: definition.logicRules,
        data,
        resolveAlias: (name) => definition.steps.find(step => step.alias === name)?.id,
    });
    return Array.from(visibility.visibleSteps);
}
