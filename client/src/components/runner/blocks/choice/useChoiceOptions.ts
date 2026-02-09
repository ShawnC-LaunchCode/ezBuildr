
import { useState, useEffect } from "react";

import { generateOptionsFromList } from "@/lib/choice-utils";
import { Step } from "@/types";

import { ChoiceOption, ChoiceAdvancedConfig, DynamicOptionsConfig } from "@shared/types/stepConfigs";

// Interfaces for Legacy Options
interface LegacyOption {
    id?: string;
    label?: string;
    alias?: string;
}

interface TableRow {
    data: Record<string, unknown>;
}

interface TableResponse {
    rows?: TableRow[];
}

interface LegacyStepConfig {
    options?: (string | LegacyOption)[];
}

interface LegacyStep {
    options?: {
        options?: (string | LegacyOption)[];
    };
}

interface UseChoiceOptionsResult {
    options: ChoiceOption[];
    loading: boolean;
    error: string | null;
    displayMode: "radio" | "dropdown" | "multiple";
    allowMultiple: boolean;
    isSearchable: boolean;
}

export function useChoiceOptions(step: Step, context?: Record<string, unknown>): UseChoiceOptionsResult {
    const [options, setOptions] = useState<ChoiceOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    let displayMode: "radio" | "dropdown" | "multiple" = "radio";
    let allowMultiple = false;
    let isSearchable = false;

    // Get display mode from config
    if (step.type === "choice") {
        const config = step.config as ChoiceAdvancedConfig;
        displayMode = config?.display ?? "radio";
        allowMultiple = config?.allowMultiple ?? false;
        isSearchable = config?.searchable ?? false;
    } else if (step.type === "multiple_choice") {
        displayMode = "multiple";
        allowMultiple = true;
    }

    const parseLegacyOptions = (rawOptions: unknown): ChoiceOption[] => {
        if (!Array.isArray(rawOptions)) {
            return [];
        }

        return rawOptions.map((opt: string | LegacyOption, idx: number) => {
            if (typeof opt === "string") {
                return { id: opt, label: opt, alias: opt };
            }
            return {
                id: opt.id ?? `opt${idx}`,
                label: opt.label ?? (opt as unknown as string),
                alias: opt.alias ?? opt.id ?? opt.label ?? `opt${idx}`,
            };
        });
    };

    const fetchTableOptions = async (dynamicConfig: DynamicOptionsConfig): Promise<ChoiceOption[]> => {
        if (dynamicConfig.type !== 'table_column') {
            return [];
        }

        const { tableId, columnId, labelColumnId, limit = 100 } = dynamicConfig;

        const response = await fetch(
            `/api/tables/${tableId}/rows?limit=${limit}`,
            { credentials: 'include' }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch table data: ${response.statusText}`);
        }

        const data = (await response.json()) as TableResponse;
        const rows = data.rows ?? [];
        const labelCol = labelColumnId ?? columnId;

        return rows.map((row: TableRow, idx: number) => {
            const idVal = row.data[columnId];
            const labelVal = row.data[labelCol] ?? row.data[columnId];

            return {
                id: typeof idVal === 'string' ? idVal : `opt-${idx}`,
                label: String(labelVal ?? `Option ${idx}`),
                alias: String(idVal ?? `opt-${idx}`)
            };
        });
    };

    const resolveDynamicOptions = async (
        dynamicConfig: DynamicOptionsConfig,
        ctx: Record<string, unknown> | undefined
    ): Promise<ChoiceOption[]> => {
        if (dynamicConfig.type === 'static') {
            const opts = dynamicConfig.options ?? [];
            return opts.map(opt => ({ ...opt, alias: opt.alias ?? opt.id }));
        }

        if (dynamicConfig.type === 'list') {
            const { listVariable } = dynamicConfig;
            // Cast to Record<string, any> to allow safe property access and passing to legacy util
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ctxAny = ctx as Record<string, any> | undefined;

            if (ctxAny && listVariable && Object.prototype.hasOwnProperty.call(ctxAny, listVariable)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return generateOptionsFromList(ctxAny[listVariable], dynamicConfig, ctxAny);
            }
            return [];
        }

        if (dynamicConfig.type === 'table_column') {
            return fetchTableOptions(dynamicConfig);
        }

        return [];
    };

    const resolveLegacyOptions = (
        currentStep: Step
    ): ChoiceOption[] => {
        const getRawOptions = (): (string | LegacyOption)[] => {
            const config = currentStep.config as LegacyStepConfig;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const legacyStep = currentStep as unknown as LegacyStep;

            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            return config?.options || legacyStep.options?.options || [];
        };

        return parseLegacyOptions(getRawOptions());
    };

    const getAdvancedOptions = async (
        config: unknown,
        ctx: Record<string, unknown> | undefined
    ): Promise<ChoiceOption[]> => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const advancedConfig = config as ChoiceAdvancedConfig | undefined;
        const configOptions = advancedConfig?.options;
        const isDynamic = configOptions !== null && typeof configOptions === 'object' && 'type' in configOptions;

        if (isDynamic) {
            return resolveDynamicOptions(configOptions, ctx);
        } else {
            const opts = (configOptions as ChoiceOption[]) ?? [];
            return opts.map(opt => ({ ...opt, alias: opt.alias ?? opt.id }));
        }
    };

    useEffect(() => {
        let isMounted = true;

        const loadOptions = async (): Promise<void> => {
            if (!isMounted) {
                return;
            }
            setLoading(true);
            setError(null);

            try {
                let newOptions: ChoiceOption[] = [];

                if (step.type === "radio" || step.type === "multiple_choice") {
                    newOptions = resolveLegacyOptions(step);
                }
                else if (step.type === "choice") {
                    newOptions = await getAdvancedOptions(step.config, context);
                }

                if (isMounted) {
                    setOptions(newOptions);
                }

            } catch (err) {
                console.error('[ChoiceBlock] Error loading options:', err);
                if (isMounted) {
                    const msg = err instanceof Error ? err.message : 'Failed to load options';
                    setError(msg);
                    setOptions([]);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        loadOptions();

        return () => { isMounted = false; };
        // We exclude options from dependencies to avoid infinite loops if we return []
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, context]);

    return {
        options,
        loading,
        error,
        displayMode,
        allowMultiple,
        isSearchable
    };
}
