import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import * as schema from '../shared/schema.js';

const { Pool } = pg;

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

async function seed() {
  console.log('🌱 Seeding database...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool, { schema });

  try {
    // =====================================================================
    // 1. CREATE TENANT
    // =====================================================================
    console.log('Creating tenant...');

    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        name: 'Acme Corporation',
        billingEmail: 'billing@acme.com',
        plan: 'pro',
      })
      .returning();

    console.log(`✅ Created tenant: ${tenant.name} (${tenant.id})`);

    // =====================================================================
    // 2. CREATE USER
    // =====================================================================
    console.log('Creating user...');

    const [user] = await db
      .insert(schema.users)
      .values({
        id: nanoid(),
        email: 'demo@acme.com',
        fullName: 'Demo User',
        firstName: 'Demo',
        lastName: 'User',
        tenantId: tenant.id,
        role: 'admin',
        tenantRole: 'owner',
        authProvider: 'local',
        defaultMode: 'easy',
      })
      .returning();

    console.log(`✅ Created user: ${user.email} (${user.id})`);

    // =====================================================================
    // 3. CREATE PROJECT
    // =====================================================================
    console.log('Creating project...');

    const [project] = await db
      .insert(schema.projects)
      .values({
        title: 'Document Automation Project',
        name: 'Document Automation Project',
        description: 'A sample project for testing document automation workflows',
        creatorId: user.id,
        createdBy: user.id,
        ownerId: user.id,
        tenantId: tenant.id,
        archived: false,
      })
      .returning();

    console.log(`✅ Created project: ${project.name} (${project.id})`);

    // =====================================================================
    // 4. CREATE WORKFLOW
    // =====================================================================
    console.log('Creating workflow...');

    const [workflow] = await db
      .insert(schema.workflows)
      .values({
        title: 'Employee Onboarding Form',
        name: 'Employee Onboarding Form',
        projectId: project.id,
        creatorId: user.id,
        status: 'draft',
      })
      .returning();

    console.log(`✅ Created workflow: ${workflow.name} (${workflow.id})`);

    // =====================================================================
    // 5. CREATE WORKFLOW VERSION
    // =====================================================================
    console.log('Creating workflow version...');

    const [workflowVersion] = await db
      .insert(schema.workflowVersions)
      .values({
        workflowId: workflow.id,
        graphJson: {
          nodes: [],
          edges: [],
        },
        createdBy: user.id,
        published: false,
      })
      .returning();

    console.log(`✅ Created workflow version (${workflowVersion.id})`);

    // Update workflow to set current version
    await db
      .update(schema.workflows)
      .set({ currentVersionId: workflowVersion.id })
      .where(schema.workflows.id.eq(workflow.id));

    console.log(`✅ Set current version for workflow`);

    // =====================================================================
    // 6. CREATE TEMPLATE
    // =====================================================================
    console.log('Creating template...');

    const [template] = await db
      .insert(schema.templates)
      .values({
        projectId: project.id,
        name: 'Onboarding Document',
        fileRef: '/templates/onboarding.docx',
        type: 'docx',
        helpersVersion: 1,
      })
      .returning();

    console.log(`✅ Created template: ${template.name} (${template.id})`);

    // =====================================================================
    // 7. CREATE SECTION
    // =====================================================================
    console.log('Creating section...');

    const [section] = await db
      .insert(schema.sections)
      .values({
        workflowId: workflow.id,
        title: 'Personal Information',
        description: 'Basic employee information',
        order: 1,
      })
      .returning();

    console.log(`✅ Created section: ${section.title} (${section.id})`);

    // =====================================================================
    // 8. CREATE STEPS
    // =====================================================================
    console.log('Creating steps...');

    const [step1] = await db
      .insert(schema.steps)
      .values({
        sectionId: section.id,
        type: 'short_text',
        title: 'Full Name',
        description: 'Enter your full legal name',
        required: true,
        order: 1,
        alias: 'full_name',
      })
      .returning();

    const [step2] = await db
      .insert(schema.steps)
      .values({
        sectionId: section.id,
        type: 'short_text',
        title: 'Email Address',
        description: 'Enter your work email address',
        required: true,
        order: 2,
        alias: 'email',
      })
      .returning();

    const [step3] = await db
      .insert(schema.steps)
      .values({
        sectionId: section.id,
        type: 'date_time',
        title: 'Start Date',
        description: 'When will you start?',
        required: true,
        order: 3,
        alias: 'start_date',
      })
      .returning();

    console.log(`✅ Created ${3} steps`);

    // =====================================================================
    // 9. CREATE SECRET (for API integration)
    // =====================================================================
    console.log('Creating secret...');

    const [secret] = await db
      .insert(schema.secrets)
      .values({
        projectId: project.id,
        key: 'SAMPLE_API_KEY',
        valueEnc: 'encrypted_api_key_value_here',
      })
      .returning();

    console.log(`✅ Created secret: ${secret.key}`);

    // =====================================================================
    // 10. CREATE API KEY
    // =====================================================================
    console.log('Creating API key...');

    const [apiKey] = await db
      .insert(schema.apiKeys)
      .values({
        projectId: project.id,
        keyHash: 'hashed_api_key_' + nanoid(),
        scopes: ['read', 'write'],
      })
      .returning();

    console.log(`✅ Created API key (${apiKey.id})`);

    console.log('\\n✅ Seeding completed successfully!');
    console.log('\\n📊 Summary:');
    console.log(`   Tenant: ${tenant.name}`);
    console.log(`   User: ${user.email}`);
    console.log(`   Project: ${project.name}`);
    console.log(`   Workflow: ${workflow.name}`);
    console.log(`   Template: ${template.name}`);
    console.log(`   Sections: 1`);
    console.log(`   Steps: 3`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Failed to seed database:', error);
  process.exit(1);
});
