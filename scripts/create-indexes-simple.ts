/**
 * Create Database Indexes (Simple Version)
 * Just the CREATE INDEX statements without COMMENT commands
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const sql = neon(process.env.DATABASE_URL!);

const indexes = [
  // Migration 0057: step_values composite index
  {
    name: 'idx_step_values_run_step',
    sql: 'CREATE INDEX IF NOT EXISTS idx_step_values_run_step ON step_values(run_id, step_id)',
    table: 'step_values'
  },

  // Migration 0058: logic_rules indexes
  {
    name: 'idx_logic_rules_target_step',
    sql: 'CREATE INDEX IF NOT EXISTS idx_logic_rules_target_step ON logic_rules(target_step_id) WHERE target_step_id IS NOT NULL',
    table: 'logic_rules'
  },
  {
    name: 'idx_logic_rules_target_section',
    sql: 'CREATE INDEX IF NOT EXISTS idx_logic_rules_target_section ON logic_rules(target_section_id) WHERE target_section_id IS NOT NULL',
    table: 'logic_rules'
  },
  {
    name: 'idx_logic_rules_workflow',
    sql: 'CREATE INDEX IF NOT EXISTS idx_logic_rules_workflow ON logic_rules(workflow_id)',
    table: 'logic_rules'
  },

  // Migration 0059: performance indexes
  {
    name: 'idx_workflow_runs_completed',
    sql: 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_completed ON workflow_runs(completed_at DESC) WHERE completed_at IS NOT NULL',
    table: 'workflow_runs'
  },
  {
    name: 'idx_workflow_runs_workflow_completed',
    sql: 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_completed ON workflow_runs(workflow_id, completed_at DESC)',
    table: 'workflow_runs'
  },
  {
    name: 'idx_workflow_runs_user_completed',
    sql: 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_completed ON workflow_runs(created_by, completed_at DESC) WHERE created_by IS NOT NULL',
    table: 'workflow_runs'
  },
  {
    name: 'idx_audit_logs_timestamp',
    sql: 'CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_events(timestamp DESC)',
    table: 'audit_events'
  },
  {
    name: 'idx_audit_logs_user_timestamp',
    sql: 'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_events(user_id, timestamp DESC) WHERE user_id IS NOT NULL',
    table: 'audit_events'
  },
  {
    name: 'idx_audit_logs_resource',
    sql: 'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_events(resource_type, resource_id, timestamp DESC)',
    table: 'audit_events'
  },
  {
    name: 'idx_analytics_events_timestamp',
    sql: 'CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp DESC)',
    table: 'analytics_events'
  },
  {
    name: 'idx_analytics_events_workflow_timestamp',
    sql: 'CREATE INDEX IF NOT EXISTS idx_analytics_events_workflow_timestamp ON analytics_events(workflow_id, timestamp DESC) WHERE workflow_id IS NOT NULL',
    table: 'analytics_events'
  },
  {
    name: 'idx_script_execution_log_timestamp',
    sql: 'CREATE INDEX IF NOT EXISTS idx_script_execution_log_timestamp ON script_execution_log(executed_at DESC)',
    table: 'script_execution_log'
  },
  {
    name: 'idx_script_execution_log_run_timestamp',
    sql: 'CREATE INDEX IF NOT EXISTS idx_script_execution_log_run_timestamp ON script_execution_log(run_id, executed_at DESC) WHERE run_id IS NOT NULL',
    table: 'script_execution_log'
  },
];

async function createIndexes() {
  console.log('🚀 Creating database indexes...\n');

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const index of indexes) {
    try {
      console.log(`📝 Creating ${index.name} on ${index.table}...`);
      await sql(index.sql);
      console.log(`   ✅ Created\n`);
      created++;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('already exists')) {
        console.log(`   ℹ️  Already exists\n`);
        skipped++;
      } else if (errorMsg.includes('does not exist') && errorMsg.includes('relation')) {
        console.log(`   ⚠️  Table "${index.table}" does not exist - skipping\n`);
        skipped++;
      } else {
        console.error(`   ❌ Failed: ${errorMsg}\n`);
        failed++;
      }
    }
  }

  console.log('━'.repeat(50));
  console.log(`📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped} (already exist or table missing)`);
  console.log(`   Failed:  ${failed}`);
  console.log('━'.repeat(50));

  if (failed > 0) {
    console.log('\n⚠️  Some indexes failed to create');
    process.exit(1);
  } else {
    console.log('\n🎉 Index creation completed successfully!');
  }
}

createIndexes();
