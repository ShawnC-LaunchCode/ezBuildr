import 'dotenv/config';
import { getDb, dbInitPromise } from '../server/db';
import { sql } from 'drizzle-orm';

async function addMissingColumns() {
  console.log('Adding missing columns to users table...');

  // Wait for database to initialize
  await dbInitPromise;
  const db = getDb();

  try {
    // Create enum types if they don't exist
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "user_tenant_role" AS ENUM('owner', 'builder', 'runner', 'viewer');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Created/verified user_tenant_role enum');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "auth_provider" AS ENUM('local', 'google');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Created/verified auth_provider enum');

    // Add full_name column if it doesn't exist
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name varchar(255);`);
    console.log('✅ Added full_name column');

    // Add first_name column if it doesn't exist (from schema)
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name varchar(255);`);
    console.log('✅ Added first_name column');

    // Add last_name column if it doesn't exist (from schema)
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name varchar(255);`);
    console.log('✅ Added last_name column');

    // Add profile_image_url column if it doesn't exist (from schema)
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url varchar(500);`);
    console.log('✅ Added profile_image_url column');

    // Add tenant_id column if it doesn't exist
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id uuid;`);
    console.log('✅ Added tenant_id column');

    // Add tenant_role column if it doesn't exist (requires enum)
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_role user_tenant_role;`);
    console.log('✅ Added tenant_role column');

    // Add auth_provider column if it doesn't exist (requires enum with default)
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider auth_provider DEFAULT 'local' NOT NULL;`);
    console.log('✅ Added auth_provider column');

    // Add default_mode column if it doesn't exist
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_mode text DEFAULT 'easy' NOT NULL;`);
    console.log('✅ Added default_mode column');

    console.log('✅ All missing columns added successfully!');
  } catch (error) {
    console.error('❌ Error adding columns:', error);
    process.exit(1);
  }

  process.exit(0);
}

addMissingColumns();
