/**
 * Read-only nested outline for a List answer (LIST-10) — used by
 * ReviewSection.tsx to show a respondent what they entered into a `list`
 * step before submission. Every item is expanded inline; there is no
 * drilling and no editing affordance, because this is a confirmation
 * surface, not an editor. Reuses `resolveItemLabel` (LIST-8) for item
 * headings rather than re-deriving label-template resolution a second time.
 */
import { formatAnswerValue } from "@/lib/formatAnswerValue";

import { LIST_VALIDATION_MAX_DEPTH } from "@shared/validation/BlockValidation";
import type { ListConfig, ListItem, ListValue } from "@shared/types/stepConfigs";

import { normalizeListConfig, normalizeListValue, resolveItemLabel } from "./listRuntime";

interface ListAnswerViewProps {
  config: ListConfig;
  value: ListValue | null | undefined;
  /** 1 = the top-level list step itself; grows as nested list fields recurse. */
  depth?: number;
}

export function ListAnswerView({ config, value, depth = 1 }: ListAnswerViewProps) {
  const listConfig = normalizeListConfig(config);
  const listValue = normalizeListValue(value);

  if (listValue.items.length === 0) {
    return <p className="text-sm italic text-muted-foreground">None added</p>;
  }

  return (
    <ol className="space-y-3">
      {listValue.items.map((item, index) => (
        <li key={item.itemId} className="rounded-md border border-slate-100 bg-slate-50/50 p-3">
          <ListAnswerItem item={item} config={listConfig} index={index} depth={depth} />
        </li>
      ))}
    </ol>
  );
}

interface ListAnswerItemProps {
  item: ListItem;
  config: ListConfig;
  index: number;
  depth: number;
}

function ListAnswerItem({ item, config, index, depth }: ListAnswerItemProps) {
  const label = resolveItemLabel(item, config, `Item ${index + 1}`);
  const fields = [...config.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <div className="space-y-2 border-l-2 border-slate-200 pl-3">
        {fields.map((field) => {
          if (field.kind === "question") {
            return (
              <div key={field.id} className="grid grid-cols-1 gap-0.5 sm:grid-cols-3 sm:gap-2">
                <span className="text-xs font-medium text-slate-500 sm:col-span-1">{field.title}</span>
                <span className="break-words text-sm text-slate-900 sm:col-span-2">
                  {formatAnswerValue(item.values[field.alias])}
                </span>
              </div>
            );
          }

          const nestedValue = normalizeListValue(item.values[field.alias]);
          const nextDepth = depth + 1;

          return (
            <div key={field.id} className="space-y-1">
              <span className="block text-xs font-medium text-slate-500">{field.title}</span>
              {nextDepth > LIST_VALIDATION_MAX_DEPTH && nestedValue.items.length > 0 ? (
                <MoreLevelsSummary value={nestedValue} config={field.list} />
              ) : (
                <ListAnswerView config={field.list} value={nestedValue} depth={nextDepth} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoreLevelsSummary({ value, config }: { value: ListValue; config: ListConfig }) {
  const levels = countNestingLevels(value, normalizeListConfig(config));
  return (
    <p className="pl-3 text-xs italic text-slate-400">
      +{levels} more level{levels === 1 ? "" : "s"}
    </p>
  );
}

/**
 * How many further levels of nesting exist below this list's items — used
 * only for the "+N more levels" cutoff message once display recursion
 * passes `LIST_VALIDATION_MAX_DEPTH`. Compliant data never reaches this
 * (the same constant is enforced at write time by the builder/server/
 * runner), so this is a defensive display cap rather than a normal path.
 */
function countNestingLevels(value: ListValue, config: ListConfig): number {
  let deepest = 0;
  for (const item of value.items) {
    for (const field of config.fields) {
      if (field.kind !== "list") {
        continue;
      }
      const nested = normalizeListValue(item.values[field.alias]);
      if (nested.items.length === 0) {
        continue;
      }
      deepest = Math.max(deepest, countNestingLevels(nested, field.list));
    }
  }
  return 1 + deepest;
}
