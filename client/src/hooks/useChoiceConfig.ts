/**
 * Custom hook for managing Choice block configuration state
 * Handles config parsing, migrations, and state management
 */

import { useState, useEffect } from 'react';
import type { ApiStep } from '@/lib/vault-api';
import type {
    ChoiceAdvancedConfig,
    ChoiceOption,
    LegacyMultipleChoiceConfig,
    LegacyRadioConfig,
    DynamicOptionsConfig
} from '@/../../shared/types/stepConfigs';

export interface ChoiceCardState {
    display: "radio" | "dropdown" | "multiple";
    allowMultiple: boolean;
    searchable: boolean;
    staticOptions: ChoiceOption[];
    dynamicOptions: Extract<DynamicOptionsConfig, { type: 'list' }>;
}

interface UseChoiceConfigResult {
    localConfig: ChoiceCardState | null;
    setLocalConfig: (config: ChoiceCardState) => void;
    sourceMode: "static" | "dynamic";
    setSourceMode: (mode: "static" | "dynamic") => void;
    isAdvancedMode: boolean;
}

const createEmptyDynamicConfig = (): Extract<DynamicOptionsConfig, { type: 'list' }> => ({
    type: 'list',
    listVariable: '',
    labelPath: '',
    valuePath: '',
    labelTemplate: '',
    groupByPath: '',
    enableSearch: false,
    includeBlankOption: false,
    blankLabel: '',
    transform: {
        filters: undefined,
        sort: undefined,
        limit: undefined,
        offset: undefined,
        dedupe: undefined,
        select: undefined
    }
});

/**
 * Parse and migrate choice config from various formats to unified state
 */
function parseChoiceConfig(step: ApiStep): {
    config: ChoiceCardState;
    mode: "static" | "dynamic";
    isAdvanced: boolean;
} {
    const isAdvanced = step.type === "choice";

    if (isAdvanced) {
        const config = step.config as ChoiceAdvancedConfig | undefined;
        const rawOptions = config?.options;

        let mode: "static" | "dynamic" = "static";
        let staticOptions: ChoiceOption[] = [];
        let dynamicOptions: Extract<DynamicOptionsConfig, { type: 'list' }> = createEmptyDynamicConfig();

        if (rawOptions && typeof rawOptions === 'object' && 'type' in rawOptions) {
            // Dynamic Config
            const dynConfig = rawOptions;
            if (dynConfig.type === 'static') {
                staticOptions = dynConfig.options || [];
            } else if (dynConfig.type === 'list') {
                mode = "dynamic";
                // Migrate old format to new format
                dynamicOptions = {
                    type: 'list',
                    listVariable: dynConfig.listVariable || '',
                    labelPath: (dynConfig as unknown as { labelPath?: string; labelColumnId?: string }).labelPath ||
                        (dynConfig as unknown as { labelPath?: string; labelColumnId?: string }).labelColumnId || '',
                    valuePath: (dynConfig as unknown as { valuePath?: string; valueColumnId?: string }).valuePath ||
                        (dynConfig as unknown as { valuePath?: string; valueColumnId?: string }).valueColumnId || '',
                    labelTemplate: dynConfig.labelTemplate,
                    groupByPath: dynConfig.groupByPath,
                    enableSearch: dynConfig.enableSearch,
                    includeBlankOption: dynConfig.includeBlankOption,
                    blankLabel: dynConfig.blankLabel,
                    transform: dynConfig.transform || createEmptyDynamicConfig().transform
                };
            }
        } else if (Array.isArray(rawOptions)) {
            staticOptions = rawOptions;
        }

        return {
            config: {
                display: config?.display || "radio",
                allowMultiple: config?.allowMultiple || false,
                searchable: config?.searchable || false,
                staticOptions,
                dynamicOptions
            },
            mode,
            isAdvanced: true
        };
    } else {
        // Easy mode legacy conversion
        const config = step.config as (LegacyMultipleChoiceConfig | LegacyRadioConfig) | undefined;
        const legacyOptions = config?.options || [];
        const options: ChoiceOption[] = Array.isArray(legacyOptions)
            ? legacyOptions.map((opt: string | { id?: string; label?: string; alias?: string }, idx: number) => ({
                id: typeof opt === 'object' && opt.id ? opt.id : `opt${idx + 1}`,
                label: typeof opt === 'string' ? opt : (opt.label || String(opt)),
                alias: typeof opt === 'string' ? `option${idx + 1}` : (opt.alias || opt.id || `option${idx + 1}`),
            }))
            : [];

        return {
            config: {
                display: step.type === "multiple_choice" ? "multiple" : "radio",
                allowMultiple: step.type === "multiple_choice",
                searchable: false,
                staticOptions: options,
                dynamicOptions: createEmptyDynamicConfig()
            },
            mode: "static",
            isAdvanced: false
        };
    }
}

/**
 * Hook for managing Choice block configuration
 */
export function useChoiceConfig(step: ApiStep): UseChoiceConfigResult {
    const [localConfig, setLocalConfig] = useState<ChoiceCardState | null>(null);
    const [sourceMode, setSourceMode] = useState<"static" | "dynamic">("static");
    const isAdvancedMode = step.type === "choice";

    // Parse config on mount or when step changes
    useEffect(() => {
        const { config, mode } = parseChoiceConfig(step);
        setLocalConfig(config);
        setSourceMode(mode);
    }, [step.config, step.type]);

    return {
        localConfig,
        setLocalConfig,
        sourceMode,
        setSourceMode,
        isAdvancedMode
    };
}
