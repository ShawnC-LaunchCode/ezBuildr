/**
 * Shared route error → HTTP status/message classifier.
 *
 * Background: the SEC-029 error-leakage remediation replaced `error.message` in
 * responses with hardcoded generic strings, but many handlers still derived the
 * status code from that hardcoded string (`message.includes('not found') ? 404
 * : message.includes('Access denied') ? 403 : 500`). Because the fallback never
 * contains those substrings, every error collapsed to 500 — masking 403/404.
 *
 * This helper derives the status from the ACTUAL thrown error while keeping the
 * security invariant intact:
 *   - Intentional 4xx errors (authorization / not-found) expose their message,
 *     which services throw deliberately and safely ("Access denied - ...",
 *     "... not found").
 *   - Unexpected 5xx errors return ONLY the generic fallback, so internal error
 *     details are never echoed to clients.
 */
export function classifyRouteError(
  error: unknown,
  fallback: string,
): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : '';
  if (raw.includes('not found')) {
    return { status: 404, message: raw };
  }
  // "Only the ..." covers owner-only operations, e.g. "Only the project owner
  // can grant owner access to others" (ProjectService / WorkflowService).
  if (raw.includes('Access denied') || raw.includes('Unauthorized') || raw.includes('Only the')) {
    return { status: 403, message: raw };
  }
  return { status: 500, message: fallback };
}
