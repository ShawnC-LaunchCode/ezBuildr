/**
 * Create a comprehensive loan application workflow
 * Demonstrates: multiple sections, conditional logic, transform blocks, and document generation
 */

import { initializeDatabase, getDb } from '../server/db';
import { workflows, sections, steps, templates, projects, users, logicRules, transformBlocks } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function createLoanApplicationWorkflow() {
  await initializeDatabase();
  const db = getDb();

  // Get the first user
  const userList = await db.select().from(users).limit(1);
  if (userList.length === 0) {
    console.log('No users found. Please create a user first.');
    return;
  }

  const user = userList[0];
  console.log('Using user:', user.email);

  // Get or create a project
  let project = await db.select().from(projects).where(eq(projects.createdBy, user.id)).limit(1);
  if (project.length === 0) {
    console.log('Creating new project...');
    const newProject = await db.insert(projects).values({
      id: randomUUID(),
      name: 'Financial Services',
      description: 'Loan and mortgage applications',
      createdBy: user.id,
      tenantId: user.id,
    }).returning();
    project = newProject;
  }

  const projectId = project[0].id;
  console.log('Using project:', projectId);

  // Create the workflow
  console.log('\n=== Creating Loan Application Workflow ===');
  const workflow = await db.insert(workflows).values({
    id: randomUUID(),
    title: 'Personal Loan Application',
    description: 'Complete loan application with automated approval letter generation',
    projectId,
    creatorId: user.id,
    ownerId: user.id,
    status: 'active',
    isPublic: true,
    publicLink: 'loan-application-' + Date.now(),
  }).returning();

  const workflowId = workflow[0].id;
  console.log('✓ Workflow created:', workflowId);

  // ==================== SECTION 1: Personal Information ====================
  console.log('\n=== Creating Section 1: Personal Information ===');
  const section1 = await db.insert(sections).values({
    id: randomUUID(),
    workflowId,
    title: 'Personal Information',
    description: 'Tell us about yourself',
    order: 1,
  }).returning();

  const personalSteps = [
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text' as const,
      title: 'First Name',
      alias: 'firstName',
      required: true,
      order: 1,
    },
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text' as const,
      title: 'Last Name',
      alias: 'lastName',
      required: true,
      order: 2,
    },
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text' as const,
      title: 'Email Address',
      alias: 'email',
      required: true,
      order: 3,
    },
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text' as const,
      title: 'Phone Number',
      alias: 'phone',
      required: true,
      order: 4,
    },
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'date_time' as const,
      title: 'Date of Birth',
      alias: 'dateOfBirth',
      required: true,
      order: 5,
      config: { dateTimeType: 'date' },
    },
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text' as const,
      title: 'Social Security Number',
      alias: 'ssn',
      required: true,
      order: 6,
      description: 'Format: XXX-XX-XXXX',
    },
  ];

  await db.insert(steps).values(personalSteps);
  console.log('✓ Added 6 personal information steps');

  // ==================== SECTION 2: Employment & Income ====================
  console.log('\n=== Creating Section 2: Employment & Income ===');
  const section2 = await db.insert(sections).values({
    id: randomUUID(),
    workflowId,
    title: 'Employment & Income',
    description: 'Your employment and income details',
    order: 2,
  }).returning();

  const employmentTypeStepId = randomUUID();
  const employmentSteps = [
    {
      id: employmentTypeStepId,
      sectionId: section2[0].id,
      type: 'radio' as const,
      title: 'Employment Status',
      alias: 'employmentStatus',
      required: true,
      order: 1,
      config: {
        options: ['Employed Full-Time', 'Employed Part-Time', 'Self-Employed', 'Retired', 'Unemployed'],
      },
    },
    {
      id: randomUUID(),
      sectionId: section2[0].id,
      type: 'short_text' as const,
      title: 'Employer Name',
      alias: 'employerName',
      required: true,
      order: 2,
      // Will be shown only if employed
      visibleIf: {
        operator: 'not_equals',
        variableName: 'employmentStatus',
        value: 'Unemployed',
      },
    },
    {
      id: randomUUID(),
      sectionId: section2[0].id,
      type: 'short_text' as const,
      title: 'Job Title',
      alias: 'jobTitle',
      required: false,
      order: 3,
      visibleIf: {
        operator: 'not_equals',
        variableName: 'employmentStatus',
        value: 'Unemployed',
      },
    },
    {
      id: randomUUID(),
      sectionId: section2[0].id,
      type: 'short_text' as const,
      title: 'Annual Income (before taxes)',
      alias: 'annualIncome',
      required: true,
      order: 4,
      description: 'Enter amount in dollars (e.g., 75000)',
    },
    {
      id: randomUUID(),
      sectionId: section2[0].id,
      type: 'short_text' as const,
      title: 'Monthly Debt Payments',
      alias: 'monthlyDebt',
      required: true,
      order: 5,
      description: 'Total monthly payments for all debts (credit cards, car loans, etc.)',
    },
  ];

  await db.insert(steps).values(employmentSteps);
  console.log('✓ Added 5 employment steps with conditional visibility');

  // ==================== SECTION 3: Loan Details ====================
  console.log('\n=== Creating Section 3: Loan Details ===');
  const section3 = await db.insert(sections).values({
    id: randomUUID(),
    workflowId,
    title: 'Loan Details',
    description: 'Information about the loan you\'re requesting',
    order: 3,
  }).returning();

  const loanSteps = [
    {
      id: randomUUID(),
      sectionId: section3[0].id,
      type: 'short_text' as const,
      title: 'Requested Loan Amount',
      alias: 'loanAmount',
      required: true,
      order: 1,
      description: 'Amount you wish to borrow (e.g., 25000)',
    },
    {
      id: randomUUID(),
      sectionId: section3[0].id,
      type: 'radio' as const,
      title: 'Loan Purpose',
      alias: 'loanPurpose',
      required: true,
      order: 2,
      config: {
        options: ['Home Improvement', 'Debt Consolidation', 'Major Purchase', 'Medical Expenses', 'Other'],
      },
    },
    {
      id: randomUUID(),
      sectionId: section3[0].id,
      type: 'radio' as const,
      title: 'Preferred Loan Term',
      alias: 'loanTerm',
      required: true,
      order: 3,
      config: {
        options: ['12 months', '24 months', '36 months', '48 months', '60 months'],
      },
    },
  ];

  await db.insert(steps).values(loanSteps);
  console.log('✓ Added 3 loan detail steps');

  // ==================== TRANSFORM BLOCK: Calculate Debt-to-Income Ratio ====================
  console.log('\n=== Creating Transform Block for DTI Calculation ===');

  // Create virtual step for DTI output
  const dtiVirtualStepId = randomUUID();
  await db.insert(steps).values({
    id: dtiVirtualStepId,
    sectionId: section3[0].id,
    type: 'computed' as const,
    title: 'Debt-to-Income Ratio',
    alias: 'debtToIncomeRatio',
    isVirtual: true,
    order: 999,
  });

  const transformBlock = await db.insert(transformBlocks).values({
    id: randomUUID(),
    workflowId,
    sectionId: section3[0].id,
    name: 'Calculate Debt-to-Income Ratio',
    language: 'javascript',
    code: `// Calculate debt-to-income ratio
const annualIncome = parseFloat(input.annualIncome) || 0;
const monthlyDebt = parseFloat(input.monthlyDebt) || 0;

if (annualIncome === 0) {
  emit({ ratio: 0, status: 'N/A' });
  return;
}

const monthlyIncome = annualIncome / 12;
const dtiRatio = (monthlyDebt / monthlyIncome) * 100;

// Determine approval status
let status = 'Excellent';
if (dtiRatio > 43) {
  status = 'High Risk';
} else if (dtiRatio > 36) {
  status = 'Moderate Risk';
} else if (dtiRatio > 28) {
  status = 'Good';
}

emit({
  ratio: dtiRatio.toFixed(2),
  status: status,
  monthlyIncome: monthlyIncome.toFixed(2)
});`,
    inputKeys: ['annualIncome', 'monthlyDebt'],
    outputKey: 'debtToIncomeRatio',
    virtualStepId: dtiVirtualStepId,
    phase: 'onSectionSubmit',
    enabled: true,
    order: 1,
    timeoutMs: 1000,
  }).returning();

  console.log('✓ Added transform block for DTI calculation');

  // ==================== SECTION 4: Final Documents ====================
  console.log('\n=== Creating Section 4: Final Documents ===');
  const section4 = await db.insert(sections).values({
    id: randomUUID(),
    workflowId,
    title: 'Your Loan Documents',
    description: 'Review and download your loan application documents',
    order: 4,
    config: {
      finalBlock: true,
      screenTitle: 'Application Submitted Successfully!',
      markdownMessage: `# Thank You for Your Application

We have received your loan application and generated your personalized documents.

## Next Steps

1. **Download** your application summary below
2. **Review** all information for accuracy
3. A loan officer will contact you within 2-3 business days

Your application reference number will be included in your documents.`,
      templates: [], // Will be updated after template creation
    },
  }).returning();

  console.log('✓ Created Final Documents section');

  console.log('\n=== Loan Application Workflow Created Successfully ===');
  console.log('Workflow ID:', workflowId);
  console.log('Public Link:', `http://localhost:5000/run/${workflow[0].publicLink}`);
  console.log('Direct Run Link:', `http://localhost:5000/run/${workflowId}`);
  console.log('\nFeatures included:');
  console.log('  ✓ 4 sections with 14 steps total');
  console.log('  ✓ Conditional visibility (employment fields)');
  console.log('  ✓ Transform block for debt-to-income calculation');
  console.log('  ✓ Multiple question types (text, radio, date)');
  console.log('  ✓ Final Documents section for auto-generation');
  console.log('\nNext: Create and link document template');

  // Return workflow details for template setup
  return {
    workflowId,
    projectId,
    finalSectionId: section4[0].id,
    userId: user.id,
  };
}

// Execute if run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  createLoanApplicationWorkflow()
    .then((result) => {
      if (result) {
        // Save result to temp file for next script
        const fs = require('fs');
        fs.writeFileSync(
          'temp-workflow-info.json',
          JSON.stringify(result, null, 2)
        );
        console.log('\nWorkflow info saved to temp-workflow-info.json');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { createLoanApplicationWorkflow };
