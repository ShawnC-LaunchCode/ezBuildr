/**
 * Choice option extraction for the condition/logic builder.
 *
 * O-2: lives in `shared/` because both sides need the same answer — the
 * server populates `WorkflowVariable.choices` from it so the condition editor
 * no longer has to fetch every step just to read its options, and the client
 * type still refers to the same descriptor.
 *
 * Legacy `radio` / `multiple_choice` steps store their options as
 * `{ options: (string | { id?, label?, alias? })[] }` on the step config.
 * The value that ends up in step data when a respondent picks an option is
 * `option.alias ?? option.id` (see
 * `client/src/components/runner/blocks/ChoiceBlock.tsx`'s `getOptionValue`
 * and `useChoiceOptions.ts`'s `parseLegacyOptions`, which is the runtime
 * source of truth). This helper mirrors that exact resolution order so the
 * condition editor's choice dropdown offers values that match stored answers
 * exactly. Keep it in sync if that resolution order ever changes.
 */

interface LegacyChoiceOption {
  id?: string;
  label?: string;
  alias?: string;
}

interface LegacyChoiceStepConfig {
  options?: Array<string | LegacyChoiceOption>;
}

export interface ChoiceOptionDescriptor {
  value: string;
  label: string;
}

/**
 * Extract `{ value, label }` pairs from a legacy radio/multiple_choice step's
 * config. Returns an empty array for any config that isn't the legacy
 * `{ options: [...] }` shape (e.g. null, or the advanced `choice` step type's
 * discriminated-union config, which isn't reachable from a condition today).
 */
export function getLegacyChoiceOptions(config: unknown): ChoiceOptionDescriptor[] {
  const rawOptions = (config as LegacyChoiceStepConfig | null)?.options;
  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions.map((opt, idx) => {
    if (typeof opt === "string") {
      return { value: opt, label: opt };
    }
    const label = opt.label ?? String(opt);
    const value = opt.alias ?? opt.id ?? opt.label ?? `opt${idx}`;
    return { value, label };
  });
}
