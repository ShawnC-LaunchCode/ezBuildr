import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function checkWorkflowData() {
  // @ts-expect-error - TODO: fix type
  neonConfig.webSocketConstructor = ws.default as unknown as typeof WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  const workflowId = '1e61a9c1-ed6b-47eb-bcc6-7ab18e1e569c';

  console.log("🔍 Checking workflow data...\n");

  // Check workflow
  const workflow = await client.query('SELECT * FROM workflows WHERE id = $1', [workflowId]);
  console.log(`Workflow found: ${workflow.rows.length > 0}`);
  if (workflow.rows.length > 0) {
    const w = workflow.rows[0];
    console.log(`  Title: ${w.title}`);
    console.log(`  Status: ${w.status}`);
    console.log(`  Creator ID: ${w.creator_id}`);
    console.log(`  Owner ID: ${w.owner_id}`);
    console.log(`  Project ID: ${w.project_id}`);
    console.log(`  Public Link: ${w.public_link}`);
  }

  // Check sections
  const sections = await client.query('SELECT id, title, "order" FROM sections WHERE workflow_id = $1 ORDER BY "order"', [workflowId]);
  console.log(`\nSections: ${sections.rows.length}`);
  sections.rows.forEach((s: Record<string, unknown>) => {
    console.log(`  - ${s.title} (order: ${s.order})`);
  });

  // Check steps
  const steps = await client.query('SELECT id, section_id, title, type FROM steps WHERE section_id = ANY(SELECT id FROM sections WHERE workflow_id = $1)', [workflowId]);
  console.log(`\nSteps: ${steps.rows.length}`);

  // Check project
  const project = await client.query('SELECT * FROM projects WHERE id = $1', [workflow.rows[0]?.project_id]);
  console.log(`\nProject found: ${project.rows.length > 0}`);
  if (project.rows.length > 0) {
    const p = project.rows[0];
    console.log(`  Title: ${p.title}`);
    console.log(`  Creator ID: ${p.creator_id}`);
    console.log(`  Owner ID: ${p.owner_id}`);
  }

  client.release();
  process.exit(0);
}

checkWorkflowData();
