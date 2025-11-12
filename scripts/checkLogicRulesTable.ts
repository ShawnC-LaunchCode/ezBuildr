import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function checkLogicRulesTable() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('Checking logic_rules table...\n');

  try {
    // Check if table exists
    const tableCheck = await client(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'logic_rules'
      )
    `);

    if (!tableCheck[0].exists) {
      console.log('❌ logic_rules table does NOT exist!');
      return;
    }

    console.log('✓ logic_rules table exists\n');

    // Get column information
    const columns = await client(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'logic_rules'
      ORDER BY ordinal_position
    `);

    console.log('Columns in logic_rules table:');
    console.log('----------------------------------------');
    columns.forEach((col: any) => {
      console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(30)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Check for expected columns
    const expectedColumns = [
      'id', 'workflow_id', 'condition_step_id', 'operator', 'condition_value',
      'target_type', 'target_step_id', 'target_section_id', 'action',
      'logical_operator', 'order', 'created_at'
    ];

    const existingColumnNames = columns.map((c: any) => c.column_name);
    const missingColumns = expectedColumns.filter(col => !existingColumnNames.includes(col));

    if (missingColumns.length > 0) {
      console.log('\n⚠️  Missing columns:', missingColumns.join(', '));
    } else {
      console.log('\n✅ All expected columns exist!');
    }

    // Try a SELECT query to see what error occurs
    console.log('\nTesting SELECT query...');
    try {
      await client(`SELECT * FROM logic_rules LIMIT 1`);
      console.log('✓ SELECT * query succeeded');
    } catch (error: any) {
      console.log('❌ SELECT * query failed:', error.message);
      console.log('Error code:', error.code);
      console.log('Error position:', error.position);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('Error code:', error.code);
    if (error.position) console.error('Error position:', error.position);
    process.exit(1);
  }
}

checkLogicRulesTable();
