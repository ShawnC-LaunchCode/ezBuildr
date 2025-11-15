#!/usr/bin/env tsx
/**
 * Test if we can query the sli_configs table
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function testQuery() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  console.log('Testing sli_configs table query...');

  const client = neon(dbUrl);

  try {
    // Try to query the table
    const result = await client`
      SELECT * FROM sli_configs LIMIT 1;
    `;

    console.log('✅ Successfully queried sli_configs table');
    console.log('Rows returned:', result.length);

    // Try to insert a test record
    console.log('\nTesting insert...');
    const insertResult = await client`
      INSERT INTO sli_configs (tenant_id, project_id, workflow_id)
      VALUES (
        'f94a5b56-a836-4454-82e0-83c0e2495a31'::uuid,
        'f94a5b56-a836-4454-82e0-83c0e2495a31'::uuid,
        NULL
      )
      ON CONFLICT DO NOTHING
      RETURNING id;
    `;

    if (insertResult.length > 0) {
      console.log('✅ Successfully inserted test record:', insertResult[0].id);
    } else {
      console.log('ℹ️  Record already exists (conflict)');
    }

    // Try to select again
    const result2 = await client`
      SELECT id, tenant_id, project_id, workflow_id, "window"
      FROM sli_configs
      LIMIT 5;
    `;

    console.log('\n✅ All records in sli_configs:');
    result2.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ID: ${row.id}, Window: ${row.window}`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('   Error code:', error.code);
    }
    process.exit(1);
  }
}

testQuery();
