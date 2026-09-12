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
 * Deliberately NOT included: `list` questions. Their stored value is
 * `{ items: [...] }` (`ListValue`) and nothing projects it into a row array
 * before blocks run — `RunDataService.buildForRun` hands the raw step value
 * straight to the runner, which rejects it as "not a valid list or array".
 * Offering them would put a guaranteed-broken option in the dropdown. Making
 * them work is a real gap, tracked as `LIST-B15` in `tickets/BACKLOG.md`.
 */
const LIST_SOURCE_STEP_TYPES = new Set<string>(["computed"]);

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
