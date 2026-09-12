import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
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
// Typed WITH the schema generic (not a bare `ReturnType<typeof drizzle>`) so
// this handle is assignable wherever the app's own `db` is — e.g.
// `new TestFactory(getOwnerDb())`, which is how a suite routes its fixture
// creation through the observer instead of the application pool.
let instance: NodePgDatabase<typeof schema> | null = null;

/**
 * The owner connection string, for tests that must hand a database URL to a
 * CHILD PROCESS rather than use a handle — e.g. the canonicalizer CLI, which is
 * an operator tool and is meant to run as the owner. Under RLS_RESTRICTED the
 * ambient `DATABASE_URL` is the restricted role, so a child process inheriting
 * it would see only RLS-visible rows and convert nothing while reporting
 * success. Same observer/app separation as `getOwnerDb`, same caveats.
 */
export function getOwnerConnectionString(): string {
  return ownerConnectionString();
}

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

export function getOwnerDb(): NodePgDatabase<typeof schema> {
  if (instance !== null) {
    return instance;
  }
  pool = new Pool({ connectionString: ownerConnectionString(), max: 2 });
  // Match the app pool's per-connection search_path so both see the same
  // per-worker schema (tests/setup.ts sets this for the app's pool).
  //
  // The schema is read INSIDE the handler, per connection — not captured once
  // when the pool is built. A `describe` body runs at collection time, before
  // `tests/setup.ts` has assigned `__TEST_SCHEMA__`, so anything constructed
  // there (e.g. `const factory = new TestFactory()`) could otherwise pin an
  // undefined schema for the process's whole lifetime and every query would
  // fail with `relation "tenants" does not exist`.
  pool.on('connect', (client) => {
    const testSchema = (global as typeof globalThis & { __TEST_SCHEMA__?: string }).__TEST_SCHEMA__;
    if (testSchema !== undefined && testSchema !== '') {
      void client.query(`SET search_path TO "${testSchema}", public`);
    }
  });
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
