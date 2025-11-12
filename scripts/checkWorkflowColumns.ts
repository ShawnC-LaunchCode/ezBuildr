import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function checkWorkflowColumns() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('Checking workflows table columns...\n');

  try {
    // Get column information for workflows table
    const columns = await client(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workflows'
      ORDER BY ordinal_position
    `);

    console.log('Workflows table columns:');
    console.log('------------------------');
    columns.forEach((col: any) => {
      console.log(`${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Check for missing columns
    const requiredColumns = ['name', 'project_id', 'current_version_id', 'owner_id'];
    const existingColumnNames = columns.map((c: any) => c.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumnNames.includes(col));

    if (missingColumns.length > 0) {
      console.log('\n⚠️  Missing columns:', missingColumns.join(', '));
    } else {
      console.log('\n✅ All required columns exist!');
    }

  } catch (error: any) {
    console.error('Error checking columns:', error.message);
    process.exit(1);
  }
}

checkWorkflowColumns();
