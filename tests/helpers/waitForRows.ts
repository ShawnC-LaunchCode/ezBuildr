/**
 * Poll a query until it returns the rows you are waiting for.
 *
 * WHY THIS EXISTS. Audit entries are written fire-and-forget: the HTTP response
 * returns before `audit_logs` has the row. Tests covering them were written as
 *
 *     await new Promise((r) => setTimeout(r, 100));
 *     const logs = await getOwnerDb().select().from(auditLogs).where(...);
 *     expect(logs).toHaveLength(1);
 *
 * A fixed 100ms grace period is not a synchronisation primitive, it is a bet on
 * how loaded the machine is. It held for as long as the whole suite ran pinned
 * to a single worker with the box to itself. The moment that changed, CI --
 * 4 cores, several workers -- lost the bet: `datavault.routes.test.ts` failed
 * with `expected [] to have a length of 1`, the write simply not yet landed.
 * The same file had been showing up intermittently in the RLS gate too.
 *
 * Waiting for the CONDITION instead of for a duration fixes the whole class,
 * and is faster in the normal case: it returns as soon as the row appears
 * rather than always burning the full 100ms.
 *
 * @param query     Runs the query. Called repeatedly, so it must be a thunk.
 * @param isReady   Given the rows, is this what we were waiting for?
 *                  Defaults to "at least one row".
 * @param timeoutMs Give up after this long. Generous on purpose -- the point is
 *                  to absorb a slow runner, and a genuinely missing write still
 *                  fails, just later. Stays well inside the 30s testTimeout.
 *
 * Returns the LAST result either way, so a timeout still fails on the caller's
 * own assertion with its own message ("expected [] to have a length of 1")
 * rather than on an opaque timeout error.
 */
export async function waitForRows<T>(
  query: () => Promise<T[]>,
  isReady: (rows: T[]) => boolean = (rows) => rows.length > 0,
  timeoutMs = 5000,
): Promise<T[]> {
  const deadline = Date.now() + timeoutMs;
  let rows = await query();

  while (!isReady(rows) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    rows = await query();
  }

  return rows;
}

/**
 * `waitForRows` for the common "exactly N audit entries" case.
 *
 * Note this waits for `>= count`, not `=== count`: a test asserting exactly one
 * entry must still fail when a second is written, and stopping at `=== count`
 * would race past a duplicate and hide precisely the double-write bug the
 * assertion is there to catch. The caller's `toHaveLength` remains the check.
 */
export async function waitForAuditLogs<T>(
  query: () => Promise<T[]>,
  count = 1,
  timeoutMs = 5000,
): Promise<T[]> {
  return waitForRows(query, (rows) => rows.length >= count, timeoutMs);
}
