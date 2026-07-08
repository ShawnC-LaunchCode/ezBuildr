import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function checkSchema() {
  // @ts-ignore - TODO: fix type
  neonConfig.webSocketConstructor = ws.default as typeof WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  const projects = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'projects'
    ORDER BY ordinal_position
  `);

  console.log('Projects table columns:');
  projects.rows.forEach((r: Record<string, unknown>) => {
    console.log(`  ${r.column_name} (${r.data_type}) - nullable: ${r.is_nullable}`);
  });

  const workflows = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'workflows'
    ORDER BY ordinal_position
  `);

  console.log('\nWorkflows table columns:');
  workflows.rows.forEach((r: Record<string, unknown>) => {
    console.log(`  ${r.column_name} (${r.data_type}) - nullable: ${r.is_nullable}`);
  });

  client.release();
  process.exit(0);
}

checkSchema();
