/** Mode System Utilities — persisted mode resolution lives in shared/. */
import type { Mode, ModeSource } from '@shared/mode';

export { resolveMode } from '@shared/mode';
export type { Mode, ModeSource } from '@shared/mode';

/*
 * LIST-B2 (2026-09-10): the `FEATURES` feature-gate that used to live here is
 * gone — `EASY_BLOCK_TYPES` / `ALL_BLOCK_TYPES` / `EASY_OPERATORS` /
 * `ALL_OPERATORS`, plus `isFeatureAllowed`, `getAvailableBlockTypes` and
 * `getAvailableOperators`. The operator lists never had a caller; the block-type
 * lists had exactly one, `RegularBlockForm`'s Block Type picker, which was
 * permanently `disabled` because the dialog is only ever opened on an existing
 * block. So the lists silently decided nothing except which types that
 * read-only control could *name* — and `EASY_BLOCK_TYPES` omitted `list_tools`,
 * which is how a List Tools block came to render a blank Block Type field in
 * Easy mode.
 *
 * List Tools is an Easy-mode block by every other measure: the page canvas's
 * Add Action menu offers it under `LOGIC_TYPES.easy`, `BlockTreeItem` counts it
 * `isEditableInEasyMode`, and `ListToolsBlockEditor` has a dedicated easy
 * branch. Mode still shapes that editor's own surface (it hides Transform and
 * Derived Outputs in easy mode) — it is just no longer expressed as a list of
 * strings nothing reads. Do not reintroduce one; put the check where the
 * feature lives.
 */

/**
 * Get a user-friendly label for mode + source
 */
export function getModeLabel(mode: Mode, source: ModeSource): string {
  const modeText = mode === 'easy' ? 'Easy' : 'Advanced';
  const sourceText = source === 'user' ? 'from Account' : 'overridden';
  return `${modeText} (${sourceText})`;
}
