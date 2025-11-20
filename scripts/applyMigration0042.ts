/**
 * Apply Migration 0042: Add DataVault API Tokens (v4 Micro-Phase 5)
 * - Creates datavault_api_tokens table
 * - Adds indexes for performance
 * - Adds CASCADE deletion on database/tenant delete
 * - Enables external API access to DataVault databases
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

async function applyMigration() {
  console.log('🚀 Applying migration 0042: API Tokens...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if table already exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'datavault_api_tokens'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('✅ datavault_api_tokens table already exists');
    } else {
      // Read and execute migration SQL
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, '../migrations/0042_add_datavault_api_tokens.sql'),
        'utf-8'
      );

      await pool.query(migrationSQL);
      console.log('✅ Migration 0042 applied successfully!');
    }

    console.log('📊 Changes:');
    console.log('  - Created datavault_api_tokens table');
    console.log('  - Added indexes for performance (database_id, tenant_id, token_hash)');
    console.log('  - Added CASCADE deletion on database/tenant delete');
    console.log('  - Added unique constraint on token_hash');
    console.log('\n🔐 Security features:');
    console.log('  - Tokens stored as SHA-256 hashes (never plaintext)');
    console.log('  - Scope-based authorization (read/write)');
    console.log('  - Optional token expiration');
    console.log('\n📡 API Token endpoints:');
    console.log('  - GET    /api/datavault/databases/:databaseId/tokens');
    console.log('  - POST   /api/datavault/databases/:databaseId/tokens');
    console.log('  - DELETE /api/datavault/tokens/:tokenId');
    console.log('\n🔑 Usage:');
    console.log('  - Create tokens in Database Settings UI');
    console.log('  - Use X-VaultLogic-API-Key header for API requests');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
