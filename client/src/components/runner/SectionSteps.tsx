import { Database } from "lucide-react";
import { useMemo } from "react";

import { BlockRenderer } from "@/components/runner/blocks";
import { BlockErrorBoundary } from "@/components/runner/BlockErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { useWorkflowVisibility } from "@/hooks/useWorkflowVisibility";
import type { ApiStep } from "@/lib/vault-api";
import { useSteps } from "@/lib/vault-hooks";
import type { DefaultValueConfig } from "@/pages/workflow-runner/runner.utils";
import type { Step } from "@/types";

import type { LogicRule } from "@shared/schema";


interface SectionStepsProps {
    sectionId: string;
    steps?: ApiStep[];
    values: Record<string, unknown>;
    logicRules: LogicRule[];
    onChange: (stepId: string, value: unknown) => void;
    errors?: Record<string, string[]>;
    intakeData?: {
        sourceWorkflowTitle?: string;
        values?: Record<string, unknown>;
    };
}

export function SectionSteps({
    sectionId,
    steps: providedSteps,
    values,
    logicRules,
    onChange,
    errors,
    intakeData
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
            repeaterConfig: step.repeaterConfig ?? null,
        }));
    }, [sourceSteps]);

    // Use visibility hook to evaluate which steps should be shown
    // Casting steps to any here because useWorkflowVisibility expects strict Step types which might differ slightly from ApiStep
    // TODO: unify Step types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const { isStepVisible } = useWorkflowVisibility(logicRules, steps as any, values);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!steps || steps.length === 0) {
        return <p className="text-muted-foreground text-sm">No steps in this section</p>;
    }

    // Filter steps to only show visible ones
    const visibleSteps = steps.filter((step) => {
        // Virtual steps are never shown
        if (step.isVirtual) { return false; }
        // Check visibility from logic rules
        return isStepVisible(step.id);
    });



    if (visibleSteps.length === 0) {
        return <p className="text-muted-foreground text-sm">No visible steps in this section</p>;
    }

    return (
        <>
            {visibleSteps.map((step) => (
                <BlockErrorBoundary key={step.id} stepId={step.id}>
                    <StepField
                        step={step}
                        value={values[step.id]}
                        onChange={(v) => { onChange(step.id, v); }}
                        error={errors?.[step.id]?.[0]} // Pass first error message
                        context={values}
                        intakeSource={getIntakeSource(step, intakeData)}
                    />
                </BlockErrorBoundary>
            ))}
        </>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getIntakeSource(step: any, intakeData?: { sourceWorkflowTitle?: string; values?: Record<string, unknown> }) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const defVal = step.defaultValue as DefaultValueConfig | undefined;
    return defVal?.source === 'intake' && defVal.variable
        ? {
            title: intakeData?.sourceWorkflowTitle ?? 'Intake',
            variable: defVal.variable,
            value: intakeData?.values?.[defVal.variable]
        }
        : undefined;
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
    intakeSource?: {
        title: string;
        variable: string;
        value: unknown;
    };
}

function StepField({ step, value, onChange, error, context, intakeSource }: StepFieldProps) {
    // Check if current value matches intake value to decide if we show the badge
    const isUsingIntakeValue = intakeSource && value === intakeSource.value;

    return (
        <div className="space-y-1 relative group">
            {intakeSource && isUsingIntakeValue && (
                <div className="absolute -top-3 right-0 z-10">
                    <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                        <Database className="w-3 h-3" />
                        From {intakeSource.title}
                    </Badge>
                </div>
            )}

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
            />

            {intakeSource && (
                <div className="flex justify-end">
                    {isUsingIntakeValue ? null : ( // If value changed, maybe show "Restore" button? For now just visual cue
                        <span className="text-[10px] text-muted-foreground hidden">Modified from original</span>
                    )}
                </div>
            )}
        </div>
    );
}
