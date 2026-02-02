import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function addIsVirtualColumn() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('Adding is_virtual column to steps table...\n');

  try {
    // Add is_virtual column
    await client(`
      ALTER TABLE steps
      ADD COLUMN IF NOT EXISTS is_virtual boolean DEFAULT false NOT NULL
    `);
    console.log('✓ Added is_virtual column');

    // Create index
    await client(`
      CREATE INDEX IF NOT EXISTS steps_is_virtual_idx ON steps(is_virtual)
    `);
    console.log('✓ Created index on is_virtual');

    console.log('\n✅ Successfully added is_virtual column to steps table!');
    console.log('🔄 Please restart your dev server.');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {console.error('Error code:', error.code);}
    if (error.position) {console.error('Error position:', error.position);}
    process.exit(1);
  }
}

addIsVirtualColumn();
