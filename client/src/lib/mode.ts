/**
 * Mode System Utilities
 * Helpers for Easy/Advanced mode feature gating
 */

export type Mode = 'easy' | 'advanced';
export type ModeSource = 'user' | 'workflow';

/**
 * Resolve the effective mode for a workflow
 * Precedence: workflow.modeOverride ?? user.defaultMode
 */
export function resolveMode(
  workflowModeOverride: Mode | null | undefined,
  userDefaultMode: Mode
): Mode {
  return workflowModeOverride ?? userDefaultMode;
}

/**
 * Feature definitions for each mode
 */
export const FEATURES = {
  // Block types available in easy mode
  EASY_BLOCK_TYPES: ['prefill', 'validate', 'branch'] as const,

  // All block types (advanced mode)
  ALL_BLOCK_TYPES: ['prefill', 'validate', 'branch', 'js'] as const,

  // Logic operators available in easy mode
  EASY_OPERATORS: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'] as const,

  // All operators (advanced mode)
  ALL_OPERATORS: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'between', 'is_empty', 'is_not_empty'] as const,
};

/**
 * Check if a feature is allowed in the current mode
 */
export function isFeatureAllowed(mode: Mode, feature: string): boolean {
  if (mode === 'advanced') {
    return true; // All features available in advanced mode
  }

  // Easy mode restrictions
  if (feature.startsWith('block:')) {
    const blockType = feature.substring(6);
    return FEATURES.EASY_BLOCK_TYPES.includes(blockType as any);
  }

  if (feature.startsWith('operator:')) {
    const operator = feature.substring(9);
    return FEATURES.EASY_OPERATORS.includes(operator as any);
  }

  if (feature === 'raw_json_editor') {
    return false; // Not available in easy mode
  }

  if (feature === 'transform_blocks') {
    return false; // Not available in easy mode
  }

  // Default: allow
  return true;
}

/**
 * Get available block types for a mode
 */
export function getAvailableBlockTypes(mode: Mode): readonly string[] {
  return mode === 'easy' ? FEATURES.EASY_BLOCK_TYPES : FEATURES.ALL_BLOCK_TYPES;
}

/**
 * Get available operators for a mode
 */
export function getAvailableOperators(mode: Mode): readonly string[] {
  return mode === 'easy' ? FEATURES.EASY_OPERATORS : FEATURES.ALL_OPERATORS;
}

/**
 * Get a user-friendly label for mode + source
 */
export function getModeLabel(mode: Mode, source: ModeSource): string {
  const modeText = mode === 'easy' ? 'Easy' : 'Advanced';
  const sourceText = source === 'user' ? 'from Account' : 'overridden';
  return `${modeText} (${sourceText})`;
}
