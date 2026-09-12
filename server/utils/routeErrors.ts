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
  const statusCode = typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return { status: statusCode, message: raw };
  }

  if (raw.includes('not found')) {
    return { status: 404, message: raw };
  }
  // RLS-2e: a caller with no tenant in the async context is an AUTHORIZATION
  // outcome, not a server fault. `withCurrentTenant` fails closed and throws
  // "RLS: no tenant in context." — correct — but before the RLS-2 rollout the
  // same request reached the service's own tenancy check and returned a clean
  // 403. Without this rule it became a 500, and it is reachable in normal use:
  // every route using `hybridAuth` WITHOUT `requireTenant` admits an
  // authenticated user whose `tenantId` is still null (a freshly registered
  // account is exactly that), so this affects all 21 converted services rather
  // than one route. Caught by api.workflows.test.ts's "reject move of workflow
  // user does not own", which expected 403 and got 500.
  //
  // Placed before the generic rule so the client message stays specific while
  // the status matches what a tenancy check would have returned.
  if (raw.includes('RLS: no tenant in context')) {
    return { status: 403, message: 'Access denied - no tenant context for this request' };
  }
  // "Only the ..." covers owner-only operations, e.g. "Only the project owner
  // can grant owner access to others" (ProjectService / WorkflowService).
  if (raw.includes('Access denied') || raw.includes('Unauthorized') || raw.includes('Only the')) {
    return { status: 403, message: raw };
  }
  if (raw.includes('Validation error')) {
    return { status: 400, message: raw };
  }
  return { status: 500, message: fallback };
}
