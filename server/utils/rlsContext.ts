import { AsyncLocalStorage } from "async_hooks";

import { sql } from "drizzle-orm";

import { db } from "../db";
import { createLogger } from "../logger";

import type { SQL } from "drizzle-orm";

/** Minimal shape we need from a Drizzle transaction: the ability to run raw SQL. */
type ExecutableTx = { execute: (query: SQL) => Promise<unknown> };

/**
 * Row-Level Security runtime context (SEC-051, phase 2).
 *
 * The database policies installed in migration 0001 gate every tenant row on
 * the `app.current_tenant_id` GUC. This module is how a request tells Postgres
 * which tenant it is.
 *
 * WHY TRANSACTION-SCOPED `SET LOCAL` (not session `SET`):
 *   The app runs on a connection POOL (Neon serverless in prod). A session-level
 *   `SET app.current_tenant_id = ...` would stick to the physical connection and
 *   leak into the NEXT request that reuses it — a cross-tenant hazard worse than
 *   the problem we are solving. `set_config(..., is_local => true)` inside a
 *   transaction is scoped to that transaction only and is reset on COMMIT/ROLLBACK,
 *   so it is safe under pooling. Therefore all RLS-scoped work must run inside a
 *   transaction opened by `withTenant`.
 *
 * ENFORCEMENT IS OPT-IN:
 *   Until `RLS_ENFORCED=true` AND the tables are put in FORCE mode (or the app
 *   connects as a non-owner role), the policies are inert (owner/superuser bypass
 *   RLS). This module is safe to wire up before enforcement is turned on — see
 *   docs/architecture/TENANT_ISOLATION_RLS.md for the rollout runbook.
 */

const logger = createLogger({ module: "rls-context" });

interface TenantStore {
  tenantId?: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/** True when RLS enforcement plumbing should be active. Default: off. */
export function isRlsEnforced(): boolean {
  return process.env.RLS_ENFORCED === "true";
}

/** The tenant bound to the current async context, if any. */
export function getCurrentTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

/**
 * Bind a tenant to the current async context for the duration of `fn`.
 * Used by request middleware so downstream code (and withTenant) can find the
 * active tenant without threading it through every call.
 */
export function runWithTenantContext<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/**
 * Open an async context for a request WITHOUT a known tenant yet, and run `fn`
 * inside it. Exists because ezBuildr resolves auth per-route (`hybridAuth` /
 * `optionalHybridAuth` are declared inline on each route, not as a single
 * global middleware that runs before dispatch) rather than once up front, so
 * the request-level middleware that opens this context (`server/middleware/
 * rlsContext.ts`) necessarily runs BEFORE the tenant id is known. Downstream
 * auth resolution calls `setCurrentTenantId` once it has one; because
 * AsyncLocalStorage propagates through the rest of the request's async call
 * chain, that later write is visible to everything that runs after it
 * (route handlers, repositories) even though the context itself opened
 * earlier.
 */
export function runWithRequestContext<T>(fn: () => T): T {
  return storage.run({}, fn);
}

/**
 * Bind a tenant id into the CURRENT async context, if one is open. No-op if
 * called outside of `runWithRequestContext`/`runWithTenantContext` (e.g. a
 * background job that hasn't opened a context) — callers that need a
 * guaranteed context should use `runWithTenantContext` instead.
 */
export function setCurrentTenantId(tenantId: string): void {
  const store = storage.getStore();
  if (store) {
    store.tenantId = tenantId;
  }
}

/**
 * Apply the tenant GUC to an open transaction (transaction-local).
 * Exposed for callers that already manage their own transaction.
 */
export async function applyTenantToTransaction(
  tx: ExecutableTx,
  tenantId: string,
): Promise<void> {
  if (typeof tenantId !== "string" || tenantId.trim().length === 0) {
    throw new Error("RLS: refusing to set an empty tenant id (would disable isolation).");
  }
  // set_config(setting, value, is_local=true) => scoped to this transaction only.
  await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
}

/**
 * Run `fn` inside a transaction whose `app.current_tenant_id` is pinned to
 * `tenantId`, so RLS policies see the correct tenant. This is the primary entry
 * point repositories/services should use once RLS is enforced.
 *
 * `fn` receives the transaction handle — all queries inside MUST use it (not the
 * global `db`) or they will run outside the tenant-scoped transaction.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await applyTenantToTransaction(tx, tenantId);
    return fn(tx);
  });
}

/**
 * Convenience overload that reads the tenant from the current async context
 * (set by the RLS middleware). Throws if no tenant is in context — fail closed.
 */
export async function withCurrentTenant<T>(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    logger.error("withCurrentTenant called with no tenant in async context");
    throw new Error("RLS: no tenant in context.");
  }
  return withTenant(tenantId, fn);
}
