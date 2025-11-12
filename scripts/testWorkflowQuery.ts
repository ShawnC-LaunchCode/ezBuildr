import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function testWorkflowQuery() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);
  const workflowId = 'ce36deff-a786-4e78-a291-15d35591a015';

  console.log('Testing workflow query...\n');

  try {
    // Try a simple SELECT * query
    console.log('Attempting SELECT * FROM workflows...');
    const result = await client(`
      SELECT *
      FROM workflows
      WHERE id = $1
      LIMIT 1
    `, [workflowId]);

    console.log('✓ Query successful!');
    console.log('Workflow found:', result.length > 0);

    if (result.length > 0) {
      console.log('\nColumn names:');
      Object.keys(result[0]).forEach((col, i) => {
        console.log(`  ${i + 1}. ${col}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error position:', error.position);
    console.error('Error detail:', error.detail);

    // Now try selecting specific columns to narrow down the issue
    console.log('\nTrying to select specific columns...');

    const columnsToTest = [
      'id', 'title', 'description', 'creator_id', 'owner_id',
      'mode_override', 'public_link', 'name', 'project_id',
      'current_version_id', 'status', 'created_at', 'updated_at'
    ];

    for (const col of columnsToTest) {
      try {
        await client(`SELECT ${col} FROM workflows WHERE id = $1 LIMIT 1`, [workflowId]);
        console.log(`  ✓ ${col}`);
      } catch (e: any) {
        console.log(`  ❌ ${col} - Error: ${e.message}`);
      }
    }
  }
}

testWorkflowQuery();
