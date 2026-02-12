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

      columns.forEach((col: Record<string, unknown>) => {
        const columnName = String(col.column_name ?? '');
        const dataType = String(col.data_type ?? '');
        const isNullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        console.log(`  ${columnName.padEnd(25)} ${dataType.padEnd(30)} ${isNullable}`);
      });

    } catch (error: unknown) {
      const pgError = error as { message?: string };
      console.error(`  Error: ${pgError.message ?? String(error)}`);
    }
  }
}

checkAllTables();
