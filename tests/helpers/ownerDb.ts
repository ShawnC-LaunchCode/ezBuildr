import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@shared/schema';

/**
 * RLS-5: the TEST OBSERVER's database handle.
 *
 * Under `RLS_RESTRICTED=true` the application's pool connects as
 * `rls5_app_role`, a genuine non-owner bound by every policy — that is the
 * point of the harness, and it is what proves the app survives RLS-4.
 *
 * A test's own fixture setup and its verification reads are a different thing.
 * They are not application code: they build the world the app is then exercised
 * in, and afterwards inspect what the app did. Routing them through the app's
 * tenant rules makes a suite assert things about its own harness instead of
 * about the code under test — and worse, it makes a passing test ambiguous,
 * because "the row is absent" and "the row is hidden from me" become the same
 * observation.
 *
 * So: the APP runs restricted, the OBSERVER reads as owner. That separation is
 * what lets a failure mean "the application could not do this under RLS",
 * which is the only failure RLS-5 is trying to surface.
 *
 * ⚠️ **Do NOT use this to make an app-path failure disappear.** If a route, a
 * service or a repository cannot see its own data under RLS, that is a real
 * finding and the fix belongs in `server/`, not here. This handle is only for
 * (a) creating fixture rows and (b) asserting on the result afterwards.
 *
 * ⚠️ **Do NOT use it in the `rls-*.test.ts` suites.** Those exist precisely to
 * observe what a restricted role can and cannot see; handing them an owner
 * connection would make them pass unconditionally — a green test that proves
 * nothing, which is the failure mode this repo has been bitten by before.
 *
 * In normal (non-RLS_RESTRICTED) runs this is the same connection string the
 * app uses, so behaviour is unchanged.
 */
let pool: Pool | null = null;
let instance: ReturnType<typeof drizzle> | null = null;

function ownerConnectionString(): string {
  const url = (global as typeof globalThis & { __OWNER_DB_URL__?: string }).__OWNER_DB_URL__;
  if (typeof url === 'string' && url.length > 0) {
    return url;
  }
  // Falls back to whatever the app is using. Correct in normal mode, where the
  // app IS the owner; under RLS_RESTRICTED it means setup has not run yet.
  const fallback = process.env.DATABASE_URL;
  if (fallback === undefined || fallback === '') {
    throw new Error('ownerDb: no owner connection string available (tests/setup.ts has not run)');
  }
  return fallback;
}

export function getOwnerDb(): ReturnType<typeof drizzle> {
  if (instance !== null) {
    return instance;
  }
  pool = new Pool({ connectionString: ownerConnectionString(), max: 2 });
  const testSchema = (global as typeof globalThis & { __TEST_SCHEMA__?: string }).__TEST_SCHEMA__;
  if (testSchema !== undefined && testSchema !== '') {
    // Match the app pool's per-connection search_path so both see the same
    // per-worker schema (tests/setup.ts sets this for the app's pool).
    pool.on('connect', (client) => {
      void client.query(`SET search_path TO "${testSchema}", public`);
    });
  }
  instance = drizzle(pool, { schema });
  return instance;
}

export async function closeOwnerDb(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
    instance = null;
  }
}
