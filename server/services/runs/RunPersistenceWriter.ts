import type { InsertWorkflowRun, WorkflowRun } from "@shared/schema";
import { resolveChoiceDisplay, resolveDateTimeConfig } from "@shared/types/stepConfigs";
import type { ChoiceAdvancedConfig } from "@shared/types/stepConfigs";
import { getValidationSchema } from "@shared/validation/BlockValidation";
import { validateValue } from "@shared/validation/Validator";

import { workflowRunRepository, stepValueRepository, type BulkSaveResult } from "../../repositories";
import { DbTransaction } from "../../repositories/BaseRepository";
import { createError } from "../../utils/errors";
import { withCurrentTenant } from "../../utils/rlsContext";
import { runDefinitionProvider, RunDefinitionProvider, type RunDefinition } from "../workflow-runs/RunDefinitionProvider";

interface RunValueValidationIssue {
    stepId: string;
    messages: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyAutosaveValue(value: unknown): boolean {
    return value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
}

function isIsoDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isIsoDateTime(value: string): boolean {
    const [datePart, timePart, extraPart] = value.split('T');
    return datePart !== undefined &&
        timePart !== undefined &&
        extraPart === undefined &&
        isIsoDate(datePart) &&
        isIsoTime(timePart) &&
        !Number.isNaN(Date.parse(value));
}

function isIsoTime(value: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function getConfigBoolean(config: unknown, key: string): boolean {
    return isRecord(config) && config[key] === true;
}

function getConfigString(config: unknown, key: string): string | undefined {
    const value = isRecord(config) ? config[key] : undefined;
    return typeof value === 'string' ? value : undefined;
}

function getStaticChoiceValues(config: unknown): Set<string> | null {
    if (!isRecord(config) || !Array.isArray(config.options)) {
        return null;
    }

    const values = new Set<string>();
    config.options.forEach((option, index) => {
        if (typeof option === 'string') {
            values.add(option);
            return;
        }
        if (!isRecord(option)) {
            values.add(`opt${index}`);
            return;
        }
        const id = typeof option.id === 'string' ? option.id : `opt${index}`;
        const label = typeof option.label === 'string' ? option.label : undefined;
        const alias = typeof option.alias === 'string' ? option.alias : undefined;
        values.add(alias ?? id);
        values.add(id);
        if (label !== undefined) {
            values.add(label);
        }
    });
    return values;
}

/**
 * Minimal step shape RunPersistenceWriter's format/shape validation needs.
 * Both a live DB row (`Step` from `@shared/schema`) and a run's
 * pinned-definition snapshot (`RunStep` in
 * `server/services/workflow-runs/RunDefinitionProvider.ts`, RVP-1) satisfy
 * this -- RVP-7 made membership + validation source from the run's
 * definition provider instead of always reading the live `steps` table
 * directly, so this can no longer be pinned to the exact DB-inferred `Step`
 * type. Mirrors `ValidatablePageStep` (server/workflows/validation.ts) and
 * `StepLike` (shared/validation/BlockValidation.ts).
 */
interface PersistableStep {
    id: string;
    type: string;
    title: string;
    config: unknown;
}

function makeValidationMessage(step: PersistableStep, valueDescription: string): string {
    return `${step.title}: expected ${valueDescription}`;
}

export class RunPersistenceWriter {
    constructor(
        private runRepo = workflowRunRepository,
        private valueRepo = stepValueRepository,
        // RVP-7: membership (which steps belong to this run) is sourced from
        // the run's own definition -- the pinned version's graph when it has
        // one, the live tables otherwise -- via `RunDefinitionProvider`,
        // instead of re-deriving it from the live `steps`/`pages` tables.
        // Re-deriving from live tables filtered out steps the author had
        // soft-deleted mid-run even though the run's pinned definition (and
        // therefore the respondent's client) still legitimately included
        // them, throwing out the whole batch before persisting anything --
        // see tickets/RUN_VERSION_PINNING_TICKETS.md, RVP-7.
        private definitionProvider: RunDefinitionProvider = runDefinitionProvider
    ) { }

    /**
     * Resolve the run and its pages/steps/logic-rules from
     * `RunDefinitionProvider` (RVP-1): the pinned version's graph when the
     * run has one, the live tables otherwise (`source: 'live'`). Mirrors
     * `RunExecutionCoordinator.getDefinition` -- the membership guard below
     * must agree with what navigation/submission already decided for this
     * run.
     */
    private async getDefinition(runId: string, workflowId: string): Promise<RunDefinition> {
        const run = await this.runRepo.findById(runId);
        if (!run || run.workflowId !== workflowId) {
            throw new Error(`Run not found: ${runId}`);
        }
        return this.definitionProvider.getDefinition(run);
    }

    /**
     * Create a new run record
     */
    async createRun(data: InsertWorkflowRun, tx?: DbTransaction): Promise<WorkflowRun> {
        return this.runRepo.create(data, tx);
    }
    /** Atomically persist a server-resolved cursor and its reached-page history. */
    async advanceRun(
        runId: string,
        currentPageId: string | null,
        progress?: number
    ): Promise<WorkflowRun> {
        return withCurrentTenant((tx) =>
            this.runRepo.advanceIfIncomplete(runId, currentPageId, progress, tx));
    }
    /**
     * Save a single step value
     */
    async saveStepValue(runId: string, stepId: string, value: unknown, workflowId: string): Promise<void> {
        // Validate step belongs to this run's definition (RVP-7) -- the
        // anti-mass-assignment guard, sourced from the pinned version rather
        // than the live tables.
        const definition = await this.getDefinition(runId, workflowId);
        const stepExists = definition.steps.some(s => s.id === stepId);
        if (!stepExists) {
            // RVP-7: a 4xx, not a bare Error. This is the anti-mass-assignment
            // guard rejecting caller-supplied input, so it must classify as a
            // client error — a plain Error falls through classifyRouteError to
            // a 500, which told callers the server had broken rather than that
            // their request was invalid. Mirrors the equivalent guard in
            // RunExecutionCoordinator.partitionSubmittedValues (RUN2-15).
            throw createError.validation(
                `Step ${stepId} does not belong to workflow ${workflowId}`,
                { stepIds: [stepId] }
            );
        }
        await this.valueRepo.upsert({
            runId,
            stepId,
            value
        });
    }
    /**
     * Bulk save values.
     * One workflow-membership prefetch + one batched upsert, instead of
     * (step lookup + page lookup + upsert) sequentially per value.
     */
    async bulkSaveValues(runId: string, values: Array<{ stepId: string, value: unknown }>, workflowId: string): Promise<void> {
        await this.bulkSave(runId, values, workflowId, true);
    }

    /**
     * Save in-progress answers without applying final-format validation.
     * Drafts still enforce workflow membership and storage shape, while values
     * such as a partially typed email or phone number remain resumable.
     * Supports clientTimestamp for conflict detection and graceful merging.
     */
    async bulkSaveDraftValues(
        runId: string,
        values: Array<{ stepId: string; value: unknown; clientTimestamp?: number | string | Date }>,
        workflowId: string
    ): Promise<BulkSaveResult> {
        return this.bulkSave(runId, values, workflowId, false);
    }

    private async bulkSave(
        runId: string,
        values: Array<{ stepId: string; value: unknown; clientTimestamp?: number | string | Date }>,
        workflowId: string,
        validateFormat: boolean
    ): Promise<BulkSaveResult> {
        if (values.length === 0) {
            return { saved: [], conflicts: [] };
        }
        const definition = await this.getDefinition(runId, workflowId);
        const stepsById = new Map<string, PersistableStep>(definition.steps.map(s => [s.id, s]));
        // Dedupe by stepId (last write wins) — a single INSERT ... ON CONFLICT
        // cannot touch the same row twice
        const byStepId = new Map<string, { value: unknown; clientTimestamp?: number | string | Date }>();
        for (const v of values) {
            if (!stepsById.has(v.stepId)) {
                // RVP-7: 4xx rather than a bare Error — see saveStepValue above.
                throw createError.validation(
                    `Step ${v.stepId} does not belong to workflow ${workflowId}`,
                    { stepIds: [v.stepId] }
                );
            }
            byStepId.set(v.stepId, { value: v.value, clientTimestamp: v.clientTimestamp });
        }

        const valuesToValidate = new Map<string, unknown>();
        for (const [stepId, item] of byStepId.entries()) {
            valuesToValidate.set(stepId, item.value);
        }
        await this.validateBulkValues(valuesToValidate, stepsById, validateFormat);

        const dataList = Array.from(byStepId.entries(), ([stepId, item]) => ({
            runId,
            stepId,
            value: item.value,
            clientTimestamp: item.clientTimestamp,
        }));

        if (typeof (this.valueRepo as unknown as { upsertManyWithTimestamps?: unknown }).upsertManyWithTimestamps === 'function') {
            return (this.valueRepo as unknown as { upsertManyWithTimestamps: (data: typeof dataList) => Promise<BulkSaveResult> }).upsertManyWithTimestamps(dataList);
        }

        const saved = await this.valueRepo.upsertMany(
            dataList.map(({ runId: r, stepId: s, value: val }) => ({ runId: r, stepId: s, value: val }))
        );
        return { saved, conflicts: [] };
    }
    /**
     * Get all values for a run
     */
    async getRunValues(runId: string): Promise<Record<string, unknown>> {
        const values = await this.valueRepo.findByRunId(runId);
        return values.reduce<Record<string, unknown>>((acc, v) => {
            acc[v.stepId] = v.value;
            return acc;
        }, {});
    }

    private async validateBulkValues(
        valuesByStepId: Map<string, unknown>,
        stepsById: Map<string, PersistableStep>,
        validateFormat: boolean
    ): Promise<void> {
        const issues: RunValueValidationIssue[] = [];

        for (const [stepId, value] of valuesByStepId.entries()) {
            const step = stepsById.get(stepId);
            if (!step) {continue;}
            const messages = await this.validateValueForStep(step, value, validateFormat);
            if (messages.length > 0) {
                issues.push({ stepId, messages });
            }
        }

        if (issues.length > 0) {
            const stepIds = issues.map(issue => issue.stepId);
            throw createError.validation(
                `Invalid step values for stepIds: ${stepIds.join(', ')}`,
                { stepIds, errors: issues }
            );
        }
    }

    private async validateValueForStep(step: PersistableStep, value: unknown, validateFormat: boolean): Promise<string[]> {
        if (isEmptyAutosaveValue(value)) {
            return [];
        }

        const messages = this.validateStoredValueShape(step, value);
        if (!validateFormat || messages.length > 0) {
            return messages;
        }
        const schema = getValidationSchema({
            id: step.id,
            type: step.type,
            config: step.config,
            required: false,
        });
        const result = await validateValue({
            schema: {
                ...schema,
                required: false,
                rules: schema.rules.filter(rule => rule.type !== 'required'),
            },
            value,
        });

        return [...messages, ...result.errors];
    }

    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity
    private validateStoredValueShape(step: PersistableStep, value: unknown): string[] {
        switch (step.type) {
            case 'short_text':
            case 'long_text':
            case 'text':
            case 'email':
            case 'email_advanced':
            case 'phone':
            case 'phone_advanced':
            case 'website':
            case 'website_advanced':
                return typeof value === 'string' ? [] : [makeValidationMessage(step, 'a string value')];

            case 'number':
            case 'number_advanced':
            case 'currency':
            case 'scale':
            case 'scale_advanced':
                return typeof value === 'number' && Number.isFinite(value)
                    ? []
                    : [makeValidationMessage(step, 'a finite number')];

            case 'date':
            case 'time':
            case 'date_time':
            case 'datetime':
            case 'datetime_unified': {
                const kind = resolveDateTimeConfig(step.type, step.config).kind;
                if (kind === 'date') {
                    return typeof value === 'string' && isIsoDate(value)
                        ? []
                        : [makeValidationMessage(step, 'a YYYY-MM-DD date string')];
                }
                if (kind === 'time') {
                    return typeof value === 'string' && isIsoTime(value)
                        ? []
                        : [makeValidationMessage(step, 'an HH:mm time string')];
                }
                return typeof value === 'string' && isIsoDateTime(value)
                    ? []
                    : [makeValidationMessage(step, 'an ISO datetime string')];
            }

            case 'yes_no':
            case 'true_false':
                return typeof value === 'boolean' ? [] : [makeValidationMessage(step, 'a boolean value')];

            case 'boolean': {
                const storeAsBoolean = !isRecord(step.config) || step.config.storeAsBoolean !== false;
                if (storeAsBoolean) {
                    return typeof value === 'boolean' ? [] : [makeValidationMessage(step, 'a boolean value')];
                }
                const allowedValues = new Set([
                    getConfigString(step.config, 'trueAlias') ?? 'true',
                    getConfigString(step.config, 'falseAlias') ?? 'false',
                ]);
                return typeof value === 'string' && allowedValues.has(value)
                    ? []
                    : [makeValidationMessage(step, `one of ${Array.from(allowedValues).join(', ')}`)];
            }

            case 'radio':
            case 'choice':
                return this.validateChoiceValue(step, value, false);

            case 'multiple_choice':
                return this.validateChoiceValue(step, value, true);

            case 'address':
            case 'address_advanced':
            case 'multi_field':
                return isRecord(value) ? [] : [makeValidationMessage(step, 'an object value')];

            case 'file_upload':
                return isRecord(value) || Array.isArray(value) ? [] : [makeValidationMessage(step, 'a file object or list')];

            default:
                return [];
        }
    }

    private validateChoiceValue(step: PersistableStep, value: unknown, forceMultiple: boolean): string[] {
        // Cardinality follows `display`, never a separate flag (STB-7 AC2).
        // This previously read `allowMultiple` from config, which the ticket
        // removed from authoring -- so every canonical `display: 'multiple'`
        // step was rejecting its own array with "expected one option value"
        // while the runner rendered checkboxes. Found by the STB-7 vertical
        // proof; no unit test covered the submit path for a multi-select.
        // resolveChoiceDisplay still honours a stored `allowMultiple` on read,
        // so pre-STB-7 rows keep working until STB-19 backfills them.
        const displayMode = resolveChoiceDisplay(
            step.config as ChoiceAdvancedConfig | undefined,
            step.type
        );
        const allowMultiple = forceMultiple || displayMode === 'multiple';
        if (allowMultiple) {
            if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
                return [makeValidationMessage(step, 'an array of option values')];
            }
        } else if (typeof value !== 'string') {
            return [makeValidationMessage(step, 'one option value')];
        }

        const allowedValues = getStaticChoiceValues(step.config);
        const allowOther = getConfigBoolean(step.config, 'allowOther');
        // A combobox exists to accept an answer the author never listed, so an
        // unlisted value is the feature rather than tampering. Resolved through
        // resolveChoiceDisplay so a legacy `dropdown` + `searchable: true`
        // config — which is also a combobox — gets the same exemption.
        // radio/dropdown/multiple keep validating: those cannot produce an
        // unlisted value from the UI, so one still signals tampering.
        const acceptsWriteIn = resolveChoiceDisplay(
            isRecord(step.config)
                ? (step.config as Pick<ChoiceAdvancedConfig, 'display' | 'searchable'>)
                : undefined,
            step.type
        ) === 'combobox';
        if (allowedValues === null || allowOther || acceptsWriteIn) {
            return [];
        }

        const submittedValues = Array.isArray(value) ? value : [value];
        const invalidValues = submittedValues
            .filter(item => typeof item !== 'string' || !allowedValues.has(item))
            .map(item => String(item));
        if (invalidValues.length === 0) {
            return [];
        }

        return [`${step.title}: invalid option value(s): ${invalidValues.join(', ')}`];
    }
}
export const runPersistenceWriter = new RunPersistenceWriter();
