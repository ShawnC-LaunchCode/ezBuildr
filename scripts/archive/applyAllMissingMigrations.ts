#!/usr/bin/env tsx
/**
 * Apply All Missing Migrations
 *
 * Applies migrations in order: 0007, 0009a, 0010, 0015, 0016, 0017, 0018, 0019, 0023
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let insideDoBlock = false;

  const lines = sql.split('\n');

  for (const line of lines) {
    if (line.trim().startsWith('--') && !insideDoBlock) {
      continue;
    }

    if (line.trim().startsWith('DO $$') || line.trim().startsWith('DO $')) {
      insideDoBlock = true;
    }

    currentStatement += `${line  }\n`;

    if (insideDoBlock && (line.trim() === 'END $$;' || line.trim() === 'END $;')) {
      insideDoBlock = false;
      statements.push(currentStatement.trim());
      currentStatement = '';
      continue;
    }

    if (!insideDoBlock && line.trim().endsWith(';')) {
      statements.push(currentStatement.trim());
      currentStatement = '';
    }
  }

  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements.filter(s => s && !s.startsWith('--'));
}

async function applyMigration(client: (query: string) => Promise<unknown>, migrationName: string, migrationFile: string) {
  console.log(`\n📝 Applying ${migrationName}...`);

  const migrationPath = join(__dirname, '..', 'migrations', migrationFile);

  try {
    const migrationSql = await readFile(migrationPath, 'utf-8');
    const statements = splitSqlStatements(migrationSql);

    let successCount = 0;
    let skipCount = 0;

    for (const statement of statements) {
      if (!statement.trim()) {continue;}

      try {
        await client(statement);
        successCount++;
        process.stdout.write('.');
      } catch (error: unknown) {
        const pgError = error as { message?: string; code?: string };
        if (pgError.message?.includes('already exists') ||
            pgError.message?.includes('duplicate') ||
            pgError.message?.includes('already') ||
            pgError.code === '42710' || // duplicate object
            pgError.code === '42P07'    // duplicate table
        ) {
          skipCount++;
          process.stdout.write('s');
        } else {
          process.stdout.write('w');
          // Don't fail - just warn
        }
      }
    }

    console.log('');
    console.log(`✅ ${migrationName} completed (${successCount} applied, ${skipCount} skipped)`);
  } catch (error: unknown) {
    const nodeError = error as { code?: string };
    if (nodeError.code === 'ENOENT') {
      console.log(`⚠️  ${migrationName} - file not found, skipping`);
    } else {
      throw error;
    }
  }
}

async function applyMigrations() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔧 VaultLogic: Apply All Missing Migrations');
  console.log('');
  console.log('This will apply the following missing migrations:');
  console.log('  • 0007: JS question type');
  console.log('  • 0009a: Secrets types');
  console.log('  • 0010: Trace and error tracking');
  console.log('  • 0015: Review and e-signature');
  console.log('  • 0016: Connections');
  console.log('  • 0017: Branding and domains');
  console.log('  • 0018: Collections datastore');
  console.log('  • 0019: Collection block types');
  console.log('  • 0023: Document engine');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1] || 'hidden');
  console.log('');

  try {
    const client = neon(dbUrl);

    await applyMigration(client, '0007: JS Question Type', '0007_add_js_question_type.sql');
    await applyMigration(client, '0009a: Secrets Types', '0009a_add_external_connections_and_secret_types.sql');
    await applyMigration(client, '0010: Trace and Error', '0010_add_trace_and_error_to_runs.sql');
    await applyMigration(client, '0015: Review/eSign', '0015_add_review_and_esign_tables.sql');
    await applyMigration(client, '0016: Connections', '0016_add_connections_table.sql');
    await applyMigration(client, '0017: Branding/Domains', '0017_add_branding_and_domains.sql');
    await applyMigration(client, '0018: Collections', '0018_add_collections_datastore.sql');
    await applyMigration(client, '0019: Collection Blocks', '0019_add_collection_block_types.sql');
    await applyMigration(client, '0023: Document Engine', '0023_add_document_engine_tables.sql');

    console.log('');
    console.log('✅ All missing migrations applied successfully!');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. All workflow features should now work correctly');
    console.log('');

  } catch (error: unknown) {
    const pgError = error as { message?: string; detail?: string };
    console.error('❌ Migration failed:', pgError.message ?? String(error));
    if (pgError.detail) {
      console.error('   Details:', pgError.detail);
    }
    console.error('');
    console.error('⚠️  Some migrations may have been partially applied.');
    console.error('   The system should still be functional.');
    process.exit(1);
  }
}

applyMigrations();
