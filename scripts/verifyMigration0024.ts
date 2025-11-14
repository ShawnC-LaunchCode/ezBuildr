#!/usr/bin/env tsx
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function verifyMigration() {
  const client = neon(process.env.DATABASE_URL!);

  console.log('🔍 Verifying Migration 0024...');
  console.log('');

  try {
    // Check tenants table
    const tenants = await client('SELECT COUNT(*) as count FROM tenants');
    console.log('✓ Tenants table:', tenants[0].count, 'records');

    // Check users columns
    const userCols = await client(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('tenant_id', 'full_name', 'first_name', 'last_name')
      ORDER BY column_name
    `);
    console.log('✓ Users table columns:', userCols.map((c: any) => c.column_name).join(', '));

    // Check projects columns
    const projectCols = await client(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'projects'
      AND column_name IN ('tenant_id', 'name', 'archived')
      ORDER BY column_name
    `);
    console.log('✓ Projects table columns:', projectCols.map((c: any) => c.column_name).join(', '));

    // Check workflows columns
    const workflowCols = await client(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflows'
      AND column_name IN ('project_id', 'name', 'current_version_id')
      ORDER BY column_name
    `);
    console.log('✓ Workflows table columns:', workflowCols.map((c: any) => c.column_name).join(', '));

    // Check for any null foreign keys
    const usersWithoutTenant = await client('SELECT COUNT(*) as count FROM users WHERE tenant_id IS NULL');
    const projectsWithoutTenant = await client('SELECT COUNT(*) as count FROM projects WHERE tenant_id IS NULL');
    const workflowsWithoutProject = await client('SELECT COUNT(*) as count FROM workflows WHERE project_id IS NULL');

    console.log('');
    console.log('🔗 Foreign Key Status:');
    console.log('  Users without tenant:', usersWithoutTenant[0].count);
    console.log('  Projects without tenant:', projectsWithoutTenant[0].count);
    console.log('  Workflows without project:', workflowsWithoutProject[0].count);

    const hasIssues =
      usersWithoutTenant[0].count > 0 ||
      projectsWithoutTenant[0].count > 0 ||
      workflowsWithoutProject[0].count > 0;

    console.log('');
    if (hasIssues) {
      console.log('⚠️  Warning: Some records have null foreign keys.');
      console.log('   Run: npx tsx scripts/applyMigration0024.ts');
      process.exit(1);
    } else {
      console.log('✅ Migration 0024 verified successfully!');
      console.log('   All tables and foreign keys are properly configured.');
    }
  } catch (error: any) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyMigration();
