import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function checkAllTables() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);

  const tables = ['users', 'projects', 'workflows'];

  for (const tableName of tables) {
    console.log(`\n=== ${tableName.toUpperCase()} TABLE ===`);

    try {
      const columns = await client(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `);

      columns.forEach((col: any) => {
        console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(30)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });

    } catch (error: any) {
      console.error(`  Error: ${error.message}`);
    }
  }
}

checkAllTables();
