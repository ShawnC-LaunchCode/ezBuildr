import express, { type Express } from 'express';

import { createLogger } from '../../server/logger';
import { rlsContext } from '../../server/middleware/rlsContext';
import { registerAuthRoutes } from '../../server/routes/auth.routes';

const logger = createLogger({ module: 'test-app' });

/**
 * An app with the shared middleware but NO routes — for suites that register
 * their own (`ai/workflowEdit`, `api.ai.personalization`, `js_helpers`,
 * `auth/oauth2.callback`).
 *
 * Separate from `createTestApp` on purpose. Those suites do not want
 * `registerAuthRoutes`: several `vi.mock` the auth middleware module with only
 * the exports THEY use, so pulling the auth routes in fails with
 * `No "optionalHybridAuth" export is defined on the mock`. Reusing one function
 * for both needs conflated "give me the app-wide middleware" with "give me the
 * auth endpoints", and briefly broke both.
 *
 * `rlsContext` is the part that matters here — see the note on
 * {@link createTestApp}.
 */
export function createBareTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(rlsContext);
  return app;
}

/**
 * Create a test Express app instance.
 *
 * A minimal app with **auth routes** registered, for suites that need to log in
 * (`auth.*.real`, `mfa.flow.real`, `session.management.real`,
 * `trusted.devices.real`, `repro_ai_access_denied`). Suites that exercise other
 * routes register them on top of what this returns.
 *
 * ---
 *
 * **`app.use(rlsContext)` is load-bearing (RLS-5).** `server/index.ts:62`
 * mounts it app-wide, and a test app that skips it is quietly exercising a
 * DIFFERENT application than the one that ships: with no async-context store
 * for the request, `hybridAuth`'s `setCurrentTenantId` is a documented no-op,
 * the ambient tenant is never populated, and every `withCurrentTenant` in the
 * request runs unscoped.
 *
 * Nothing revealed that while the app connected as the table owner — an
 * unscoped transaction still saw every row. Under a non-owner role it was the
 * single largest source of failures: `ai/workflowEdit.test.ts` alone failed 34
 * tests, every one of them "Workflow not found" from a `verifyAccess` whose
 * `withCurrentTenant` had no tenant to apply.
 *
 * It must sit AFTER the body parsers and BEFORE any route registration, which
 * is the order `server/index.ts` uses.
 *
 * A suite that MOCKS `hybridAuth` needs one more thing this cannot provide:
 * the mock must call `setCurrentTenantId` itself. Setting `req.tenantId` looks
 * equivalent to what the real middleware does and is not.
 */
export function createTestApp(): Express {
  const app = express();

  // Enable trust proxy for X-Forwarded-For header support
  app.set('trust proxy', true);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mirrors server/index.ts — see the note above.
  app.use(rlsContext);

  // Register auth routes
  registerAuthRoutes(app);

  // Error handler

  app.use((err: any, req: any, res: any, _next: any) => {
    logger.error({ error: err }, 'Test app error');
    res.status(500).json({ message: 'Internal server error', error: err.message });
  });

  return app;
}
