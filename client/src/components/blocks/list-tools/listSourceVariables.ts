import type { ApiStep } from "@/lib/vault-api";

/**
 * Step types whose value is list-shaped by the time blocks run.
 *
 * `computed` is the one that matters: `ReadTableBlockService`,
 * `QueryBlockService` and `ListToolsBlockService` each persist their output as
 * a `computed` *virtual* step, so a block's list output reaches the picker as a
 * computed step carrying the block's `outputKey` / `outputVariableName` /
 * `outputListVar` as its alias. User-authored `computed` steps can emit arrays
 * too, and `ListToolsBlockRunner` normalizes a plain array via
 * `arrayToListVariable`, so they are offered as well.
 *
 * `list` questions are included too (LIST-B15). Their stored value is
 * `{ items: [...] }` (`ListValue`), not row-shaped, but `ListToolsBlockRunner`
 * now normalizes it at its own input boundary via `listValueToListVariable`
 * (`shared/listPipeline.ts`) before rejecting non-list/array input — the same
 * envelope→rows conversion `choice-utils.ts` uses for list-bound Choice
 * options. Nothing upstream of the runner (block context, `RunDataService`)
 * projects the value, so every other consumer still sees the raw `ListValue`.
 */
const LIST_SOURCE_STEP_TYPES = new Set<string>(["computed", "list"]);

/**
 * The list-valued variables a List Tools block may read from.
 *
 * `steps` must be the **workflow's** steps (`useWorkflowSteps`, which hits
 * `/api/workflows/:id/steps` and includes virtual steps), not one page's
 * (`useSteps`, which excludes them) — block outputs live on whichever page the
 * block was attached to, and `/api/pages/:id/steps` filters virtual steps out.
 *
 * `ownOutputVar` drops the block's own output from its own source list, which
 * would otherwise appear (a saved List Tools block owns a computed virtual step
 * aliased to its `outputListVar`) and read from itself.
 */
export function selectListSourceVariables(
    steps: ApiStep[] | undefined,
    ownOutputVar?: string
): ApiStep[] {
    return (steps ?? []).filter((step) =>
        LIST_SOURCE_STEP_TYPES.has(step.type) &&
        !!step.alias &&
        step.alias.length > 0 &&
        step.alias !== ownOutputVar
    );
}
