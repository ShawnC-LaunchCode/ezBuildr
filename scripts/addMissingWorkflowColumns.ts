import 'dotenv/config';
import { getDb, dbInitPromise } from '../server/db';
import { sql } from 'drizzle-orm';

async function addMissingWorkflowColumns() {
  console.log('Adding missing columns to workflows and related tables...');

  // Wait for database to initialize
  await dbInitPromise;
  const db = getDb();

  try {
    // Create enums first
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "workflow_status" AS ENUM('draft', 'published');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Created/verified workflow_status enum');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "tenant_plan" AS ENUM('free', 'pro', 'enterprise');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Created/verified tenant_plan enum');

    // Create tenants table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(255) NOT NULL,
        "billing_email" varchar(255),
        "plan" "tenant_plan" DEFAULT 'free' NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      );
    `);
    console.log('✅ Created/verified tenants table');

    // Create projects table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE cascade NOT NULL,
        "archived" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      );
    `);
    console.log('✅ Created/verified projects table');

    // Add name column to workflows if it doesn't exist (copy from title)
    await db.execute(sql`ALTER TABLE workflows ADD COLUMN IF NOT EXISTS name varchar(255);`);
    console.log('✅ Added name column to workflows');

    // Update name from title if name is null
    await db.execute(sql`UPDATE workflows SET name = title WHERE name IS NULL;`);
    console.log('✅ Copied title to name');

    // Add project_id column to workflows if it doesn't exist
    await db.execute(sql`ALTER TABLE workflows ADD COLUMN IF NOT EXISTS project_id uuid;`);
    console.log('✅ Added project_id column to workflows');

    // Add current_version_id column to workflows if it doesn't exist
    await db.execute(sql`ALTER TABLE workflows ADD COLUMN IF NOT EXISTS current_version_id uuid;`);
    console.log('✅ Added current_version_id column to workflows');

    console.log('✅ All missing workflow columns added successfully!');
  } catch (error) {
    console.error('❌ Error adding columns:', error);
    process.exit(1);
  }

  process.exit(0);
}

addMissingWorkflowColumns();
