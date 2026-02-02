import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const sql = neon(process.env.DATABASE_URL!);

async function listIndexes() {
  const result = await sql`
    SELECT
      indexname,
      tablename
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;

  console.log('All indexes in database:');
  console.log(JSON.stringify(result, null, 2));
}

listIndexes();
