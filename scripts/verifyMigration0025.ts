import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();
const sql = neon(process.env.DATABASE_URL!);

async function verify() {
  console.log('🔍 Verifying Migration 0025 Results\n');

  console.log('Projects Table:');
  const projectCols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'projects'
    AND column_name IN ('created_by', 'owner_id', 'status')
    ORDER BY column_name
  `;
  console.table(projectCols);

  console.log('\nSections Table:');
  const sectionCols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'sections'
    AND column_name = 'updated_at'
  `;
  console.table(sectionCols);

  console.log('\nSteps Table:');
  const stepCols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'steps'
    AND column_name = 'updated_at'
  `;
  console.table(stepCols);

  console.log('\nLogic Rules Table:');
  const logicCols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'logic_rules'
    AND column_name = 'updated_at'
  `;
  console.table(logicCols);

  console.log('\nIndices on Projects:');
  const indices = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'projects'
    AND indexname LIKE 'projects_%'
    ORDER BY indexname
  `;
  console.table(indices);

  console.log('\n✅ Verification Complete!');
}

verify().catch(console.error);
