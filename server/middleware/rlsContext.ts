import { runWithRequestContext, setCurrentTenantId } from "../utils/rlsContext";

import type { AuthRequest } from "./auth";
import type { Request, Response, NextFunction } from "express";

/**
 * RLS tenant-context middleware (SEC-051).
 *
 * Binds the request's resolved tenant into an AsyncLocalStorage context so that
 * `withCurrentTenant()` (server/utils/rlsContext.ts) can open tenant-scoped
 * transactions without threading the tenant id through every call.
 *
 * Mounted ONCE, globally, at the very top of the middleware stack (see
 * server/index.ts, server/production.ts) — deliberately BEFORE auth, not
 * after. ezBuildr resolves auth per-route: `hybridAuth`/`optionalHybridAuth`/
 * `requireAuth` are declared inline on each route (`app.get(path, hybridAuth,
 * handler)`), not as a single global middleware that runs before dispatch, so
 * there is no point in the stack where `req.tenantId` is already resolved for
 * every request. Instead this middleware opens the AsyncLocalStorage context
 * early and leaves it empty; `server/middleware/auth.ts` (`attachUserToRequest`,
 * `cookieStrategy`) calls `setCurrentTenantId` once a route's own auth
 * middleware resolves the tenant. Because AsyncLocalStorage propagates through
 * the rest of the request's async call chain, that later write is visible to
 * everything downstream (route handlers, repositories) even though this
 * middleware ran before the tenant was known.
 *
 * Safe no-op for public/unauthenticated routes: if nothing ever calls
 * `setCurrentTenantId` for a request, `getCurrentTenantId()` simply returns
 * undefined for its whole lifetime — it never throws.
 */
export function rlsContext(req: Request, _res: Response, next: NextFunction): void {
  runWithRequestContext(() => {
    // Defensive: if a caller ever mounts this after tenant resolution (e.g. a
    // future per-route usage), seed the context immediately instead of
    // waiting on auth.ts to do it.
    const tenantId = (req as AuthRequest).tenantId;
    if (tenantId) {
      setCurrentTenantId(tenantId);
    }
    next();
  });
}
