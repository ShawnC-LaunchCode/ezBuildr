/**
 * Legacy Final Documents section template entries.
 *
 * `section.config.finalBlock === true` sections (the "legacy" authoring path
 * predating the Final Block step type) store selected templates as
 * `config.templates`. Historically this was always a bare template-id
 * string. LU-5 widens each entry so it can optionally carry a per-document
 * `conditions` (the same `ConditionExpression` language `steps.visible_if` /
 * `FinalBlockConfig.documents[].conditions` already use), while keeping the
 * bare-string form readable — it is the documented legacy contract, and the
 * only shape any historical row can actually contain.
 *
 * Both the legacy-section editor (`FinalDocumentsSectionEditor.tsx`) and the
 * two server readers (`RunLifecycleService.buildLegacyFinalBlockConfig`,
 * `workflowStructureRules.checkLegacyFinalSections`) go through
 * `normalizeFinalDocumentsTemplateEntry` so there is exactly one place that
 * understands both forms.
 */
import type { ConditionExpression } from "./types/conditions";

export type FinalDocumentsTemplateEntry =
  | string
  | { templateId: string; conditions?: ConditionExpression | null };

export interface NormalizedFinalDocumentsTemplateEntry {
  templateId: string;
  conditions: ConditionExpression | null;
}

/**
 * Normalize one `config.templates` entry, tolerating both the legacy
 * bare-string form and the widened `{ templateId, conditions? }` object
 * form. Returns `null` for an entry that is neither — callers treat that the
 * same way they already treat an empty/invalid id (skip or report, per
 * caller).
 */
export function normalizeFinalDocumentsTemplateEntry(
  entry: unknown
): NormalizedFinalDocumentsTemplateEntry | null {
  if (typeof entry === "string") {
    return { templateId: entry, conditions: null };
  }

  if (typeof entry === "object" && entry !== null) {
    const raw = entry as { templateId?: unknown; conditions?: unknown };
    if (typeof raw.templateId === "string") {
      return {
        templateId: raw.templateId,
        conditions: (raw.conditions ?? null) as ConditionExpression | null,
      };
    }
  }

  return null;
}
