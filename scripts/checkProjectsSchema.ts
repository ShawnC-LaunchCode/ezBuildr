#!/usr/bin/env tsx
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function checkSchema() {
  const client = neon(process.env.DATABASE_URL!);

  console.log('🔍 Projects Table Schema:');
  console.log('');

  const columns = await client(`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = 'projects'
    ORDER BY ordinal_position
  `);

  columns.forEach((col: any) => {
    console.log(`${col.column_name}:`);
    console.log(`  Type: ${col.data_type}`);
    console.log(`  Nullable: ${col.is_nullable}`);
    console.log(`  Default: ${col.column_default || 'none'}`);
    console.log('');
  });
}

checkSchema();
