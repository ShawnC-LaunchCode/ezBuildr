import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function applyMigration() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);
  const db = drizzle(client);

  const migration = fs.readFileSync('migrations/0009_add_multi_tenant_data_model.sql', 'utf-8');

  console.log('Applying migration 0009_add_multi_tenant_data_model...');

  try {
    await db.execute(sql.raw(migration));
    console.log('Migration applied successfully!');
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();
