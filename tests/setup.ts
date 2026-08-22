import { beforeAll, afterAll, beforeEach, afterEach, vi, expect } from "vitest";
import dotenv from "dotenv";

// import "@testing-library/jest-dom";
import { SchemaManager } from "./helpers/schemaManager";
declare global {
  // eslint-disable-next-line no-var
  var __BASE_DB_URL__: string;
  // eslint-disable-next-line no-var
  var __OWNER_DB_URL__: string;
  // eslint-disable-next-line no-var
  var __TEST_SCHEMA__: string;
}
// Load environment variables immediately
dotenv.config();
/**
 * Global test setup file
 * Runs before all tests
 */
// Define db and helpers at file scope but initialize them dynamically

let db: any;

let initializeDatabase: any;

let dbInitPromise: any;
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.VITE_GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "test-google-client-id";
// Must be 32+ chars for strict Zod validation
process.env.JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars-long";
// Required for server startup (encryption utils) - 32 bytes base64 encoded
process.env.VL_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
// AI SDKs are mocked; a non-empty key must exist BEFORE any test-file import so
// the module-level AI service singletons (e.g. DocumentAIAssistService) construct
// their mocked client instead of silently degrading to null (empty responses).
// CI has no GEMINI_API_KEY, and per-test-file `process.env` assignments run too
// late because ESM imports (which build the singleton) are hoisted above them.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";
// Tests create/drop schemas and mutate data, so they MUST run against a
// disposable local/test database — never the app's DATABASE_URL, which may
// point at a shared cloud dev DB (that's how 355 stray test_schema_* schemas
// once accumulated on Neon). Resolve the test DB from TEST_DATABASE_URL, else a
// local default; ignore the inherited DATABASE_URL entirely.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ezbuildr_test";
// Fail closed: refuse to run the DB-mutating setup against a remote host unless
// explicitly opted in. This is the guardrail that stops tests polluting a
// cloud database ever again.
{
  const testHost = new URL(process.env.DATABASE_URL).hostname;
  const isLocal = testHost === "localhost" || testHost === "127.0.0.1" || testHost === "::1";
  if (!isLocal && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error(
      `Refusing to run tests against non-local database host "${testHost}". ` +
      `Point TEST_DATABASE_URL at a local/Docker test DB (e.g. the port-5434 container), ` +
      `or set ALLOW_REMOTE_TEST_DB=true to override deliberately.`
    );
  }
}
// Increase hook timeout for slow migrations globally
vi.setConfig({ hookTimeout: 300000 });
// Mock browser APIs for JSDOM environment (UI tests)
if (typeof window !== 'undefined') {
  // Mock window.navigator
  Object.defineProperty(window, 'navigator', {
    value: {
      userAgent: 'test-user-agent',
      language: 'en-US',
      languages: ['en-US', 'en'],
      onLine: true,
      platform: 'test',
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
    },
    writable: true,
    configurable: true,
  });
  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => { return ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: null,
    rootMargin: '',
    thresholds: [],
    takeRecords: vi.fn().mockReturnValue([]),
  }); });
  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  } as any;
  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
// Helper to check if we should connect to real DB
const shouldConnectToDb = () => {
  // Check if we are running in a unit test file context
  try {
    const state = expect.getState();
    const testPath = state.testPath || state.currentTestName;
    // Only skip DB for pure unit tests (components, hooks, utils)
    // Service tests in tests/unit often use the DB (integration tests in disguise)

    if (testPath && (
      testPath.includes('/unit/components/') ||
      testPath.includes('\\unit\\components\\') ||
      testPath.includes('/unit/hooks/') ||
      testPath.includes('\\unit\\hooks\\') ||
      testPath.includes('/unit/utils/') ||
      testPath.includes('\\unit\\utils\\')
    )) {
      console.log(`ℹ️  Skipping DB connection for component/hook/util unit test: ${testPath}`);
      return false;
    }
  } catch (e) {
    // expect.getState() might fail if not in test context, ignore
  }

  // Don't connect if we are explicitly in unit tests (which interpret "db" as a mock)
  // or if NO database URL was provided at all
  if (process.env.TEST_TYPE === 'unit') { return false; }
  // If we are in unit tests generally (inferred), try to avoid heavy DB unless forced
  return !!process.env.DATABASE_URL;
};
// RLS-5: run the integration suite against a genuinely restricted, non-owner
// role instead of the schema owner, so the suite proves what RLS actually
// enforces rather than what the policies merely say (the owner bypasses RLS
// unless FORCE is set — see RLS-4 — but a non-owner role is bound by policy
// with no FORCE required, which is what makes this a meaningful gate before
// RLS-4 ships). Off by default; every existing run is byte-identical.
//
// `server/db.ts`'s pool is a singleton created at `initializeDatabase()` time
// from `process.env.DATABASE_URL`, read once. Migrations need owner/DDL
// privilege the restricted role deliberately does not have (least privilege —
// matches `tests/integration/rls4-forceEnforcement.test.ts`'s role), so they
// must run BEFORE `DATABASE_URL` is repointed, through a separate raw `pg`
// client that stays on the owner's credentials throughout. Only after that
// client provisions the restricted role and disconnects do we swap
// `DATABASE_URL` and import `server/db` — so the app's pool never sees owner
// credentials in this mode.
const RLS_RESTRICTED = process.env.RLS_RESTRICTED === "true";
const RLS5_ROLE = "rls5_app_role";
const RLS5_PASSWORD = "rls5_app_role_pw";
// RLS-6/RLS-7: the admin console's cross-tenant read path connects as a
// SEPARATE role holding BYPASSRLS (`server/db/adminDb.ts`). Production sets
// `ADMIN_DATABASE_URL` to it; without one, `AdminAccessService` falls back to
// the normal pool, which under a non-owner role gives every `/api/admin` route
// a tenant-scoped view — five 404s in `api.admin-user-workflows.test.ts` for
// resources that plainly exist. Provisioning it here means the restricted run
// exercises the path production actually uses instead of a fallback that only
// works while nothing enforces RLS.
const RLS_ADMIN_ROLE = "rls6_admin_bypass_role";
const RLS_ADMIN_PASSWORD = "rls6_admin_bypass_pw";

function toRestrictedUrl(base: string, user: string, password: string): string {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  return url.toString();
}

async function provisionRestrictedRole(
  ownerClient: { query: (sql: string) => Promise<unknown> },
  schema: string
): Promise<void> {
  // Postgres roles are cluster-level and outlive the test database (a prior
  // run, or a different worktree, may have already created this one) — so
  // this must be idempotent rather than assume a clean cluster.
  await ownerClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS5_ROLE}') THEN
        CREATE ROLE "${RLS5_ROLE}" LOGIN;
      END IF;
    END $$;
  `);
  // Re-asserted every run rather than trusted: a role left over from a prior
  // cluster state should still end up NOBYPASSRLS/NOSUPERUSER with the
  // password this run expects, not whatever it was left as.
  await ownerClient.query(
    `ALTER ROLE "${RLS5_ROLE}" WITH PASSWORD '${RLS5_PASSWORD}' NOBYPASSRLS NOSUPERUSER`
  );
  await ownerClient.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${RLS5_ROLE}"`);
  await ownerClient.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${RLS5_ROLE}"`
  );
  await ownerClient.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${RLS5_ROLE}"`
  );
}

async function provisionAdminBypassRole(
  ownerClient: { query: (sql: string) => Promise<unknown> },
  schema: string
): Promise<void> {
  // Same idempotency reasoning as the restricted role: cluster-level, outlives
  // the database. BYPASSRLS is re-asserted every run rather than trusted.
  await ownerClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_ADMIN_ROLE}') THEN
        CREATE ROLE "${RLS_ADMIN_ROLE}" LOGIN;
      END IF;
    END $$;
  `);
  await ownerClient.query(
    `ALTER ROLE "${RLS_ADMIN_ROLE}" WITH PASSWORD '${RLS_ADMIN_PASSWORD}' BYPASSRLS NOSUPERUSER`
  );
  await ownerClient.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${RLS_ADMIN_ROLE}"`);
  await ownerClient.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${RLS_ADMIN_ROLE}"`
  );
  await ownerClient.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${RLS_ADMIN_ROLE}"`
  );
}

// Global test hooks
beforeAll(async () => {
  // Conditionally load jest-dom for UI tests (JSDOM environment)
  if (typeof window !== 'undefined') {
    try {

      // @ts-expect-error - types for jest-dom might be missing in this context
      await import("@testing-library/jest-dom");
    } catch (e) {
      console.warn("Failed to load jest-dom:", e);
    }
  }
  // Only attempt DB setup if we expect a real DB connection
  if (shouldConnectToDb()) {
    try {
      // PARALLELISM: Create isolated schema for this worker
      // We must do this BEFORE importing server/db so that the pool connects to the correct schema
      // PARALLELISM: Create isolated schema for this worker
      // We must do this BEFORE importing server/db so that the pool connects to the correct schema
      // Save original URL for teardown
      (global as any).__BASE_DB_URL__ = process.env.DATABASE_URL;
      let { schemaName, connectionString, existed } = await SchemaManager.createTestSchema(process.env.DATABASE_URL!);

      // Decide whether this schema may be reused, by CONTENT rather than by
      // table count (2026-08-21). The old check — "does it have any tables?" —
      // is blind to policy-only migrations, and every migration since 0024 is
      // policy-only. It left 11 of 124 `_v36` schemas frozen on the original
      // 0001 RLS policies while carrying a current-looking name, so ~9% of
      // workers ran the app against three-week-old rules and produced failures
      // that read exactly like production defects. See the block comment on
      // `SchemaManager.migrationsFingerprint`.
      const expectedFingerprint = await SchemaManager.migrationsFingerprint();
      (global as any).__MIGRATIONS_FINGERPRINT__ = expectedFingerprint;

      if (existed) {
        const actual = await SchemaManager.readSchemaFingerprint(connectionString, schemaName);
        if (actual === expectedFingerprint) {
          (global as any).__SKIP_MIGRATIONS__ = true;
          console.log(`📊 Schema ${schemaName} matches the migration fingerprint - skipping migrations`);
        } else {
          console.warn(
            `♻️ Schema ${schemaName} was built from a DIFFERENT migration set `
            + `(had ${actual ?? 'no fingerprint'}, need ${expectedFingerprint}) - rebuilding from scratch`
          );
          await SchemaManager.dropTestSchema(process.env.DATABASE_URL!, schemaName);
          ({ schemaName, connectionString, existed } = await SchemaManager.createTestSchema(process.env.DATABASE_URL!));
          (global as any).__SKIP_MIGRATIONS__ = false;
        }
      } else {
        (global as any).__SKIP_MIGRATIONS__ = false;
      }

      // Set TEST_SCHEMA in both global and env so db.ts can configure the pool correctly
      (global as any).__TEST_SCHEMA__ = schemaName;
      process.env.TEST_SCHEMA = schemaName;
      console.log(`🔒 Test Schema Isolated: ${schemaName} (Reused: ${existed})`);

      if (RLS_RESTRICTED) {
        // Everything below needs owner/DDL privilege, so it runs through a
        // raw client that stays on the owner's credentials — DATABASE_URL is
        // not repointed until this client is done and closed.
        const { Client } = await import('pg');
        const ownerClient = new Client({ connectionString });
        await ownerClient.connect();
        await ownerClient.query(`SET search_path TO "${schemaName}", public`);
        try {
          await ownerClient.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`);
        } catch (e: any) {
          console.warn(`⚠️ Could not ensure pgcrypto extension: ${e?.message}`);
        }
        try {
          await ownerClient.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public`);
          try {
            await ownerClient.query(`ALTER EXTENSION pg_trgm SET SCHEMA public`);
          } catch {
            // benign if already in public
          }
        } catch (e: any) {
          console.warn(`⚠️ Could not ensure pg_trgm extension: ${e?.message}`);
        }
        await applyManualMigrations({ execute: (sql: string) => ownerClient.query(sql) });
        if ((global as any).__SKIP_MIGRATIONS__) {
          try {
            await ownerClient.query(`
              DO $$ DECLARE r RECORD;
              BEGIN
                FOR r IN (SELECT tablename FROM pg_tables
                          WHERE schemaname = current_schema()
                          AND tablename NOT LIKE '__drizzle%')
                LOOP
                  EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', current_schema(), r.tablename);
                END LOOP;
              END $$;
            `);
            console.log('🧹 Truncated stale data from reused schema (owner connection)');
          } catch (truncErr: any) {
            console.warn(`⚠️ Failed to truncate stale data: ${truncErr.message}`);
          }
        }
        // The restricted role needs to exist AND be granted against a schema
        // that already has every table migrations will ever create in this
        // run — hence provisioning last, after migrations, not before.
        await provisionRestrictedRole(ownerClient, schemaName);
        await provisionAdminBypassRole(ownerClient, schemaName);
        await ownerClient.end();

        process.env.DATABASE_URL = toRestrictedUrl(connectionString, RLS5_ROLE, RLS5_PASSWORD);
        process.env.ADMIN_DATABASE_URL = toRestrictedUrl(
          connectionString, RLS_ADMIN_ROLE, RLS_ADMIN_PASSWORD
        );
        // The admin pool is normally opened by server/index.ts (or
        // production.ts) at boot; integration suites never run either, so it
        // has to be opened here or `adminDb` throws "not initialized" the first
        // time an admin route touches it. Must come AFTER `__TEST_SCHEMA__` is
        // set — adminDb reads it to pin `search_path` per connection.
        const { initializeAdminDb } = await import('../server/db/adminDb');
        await initializeAdminDb();
        (global as any).__RLS_RESTRICTED_ROLE__ = RLS5_ROLE;
        console.log(`🔐 RLS-5: running as restricted role "${RLS5_ROLE}" (not the schema owner)`);
      } else {
        process.env.DATABASE_URL = connectionString;
      }
      // RLS-5: the OWNER connection string, kept for the test observer.
      //
      // Under RLS_RESTRICTED the app's pool is the restricted role, which is
      // the whole point — but a test's own fixture setup and its verification
      // reads are NOT the application. They are an external observer building
      // and inspecting state, and forcing them through the app's tenant rules
      // makes a suite assert things about its harness rather than about the
      // code under test. `tests/helpers/ownerDb.ts` reads this to offer that
      // observer connection. In normal mode it is the same string the app
      // uses, so nothing changes.
      (global as any).__OWNER_DB_URL__ = connectionString;

      // Dynamically import server/db to ensure it picks up the mutated env vars
      const dbModule = await import("../server/db");
      // Check if the module is valid (not a partial mock missing exports)
      // Use 'in' check to avoid accessing undefined properties on strict mocks
      if ('db' in dbModule && 'initializeDatabase' in dbModule && dbModule.db && dbModule.initializeDatabase) {
        db = dbModule.db;
        initializeDatabase = dbModule.initializeDatabase;
        dbInitPromise = dbModule.dbInitPromise;
        // Initialize DB if not already initialized (idempotent - no-op after first call per fork)
        // We intentionally do NOT close the pool between test files to avoid "pool already ended" errors.
        await initializeDatabase();
        await dbInitPromise;
        // CRITICAL: For test schemas, set search_path at the CONNECTION LEVEL (not session level)
        // This ensures ALL subsequent queries use the correct schema
        if ((global as any).__TEST_SCHEMA__) {
          const schema = (global as any).__TEST_SCHEMA__;
          // Set search_path for the current connection
          await db.execute(`SET search_path TO "${schema}", public`);
          // NOTE: We intentionally do NOT use ALTER DATABASE SET search_path here.
          // When multiple test forks run in parallel, they all share the same database
          // and would race to set the database-level default, causing cross-fork interference.
          // Instead, we rely on the pool.connect() wrapper in server/db.ts which sets
          // search_path on every connection checkout, guaranteeing fork isolation.
          console.log(`✅ Enforced search_path: ${schema}, public`);
        }
        if (!RLS_RESTRICTED) {
          // In RLS_RESTRICTED mode all of this already ran through the
          // owner client above — the restricted role has neither the
          // privilege for it (extensions, migrations) nor, deliberately,
          // TRUNCATE (least privilege — see `provisionRestrictedRole`).
          //
          // pgcrypto provides digest() (used by portal token hashing and some
          // migrations). Create it in public — which is on the search_path — before
          // migrations run so digest() resolves in the isolated test schemas.
          try {
            await db.execute(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`);
          } catch (e: any) {
            console.warn(`⚠️ Could not ensure pgcrypto extension: ${e?.message}`);
          }
          try {
            await db.execute(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public`);
            try {
              await db.execute(`ALTER EXTENSION pg_trgm SET SCHEMA public`);
            } catch {
              // benign if already in public
            }
          } catch (e: any) {
            console.warn(`⚠️ Could not ensure pg_trgm extension: ${e?.message}`);
          }
          // Run database migrations for test DB
          await applyManualMigrations(db);
          // CLEAN DATA when reusing schemas to prevent stale FK violations
          // (Schema structure is preserved, only data is cleared)
          if ((global as any).__SKIP_MIGRATIONS__) {
            try {
              await db.execute(`
                DO $$ DECLARE r RECORD;
                BEGIN
                  FOR r IN (SELECT tablename FROM pg_tables
                            WHERE schemaname = current_schema()
                            AND tablename NOT LIKE '__drizzle%')
                  LOOP
                    EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', current_schema(), r.tablename);
                  END LOOP;
                END $$;
              `);
              console.log('🧹 Truncated stale data from reused schema');
            } catch (truncErr: any) {
              console.warn(`⚠️ Failed to truncate stale data: ${truncErr.message}`);
            }
          }
        }
        // NOTE: The former "failsafe" ADD COLUMN block and ensureDbFunctions()
        // were removed once the migration chain was regenerated to build the full
        // schema from scratch (0000_init_baseline) plus RLS (0001) and the
        // DataVault functions (0002). Fresh per-worker schemas now get everything
        // from the migrations alone — if something is missing, the migration is
        // wrong and tests should fail loudly rather than be papered over here.
      } else {
        console.log("⚠️ DB module loaded but appears to be a mock. Skipping real DB setup.");
      }
    } catch (error) {
      // FATAL as of 2026-08-21. This used to warn and continue — and since the
      // whole block is already gated on `shouldConnectToDb()`, "ignoring for
      // unit tests or mock scenarios" had stopped being true: what it actually
      // ignored was a failed schema build in a DB-backed run, letting the suite
      // proceed against a schema that is not the one the migrations describe.
      //
      // That is how 11 worker schemas ended up frozen on the original 0001 RLS
      // policies while carrying a current-looking name. Every failure they
      // produced read like an application defect; one was written up as one.
      //
      // One loud failure here is strictly better than eighty mystery failures
      // downstream — and it is the same lesson as "check the container first"
      // when a whole integration run goes red.
      console.error("❌ Test database setup failed — refusing to run against an unknown schema:", error);
      throw error;
    }
  }
});
afterAll(async () => {
  // OPTIMIZATION: Do NOT close the database pool or drop the schema here!
  // We want to reuse both the pool and schema for the next test file running in this same worker.
  // The fork process will clean up the pool when it exits.
  // Closing the pool here causes "Called end on pool more than once" errors when the next
  // test file's beforeAll tries to re-initialize, which aborts DB setup entirely.
  console.log("🧹 Cleaning up test environment...");
});
beforeEach(async () => {
  // Reset mocks before each test
  vi.clearAllMocks();
  // Clear shared state
  // We do NOT run ensureDbFunctions here anymore to reduce "tuple concurrently updated" errors.
  // It is sufficient to run it in beforeAll.
});
afterEach(async () => {
  vi.restoreAllMocks();
});
// Helper to apply manual migrations. Accepts either the real drizzle `db`
// (the normal path) or a thin `{ execute }` adapter over a raw owner `pg`
// client (RLS_RESTRICTED mode, where migrations must run before DATABASE_URL
// is repointed to the restricted role) — both only need `.execute(sql)`.
async function applyManualMigrations(db: { execute: (sql: string) => Promise<unknown> }) {
  // Wrap in try-catch so failing migrations (e.g. existing tables) don't block function creation
  try {
    if ((global as any).__SKIP_MIGRATIONS__) {
      console.log("⏩ Schema reused, skipping migrations.");
    } else {
      console.log("🔄 Running test migrations (manual file mode due to broken journal)...");
      const fs = await import('fs');
      const path = await import('path');
      const migrationsDir = path.join(process.cwd(), 'migrations');
      if (fs.existsSync(migrationsDir)) {
        console.error(`Debug: migrationsDir found: ${migrationsDir}`);
        const files = fs.readdirSync(migrationsDir)
          .filter(f => f.endsWith('.sql'))
          .sort(); // Alphanumeric sort
        console.error(`Debug: Found ${files.length} migration files`);
        console.error(`Debug: Files: ${files.join(', ')}`);
        for (const file of files) {
          console.log(`   Applying ${file}...`);
          let sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
          // CRITICAL: Ensure migrations run in the correct schema
          const schema = (global as any).__TEST_SCHEMA__;
          if (schema) {
            // Replace all hardcoded "public". schema references with test schema
            // This is essential because migrations contain CREATE TYPE "public"."type_name" statements
            sqlContent = sqlContent.replace(/"public"\./g, `"${schema}".`);
            // Prepend SET search_path to ensure all tables are created in test schema
            sqlContent = `SET search_path TO "${schema}", public;\n\n${sqlContent}`;
          }
          try {
            // OPTIMIZATION: Try to execute the whole file first
            await db.execute(sqlContent);
          } catch (e: any) {
            // If whole file execution fails with a benign error, fall back to statement-by-statement
            // Check for:
            // - 'already exists' string
            // - 'duplicate object' string
            // - code 42710 (duplicate_object) - for types/tables
            // - code 42P07 (duplicate_table)
            if (
              e.message.includes('already exists') ||
              e.message.includes('duplicate object') ||
              e.code === '42710' ||
              e.code === '42P07'
            ) {
              console.log(`⚠️ Partial failure in ${file} (Error: ${e.message} / Code: ${e.code}), retrying statement-by-statement...`);
              const statements = sqlContent.split('--> statement-breakpoint');
              for (const statement of statements) {
                if (!statement.trim()) { continue; }
                try {
                  // CRITICAL: Ensure each statement has the search_path set
                  // When statements are executed individually, we need to set search_path for each one
                  const schema = (global as any).__TEST_SCHEMA__;
                  let stmtWithPath = statement;
                  if (schema && !statement.includes('SET search_path')) {
                    stmtWithPath = `SET search_path TO "${schema}", public;\n${statement}`;
                  }
                  await db.execute(stmtWithPath);
                } catch (subError: any) {
                  if (
                    subError.message.includes('already exists') ||
                    subError.message.includes('duplicate object') ||
                    subError.code === '42710' ||
                    subError.code === '42P07'
                  ) {
                    // benign, ignore
                  } else {
                    console.error(`❌ FAILED MIGRATION ${file} STATEMENT:`, subError.message);
                    console.error(`SQL: ${statement.substring(0, 200)}...`); // Log start of SQL
                    throw subError;
                  }
                }
              }
            } else {
              console.error(`❌ FAILED MIGRATION ${file}:`, e.message);
              throw e;
            }
          }
        }
        console.log(`✅ Applied ${files.length} migration files.`);

        // Record what built this schema — ONLY after the whole chain applied.
        // A partial chain must leave no fingerprint, so the next run rebuilds
        // instead of caching the half-migrated state forever (which is exactly
        // what happened to 11 schemas before this existed).
        const fingerprint = (global as any).__MIGRATIONS_FINGERPRINT__;
        const schema = (global as any).__TEST_SCHEMA__;
        if (typeof fingerprint === 'string' && typeof schema === 'string') {
          await db.execute(
            `CREATE TABLE IF NOT EXISTS "${schema}".__schema_fingerprint (`
            + `fingerprint text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
          );
          await db.execute(`DELETE FROM "${schema}".__schema_fingerprint`);
          await db.execute(
            `INSERT INTO "${schema}".__schema_fingerprint (fingerprint) VALUES ('${fingerprint}')`
          );
          console.log(`🔏 Recorded migration fingerprint ${fingerprint} on ${schema}`);
        }
      }
    }
  } catch (error: any) {
    // Deliberately FATAL as of 2026-08-21. This used to warn and continue
    // ("non-fatal if DB exists"), which is how a chain that died at 0027 left a
    // schema with every table and none of the later policies — and, because the
    // fingerprint is only written on success, that schema now rebuilds next run
    // rather than being cached. Continuing into a suite whose schema is not the
    // one the migrations describe produces results that are worse than a
    // failure: they look like application defects. Fail here instead.
    console.error("❌ Migrations failed — refusing to run against a half-built schema:", error);
    throw error;
  }
}

// Mock express-session only for unit tests (integration tests need real sessions)
const isIntegrationTest = process.env.TEST_TYPE === "integration" || process.env.VITEST_INTEGRATION === "true";
vi.mock('express-session', async () => {
  // Check if running integration tests
  if (process.env.TEST_TYPE === "integration" || process.env.VITEST_INTEGRATION === "true") {
    // Return actual express-session for integration tests
    return vi.importActual('express-session');
  }
  // Return mock for unit tests
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createMockSessionMiddleware } = require('./helpers/authMocks');
  return {
    default: vi.fn(() => createMockSessionMiddleware()),
  };
});
// Mock external services
vi.mock("../server/services/sendgrid", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  sendInvitation: vi.fn().mockResolvedValue({ success: true }),
  sendReminder: vi.fn().mockResolvedValue({ success: true }),
}));
// Mock database storage operations for tests
// Mock database storage operations for tests
// Storage mock removed (legacy system cleanup) - Use UserRepository directly
if (isIntegrationTest) {
  vi.setConfig({ testTimeout: 60000 });
}
// Mock AI Providers Globally to prevent rate limits and network calls
vi.mock("@google/generative-ai", () => {
  // Must be a real class: services call `new GoogleGenerativeAI(...)`, and an
  // arrow-function `vi.fn().mockImplementation(() => …)` is not a constructor,
  // which makes the AI-service singleton throw at import time (empty responses).
  class MockGoogleGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              updatedWorkflow: { title: "Mocked AI Workflow", sections: [] },
              explanation: ["Mocked explanation"],
              diff: { changes: [] },
              suggestions: [],
            }),
          },
        }),
      };
    }
  }
  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
  };
});
vi.mock("openai", () => {
  const MockOpenAI = vi.fn().mockImplementation(() => { return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "{}" } }],
          usage: { total_tokens: 10 },
        }),
      },
    },
  }; });
  return {
    'OpenAI': MockOpenAI,
    default: MockOpenAI,
  };
});
vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn().mockImplementation(() => { return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: "{}" }],
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    },
  }; });
  return {

    'Anthropic': MockAnthropic,
    default: MockAnthropic,
  };
});
