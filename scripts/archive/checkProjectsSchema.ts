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

  columns.forEach((col: Record<string, unknown>) => {
    const columnName = String(col.column_name ?? '');
    const dataType = String(col.data_type ?? '');
    const isNullable = String(col.is_nullable ?? '');
    const columnDefault = col.column_default ? String(col.column_default) : 'none';
    console.log(`${columnName}:`);
    console.log(`  Type: ${dataType}`);
    console.log(`  Nullable: ${isNullable}`);
    console.log(`  Default: ${columnDefault}`);
    console.log('');
  });
}

checkSchema();
