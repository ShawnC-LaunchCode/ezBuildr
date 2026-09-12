
import { useState, useEffect } from "react";

import { generateOptionsFromList } from "@/lib/choice-utils";
import { getAuthHeaders } from "@/lib/vault-api";
import { Step } from "@/types";

import { resolveChoiceDisplay } from "@shared/types/stepConfigs";

import type { ChoiceOption, ChoiceAdvancedConfig, ChoiceDisplay, DynamicOptionsConfig } from "@shared/types/stepConfigs";

// Interfaces for Legacy Options
interface LegacyOption {
    id?: string;
    label?: string;
    alias?: string;
}

interface TableOptionsResponse {
    options: Array<{ value: string; label: string }>;
}

interface LegacyStepConfig {
    options?: (string | LegacyOption)[];
}

interface UseChoiceOptionsResult {
    options: ChoiceOption[];
    loading: boolean;
    error: string | null;
    displayMode: ChoiceDisplay;
    allowMultiple: boolean;
}

/** True for strings with at least one non-whitespace character. */
function isUsableString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/** First usable (non-empty, non-whitespace) string among the candidates, else `undefined`. */
function firstUsableString(...candidates: Array<string | undefined>): string | undefined {
    return candidates.find(isUsableString);
}

function cyrb128(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return (h ^ (h >>> 13)) >>> 0;
}

function mulberry32(a: number) {
    let state = a;
    return function() {
      let t = state += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

function seededShuffle<T>(array: T[], seedStr: string): T[] {
    const seed = cyrb128(seedStr);
    const rng = mulberry32(seed);
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function getPreviewSeed(): string {
    if (typeof window === 'undefined') { return 'server-fallback'; }
    let seed = window.sessionStorage.getItem('ez_preview_seed');
    if (!seed) {
        seed = Math.random().toString(36).substring(2);
        window.sessionStorage.setItem('ez_preview_seed', seed);
    }
    return seed;
}

/**
 * Single choke point for option identity. Radix's SelectItem throws on an
 * empty `value`, and `id`/`alias` both double as React keys and stored
 * values, so every option leaving this hook must have a non-empty `id` and
 * `alias` — regardless of which source (legacy, static, list, table_column)
 * produced it. Options with neither a usable label nor a usable id/alias
 * carry nothing to show or store, so they're dropped instead of guessed at.
 */
function normalizeChoiceOptions(rawOptions: ChoiceOption[]): ChoiceOption[] {
    const normalized: ChoiceOption[] = [];

    rawOptions.forEach((opt, idx) => {
        const fallback = `opt${idx}`;
        const id = firstUsableString(opt.id, opt.alias);
        const alias = firstUsableString(opt.alias, opt.id);

        if (!isUsableString(opt.label) && id === undefined && alias === undefined) {
            return;
        }

        normalized.push({ ...opt, id: id ?? fallback, alias: alias ?? fallback });
    });

    return normalized;
}

/**
 * Parses `config.options` into a `DynamicOptionsConfig` when it's the
 * discriminated-union (dynamic) shape, else `undefined` for the plain
 * `ChoiceOption[]` (static/legacy) shape.
 */
function parseDynamicOptionsConfig(config: unknown): DynamicOptionsConfig | undefined {
    const advancedConfig = config as ChoiceAdvancedConfig | undefined;
    const configOptions = advancedConfig?.options;
    const isDynamic = configOptions !== null && typeof configOptions === "object" && "type" in configOptions;
    return isDynamic ? configOptions : undefined;
}

export function useChoiceOptions(
    step: Step,
    context?: Record<string, unknown>,
    aliasMap?: Record<string, string>,
    runId?: string
): UseChoiceOptionsResult {
    const [options, setOptions] = useState<ChoiceOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Shared with the builder so a saved question can't render one way in the
    // editor and another in the run: it also folds the legacy
    // dropdown + searchable pair into 'combobox'.
    const displayMode = resolveChoiceDisplay(
        step.type === "choice" ? (step.config as ChoiceAdvancedConfig | undefined) : undefined,
        step.type
    );
    const allowMultiple = displayMode === "multiple";

    // Option resolution only ever reads one thing off `context`: the source
    // list for a `type: 'list'` dynamic config (table_column/static/legacy
    // read nothing from it). `listVariableValue` narrows the effect's
    // dependency to that single value instead of the whole run value map —
    // see the effect below.
    const dynamicOptionsConfig = step.type === "choice" ? parseDynamicOptionsConfig(step.config) : undefined;
    const listVariable = dynamicOptionsConfig?.type === "list" ? dynamicOptionsConfig.listVariable : undefined;
    const resolvedStepId = listVariable !== undefined ? aliasMap?.[listVariable] : undefined;
    const listVariableValue = listVariable !== undefined
        ? (context && Object.prototype.hasOwnProperty.call(context, listVariable)
            ? context[listVariable]
            : (resolvedStepId !== undefined && context && Object.prototype.hasOwnProperty.call(context, resolvedStepId)
                ? context[resolvedStepId]
                : undefined))
        : undefined;

    const parseLegacyOptions = (rawOptions: unknown): ChoiceOption[] => {
        if (!Array.isArray(rawOptions)) {
            return [];
        }

        return rawOptions.map((opt: string | LegacyOption): ChoiceOption => {
            if (typeof opt === "string") {
                return { id: opt, label: opt, alias: opt };
            }
            return {
                id: opt.id ?? "",
                label: opt.label ?? "",
                alias: opt.alias ?? "",
            };
        });
    };

    const fetchTableOptions = async (dynamicConfig: DynamicOptionsConfig): Promise<ChoiceOption[]> => {
        if (dynamicConfig.type !== 'table_column') {
            return [];
        }

        const { tableId, columnId, labelColumnId, limit = 100 } = dynamicConfig;

        const query = new URLSearchParams({ columnId, limit: String(limit) });
        if (labelColumnId) {
            query.set('labelColumnId', labelColumnId);
        }
        const response = await fetch(
            `/api/datavault/tables/${encodeURIComponent(tableId)}/options?${query.toString()}`,
            { method: 'GET', headers: getAuthHeaders(), credentials: 'include' }
        );
        if (!response.ok) {
            throw new Error(`Failed to fetch table options: ${response.statusText}`);
        }
        const data = (await response.json()) as TableOptionsResponse;

        return data.options.map(({ value, label }) => ({
            id: value,
            alias: value,
            label,
        }));
    };

    const resolveDynamicOptions = async (
        dynamicConfig: DynamicOptionsConfig,
        ctx: Record<string, unknown> | undefined
    ): Promise<ChoiceOption[]> => {
        if (dynamicConfig.type === 'static') {
            return dynamicConfig.options ?? [];
        }

        if (dynamicConfig.type === 'list') {
            const { listVariable: sourceListVariable } = dynamicConfig;

            if (ctx && sourceListVariable) {
                const resolvedKey = aliasMap?.[sourceListVariable];
                const listData = Object.prototype.hasOwnProperty.call(ctx, sourceListVariable)
                    ? ctx[sourceListVariable]
                    : (resolvedKey !== undefined && Object.prototype.hasOwnProperty.call(ctx, resolvedKey)
                        ? ctx[resolvedKey]
                        : undefined);

                if (listData !== undefined) {
                    return generateOptionsFromList(listData, dynamicConfig, ctx);
                }
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
            return config?.options ?? [];
        };

        return parseLegacyOptions(getRawOptions());
    };

    const getAdvancedOptions = async (
        config: unknown,
        ctx: Record<string, unknown> | undefined
    ): Promise<ChoiceOption[]> => {
        const dynamicConfig = parseDynamicOptionsConfig(config);
        if (dynamicConfig) {
            return resolveDynamicOptions(dynamicConfig, ctx);
        }

        const advancedConfig = config as ChoiceAdvancedConfig | undefined;
        return (advancedConfig?.options as ChoiceOption[] | undefined) ?? [];
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
                    let finalOptions = normalizeChoiceOptions(newOptions);
                    
                    const advancedConfig = step.config as ChoiceAdvancedConfig | undefined;
                    if (advancedConfig?.randomizeOrder) {
                        const seedStr = `${runId ? runId : getPreviewSeed()}-${step.id}`;
                        finalOptions = seededShuffle(finalOptions, seedStr);
                    }
                    
                    setOptions(finalOptions);
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
        // Deliberately narrower than [step, context]: `context` is the whole
        // run value map and changes on every keystroke in any field on the
        // page. Option resolution only ever reads context[listVariable] (for
        // `type: 'list'`), so depending on the full object would refetch/
        // rebuild options — including issuing a table_column network request
        // — on every unrelated keystroke. listVariableValue is that narrowed
        // read; list-backed options still refresh when it changes. We also
        // exclude `options` itself to avoid an infinite loop when a resolver
        // returns [].
    }, [step, listVariableValue, resolvedStepId]);

    return {
        options,
        loading,
        error,
        displayMode,
        allowMultiple
    };
}
