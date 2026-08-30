import dotenv from "dotenv";
dotenv.config();

import { Pool } from 'pg';

import { randomUUID } from 'crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface CreateDemoWorkflowOptions {
  connectionString?: string;
  userId?: string;
  tenantId?: string;
}

export interface CreatedDemoWorkflow {
  projectId: string;
  workflowId: string;
  publicLink: string;
}

export async function createDemoWorkflow(
  options: CreateDemoWorkflowOptions = {}
): Promise<CreatedDemoWorkflow> {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (connectionString === undefined) {
    throw new Error('DATABASE_URL is required to create the demo workflow');
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log("🎨 Creating Demo Workflow: Event Registration Platform\n");

    const userId = options.userId ?? "116568744155653496130";
    const tenantId = options.tenantId ?? "2181d3ab-9a00-42c2-a9b6-0d202df1e5f0";

    // 1. Create a project
    console.log("📁 Creating project...");
    const projectId = randomUUID();
    await client.query(`
      INSERT INTO projects (
        id, title, name, description, creator_id, owner_id, created_by,
        tenant_id, status, archived, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    `, [
      projectId,
      "Demo Project - Event Platform",
      "Demo Project - Event Platform",
      "Showcases VaultLogic's workflow automation capabilities",
      userId,
      userId,
      userId,
      tenantId,
      'active',
      false
    ]);
    console.log(`✅ Project created: ${projectId}\n`);

    // 2. Create workflow
    console.log("🔄 Creating workflow...");
    const workflowId = randomUUID();
    const publicLink = randomUUID();

    await client.query(`
      INSERT INTO workflows (
        id, project_id, title, description, status, creator_id, owner_id,
        public_link, is_public, require_login, intake_config, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [
      workflowId,
      projectId,
      "Event Registration & Pricing Calculator",
      "A comprehensive demo showing conditional logic, calculations, and various input types",
      "active",
      userId,
      userId,
      publicLink,
      true,
      false,
      JSON.stringify({ easyModeEnabled: true, welcomeScreen: null, thankYouScreen: null })
    ]);
    console.log(`✅ Workflow created: ${workflowId}`);
    console.log(`   Public link: http://localhost:5000/run/${publicLink}\n`);

    // 3. Create pages
    console.log("📄 Creating pages...");

    const page1Id = randomUUID();
    const page2Id = randomUUID();
    const page3Id = randomUUID();
    const page4Id = randomUUID();

    await client.query(`
      INSERT INTO pages (id, workflow_id, title, description, "order", created_at, updated_at)
      VALUES
        ($1, $2, 'Personal Information', 'Tell us about yourself', 0, NOW(), NOW()),
        ($3, $2, 'Event Preferences', 'Choose your event options', 1, NOW(), NOW()),
        ($4, $2, 'Additional Services', 'Optional add-ons', 2, NOW(), NOW()),
        ($5, $2, 'Review & Submit', 'Final details', 3, NOW(), NOW())
    `, [page1Id, workflowId, page2Id, page3Id, page4Id]);
    console.log(`✅ Created 4 pages\n`);

    // 4. Create steps
    console.log("📝 Creating steps...");

    // Page 1: Personal Information
    const step1_1 = randomUUID();
    const step1_2 = randomUUID();
    const step1_3 = randomUUID();
    const step1_4 = randomUUID();
    const step1_5 = randomUUID();
    const step1_6 = randomUUID();

    await client.query(`
      INSERT INTO steps (id, page_id, workflow_id, type, title, description, required, "order", alias, config, created_at, updated_at)
      VALUES
        ($1, $2, $8, 'text', 'Full Name', 'Enter your first and last name', true, 0, 'fullName', '{"variant": "short"}', NOW(), NOW()),
        ($3, $2, $8, 'text', 'Email Address', 'We''ll send confirmation to this email', true, 1, 'email', '{"variant": "short"}', NOW(), NOW()),
        ($4, $2, $8, 'text', 'Phone Number', 'Include country code if international', false, 2, 'phone', '{"variant": "short"}', NOW(), NOW()),
        ($5, $2, $8, 'choice', 'Attendance Type', 'How will you attend?', true, 3, 'attendanceType', '{"display": "radio", "options": [{"id": "in_person", "label": "In-Person", "alias": "In-Person"}, {"id": "virtual", "label": "Virtual", "alias": "Virtual"}]}', NOW(), NOW()),
        ($6, $2, $8, 'choice', 'Dietary Restrictions', 'Do you have any dietary requirements?', true, 4, 'hasDietary', '{"display": "radio", "options": [{"id": "yes", "label": "Yes", "alias": "Yes"}, {"id": "no", "label": "No", "alias": "No"}]}', NOW(), NOW()),
        ($7, $2, $8, 'text', 'Dietary Details', 'Please specify your dietary restrictions', true, 5, 'dietaryDetails', '{"variant": "long"}', NOW(), NOW())
    `, [step1_1, page1Id, step1_2, step1_3, step1_4, step1_5, step1_6, workflowId]);

    // Page 2: Event Preferences
    const step2_1 = randomUUID();
    const step2_2 = randomUUID();
    const step2_3 = randomUUID();
    const step2_4 = randomUUID();

    await client.query(`
      INSERT INTO steps (id, page_id, workflow_id, type, title, description, required, "order", alias, config, created_at, updated_at)
      VALUES
        ($1, $2, $6, 'choice', 'Ticket Type', 'Choose your registration tier', true, 0, 'ticketType', '{"display": "radio", "options": [{"id": "early_bird", "label": "Early Bird - $99", "alias": "Early Bird - $99"}, {"id": "standard", "label": "Standard - $149", "alias": "Standard - $149"}, {"id": "vip", "label": "VIP - $299", "alias": "VIP - $299"}]}', NOW(), NOW()),
        ($3, $2, $6, 'choice', 'Workshop Sessions', 'Select workshops you''d like to attend (max 3)', false, 1, 'workshops', '{"display": "multiple", "max": 3, "options": [{"id": "ai_ml", "label": "AI & Machine Learning", "alias": "AI & Machine Learning"}, {"id": "cloud", "label": "Cloud Architecture", "alias": "Cloud Architecture"}, {"id": "devops", "label": "DevOps Best Practices", "alias": "DevOps Best Practices"}, {"id": "security", "label": "Security Fundamentals", "alias": "Security Fundamentals"}]}', NOW(), NOW()),
        ($4, $2, $6, 'choice', 'T-Shirt Size', 'For in-person attendees only', false, 2, 'tshirtSize', '{"display": "radio", "options": [{"id": "S", "label": "Small", "alias": "Small"}, {"id": "M", "label": "Medium", "alias": "Medium"}, {"id": "L", "label": "Large", "alias": "Large"}, {"id": "XL", "label": "X-Large", "alias": "X-Large"}]}', NOW(), NOW()),
        ($5, $2, $6, 'date_time', 'Preferred Check-in Time', 'When would you like to check in?', false, 3, 'checkinTime', '{"kind": "datetime"}', NOW(), NOW())
    `, [step2_1, page2Id, step2_2, step2_3, step2_4, workflowId]);

    // Page 3: Additional Services
    const step3_1 = randomUUID();
    const step3_2 = randomUUID();
    const step3_3 = randomUUID();

    await client.query(`
      INSERT INTO steps (id, page_id, workflow_id, type, title, description, required, "order", alias, config, created_at, updated_at)
      VALUES
        ($1, $2, $5, 'boolean', 'Airport Shuttle', 'Do you need airport pickup? ($50)', false, 0, 'needsShuttle', '{"trueLabel": "Yes", "falseLabel": "No", "storeAsBoolean": false, "trueAlias": "yes", "falseAlias": "no", "displayStyle": "buttons"}', NOW(), NOW()),
        ($3, $2, $5, 'boolean', 'Hotel Accommodation', 'Reserve a hotel room? ($200/night)', false, 1, 'needsHotel', '{"trueLabel": "Yes", "falseLabel": "No", "storeAsBoolean": false, "trueAlias": "yes", "falseAlias": "no", "displayStyle": "buttons"}', NOW(), NOW()),
        ($4, $2, $5, 'text', 'Number of Nights', 'How many nights? (1-3)', false, 2, 'hotelNights', '{"variant": "short"}', NOW(), NOW())
    `, [step3_1, page3Id, step3_2, step3_3, workflowId]);

    // Page 4: Review
    const step4_1 = randomUUID();
    const step4_2 = randomUUID();

    await client.query(`
      INSERT INTO steps (id, page_id, workflow_id, type, title, description, required, "order", alias, config, created_at, updated_at)
      VALUES
        ($1, $2, $4, 'file_upload', 'Profile Photo', 'Upload a photo for your badge (optional)', false, 0, 'profilePhoto', '{"maxFiles": 1, "allowedTypes": ["image/jpeg", "image/png"]}', NOW(), NOW()),
        ($3, $2, $4, 'text', 'Special Requests', 'Any other requirements or questions?', false, 1, 'specialRequests', '{"variant": "long"}', NOW(), NOW())
    `, [step4_1, page4Id, step4_2, workflowId]);

    console.log(`✅ Created 15 steps with aliases\n`);

    // 5. Create logic rules
    console.log("🧠 Creating conditional logic rules...");

    const logic1Id = randomUUID();
    const logic2Id = randomUUID();
    const logic3Id = randomUUID();
    const logic4Id = randomUUID();

    // Show dietary details only if hasDietary = yes
    await client.query(`
      INSERT INTO logic_rules (
        id, workflow_id, condition_step_id, "when", target_type,
        target_step_id, action, "order", created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 'step', $5, 'show', 0, NOW(), NOW())
    `, [
      logic1Id,
      workflowId,
      step1_5,
      JSON.stringify({
        type: "condition",
        id: "demo-dietary-details-visible",
        variable: "hasDietary",
        operator: "equals",
        value: "Yes",
        valueType: "constant"
      }),
      step1_6
    ]);

    // Show t-shirt size only for in-person attendees
    await client.query(`
      INSERT INTO logic_rules (
        id, workflow_id, condition_step_id, "when", target_type,
        target_step_id, action, "order", created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 'step', $5, 'show', 1, NOW(), NOW())
    `, [
      logic2Id,
      workflowId,
      step1_4,
      JSON.stringify({
        type: "condition",
        id: "demo-tshirt-size-visible",
        variable: "attendanceType",
        operator: "equals",
        value: "In-Person",
        valueType: "constant"
      }),
      step2_3
    ]);

    // Show checkin time only for in-person
    await client.query(`
      INSERT INTO logic_rules (
        id, workflow_id, condition_step_id, "when", target_type,
        target_step_id, action, "order", created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 'step', $5, 'show', 2, NOW(), NOW())
    `, [
      logic3Id,
      workflowId,
      step1_4,
      JSON.stringify({
        type: "condition",
        id: "demo-checkin-time-visible",
        variable: "attendanceType",
        operator: "equals",
        value: "In-Person",
        valueType: "constant"
      }),
      step2_4
    ]);

    // Show hotel nights only if needsHotel = yes
    await client.query(`
      INSERT INTO logic_rules (
        id, workflow_id, condition_step_id, "when", target_type,
        target_step_id, action, "order", created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 'step', $5, 'show', 3, NOW(), NOW())
    `, [
      logic4Id,
      workflowId,
      step3_2,
      JSON.stringify({
        type: "condition",
        id: "demo-hotel-nights-visible",
        variable: "needsHotel",
        operator: "equals",
        value: "yes",
        valueType: "constant"
      }),
      step3_3
    ]);

    console.log(`✅ Created 4 conditional logic rules\n`);

    // 6. Create transform blocks for calculations
    console.log("⚡ Creating transform blocks...");

    const transform1Id = randomUUID();
    const virtualStep1Id = randomUUID();

    // Create virtual step for total price
    await client.query(`
      INSERT INTO steps (id, page_id, workflow_id, type, title, alias, required, "order", is_virtual, config, created_at, updated_at)
      VALUES ($1, $2, $3, 'computed', 'Total Price', 'totalPrice', false, 999, true, '{}', NOW(), NOW())
    `, [virtualStep1Id, page4Id, workflowId]);

    // Transform block to calculate total price
    await client.query(`
      INSERT INTO transform_blocks (
        id, workflow_id, page_id, name, language, code,
        input_keys, output_key, virtual_step_id, phase, enabled, "order", timeout_ms,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
    `, [
      transform1Id,
      workflowId,
      page4Id,
      "Calculate Total Price",
      "javascript",
      `// Calculate total registration cost
let total = 0;

// Base ticket price
const ticketPrices = {
  'Early Bird - $99': 99,
  'Standard - $149': 149,
  'VIP - $299': 299
};

total += ticketPrices[input.ticketType] || 0;

// Add-ons
if (input.needsShuttle === 'yes') {
  total += 50;
}

if (input.needsHotel === 'yes') {
  const nights = parseInt(input.hotelNights) || 1;
  total += nights * 200;
}

// Workshop premium for VIP
if (input.ticketType === 'VIP - $299' && input.workshops && input.workshops.length > 0) {
  // VIP workshops are included
  emit("VIP Price: $" + total + " (includes " + input.workshops.length + " workshops)");
} else {
  emit("Total: $" + total);
}`,
      ['ticketType', 'needsShuttle', 'needsHotel', 'hotelNights', 'workshops'],
      'totalPrice',
      virtualStep1Id,
      'onRunComplete',
      true,
      0,
      3000
    ]);

    console.log(`✅ Created 1 transform block with pricing calculation\n`);

    // Success!
    console.log("═".repeat(60));
    console.log("✅ DEMO WORKFLOW CREATED SUCCESSFULLY!");
    console.log("═".repeat(60));
    console.log("\n📊 Summary:");
    console.log(`   Project: Demo Project - Event Platform`);
    console.log(`   Workflow: Event Registration & Pricing Calculator`);
    console.log(`   Pages: 4`);
    console.log(`   Steps: 15 (+ 1 virtual step for calculations)`);
    console.log(`   Logic Rules: 4 conditional rules`);
    console.log(`   Transform Blocks: 1 pricing calculator`);
    console.log("\n🌐 Access URLs:");
    console.log(`   Builder: http://localhost:5000/workflows/${workflowId}`);
    console.log(`   Public Run: http://localhost:5000/run/${publicLink}`);
    console.log(`   Preview: http://localhost:5000/workflows/${workflowId}/preview`);
    console.log("\n🎯 Features Demonstrated:");
    console.log("   ✓ Multiple step types (text, choice, Boolean, date/time, file)");
    console.log("   ✓ Conditional logic (show/hide based on answers)");
    console.log("   ✓ Transform blocks (JavaScript calculations)");
    console.log("   ✓ Step aliases (variables)");
    console.log("   ✓ Page-based navigation");
    console.log("   ✓ File uploads");
    console.log("   ✓ Public sharing");
    console.log("\n💡 Try these interactions:");
    console.log("   • Select 'In-Person' to see t-shirt size and check-in time");
    console.log("   • Choose 'Yes' for dietary restrictions to see details field");
    console.log("   • Select 'Yes' for hotel to see nights input");
    console.log("   • Complete workflow to see total price calculation");
    console.log(`\n${  "═".repeat(60)}`);

    await client.query('COMMIT');
    return { projectId, workflowId, publicLink };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  createDemoWorkflow().catch((error: unknown) => {
    console.error("❌ Error creating demo workflow:", error);
    process.exitCode = 1;
  });
}
