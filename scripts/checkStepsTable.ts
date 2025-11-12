import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function checkStepsTable() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('Checking steps table columns...\n');

  try {
    const columns = await client(`
      SELECT column_name, data_type, is_nullable, ordinal_position
      FROM information_schema.columns
      WHERE table_name = 'steps'
      ORDER BY ordinal_position
    `);

    console.log('Steps table columns:');
    console.log('--------------------------------------');
    columns.forEach((col: any, index) => {
      const charCount = 8 + columns.slice(0, index + 1).map((c: any) => `"${c.column_name}"`.length + 2).reduce((a, b) => a + b, 0);
      console.log(`${(index + 1).toString().padStart(2)}. ${col.column_name.padEnd(20)} ${col.data_type.padEnd(25)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'.padEnd(8)} [char pos ~${charCount}]`);
    });

    const expectedColumns = [
      'id', 'section_id', 'type', 'title', 'description',
      'required', 'options', 'alias', 'order', 'is_virtual', 'created_at'
    ];

    const existingColumnNames = columns.map((c: any) => c.column_name);
    const missingColumns = expectedColumns.filter(col => !existingColumnNames.includes(col));

    if (missingColumns.length > 0) {
      console.log('\n⚠️  Missing columns:', missingColumns.join(', '));
    } else {
      console.log('\n✅ All expected columns exist!');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error position:', error.position);
    process.exit(1);
  }
}

checkStepsTable();
