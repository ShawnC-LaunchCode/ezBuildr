/**
 * Shared types for the document onboarding wizard (GH-167).
 *
 * Deliberately not importing from `server/lib/ai/DocumentAIAssistService.ts`
 * (server-only module with heavy document-parsing deps) — the small shapes
 * this wizard actually reads from `/api/ai/doc/*` are redeclared here.
 */

import type { StepConfig } from "@shared/types/stepConfigs";

/** One row of `POST /api/ai/doc/analyze`'s `variables` array. */
export interface AnalyzedVariable {
  name: string;
  confidence: number;
  source: "explicit_tag" | "ai_inferred";
  type?: "text" | "date" | "number" | "boolean" | "array";
  context?: string;
}

export interface AnalyzeDocumentResult {
  variables: AnalyzedVariable[];
  suggestions: string[];
}

/**
 * A single row on the wizard's Review & Approve step — an extracted
 * variable plus the author-editable question type and alias (AC2).
 */
export interface OnboardingVariable {
  /** Original variable/placeholder name as extracted from the document. */
  name: string;
  /** Author-editable alias (human-friendly variable name). */
  alias: string;
  /** Canonical persisted type selected by the author. */
  type: string;
  /** Stable picker identity when friendly actions share a canonical type. */
  presetId?: string;
  /** Canonical type-specific config selected by the friendly action. */
  config?: StepConfig;
  /** Human-readable label used as the generated question's title. */
  label: string;
  confidence: number;
  source: "explicit_tag" | "ai_inferred";
}
