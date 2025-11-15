#!/usr/bin/env tsx
/**
 * Check if SLI tables exist
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function checkTables() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = neon(dbUrl);

  try {
    // Check if sli_configs table exists
    const result = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sli_configs'
      );
    `;

    console.log('sli_configs table exists:', result[0].exists);

    // Try to describe the table if it exists
    if (result[0].exists) {
      const columns = await client`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'sli_configs'
        ORDER BY ordinal_position;
      `;
      console.log('\nColumns:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type}`);
      });
    } else {
      console.log('\n❌ sli_configs table does not exist');

      // Check what tables DO exist
      const tables = await client`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name LIKE '%sli%' OR table_name LIKE '%metric%'
        ORDER BY table_name;
      `;

      if (tables.length > 0) {
        console.log('\nRelated tables found:');
        tables.forEach(t => console.log(`  - ${t.table_name}`));
      } else {
        console.log('\nNo SLI or metrics tables found');
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTables();
