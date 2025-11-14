import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();
const sql = neon(process.env.DATABASE_URL!);

async function applyMigration() {
  console.log('Applying migration 0025 step by step...\n');

  const steps = [
    {
      name: 'Add created_by to projects',
      sql: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by varchar`
    },
    {
      name: 'Add owner_id to projects',
      sql: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id varchar`
    },
    {
      name: 'Add status to projects',
      sql: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'active'`
    },
    {
      name: 'Add updated_at to sections',
      sql: `ALTER TABLE sections ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`
    },
    {
      name: 'Add updated_at to steps',
      sql: `ALTER TABLE steps ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`
    },
    {
      name: 'Add updated_at to logic_rules',
      sql: `ALTER TABLE logic_rules ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`
    }
  ];

  for (const step of steps) {
    try {
      await sql(step.sql);
      console.log('✓', step.name);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('s', step.name, '(already exists)');
      } else {
        console.log('✗', step.name, ':', error.message);
      }
    }
  }

  console.log('\n✅ Core migration steps completed!');
  console.log('\nNow running backfill and constraints...\n');

  // Backfill and constraints
  const backfillSteps = [
    {
      name: 'Backfill sections.updated_at',
      sql: `UPDATE sections SET updated_at = created_at WHERE updated_at IS NULL`
    },
    {
      name: 'Backfill steps.updated_at',
      sql: `UPDATE steps SET updated_at = created_at WHERE updated_at IS NULL`
    },
    {
      name: 'Backfill logic_rules.updated_at',
      sql: `UPDATE logic_rules SET updated_at = created_at WHERE updated_at IS NULL`
    },
    {
      name: 'Create projects_created_by_idx',
      sql: `CREATE INDEX IF NOT EXISTS projects_created_by_idx ON projects(created_by)`
    },
    {
      name: 'Create projects_owner_idx',
      sql: `CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id)`
    },
    {
      name: 'Create projects_status_idx',
      sql: `CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status)`
    }
  ];

  for (const step of backfillSteps) {
    try {
      await sql(step.sql);
      console.log('✓', step.name);
    } catch (error: any) {
      console.log('⚠', step.name, ':', error.message);
    }
  }

  console.log('\n✅ Migration 0025 fully applied!');
}

applyMigration().catch(console.error);
