import type { InsertWorkflowRun, WorkflowRun, Step } from "@shared/schema";
import { getValidationSchema } from "@shared/validation/BlockValidation";
import { validateValue } from "@shared/validation/Validator";

import { workflowRunRepository, stepValueRepository, stepRepository, sectionRepository } from "../../repositories";
import { DbTransaction } from "../../repositories/BaseRepository";
import { createError } from "../../utils/errors";

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

function makeValidationMessage(step: Step, valueDescription: string): string {
    return `${step.title}: expected ${valueDescription}`;
}

export class RunPersistenceWriter {
    constructor(
        private runRepo = workflowRunRepository,
        private valueRepo = stepValueRepository,
        private stepRepo = stepRepository,
        private sectionRepo = sectionRepository
    ) { }
    /**
     * Create a new run record
     */
    async createRun(data: InsertWorkflowRun, tx?: DbTransaction): Promise<WorkflowRun> {
        return this.runRepo.create(data, tx);
    }
    /**
     * Update run properties
     */
    async updateRun(runId: string, data: Partial<WorkflowRun>): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- Drizzle update type mismatch with Partial<WorkflowRun>
        await this.runRepo.updateIfIncomplete(runId, data as any);
    }
    /**
     * Save a single step value
     */
    async saveStepValue(runId: string, stepId: string, value: unknown, workflowId: string): Promise<void> {
        // Validate step belongs to workflow
        const step = await this.stepRepo.findById(stepId);
        if (!step) {throw new Error(`Step not found: ${stepId}`);}
        const section = await this.sectionRepo.findById(step.sectionId);
        if (!section || section.workflowId !== workflowId) {
            throw new Error(`Step ${stepId} does not belong to workflow ${workflowId}`);
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
     * (step lookup + section lookup + upsert) sequentially per value.
     */
    async bulkSaveValues(runId: string, values: Array<{ stepId: string, value: unknown }>, workflowId: string): Promise<void> {
        await this.bulkSave(runId, values, workflowId, true);
    }

    /**
     * Save in-progress answers without applying final-format validation.
     * Drafts still enforce workflow membership and storage shape, while values
     * such as a partially typed email or phone number remain resumable.
     */
    async bulkSaveDraftValues(runId: string, values: Array<{ stepId: string, value: unknown }>, workflowId: string): Promise<void> {
        await this.bulkSave(runId, values, workflowId, false);
    }

    private async bulkSave(
        runId: string,
        values: Array<{ stepId: string, value: unknown }>,
        workflowId: string,
        validateFormat: boolean
    ): Promise<void> {
        if (values.length === 0) {return;}
        const workflowSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
        const stepsById = new Map(workflowSteps.map(s => [s.id, s]));
        // Dedupe by stepId (last write wins) — a single INSERT ... ON CONFLICT
        // cannot touch the same row twice
        const byStepId = new Map<string, unknown>();
        for (const v of values) {
            if (!stepsById.has(v.stepId)) {
                throw new Error(`Step ${v.stepId} does not belong to workflow ${workflowId}`);
            }
            byStepId.set(v.stepId, v.value);
        }
        await this.validateBulkValues(byStepId, stepsById, validateFormat);
        await this.valueRepo.upsertMany(
            Array.from(byStepId.entries(), ([stepId, value]) => ({ runId, stepId, value }))
        );
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
        stepsById: Map<string, Step>,
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

    private async validateValueForStep(step: Step, value: unknown, validateFormat: boolean): Promise<string[]> {
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
    private validateStoredValueShape(step: Step, value: unknown): string[] {
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
                return typeof value === 'string' && isIsoDate(value)
                    ? []
                    : [makeValidationMessage(step, 'a YYYY-MM-DD date string')];

            case 'date_time':
            case 'datetime':
            case 'datetime_unified':
                return typeof value === 'string' && isIsoDateTime(value)
                    ? []
                    : [makeValidationMessage(step, 'an ISO datetime string')];

            case 'time':
                return typeof value === 'string' && isIsoTime(value)
                    ? []
                    : [makeValidationMessage(step, 'an HH:mm time string')];

            case 'yes_no':
            case 'true_false':
                return typeof value === 'boolean' ? [] : [makeValidationMessage(step, 'a boolean value')];

            case 'boolean': {
                const storeAsBoolean = !isRecord(step.config) || step.config.storeAsBoolean !== false;
                if (storeAsBoolean) {
                    return typeof value === 'boolean' ? [] : [makeValidationMessage(step, 'a boolean value')];
                }
                const trueLabel = getConfigString(step.config, 'trueLabel') ?? 'Yes';
                const falseLabel = getConfigString(step.config, 'falseLabel') ?? 'No';
                const allowedValues = new Set([
                    trueLabel,
                    falseLabel,
                    getConfigString(step.config, 'trueAlias'),
                    getConfigString(step.config, 'falseAlias'),
                ].filter((item): item is string => item !== undefined));
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

    private validateChoiceValue(step: Step, value: unknown, forceMultiple: boolean): string[] {
        const allowMultiple = forceMultiple || getConfigBoolean(step.config, 'allowMultiple');
        if (allowMultiple) {
            if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
                return [makeValidationMessage(step, 'an array of option values')];
            }
        } else if (typeof value !== 'string') {
            return [makeValidationMessage(step, 'one option value')];
        }

        const allowedValues = getStaticChoiceValues(step.config);
        const allowOther = getConfigBoolean(step.config, 'allowOther');
        if (allowedValues === null || allowOther) {
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
