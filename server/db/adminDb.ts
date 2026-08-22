import * as schema from "@shared/schema";

import { env } from "../config/env";
import { logger } from "../logger";

import type { DrizzleDB } from "../db";
import type { Pool as NeonPool } from '@neondatabase/serverless';
import type { Pool, PoolClient } from 'pg';

/**
 * RLS-6: a SECOND, dedicated connection pool for the admin console's
 * cross-tenant read path.
 *
 * WHY THIS EXISTS: once RLS-4 sets `FORCE ROW LEVEL SECURITY` and the app's
 * normal pool (`server/db.ts`) connects as a non-owner role, every
 * tenant-scoped policy — `USING (tenant_id = current_setting('app.current_tenant_id',
 * true)::uuid)`, with NO platform-admin clause, and `users` is a covered
 * table — would silently restrict `/api/admin` to the acting admin's own
 * tenant. Not an error: a truncated list that looks correct. This module is
 * the escape hatch, and containment is the entire point of it:
 *
 *   - It connects as `ezbuildr_admin_bypass`, a role granted BYPASSRLS —
 *     distinct
 *     from BOTH the table owner the normal pool uses today AND RLS-4's
 *     future least-privilege application role, which must NEVER get
 *     BYPASSRLS (that would return the whole system to "one connection sees
 *     everything" and delete the property Phase 2 exists to create).
 *
 *     ⚠️ **That role does not exist yet in any environment.** An earlier
 *     version of this comment said it was "created in migration
 *     0024_certain_nightcrawler.sql"; there is no such migration here (0024 is
 *     `0024_repair_rls_coverage.sql`) and nothing in the chain creates it —
 *     grep `BYPASSRLS` in migrations/ and the only hits are prose. It is
 *     created per-environment as an operational step, deliberately not as a
 *     migration: roles are cluster-level, migrations are per-database, and the
 *     password must not live in git. See `tickets/RLS4_CUTOVER.md` §1.
 *   - `ADMIN_DATABASE_URL` is a separate env var (see .env.example),
 *     independent of `DATABASE_URL`.
 *   - This module exports exactly one thing callers should use — `adminDb` —
 *     plus the lifecycle helpers every pool module in this app exposes
 *     (`initializeAdminDb`/`closeAdminDb`/`isAdminDbConfigured`, mirroring
 *     `server/db.ts`'s own `initializeDatabase`/`closeDatabase` shape).
 *     `tests/unit/server/adminDb.containment.test.ts` asserts that no file
 *     outside `server/routes/admin*` and the admin services imports `adminDb`
 *     — the same shape as `tests/unit/client/store.deadSetters.test.ts`,
 *     because neither `tsc` nor ESLint can catch a *used* import that simply
 *     should not be there.
 *   - No policy gets an admin clause, and this pool is never used for
 *     tenant-scoped work — it deliberately never sets `app.current_tenant_id`.
 *     Every read through it MUST be paired with an `admin_access_log` row,
 *     written by the caller (`server/services/AdminAccessService.ts`) via the
 *     NORMAL pool — that table carries no `tenant_id` and no RLS policy, so
 *     writing it needs no bypass.
 *
 * Read docs/architecture/TENANT_ISOLATION_RLS.md §9 before changing this file.
 */

let pool: Pool | NeonPool | null = null;
let _db: DrizzleDB | null = null;
let adminDbInitialized = false;

/** True when ADMIN_DATABASE_URL is set to something usable. */
export function isAdminDbConfigured(): boolean {
  const url = process.env.ADMIN_DATABASE_URL;
  return typeof url === 'string' && url.length > 0 && url !== 'undefined';
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function initializeAdminDb() {
  if (adminDbInitialized) { return; }

  const databaseUrl = process.env.ADMIN_DATABASE_URL;
  if (!isAdminDbConfigured() || databaseUrl == null) {
    throw new Error(
      "ADMIN_DATABASE_URL must be set to use the admin cross-tenant read path. " +
      "See .env.example — it must point at a role with BYPASSRLS, distinct from " +
      "DATABASE_URL's role."
    );
  }

  const isNeonDatabase = env.NODE_ENV !== 'test' &&
    (databaseUrl.includes('neon.tech') || databaseUrl.includes('neon.co'));

  logger.info(`Admin DB: initializing... ${isNeonDatabase ? "Neon" : "Local"}`);

  if (isNeonDatabase) {
    const { Pool: NeonPoolClass, neonConfig } = await import('@neondatabase/serverless');
    const ws = await import('ws');

    neonConfig.webSocketConstructor = ws.default;
    pool = new NeonPoolClass({ connectionString: databaseUrl });

    const { drizzle: drizzleNeon } = await import('drizzle-orm/neon-serverless');
    _db = drizzleNeon(pool, { schema });
  } else {
    const pg = await import('pg');

    // Admin traffic is low-volume by design (A2: read-only console path) — a
    // small pool is deliberate, not an oversight. Test mode mirrors
    // server/db.ts's single-connection pool so per-worker search_path
    // pinning (below) is reliable.
    const poolSize = env.NODE_ENV === 'test' ? 1 : 3;
    pool = new pg.default.Pool({ connectionString: databaseUrl, max: poolSize });

    // Mirrors server/db.ts's identical wrapper: in tests, every physical
    // connection checkout must pin search_path to the current worker's
    // isolated schema BEFORE any query runs, or this pool would resolve
    // "users"/"workflows" against the wrong worker's tables.
    const testSchema = process.env.TEST_SCHEMA ?? (global as Record<string, unknown>).__TEST_SCHEMA__;
    if (testSchema && env.NODE_ENV === 'test') {
      const originalConnect = pool.connect.bind(pool);
      const schemaStr = String(testSchema);
      type ConnectCallback = (err: Error | undefined, client: PoolClient, release: () => void) => void;

      // @ts-expect-error - mirrors server/db.ts's identical wrapper
      (pool as Pool & { connect: (callback?: ConnectCallback) => Promise<PoolClient> }).connect = async function (callback?: ConnectCallback) {
        if (callback != null) {
          // @ts-expect-error - mirrors server/db.ts's identical wrapper
          return originalConnect((err: Error | undefined, client: PoolClient, release: () => void) => {
            if (!err && client != null) {
              void client.query(`SET search_path TO "${schemaStr}", public`)
                .catch((e: unknown) => {
                  logger.warn({ schema: schemaStr, err: e instanceof Error ? e.message : String(e) }, "[ADMIN-DB-WRAP] Failed to set search_path");
                })
                .finally(() => {
                  callback(err, client, release);
                });
              return;
            }
            callback(err, client, release);
          });
        }
        const client = await originalConnect();
        try {
          await client.query(`SET search_path TO "${schemaStr}", public`);
        } catch (e: unknown) {
          logger.warn({ schema: schemaStr, err: e instanceof Error ? e.message : String(e) }, "[ADMIN-DB-WRAP] Failed to set search_path");
        }
        return client;
      };
    }

    const { drizzle: drizzlePg } = await import('drizzle-orm/node-postgres');
    _db = drizzlePg(pool, { schema });
  }

  adminDbInitialized = true;
  logger.info("Admin DB: initialized.");
}

/** Idempotent — safe to call multiple times. */
export async function closeAdminDb(): Promise<void> {
  if (pool != null) {
    logger.info("Admin DB: closing pool...");
    const p = pool;
    pool = null;
    adminDbInitialized = false;
    _db = null;
    await p.end();
    logger.info("Admin DB: pool closed.");
  }
}

/**
 * The BYPASSRLS Drizzle instance. Throws if `initializeAdminDb()` hasn't
 * completed. Callers: `server/services/AdminAccessService.ts` only — see the
 * containment test.
 */
const adminDb = new Proxy({} as DrizzleDB, {
  get(_target, prop) {
    if (!_db) {
      throw new Error("Admin DB not initialized. Call await initializeAdminDb() first.");
    }
    if (typeof prop === 'symbol') { return (_db as unknown as Record<symbol, unknown>)[prop]; }
    return _db[prop as keyof DrizzleDB];
  },
});

export { adminDb };
