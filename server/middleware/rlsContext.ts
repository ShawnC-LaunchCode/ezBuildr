import { runWithTenantContext } from "../utils/rlsContext";

import type { AuthRequest } from "./auth";
import type { Request, Response, NextFunction } from "express";

/**
 * RLS tenant-context middleware (SEC-051).
 *
 * Binds the request's resolved tenant into an AsyncLocalStorage context so that
 * `withCurrentTenant()` (server/utils/rlsContext.ts) can open tenant-scoped
 * transactions without threading the tenant id through every call.
 *
 * Mount AFTER the auth middleware that sets `req.tenantId`. It is a safe no-op
 * when there is no tenant on the request (public/unauthenticated routes) and
 * has no effect on query behaviour until RLS enforcement is turned on — it only
 * makes the tenant available to code that opts into `withCurrentTenant`.
 */
export function rlsContext(req: Request, _res: Response, next: NextFunction): void {
  const tenantId = (req as AuthRequest).tenantId;
  if (!tenantId) {
    next();
    return;
  }
  runWithTenantContext(tenantId, () => {
    next();
  });
}
