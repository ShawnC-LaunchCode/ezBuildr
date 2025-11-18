import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

async function markMigrationsApplied() {
  console.log('📝 Marking all existing migrations as applied...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Ensure drizzle migration table exists
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS "drizzle";
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        "id" SERIAL PRIMARY KEY,
        "hash" text NOT NULL,
        "created_at" bigint
      );
    `);

    // Read all migration files
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files\n`);

    // Check which are already applied
    const appliedResult = await pool.query(
      'SELECT hash FROM drizzle.__drizzle_migrations'
    );
    const appliedHashes = new Set(appliedResult.rows.map(r => r.hash));

    let markedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Generate hash (same as drizzle-orm does)
      const hash = crypto.createHash('sha256').update(sql).digest('hex');

      if (appliedHashes.has(hash)) {
        console.log(`  ⏭️  ${file} (already applied)`);
        skippedCount++;
      } else {
        const timestamp = Date.now();
        await pool.query(
          'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
          [hash, timestamp]
        );
        console.log(`  ✅ ${file} (marked as applied)`);
        markedCount++;
      }
    }

    console.log('\n' + '─'.repeat(80));
    console.log(`✅ Marked ${markedCount} migrations as applied`);
    console.log(`⏭️  Skipped ${skippedCount} already applied migrations`);
    console.log('─'.repeat(80));
    console.log('\nYou can now run new migrations with: npm run db:migrate\n');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

markMigrationsApplied().catch(console.error);
