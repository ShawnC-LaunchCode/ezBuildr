/**
 * Emit a deterministic, diffable snapshot of a Postgres schema.
 *
 * Built for ENV-2: proving that a database created from `migrations/` reproduces
 * production's actual schema. Two snapshots taken with this script can be compared
 * with a plain `diff`, so ordering is normalised everywhere and nothing timestamped
 * or size-dependent is included.
 *
 * READ-ONLY. Issues only SELECTs against catalog views, and opens a single
 * connection. Safe to point at production.
 *
 *   npx tsx scripts/schema-snapshot.ts                     # uses DATABASE_URL
 *   npx tsx scripts/schema-snapshot.ts "postgres://..."    # explicit target
 *   npx tsx scripts/schema-snapshot.ts > snapshots/prod.txt
 *
 * Writes the snapshot to stdout and a one-line summary to stderr, so redirecting
 * stdout still shows you what happened.
 */
import 'dotenv/config';
import pg from 'pg';

/** Only user data lives here; pg_catalog/information_schema are noise. */
const SCHEMA_FILTER =
  `n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ` +
  `AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%'`;

async function main(): Promise<void> {
  const connectionString = process.argv[2] ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('No target: pass a connection string or set DATABASE_URL.');
  }

  const client = new pg.Client({ connectionString });
  const out: string[] = [];
  const section = (title: string): void => {
    out.push('', `## ${title}`, '');
  };

  try {
    await client.connect();

    const meta = await client.query<{ version: string; db: string }>(
      `SELECT current_setting('server_version') AS version, current_database() AS db`
    );
    out.push('# Schema snapshot');
    out.push('');
    out.push(`database: ${meta.rows[0].db}`);
    out.push(`postgres: ${meta.rows[0].version}`);
    out.push('');
    out.push('Deterministic and diffable. No timestamps, sizes, row counts or OIDs.');

    // ── tables ──────────────────────────────────────────────────────────────
    const tables = await client.query<{ schema: string; table: string; rls: boolean; forced: boolean }>(`
      SELECT n.nspname AS schema, c.relname AS table,
             c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND ${SCHEMA_FILTER}
      ORDER BY 1, 2
    `);
    section(`tables (${tables.rows.length})`);
    for (const t of tables.rows) {
      const flags = [t.rls ? 'RLS' : null, t.forced ? 'FORCED' : null].filter(Boolean).join(' ');
      const suffix = flags.length > 0 ? `  [${flags}]` : '';
      out.push(`${t.schema}.${t.table}${suffix}`);
    }

    // ── columns ─────────────────────────────────────────────────────────────
    const columns = await client.query<{
      schema: string; table: string; column: string; type: string; nullable: string; def: string | null;
    }>(`
      SELECT table_schema AS schema, table_name AS table, column_name AS column,
             format_type(a.atttypid, a.atttypmod) AS type,
             is_nullable AS nullable, column_default AS def
      FROM information_schema.columns ic
      JOIN pg_class c ON c.relname = ic.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = ic.table_schema
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = ic.column_name
      WHERE ${SCHEMA_FILTER} AND c.relkind = 'r'
      ORDER BY 1, 2, 3
    `);
    section(`columns (${columns.rows.length})`);
    for (const c of columns.rows) {
      const notNull = c.nullable === 'NO' ? ' NOT NULL' : '';
      const dflt = c.def === null ? '' : ` DEFAULT ${c.def}`;
      out.push(`${c.schema}.${c.table}.${c.column}  ${c.type}${notNull}${dflt}`);
    }

    // ── enums ───────────────────────────────────────────────────────────────
    const enums = await client.query<{ schema: string; name: string; labels: string }>(`
      SELECT n.nspname AS schema, t.typname AS name,
             string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE ${SCHEMA_FILTER}
      GROUP BY 1, 2 ORDER BY 1, 2
    `);
    section(`enums (${enums.rows.length})`);
    for (const e of enums.rows) {
      out.push(`${e.schema}.${e.name} = [${e.labels}]`);
    }

    // ── indexes ─────────────────────────────────────────────────────────────
    const indexes = await client.query<{ schema: string; table: string; name: string; def: string }>(`
      SELECT schemaname AS schema, tablename AS table, indexname AS name, indexdef AS def
      FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog','information_schema')
      ORDER BY 1, 2, 3
    `);
    section(`indexes (${indexes.rows.length})`);
    for (const i of indexes.rows) {
      out.push(`${i.schema}.${i.table}.${i.name}: ${i.def}`);
    }

    // ── constraints ─────────────────────────────────────────────────────────
    const constraints = await client.query<{
      schema: string; table: string; name: string; type: string; def: string;
    }>(`
      SELECT n.nspname AS schema, c.relname AS table, con.conname AS name,
             con.contype AS type, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${SCHEMA_FILTER}
      ORDER BY 1, 2, 3
    `);
    section(`constraints (${constraints.rows.length})`);
    for (const c of constraints.rows) {
      out.push(`${c.schema}.${c.table}.${c.name} [${c.type}]: ${c.def}`);
    }

    // ── RLS policies ────────────────────────────────────────────────────────
    const policies = await client.query<{
      schema: string; table: string; name: string; cmd: string;
      roles: string; qual: string | null; check: string | null;
    }>(`
      SELECT schemaname AS schema, tablename AS table, policyname AS name,
             cmd, array_to_string(roles, ',') AS roles, qual, with_check AS check
      FROM pg_policies
      WHERE schemaname NOT IN ('pg_catalog','information_schema')
      ORDER BY 1, 2, 3
    `);
    section(`rls policies (${policies.rows.length})`);
    for (const p of policies.rows) {
      out.push(`${p.schema}.${p.table}.${p.name} [${p.cmd}] roles=${p.roles}`);
      out.push(`    USING      ${p.qual ?? '-'}`);
      out.push(`    WITH CHECK ${p.check ?? '-'}`);
    }

    // ── functions (RLS depends on app_current_tenant()) ─────────────────────
    const funcs = await client.query<{ schema: string; name: string; args: string; result: string }>(`
      SELECT n.nspname AS schema, p.proname AS name,
             pg_get_function_identity_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE ${SCHEMA_FILTER}
      ORDER BY 1, 2, 3
    `);
    section(`functions (${funcs.rows.length})`);
    for (const f of funcs.rows) {
      out.push(`${f.schema}.${f.name}(${f.args}) -> ${f.result}`);
    }

    // ── applied migrations, if drizzle's journal table exists ───────────────
    const journal = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = '__drizzle_migrations'
      ) AS exists
    `);
    section('applied migrations');
    if (journal.rows[0].exists) {
      const applied = await client
        .query<{ hash: string }>(`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at`)
        .catch(() =>
          client.query<{ hash: string }>(`SELECT hash FROM public.__drizzle_migrations ORDER BY created_at`)
        );
      out.push(`count: ${applied.rows.length}`);
      for (const m of applied.rows) {
        out.push(m.hash);
      }
    } else {
      out.push('no __drizzle_migrations table — this database was NOT built by `db:migrate`');
    }

    console.log(out.join('\n'));
    console.error(
      `snapshot ok: ${tables.rows.length} tables, ${columns.rows.length} columns, ` +
        `${enums.rows.length} enums, ${indexes.rows.length} indexes, ` +
        `${constraints.rows.length} constraints, ${policies.rows.length} policies`
    );
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
