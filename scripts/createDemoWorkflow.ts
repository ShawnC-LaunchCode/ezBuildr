import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

import { randomUUID } from 'crypto';

async function createDemoWorkflow() {
  try {
    // @ts-ignore - TODO: fix type
    neonConfig.webSocketConstructor = ws.default as unknown as typeof WebSocket;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    console.log("🎨 Creating Demo Workflow: Event Registration Platform\n");

    const userId = "116568744155653496130";
    const tenantId = "2181d3ab-9a00-42c2-a9b6-0d202df1e5f0";

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

    // 3. Create sections
    console.log("📄 Creating sections...");

    const section1Id = randomUUID();
    const section2Id = randomUUID();
    const section3Id = randomUUID();
    const section4Id = randomUUID();

    await client.query(`
      INSERT INTO sections (id, workflow_id, title, description, "order", created_at, updated_at)
      VALUES
        ($1, $2, 'Personal Information', 'Tell us about yourself', 0, NOW(), NOW()),
        ($3, $2, 'Event Preferences', 'Choose your event options', 1, NOW(), NOW()),
        ($4, $2, 'Additional Services', 'Optional add-ons', 2, NOW(), NOW()),
        ($5, $2, 'Review & Submit', 'Final details', 3, NOW(), NOW())
    `, [section1Id, workflowId, section2Id, section3Id, section4Id]);
    console.log(`✅ Created 4 sections\n`);

    // 4. Create steps
    console.log("📝 Creating steps...");

    // Section 1: Personal Information
    const step1_1 = randomUUID();
    const step1_2 = randomUUID();
    const step1_3 = randomUUID();
    const step1_4 = randomUUID();
    const step1_5 = randomUUID();
    const step1_6 = randomUUID();

    await client.query(`
      INSERT INTO steps (id, section_id, type, title, description, required, "order", alias, config, created_at, updated_at)
      VALUES
        ($1, $2, 'short_text', 'Full Name', 'Enter your first and last name', true, 0, 'fullName', '{}', NOW(), NOW()),
        ($3, $2, 'short_text', 'Email Address', 'We''ll send confirmation to this email', true, 1, 'email', '{"validation": "email"}', NOW(), NOW()),
        ($4, $2, 'short_text', 'Phone Number', 'Include country code if international', false, 2, 'phone', '{}', NOW(), NOW()),
        ($5, $2, 'radio', 'Attendance Type', 'How will you attend?', true, 3, 'attendanceType', '{"options": [{"label": "In-Person", "value": "in_person"}, {"label": "Virtual", "value": "virtual"}]}', NOW(), NOW()),
        ($6, $2, 'radio', 'Dietary Restrictions', 'Do you have any dietary requirements?', true, 4, 'hasDietary', '{"options": [{"label": "Yes", "value": "yes"}, {"label": "No", "value": "no"}]}', NOW(), NOW()),
        ($7, $2, 'long_text', 'Dietary Details', 'Please specify your dietary restrictions', true, 5, 'dietaryDetails', '{}', NOW(), NOW())
    `, [step1_1, section1Id, step1_2, step1_3, step1_4, step1_5, step1_6]);

    // Section 2: Event Preferences
    const step2_1 = randomUUID();
    const step2_2 = randomUUID();
    const step2_3 = randomUUID();
    const step2_4 = randomUUID();

    await client.query(`
      INSERT INTO steps (id, section_id, type, title, description, required, "order", alias, config, created_at, updated_at)
      VALUES
        ($1, $2, 'radio', 'Ticket Type', 'Choose your registration tier', true, 0, 'ticketType', '{"options": [{"label": "Early Bird - $99", "value": "early_bird"}, {"label": "Standard - $149", "value": "standard"}, {"label": "VIP - $299", "value": "vip"}]}', NOW(), NOW()),
        ($3, $2, 'checkbox', 'Workshop Sessions', 'Select workshops you''d like to attend (max 3)', false, 1, 'workshops', '{"options": [{"label": "AI & Machine Learning", "value": "ai_ml"}, {"label": "Cloud Architecture", "value": "cloud"}, {"label": "DevOps Best Practices", "value": "devops"}, {"label": "Security Fundamentals", "value": "security"}]}', NOW(), NOW()),
        ($4, $2, 'radio', 'T-Shirt Size', 'For in-person attendees only', false, 2, 'tshirtSize', '{"options": [{"label": "Small", "value": "S"}, {"label": "Medium", "value": "M"}, {"label": "Large", "value": "L"}, {"label": "X-Large", "value": "XL"}]}', NOW(), NOW()),
        ($5, $2, 'date_time', 'Preferred Check-in Time', 'When would you like to check in?', false, 3, 'checkinTime', '{"dateType": "datetime"}', NOW(), NOW())
    `, [step2_1, section2Id, step2_2, step2_3, step2_4]);

    // Section 3: Additional Services
    const step3_1 = randomUUID();
    const step3_2 = randomUUID();
    const step3_3 = randomUUID();

    await client.query(`
      INSERT INTO steps (id, section_id, type, title, description, required, "order", alias, config, created_at, updated_at)
      VALUES
        ($1, $2, 'yes_no', 'Airport Shuttle', 'Do you need airport pickup? ($50)', false, 0, 'needsShuttle', '{}', NOW(), NOW()),
        ($3, $2, 'yes_no', 'Hotel Accommodation', 'Reserve a hotel room? ($200/night)', false, 1, 'needsHotel', '{}', NOW(), NOW()),
        ($4, $2, 'short_text', 'Number of Nights', 'How many nights? (1-3)', false, 2, 'hotelNights', '{"validation": "number"}', NOW(), NOW())
    `, [step3_1, section3Id, step3_2, step3_3]);

    // Section 4: Review
    const step4_1 = randomUUID();
    const step4_2 = randomUUID();

    await client.query(`
      INSERT INTO steps (id, section_id, type, title, description, required, "order", alias, config, created_at, updated_at)
      VALUES
        ($1, $2, 'file_upload', 'Profile Photo', 'Upload a photo for your badge (optional)', false, 0, 'profilePhoto', '{"maxFiles": 1, "allowedTypes": ["image/jpeg", "image/png"]}', NOW(), NOW()),
        ($3, $2, 'long_text', 'Special Requests', 'Any other requirements or questions?', false, 1, 'specialRequests', '{}', NOW(), NOW())
    `, [step4_1, section4Id, step4_2]);

    console.log(`✅ Created 15 steps with aliases\n`);

    // 5. Create logic rules
    console.log("🧠 Creating conditional logic rules...");

    const logic1Id = randomUUID();
    const logic2Id = randomUUID();
    const logic3Id = randomUUID();
    const logic4Id = randomUUID();

    // Show dietary details only if hasDietary = yes
    await client.query(`
      INSERT INTO logic_rules (id, workflow_id, condition, action, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [
      logic1Id,
      workflowId,
      JSON.stringify({
        type: "simple",
        operator: "equals",
        variableName: "hasDietary",
        value: "yes"
      }),
      JSON.stringify({
        type: "show",
        targetId: step1_6,
        targetType: "step"
      })
    ]);

    // Show t-shirt size only for in-person attendees
    await client.query(`
      INSERT INTO logic_rules (id, workflow_id, condition, action, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [
      logic2Id,
      workflowId,
      JSON.stringify({
        type: "simple",
        operator: "equals",
        variableName: "attendanceType",
        value: "in_person"
      }),
      JSON.stringify({
        type: "show",
        targetId: step2_3,
        targetType: "step"
      })
    ]);

    // Show checkin time only for in-person
    await client.query(`
      INSERT INTO logic_rules (id, workflow_id, condition, action, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [
      logic3Id,
      workflowId,
      JSON.stringify({
        type: "simple",
        operator: "equals",
        variableName: "attendanceType",
        value: "in_person"
      }),
      JSON.stringify({
        type: "show",
        targetId: step2_4,
        targetType: "step"
      })
    ]);

    // Show hotel nights only if needsHotel = yes
    await client.query(`
      INSERT INTO logic_rules (id, workflow_id, condition, action, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [
      logic4Id,
      workflowId,
      JSON.stringify({
        type: "simple",
        operator: "equals",
        variableName: "needsHotel",
        value: "yes"
      }),
      JSON.stringify({
        type: "show",
        targetId: step3_3,
        targetType: "step"
      })
    ]);

    console.log(`✅ Created 4 conditional logic rules\n`);

    // 6. Create transform blocks for calculations
    console.log("⚡ Creating transform blocks...");

    const transform1Id = randomUUID();
    const virtualStep1Id = randomUUID();

    // Create virtual step for total price
    await client.query(`
      INSERT INTO steps (id, section_id, type, title, alias, required, "order", is_virtual, config, created_at, updated_at)
      VALUES ($1, $2, 'computed', 'Total Price', 'totalPrice', false, 999, true, '{}', NOW(), NOW())
    `, [virtualStep1Id, section4Id]);

    // Transform block to calculate total price
    await client.query(`
      INSERT INTO transform_blocks (
        id, workflow_id, section_id, name, language, code,
        input_keys, output_key, virtual_step_id, phase, enabled, "order", timeout_ms,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
    `, [
      transform1Id,
      workflowId,
      section4Id,
      "Calculate Total Price",
      "javascript",
      `// Calculate total registration cost
let total = 0;

// Base ticket price
const ticketPrices = {
  'early_bird': 99,
  'standard': 149,
  'vip': 299
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
if (input.ticketType === 'vip' && input.workshops && input.workshops.length > 0) {
  // VIP workshops are included
  emit("VIP Price: $" + total + " (includes " + input.workshops.length + " workshops)");
} else {
  emit("Total: $" + total);
}`,
      JSON.stringify(['ticketType', 'needsShuttle', 'needsHotel', 'hotelNights', 'workshops']),
      'totalPrice',
      virtualStep1Id,
      'onWorkflowComplete',
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
    console.log(`   Sections: 4`);
    console.log(`   Steps: 15 (+ 1 virtual step for calculations)`);
    console.log(`   Logic Rules: 4 conditional rules`);
    console.log(`   Transform Blocks: 1 pricing calculator`);
    console.log("\n🌐 Access URLs:");
    console.log(`   Builder: http://localhost:5000/workflows/${workflowId}`);
    console.log(`   Public Run: http://localhost:5000/run/${publicLink}`);
    console.log(`   Preview: http://localhost:5000/workflows/${workflowId}/preview`);
    console.log("\n🎯 Features Demonstrated:");
    console.log("   ✓ Multiple step types (text, radio, checkbox, yes/no, date, file)");
    console.log("   ✓ Conditional logic (show/hide based on answers)");
    console.log("   ✓ Transform blocks (JavaScript calculations)");
    console.log("   ✓ Step aliases (variables)");
    console.log("   ✓ Section-based navigation");
    console.log("   ✓ File uploads");
    console.log("   ✓ Public sharing");
    console.log("\n💡 Try these interactions:");
    console.log("   • Select 'In-Person' to see t-shirt size and check-in time");
    console.log("   • Choose 'Yes' for dietary restrictions to see details field");
    console.log("   • Select 'Yes' for hotel to see nights input");
    console.log("   • Complete workflow to see total price calculation");
    console.log(`\n${  "═".repeat(60)}`);

    client.release();
    process.exit(0);
  } catch (error: unknown) {
    console.error("❌ Error creating demo workflow:", error);
    process.exit(1);
  }
}

createDemoWorkflow();
