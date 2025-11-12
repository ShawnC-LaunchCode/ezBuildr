import { drizzle } from 'drizzle-orm/neon-http';
import { neon, neonConfig } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

// Enable full results for multi-statement execution
neonConfig.fetchOptions = {
  cache: 'no-store',
};

async function fixUserColumns() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('Applying critical schema fixes...');

  try {
    // Execute each statement separately
    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name varchar(255)');
    console.log('✓ Added full_name column');

    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id uuid');
    console.log('✓ Added tenant_id column');

    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name varchar(255)');
    console.log('✓ Added first_name column');

    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name varchar(255)');
    console.log('✓ Added last_name column');

    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url varchar(500)');
    console.log('✓ Added profile_image_url column');

    console.log('\nAll columns added successfully! You can now log in.');
  } catch (error: any) {
    console.error('Error fixing user columns:', error.message);
    process.exit(1);
  }
}

fixUserColumns();
