import type { IntakeConfig } from "../../shared/types/intake.js";

/**
 * Filter caller-supplied prefill/initial values against a workflow's intake
 * allowlist (RUN2-6). Shared by every path that can seed a run from
 * caller-controlled data:
 *  - IntakeService.createIntakeRun (public intake portal, ?prefill params)
 *  - RunService.createRun / createAnonymousRun (POST /api/workflows/:id/runs,
 *    POST /api/workflows/public/:slug/start, and the authenticated
 *    creator-run path)
 *
 * Absent `intakeConfig`, or `allowPrefill !== true`, means NO caller-supplied
 * value is applied — every key is dropped silently (never an error). With
 * `allowPrefill: true`, only keys present in `allowedPrefillKeys` survive;
 * everything else is dropped.
 *
 * Only one filtering implementation must exist for this check — do not copy
 * this logic inline elsewhere.
 */
export function filterPrefillValues<T>(
  intakeConfig: IntakeConfig | undefined,
  values: Record<string, T> | undefined
): Record<string, T> {
  const filtered: Record<string, T> = {};
  if (!values || intakeConfig?.allowPrefill !== true || !intakeConfig.allowedPrefillKeys) {
    return filtered;
  }
  const allowedKeys = new Set(intakeConfig.allowedPrefillKeys);
  for (const [key, value] of Object.entries(values)) {
    if (allowedKeys.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
