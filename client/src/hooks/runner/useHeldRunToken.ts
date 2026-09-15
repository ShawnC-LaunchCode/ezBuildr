import { useEffect, useState } from "react";

import { getRunToken } from "@/lib/runTokens";

/**
 * The run token for `runId`, including after submit has cleared it from storage.
 *
 * Submitting a run calls `clearRunToken` (useRunNavigation), so a completed
 * run's token no longer lingers in localStorage. The completion screen still
 * needs it, though: an anonymous respondent's run token is the only credential
 * that can list and download the documents the run just generated, and the
 * server accepts it for a completed run. Reading storage on every render handed
 * that screen `null`, and the documents list answered 401 (2026-09-15).
 *
 * This keeps the last token seen for this run in memory only. Storage stays
 * cleared, so the token does not survive a reload or reach another run. The
 * shareable `/share/:token` link is the way back to documents later.
 */
export function useHeldRunToken(runId: string | null): string | null {
  const stored = runId !== null ? getRunToken(runId) : null;
  const [held, setHeld] = useState<{ runId: string; token: string } | null>(null);

  useEffect(() => {
    if (runId !== null && stored !== null) {
      setHeld({ runId, token: stored });
    }
  }, [runId, stored]);

  if (stored !== null) {
    return stored;
  }
  return held !== null && held.runId === runId ? held.token : null;
}
