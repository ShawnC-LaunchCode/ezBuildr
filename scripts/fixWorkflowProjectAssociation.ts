#!/usr/bin/env tsx
/**
 * Fix Workflow-Project Association Issue
 *
 * This script diagnoses and fixes workflows that are missing project_id associations.
 * This is required for template uploads and other project-scoped features.
 *
 * Usage:
 *   npx tsx scripts/fixWorkflowProjectAssociation.ts
 */

import { neon } from '@neondatabase/serverless';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

/**
 * Split SQL into individual statements while preserving DO blocks
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let insideDoBlock = false;

  const lines = sql.split('\n');

  for (const line of lines) {
    // Check for DO block start
    if (line.trim().startsWith('DO $$') || line.trim().startsWith('DO $')) {
      insideDoBlock = true;
    }

    currentStatement += line + '\n';

    // Check for DO block end
    if (insideDoBlock && (line.trim() === 'END $$;' || line.trim() === 'END $;')) {
      insideDoBlock = false;
      statements.push(currentStatement.trim());
      currentStatement = '';
      continue;
    }

    // Regular statement end (semicolon not inside DO block)
    if (!insideDoBlock && line.trim().endsWith(';') && !line.trim().startsWith('--')) {
      statements.push(currentStatement.trim());
      currentStatement = '';
    }
  }

  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements.filter(s => s && !s.startsWith('--'));
}

async function fixWorkflowProjectAssociation() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.error('');
    console.error('Please set DATABASE_URL in your .env file or environment');
    process.exit(1);
  }

  console.log('🔧 VaultLogic - Fix Workflow-Project Association');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1]?.split('/')[0] || 'hidden');
  console.log('');

  try {
    const client = neon(dbUrl);

    // Step 1: Check current state
    console.log('📊 Step 1: Checking current state...');

    const totalWorkflows = await client`SELECT COUNT(*) as count FROM workflows`;
    const workflowsWithoutProject = await client`SELECT COUNT(*) as count FROM workflows WHERE project_id IS NULL`;
    const totalProjects = await client`SELECT COUNT(*) as count FROM projects`;

    console.log(`   Total workflows: ${totalWorkflows[0].count}`);
    console.log(`   Workflows without project: ${workflowsWithoutProject[0].count}`);
    console.log(`   Total projects: ${totalProjects[0].count}`);
    console.log('');

    if (parseInt(workflowsWithoutProject[0].count as string) === 0) {
      console.log('✅ All workflows are already associated with projects!');
      console.log('');
      console.log('If you\'re still seeing the error, try:');
      console.log('   1. Restart your application server');
      console.log('   2. Clear your browser cache');
      console.log('   3. Check that the workflow you\'re working with exists');
      console.log('');
      return;
    }

    // Step 2: Apply migration
    console.log('🔄 Step 2: Applying migration 0025...');
    console.log('');

    const migrationPath = join(__dirname, '..', 'migrations', '0025_fix_workflows_missing_columns.sql');
    const migrationSql = await readFile(migrationPath, 'utf-8');

    const statements = splitSqlStatements(migrationSql);

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement.trim() || statement.trim().startsWith('--')) {
        continue;
      }

      try {
        await client(statement);
        successCount++;
        process.stdout.write('.');
      } catch (error: any) {
        // Ignore errors for already-applied changes
        if (error.message?.includes('already exists') ||
            error.message?.includes('duplicate') ||
            (error.message?.includes('column') && error.message?.includes('already'))) {
          skipCount++;
          process.stdout.write('s');
        } else {
          console.error(`\n⚠️  Statement ${i + 1} warning:`, error.message);
        }
      }
    }

    console.log('');
    console.log('');

    // Step 3: Verify fix
    console.log('✅ Step 3: Verifying fix...');

    const workflowsWithoutProjectAfter = await client`SELECT COUNT(*) as count FROM workflows WHERE project_id IS NULL`;
    const defaultProject = await client`SELECT id, name FROM projects LIMIT 1`;

    console.log(`   Workflows without project (after): ${workflowsWithoutProjectAfter[0].count}`);
    if (defaultProject.length > 0) {
      console.log(`   Default project: ${defaultProject[0].name} (${defaultProject[0].id})`);
    }
    console.log('');

    console.log('✅ Migration completed successfully!');
    console.log(`   ${successCount} statements applied`);
    console.log(`   ${skipCount} statements skipped (already applied)`);
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. Try uploading a template again');
    console.log('   3. If the issue persists, check the workflow in the database');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('❌ Script failed:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    if (error.hint) {
      console.error('   Hint:', error.hint);
    }
    console.error('');
    console.error('💡 Troubleshooting:');
    console.error('   - Check that DATABASE_URL is correct');
    console.error('   - Ensure database is accessible');
    console.error('   - Verify you have necessary permissions');
    console.error('');
    process.exit(1);
  }
}

fixWorkflowProjectAssociation();
