/**
 * QuestionTypeIcon
 *
 * The single visual mark for a question type, used everywhere a type is shown:
 * the add-question menu, step cards, the outline tree, the type selector.
 *
 * Two rules make the set scannable:
 *
 *  1. Colour comes from the type's BLOCK_REGISTRY *category*, not the type
 *     itself, so the eye sorts questions into data families (text / choice /
 *     numeric / ...) before reading a single label.
 *  2. The mark is notation where a canonical one exists ("T", "@", "#",
 *     "Y/N") and a stroke icon everywhere else. See `glyph` in blockRegistry.
 *
 * Tints, foregrounds and borders live in index.css as --qtype-* triplets,
 * mirroring the older --block-* convention, and every pair is verified to
 * clear WCAG AA in both light and dark themes.
 */

import { FileText } from "lucide-react";

import {
  getQuestionTypePresentation,
  type BlockCategory,
  type QuestionTypePresentation,
} from "@/lib/blockRegistry";
import { cn } from "@/lib/utils";

/**
 * Whole class names per category — never interpolated, so Tailwind's JIT can
 * see them. Adding a category means adding a row here and a --qtype-* triplet
 * in index.css.
 */
const CATEGORY_TILE: Record<BlockCategory, string> = {
  text: "bg-qtype-text text-qtype-text-foreground ring-qtype-text-border",
  boolean: "bg-qtype-boolean text-qtype-boolean-foreground ring-qtype-boolean-border",
  structure: "bg-qtype-structure text-qtype-structure-foreground ring-qtype-structure-border",
  validated: "bg-qtype-validated text-qtype-validated-foreground ring-qtype-validated-border",
  datetime: "bg-qtype-datetime text-qtype-datetime-foreground ring-qtype-datetime-border",
  choice: "bg-qtype-choice text-qtype-choice-foreground ring-qtype-choice-border",
  numeric: "bg-qtype-numeric text-qtype-numeric-foreground ring-qtype-numeric-border",
  advanced: "bg-qtype-advanced text-qtype-advanced-foreground ring-qtype-advanced-border",
  display: "bg-qtype-display text-qtype-display-foreground ring-qtype-display-border",
  // No blocks carry this category today; it falls back to the neutral tile.
  output: "bg-qtype-display text-qtype-display-foreground ring-qtype-display-border",
};

const SIZE_TILE = {
  sm: "h-5 w-5 rounded-[5px]",
  md: "h-6 w-6 rounded-md",
} as const;

const SIZE_ICON = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
} as const;

/**
 * Glyphs are 1-3 characters, so the type has to shrink as the mark gets
 * longer or "Y/N" overruns a 20px tile.
 */
function glyphClass(glyph: string, size: "sm" | "md"): string {
  const len = [...glyph].length;
  if (len <= 1) { return size === "sm" ? "text-[12px]" : "text-[14px]"; }
  if (len === 2) { return size === "sm" ? "text-[10px]" : "text-[11px]"; }
  // Three-character marks ("Y/N", "T/F") are the tightest case. Measured in
  // JetBrains Mono with tracking-tighter these come to ~14.9px inside a 20px
  // tile, so they still clear the edge — an earlier 8px was needlessly small.
  return size === "sm" ? "text-[9px]" : "text-[10px]";
}

export interface QuestionTypeIconProps {
  /** Step type, e.g. "short_text". Unknown types fall back to a neutral tile. */
  type: string;
  /** Stored config used to distinguish presets sharing one canonical type. */
  config?: unknown;
  /** Preset-specific display metadata when stored type alone is ambiguous. */
  presentation?: QuestionTypePresentation;
  size?: "sm" | "md";
  className?: string;
  /**
   * Every current call site renders a text label beside the tile, so the tile
   * is decorative by default. Pass `labelled` where it stands alone.
   */
  labelled?: boolean;
}

export function QuestionTypeIcon({
  type,
  config,
  presentation,
  size = "md",
  className,
  labelled = false,
}: QuestionTypeIconProps) {
  const entry = presentation ?? getQuestionTypePresentation(type, config);
  const Icon = entry?.icon ?? FileText;
  const glyph = entry?.glyph;
  const tile = CATEGORY_TILE[entry?.category ?? "display"];

  const a11y = labelled
    ? { role: "img" as const, "aria-label": entry?.label ?? type }
    : { "aria-hidden": true };

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center ring-1 ring-inset",
        SIZE_TILE[size],
        tile,
        className
      )}
      title={entry?.label ?? type}
      {...a11y}
    >
      {glyph !== undefined ? (
        <span
          className={cn(
            "select-none font-mono font-semibold leading-none tracking-tighter",
            glyphClass(glyph, size)
          )}
        >
          {glyph}
        </span>
      ) : (
        <Icon className={SIZE_ICON[size]} strokeWidth={2.25} />
      )}
    </span>
  );
}
