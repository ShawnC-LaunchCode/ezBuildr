import express, { type Express } from 'express';

import { rlsContext } from '../../server/middleware/rlsContext';

/**
 * An Express app wired the way the real server wires one.
 *
 * 27 integration suites build their own app with a bare `express()` +
 * `express.json()` and then register a handful of routes. That skips
 * `server/index.ts:62`'s app-wide `app.use(rlsContext)` — and without it there
 * is no async-context store for the request, so `hybridAuth`'s
 * `setCurrentTenantId` is a documented no-op and the ambient tenant is never
 * populated.
 *
 * Nothing showed that while the app connected as the table owner: an unscoped
 * transaction still saw every row. Under a non-owner role it is the single
 * biggest source of failures — `ai/workflowEdit.test.ts` alone failed 34 tests,
 * every one of them "Workflow not found" from a `verifyAccess` whose
 * `withCurrentTenant` had no tenant to apply. That is a defect in the TEST
 * HARNESS, not in the routes: production mounts the middleware app-wide, so
 * these suites were quietly exercising a different application than the one
 * that ships.
 *
 * Use this instead of `express()` in any suite that registers real routes.
 */
export function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(rlsContext);
  return app;
}
