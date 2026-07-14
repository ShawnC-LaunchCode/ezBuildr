import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function checkWorkflow() {
  // @ts-expect-error - TODO: fix type
  neonConfig.webSocketConstructor = ws.default as unknown as typeof WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  const workflowId = 'df2ce011-f589-4044-ac58-7fb51284bc1f';

  console.log("🔍 Checking workflow...\n");

  // Check workflow
  const workflow = await client.query(
    'SELECT id, title, status, creator_id, owner_id, project_id FROM workflows WHERE id = $1',
    [workflowId]
  );

  if (workflow.rows.length === 0) {
    console.log("❌ Workflow not found!");
    client.release();
    process.exit(1);
  }

  console.log("✅ Workflow found:");
  console.log(`   Title: ${workflow.rows[0].title}`);
  console.log(`   Status: ${workflow.rows[0].status}`);
  console.log(`   Creator: ${workflow.rows[0].creator_id}`);
  console.log(`   Owner: ${workflow.rows[0].owner_id}`);
  console.log(`   Project: ${workflow.rows[0].project_id}`);

  // Check sections
  const sections = await client.query(
    'SELECT COUNT(*) as count FROM sections WHERE workflow_id = $1',
    [workflowId]
  );
  console.log(`\n📄 Sections: ${sections.rows[0].count}`);

  // Check steps
  const steps = await client.query(
    'SELECT COUNT(*) as count FROM steps WHERE section_id IN (SELECT id FROM sections WHERE workflow_id = $1)',
    [workflowId]
  );
  console.log(`📝 Steps: ${steps.rows[0].count}`);

  // Check project
  if (workflow.rows[0].project_id) {
    const project = await client.query(
      'SELECT id, title FROM projects WHERE id = $1',
      [workflow.rows[0].project_id]
    );

    if (project.rows.length > 0) {
      console.log(`\n📁 Project: ${project.rows[0].title}`);
    } else {
      console.log(`\n⚠️  Project not found: ${workflow.rows[0].project_id}`);
    }
  }

  client.release();
  process.exit(0);
}

checkWorkflow();
