import { useMemo } from "react";

import { BlockRenderer } from "@/components/runner/blocks";
import { BlockErrorBoundary } from "@/components/runner/BlockErrorBoundary";
import { useSectionVisibility } from "@/hooks/runner/useSectionVisibility";
import type { ApiStep } from "@/lib/vault-api";
import { useSteps } from "@/lib/vault-hooks";
import type { Step } from "@/types";

import type { LogicRule } from "@shared/schema";


interface SectionStepsProps {
    sectionId: string;
    steps?: ApiStep[];
    /**
     * Every step in the workflow (not just this section's), used only to
     * build the alias->step id map for display-block `{{alias}}`
     * interpolation. Aliases are workflow-wide, but rendering (visibility,
     * ordering) stays scoped to `steps`. Falls back to `steps` when the
     * caller doesn't have the full-workflow list on hand.
     */
    allSteps?: ApiStep[];
    values: Record<string, unknown>;
    logicRules: LogicRule[];
    onChange: (stepId: string, value: unknown) => void;
    errors?: Record<string, string[]>;
    runId?: string;
    runToken?: string;
}

export function SectionSteps({
    sectionId,
    steps: providedSteps,
    allSteps: providedAllSteps,
    values,
    logicRules,
    onChange,
    errors,
    runId,
    runToken,
}: SectionStepsProps) {
    const { data: rawSteps } = useSteps(sectionId, {
        enabled: !providedSteps
    });

    const sourceSteps = providedSteps ?? rawSteps;

    const steps = useMemo(() => {
        if (!sourceSteps) { return []; }
        return sourceSteps.map(step => ({
            ...step,
            createdAt: step.createdAt ? new Date(step.createdAt) : null,
            updatedAt: step.updatedAt ? new Date(step.updatedAt) : null,
            alias: step.alias,
            description: step.description,
            visibleIf: step.visibleIf ?? null,
            defaultValue: step.defaultValue ?? null,
            isVirtual: step.isVirtual ?? false,
        }));
    }, [sourceSteps]);

    // Use visibility hook to evaluate which steps should be shown
    // Casting steps to any here because useSectionVisibility expects strict Step types which might differ slightly from ApiStep
    // TODO: unify Step types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const { getVisibleSectionSteps } = useSectionVisibility(undefined, steps as any, values, logicRules);

    // Alias -> step id map for display-block {{alias}} interpolation. Aliases
    // are workflow-wide (a display block on page 3 routinely references an
    // answer from page 1), so this is built from the whole-workflow step list
    // when the caller supplies one, falling back to this section's own steps
    // otherwise (still correct, just unable to resolve cross-section aliases).
    const aliasSourceSteps = providedAllSteps ?? steps;
    const aliasMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const step of aliasSourceSteps) {
            if (step.alias) {
                map[step.alias] = step.id;
            }
        }
        return map;
    }, [aliasSourceSteps]);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!steps || steps.length === 0) {
        return <p className="text-muted-foreground text-sm">No steps in this section</p>;
    }

    // Filter steps to only show visible ones
    const visibleSteps = getVisibleSectionSteps(sectionId) as unknown as typeof steps;



    if (visibleSteps.length === 0) {
        return <p className="text-muted-foreground text-sm">No visible steps in this section</p>;
    }

    return (
        <div data-testid="runner-section-steps" className="space-y-8">
            {visibleSteps.map((step) => (
                <BlockErrorBoundary key={step.id} stepId={step.id}>
                    <StepField
                        step={step}
                        value={values[step.id]}
                        onChange={(v) => { onChange(step.id, v); }}
                        error={errors?.[step.id]?.[0]} // Pass first error message
                        context={values}
                        aliasMap={aliasMap}
                        runId={runId}
                        runToken={runToken}
                    />
                </BlockErrorBoundary>
            ))}
        </div>
    );
}

/**
 * StepField - Thin wrapper around BlockRenderer
 *
 * Now uses the new comprehensive BlockRenderer system that supports
 * all block types with proper validation and nested data handling.
 */
type RuntimeStep = Omit<ApiStep, 'createdAt' | 'updatedAt'> & {
    createdAt: Date | null;
    updatedAt: Date | null;
    [key: string]: unknown; // Allow for other runtime props
};

interface StepFieldProps {
    step: RuntimeStep;
    value: unknown;
    onChange: (value: unknown) => void;
    error?: string;
    context: Record<string, unknown>;
    aliasMap?: Record<string, string>;
    runId?: string;
    runToken?: string;
}

function StepField({ step, value, onChange, error, context, aliasMap, runId, runToken }: StepFieldProps) {
    return (
        <div className="space-y-1 relative group">
            {/* 
          BlockRenderer expects 'Step' type which is our main internal type. 
          RuntimeStep is derived from ApiStep. Casting is necessary until types are unified.
      */}
            <BlockRenderer
                step={step as unknown as Step}
                value={value}
                onChange={onChange}
                required={step.required}
                readOnly={false}
                error={error}
                showValidation={!!error}
                context={context}
                aliasMap={aliasMap}
                runId={runId}
                runToken={runToken}
            />
        </div>
    );
}
