/** Shared Easy/Advanced mode contract used by both client and server. */
export type Mode = 'easy' | 'advanced';
export type ModeSource = 'user' | 'workflow';

/** Workflow override wins; otherwise the persisted user default applies. */
export function resolveMode(
  workflowModeOverride: Mode | null | undefined,
  userDefaultMode: Mode,
): Mode {
  return workflowModeOverride ?? userDefaultMode;
}
