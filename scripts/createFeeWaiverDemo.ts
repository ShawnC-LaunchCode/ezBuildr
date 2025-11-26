/**
 * Create Fee Waiver Application Demo Workflow
 *
 * This script creates a comprehensive demonstration workflow that showcases:
 * - Multiple sections with various step types
 * - Conditional logic (show/hide, skip sections)
 * - Transform blocks for calculations
 * - Virtual steps with computed values
 * - Step aliases (variables)
 * - File uploads
 * - Document template generation capabilities
 */

import { getDb, initializeDatabase } from '../server/db';
import {
  projects,
  workflows,
  sections,
  steps,
  transformBlocks,
  logicRules,
} from '../shared/schema';
import { eq } from 'drizzle-orm';
import logger from '../server/logger';

// 2024 Federal Poverty Level thresholds (for demonstration)
const POVERTY_LEVELS: Record<number, number> = {
  1: 1215,
  2: 1644,
  3: 2072,
  4: 2500,
  5: 2929,
  6: 3357,
  7: 3785,
  8: 4214,
};

interface DemoData {
  projectId: string;
  workflowId: string;
  sectionIds: Record<string, string>;
  stepIds: Record<string, string>;
  transformBlockIds: Record<string, string>;
}

async function createFeeWaiverDemo(userId: string): Promise<DemoData> {
  const db = getDb();
  logger.info('Starting Fee Waiver demo workflow creation', { userId });

  // Step 1: Get or create demo project
  let project = await db.query.projects.findFirst({
    where: eq(projects.title, 'Demo Project'),
  });

  if (!project) {
    [project] = await db
      .insert(projects)
      .values({
        title: 'Demo Project',
        name: 'Demo Project',
        description: 'Demonstration workflows showcasing VaultLogic features',
        creatorId: userId,
        createdBy: userId,
        ownerId: userId,
      })
      .returning();
    logger.info('Created demo project', { projectId: project.id });
  } else {
    logger.info('Using existing demo project', { projectId: project.id });
  }

  // Step 2: Create workflow
  const [workflow] = await db
    .insert(workflows)
    .values({
      title: 'Fee Waiver Application',
      description:
        'A comprehensive fee waiver application demonstrating VaultLogic features including conditional logic, calculations, and document generation.',
      projectId: project.id,
      creatorId: userId,
      ownerId: userId,
      status: 'draft',
      easyModeEnabled: false,
      welcomeScreen: {
        title: 'Court Fee Waiver Application',
        content:
          '## Welcome\n\nThis application will help determine if you qualify for a court fee waiver based on your income and household size.\n\n**You may qualify if:**\n- Your monthly income is less than 150% of the federal poverty level\n- You receive public assistance (SNAP, SSI, etc.)\n- Your income is insufficient to pay fees and support yourself/dependents\n\n**What you\'ll need:**\n- Personal and household information\n- Income and expense details\n- Supporting documentation (pay stubs, bank statements, etc.)\n\n**Estimated time:** 10-15 minutes',
        showProgressBar: true,
      },
      thankYouScreen: {
        title: 'Application Submitted',
        content:
          '## Thank You!\n\nYour fee waiver application has been submitted successfully.\n\n**What happens next:**\n1. Your application will be reviewed by the court clerk\n2. You will receive a decision within 5 business days\n3. If approved, you will receive a fee waiver certificate\n4. If additional information is needed, you will be contacted\n\n**Questions?**\nContact the court clerk\'s office at (555) 123-4567',
        showSummary: true,
      },
    })
    .returning();

  logger.info('Created workflow', { workflowId: workflow.id });

  const sectionIds: Record<string, string> = {};
  const stepIds: Record<string, string> = {};
  const transformBlockIds: Record<string, string> = {};

  // Step 3: Create Section 1 - Applicant Information
  const [section1] = await db
    .insert(sections)
    .values({
      workflowId: workflow.id,
      title: 'Applicant Information',
      description: 'Basic information about the person applying for the fee waiver',
      order: 0,
    })
    .returning();
  sectionIds.applicantInfo = section1.id;

  // Section 1 Steps
  const section1Steps = [
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'First Name',
      alias: 'firstName',
      required: true,
      order: 0,
      config: { placeholder: 'Enter your first name' },
    },
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'Middle Name',
      alias: 'middleName',
      required: false,
      order: 1,
      config: { placeholder: 'Optional' },
    },
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'Last Name',
      alias: 'lastName',
      required: true,
      order: 2,
      config: { placeholder: 'Enter your last name' },
    },
    {
      sectionId: section1.id,
      type: 'date_time' as const,
      title: 'Date of Birth',
      alias: 'dateOfBirth',
      required: true,
      order: 3,
      config: { includeTime: false },
    },
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'Street Address',
      alias: 'streetAddress',
      required: true,
      order: 4,
      config: { placeholder: '123 Main St' },
    },
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'City',
      alias: 'city',
      required: true,
      order: 5,
      config: { placeholder: 'City' },
    },
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'State',
      alias: 'state',
      required: true,
      order: 6,
      config: { placeholder: 'State' },
    },
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'ZIP Code',
      alias: 'zipCode',
      required: true,
      order: 7,
      config: { placeholder: '12345' },
    },
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'Phone Number',
      alias: 'phoneNumber',
      required: true,
      order: 8,
      config: { placeholder: '(555) 123-4567' },
    },
    {
      sectionId: section1.id,
      type: 'short_text' as const,
      title: 'Email Address',
      alias: 'emailAddress',
      required: false,
      order: 9,
      config: { placeholder: 'your.email@example.com' },
    },
  ];

  for (const step of section1Steps) {
    const [created] = await db.insert(steps).values(step).returning();
    stepIds[step.alias] = created.id;
  }

  logger.info('Created Section 1: Applicant Information', {
    sectionId: section1.id,
    stepCount: section1Steps.length
  });

  // Step 4: Create Section 2 - Household & Income
  const [section2] = await db
    .insert(sections)
    .values({
      workflowId: workflow.id,
      title: 'Household & Income',
      description: 'Information about your household size and monthly income',
      order: 1,
    })
    .returning();
  sectionIds.householdIncome = section2.id;

  const section2Steps = [
    {
      sectionId: section2.id,
      type: 'multiple_choice' as const,
      title: 'Number of People in Household',
      description: 'Include yourself, spouse, and any dependents',
      alias: 'householdSize',
      required: true,
      order: 0,
      config: {
        options: ['1', '2', '3', '4', '5', '6', '7', '8 or more'],
      },
    },
    {
      sectionId: section2.id,
      type: 'radio' as const,
      title: 'Employment Status',
      alias: 'employmentStatus',
      required: true,
      order: 1,
      config: {
        options: ['Employed Full-Time', 'Employed Part-Time', 'Unemployed', 'Self-Employed', 'Retired', 'Disabled'],
      },
    },
    {
      sectionId: section2.id,
      type: 'short_text' as const,
      title: 'Employer Name',
      alias: 'employerName',
      required: false,
      order: 2,
      config: { placeholder: 'Enter employer name' },
    },
    {
      sectionId: section2.id,
      type: 'short_text' as const,
      title: 'Monthly Gross Income (Before Taxes)',
      description: 'Enter your total monthly income from employment',
      alias: 'monthlyIncome',
      required: true,
      order: 3,
      config: { placeholder: '2500.00', inputType: 'number' },
    },
    {
      sectionId: section2.id,
      type: 'short_text' as const,
      title: 'Other Monthly Income',
      description: 'Social Security, disability, child support, etc.',
      alias: 'otherIncome',
      required: false,
      order: 4,
      config: { placeholder: '0.00', inputType: 'number' },
    },
    {
      sectionId: section2.id,
      type: 'multiple_choice' as const,
      title: 'Do you receive any of the following public benefits?',
      description: 'Select all that apply',
      alias: 'publicBenefits',
      required: false,
      order: 5,
      config: {
        options: [
          'SNAP (Food Stamps)',
          'SSI (Supplemental Security Income)',
          'TANF (Temporary Assistance for Needy Families)',
          'Medicaid',
          'General Assistance',
          'None',
        ],
        multiple: true,
      },
    },
  ];

  for (const step of section2Steps) {
    const [created] = await db.insert(steps).values(step).returning();
    stepIds[step.alias] = created.id;
  }

  logger.info('Created Section 2: Household & Income', {
    sectionId: section2.id,
    stepCount: section2Steps.length
  });

  // Step 5: Create Section 3 - Monthly Expenses
  const [section3] = await db
    .insert(sections)
    .values({
      workflowId: workflow.id,
      title: 'Monthly Expenses',
      description: 'Your average monthly household expenses',
      order: 2,
    })
    .returning();
  sectionIds.expenses = section3.id;

  const section3Steps = [
    {
      sectionId: section3.id,
      type: 'short_text' as const,
      title: 'Rent or Mortgage',
      alias: 'expenseRent',
      required: true,
      order: 0,
      config: { placeholder: '1200.00', inputType: 'number' },
    },
    {
      sectionId: section3.id,
      type: 'short_text' as const,
      title: 'Utilities (Electric, Gas, Water)',
      alias: 'expenseUtilities',
      required: true,
      order: 1,
      config: { placeholder: '200.00', inputType: 'number' },
    },
    {
      sectionId: section3.id,
      type: 'short_text' as const,
      title: 'Food & Groceries',
      alias: 'expenseFood',
      required: true,
      order: 2,
      config: { placeholder: '400.00', inputType: 'number' },
    },
    {
      sectionId: section3.id,
      type: 'short_text' as const,
      title: 'Transportation (Car payment, gas, insurance)',
      alias: 'expenseTransportation',
      required: true,
      order: 3,
      config: { placeholder: '300.00', inputType: 'number' },
    },
    {
      sectionId: section3.id,
      type: 'short_text' as const,
      title: 'Medical & Healthcare',
      alias: 'expenseMedical',
      required: true,
      order: 4,
      config: { placeholder: '150.00', inputType: 'number' },
    },
    {
      sectionId: section3.id,
      type: 'short_text' as const,
      title: 'Childcare',
      alias: 'expenseChildcare',
      required: false,
      order: 5,
      config: { placeholder: '0.00', inputType: 'number' },
    },
    {
      sectionId: section3.id,
      type: 'short_text' as const,
      title: 'Other Monthly Expenses',
      description: 'Clothing, personal care, phone, etc.',
      alias: 'expenseOther',
      required: false,
      order: 6,
      config: { placeholder: '0.00', inputType: 'number' },
    },
  ];

  for (const step of section3Steps) {
    const [created] = await db.insert(steps).values(step).returning();
    stepIds[step.alias] = created.id;
  }

  logger.info('Created Section 3: Monthly Expenses', {
    sectionId: section3.id,
    stepCount: section3Steps.length
  });

  // Step 6: Create Section 4 - Assets & Liabilities
  const [section4] = await db
    .insert(sections)
    .values({
      workflowId: workflow.id,
      title: 'Assets & Liabilities',
      description: 'Information about your financial assets and debts',
      order: 3,
    })
    .returning();
  sectionIds.assets = section4.id;

  const section4Steps = [
    {
      sectionId: section4.id,
      type: 'short_text' as const,
      title: 'Cash on Hand & Bank Accounts',
      alias: 'cashAndBank',
      required: true,
      order: 0,
      config: { placeholder: '0.00', inputType: 'number' },
    },
    {
      sectionId: section4.id,
      type: 'short_text' as const,
      title: 'Value of Vehicle(s)',
      alias: 'vehicleValue',
      required: false,
      order: 1,
      config: { placeholder: '0.00', inputType: 'number' },
    },
    {
      sectionId: section4.id,
      type: 'short_text' as const,
      title: 'Real Estate Value',
      alias: 'realEstateValue',
      required: false,
      order: 2,
      config: { placeholder: '0.00', inputType: 'number' },
    },
    {
      sectionId: section4.id,
      type: 'short_text' as const,
      title: 'Other Assets',
      description: 'Investments, retirement accounts, valuable property',
      alias: 'otherAssets',
      required: false,
      order: 3,
      config: { placeholder: '0.00', inputType: 'number' },
    },
    {
      sectionId: section4.id,
      type: 'short_text' as const,
      title: 'Total Debt',
      description: 'Credit cards, loans, medical bills',
      alias: 'totalDebt',
      required: false,
      order: 4,
      config: { placeholder: '0.00', inputType: 'number' },
    },
  ];

  for (const step of section4Steps) {
    const [created] = await db.insert(steps).values(step).returning();
    stepIds[step.alias] = created.id;
  }

  logger.info('Created Section 4: Assets & Liabilities', {
    sectionId: section4.id,
    stepCount: section4Steps.length
  });

  // Step 7: Create Section 5 - Supporting Documents
  const [section5] = await db
    .insert(sections)
    .values({
      workflowId: workflow.id,
      title: 'Supporting Documents',
      description: 'Upload documents to support your application',
      order: 4,
    })
    .returning();
  sectionIds.documents = section5.id;

  const section5Steps = [
    {
      sectionId: section5.id,
      type: 'file_upload' as const,
      title: 'Pay Stubs (Last 2 months)',
      alias: 'payStubs',
      required: false,
      order: 0,
      config: {
        accept: '.pdf,.jpg,.jpeg,.png',
        maxSize: 5242880, // 5MB
        multiple: true,
      },
    },
    {
      sectionId: section5.id,
      type: 'file_upload' as const,
      title: 'Bank Statements (Last 2 months)',
      alias: 'bankStatements',
      required: false,
      order: 1,
      config: {
        accept: '.pdf,.jpg,.jpeg,.png',
        maxSize: 5242880,
        multiple: true,
      },
    },
    {
      sectionId: section5.id,
      type: 'file_upload' as const,
      title: 'Proof of Public Benefits',
      description: 'SNAP, SSI, or other benefit documentation',
      alias: 'benefitProof',
      required: false,
      order: 2,
      config: {
        accept: '.pdf,.jpg,.jpeg,.png',
        maxSize: 5242880,
        multiple: true,
      },
    },
    {
      sectionId: section5.id,
      type: 'file_upload' as const,
      title: 'Other Supporting Documents',
      alias: 'otherDocuments',
      required: false,
      order: 3,
      config: {
        accept: '.pdf,.jpg,.jpeg,.png',
        maxSize: 5242880,
        multiple: true,
      },
    },
  ];

  for (const step of section5Steps) {
    const [created] = await db.insert(steps).values(step).returning();
    stepIds[step.alias] = created.id;
  }

  logger.info('Created Section 5: Supporting Documents', {
    sectionId: section5.id,
    stepCount: section5Steps.length
  });

  // Step 8: Create Section 6 - Review & Certification
  const [section6] = await db
    .insert(sections)
    .values({
      workflowId: workflow.id,
      title: 'Review & Certification',
      description: 'Review your information and certify your application',
      order: 5,
    })
    .returning();
  sectionIds.review = section6.id;

  const section6Steps = [
    {
      sectionId: section6.id,
      type: 'long_text' as const,
      title: 'Additional Information',
      description: 'Provide any additional information to support your fee waiver request',
      alias: 'additionalInfo',
      required: false,
      order: 0,
      config: { placeholder: 'Enter any additional details...', rows: 4 },
    },
    {
      sectionId: section6.id,
      type: 'yes_no' as const,
      title: 'Certification',
      description:
        'I declare under penalty of perjury that the information I have provided is true and correct to the best of my knowledge.',
      alias: 'certification',
      required: true,
      order: 1,
      config: {},
    },
  ];

  for (const step of section6Steps) {
    const [created] = await db.insert(steps).values(step).returning();
    stepIds[step.alias] = created.id;
  }

  logger.info('Created Section 6: Review & Certification', {
    sectionId: section6.id,
    stepCount: section6Steps.length
  });

  // Step 9: Create Transform Blocks for Calculations
  logger.info('Creating transform blocks for calculations');

  // Transform Block 1: Calculate Total Monthly Income
  const [transformBlock1] = await db
    .insert(transformBlocks)
    .values({
      workflowId: workflow.id,
      sectionId: section2.id,
      name: 'Calculate Total Monthly Income',
      language: 'javascript',
      code: `// Calculate total monthly income from all sources
const monthlyIncome = parseFloat(input.monthlyIncome) || 0;
const otherIncome = parseFloat(input.otherIncome) || 0;
const totalIncome = monthlyIncome + otherIncome;

emit(totalIncome);`,
      inputKeys: ['monthlyIncome', 'otherIncome'],
      outputKey: 'totalMonthlyIncome',
      phase: 'onSectionSubmit',
      enabled: true,
      order: 0,
      timeoutMs: 1000,
    })
    .returning();

  // Create virtual step for totalMonthlyIncome
  const [virtualStep1] = await db
    .insert(steps)
    .values({
      sectionId: section2.id,
      type: 'computed',
      title: 'Total Monthly Income',
      alias: 'totalMonthlyIncome',
      isVirtual: true,
      required: false,
      order: 999,
      config: {},
    })
    .returning();

  await db
    .update(transformBlocks)
    .set({ virtualStepId: virtualStep1.id })
    .where(eq(transformBlocks.id, transformBlock1.id));

  transformBlockIds.totalIncome = transformBlock1.id;
  stepIds.totalMonthlyIncome = virtualStep1.id;

  // Transform Block 2: Calculate Poverty Level Threshold
  const [transformBlock2] = await db
    .insert(transformBlocks)
    .values({
      workflowId: workflow.id,
      sectionId: section2.id,
      name: 'Calculate Poverty Level Threshold',
      language: 'javascript',
      code: `// 2024 Federal Poverty Level thresholds (monthly)
const povertyLevels = {
  '1': 1215,
  '2': 1644,
  '3': 2072,
  '4': 2500,
  '5': 2929,
  '6': 3357,
  '7': 3785,
  '8 or more': 4214,
};

const householdSize = input.householdSize || '1';
const basePoverty = povertyLevels[householdSize] || povertyLevels['1'];

// Fee waiver qualification is 150% of poverty level
const threshold = basePoverty * 1.5;

emit(Math.round(threshold));`,
      inputKeys: ['householdSize'],
      outputKey: 'povertyThreshold',
      phase: 'onSectionSubmit',
      enabled: true,
      order: 1,
      timeoutMs: 1000,
    })
    .returning();

  const [virtualStep2] = await db
    .insert(steps)
    .values({
      sectionId: section2.id,
      type: 'computed',
      title: 'Poverty Threshold (150%)',
      alias: 'povertyThreshold',
      isVirtual: true,
      required: false,
      order: 999,
      config: {},
    })
    .returning();

  await db
    .update(transformBlocks)
    .set({ virtualStepId: virtualStep2.id })
    .where(eq(transformBlocks.id, transformBlock2.id));

  transformBlockIds.povertyThreshold = transformBlock2.id;
  stepIds.povertyThreshold = virtualStep2.id;

  // Transform Block 3: Determine Qualification Status
  const [transformBlock3] = await db
    .insert(transformBlocks)
    .values({
      workflowId: workflow.id,
      sectionId: section2.id,
      name: 'Determine Qualification Status',
      language: 'javascript',
      code: `// Determine if applicant qualifies based on income
const totalIncome = parseFloat(input.totalMonthlyIncome) || 0;
const threshold = parseFloat(input.povertyThreshold) || 0;

const qualifiesByIncome = totalIncome <= threshold;

// Check for public benefits (auto-qualify)
const benefits = input.publicBenefits || [];
const hasPublicBenefits = Array.isArray(benefits) &&
  benefits.length > 0 &&
  !benefits.includes('None');

const qualifies = qualifiesByIncome || hasPublicBenefits;

const status = qualifies ? 'Likely Qualified' : 'Additional Review Required';

emit(status);`,
      inputKeys: ['totalMonthlyIncome', 'povertyThreshold', 'publicBenefits'],
      outputKey: 'qualificationStatus',
      phase: 'onSectionSubmit',
      enabled: true,
      order: 2,
      timeoutMs: 1000,
    })
    .returning();

  const [virtualStep3] = await db
    .insert(steps)
    .values({
      sectionId: section2.id,
      type: 'computed',
      title: 'Qualification Status',
      alias: 'qualificationStatus',
      isVirtual: true,
      required: false,
      order: 999,
      config: {},
    })
    .returning();

  await db
    .update(transformBlocks)
    .set({ virtualStepId: virtualStep3.id })
    .where(eq(transformBlocks.id, transformBlock3.id));

  transformBlockIds.qualificationStatus = transformBlock3.id;
  stepIds.qualificationStatus = virtualStep3.id;

  // Transform Block 4: Calculate Total Monthly Expenses
  const [transformBlock4] = await db
    .insert(transformBlocks)
    .values({
      workflowId: workflow.id,
      sectionId: section3.id,
      name: 'Calculate Total Monthly Expenses',
      language: 'javascript',
      code: `// Sum all monthly expenses
const rent = parseFloat(input.expenseRent) || 0;
const utilities = parseFloat(input.expenseUtilities) || 0;
const food = parseFloat(input.expenseFood) || 0;
const transportation = parseFloat(input.expenseTransportation) || 0;
const medical = parseFloat(input.expenseMedical) || 0;
const childcare = parseFloat(input.expenseChildcare) || 0;
const other = parseFloat(input.expenseOther) || 0;

const totalExpenses = rent + utilities + food + transportation + medical + childcare + other;

emit(totalExpenses);`,
      inputKeys: ['expenseRent', 'expenseUtilities', 'expenseFood', 'expenseTransportation', 'expenseMedical', 'expenseChildcare', 'expenseOther'],
      outputKey: 'totalMonthlyExpenses',
      phase: 'onSectionSubmit',
      enabled: true,
      order: 0,
      timeoutMs: 1000,
    })
    .returning();

  const [virtualStep4] = await db
    .insert(steps)
    .values({
      sectionId: section3.id,
      type: 'computed',
      title: 'Total Monthly Expenses',
      alias: 'totalMonthlyExpenses',
      isVirtual: true,
      required: false,
      order: 999,
      config: {},
    })
    .returning();

  await db
    .update(transformBlocks)
    .set({ virtualStepId: virtualStep4.id })
    .where(eq(transformBlocks.id, transformBlock4.id));

  transformBlockIds.totalExpenses = transformBlock4.id;
  stepIds.totalMonthlyExpenses = virtualStep4.id;

  // Transform Block 5: Calculate Disposable Income
  const [transformBlock5] = await db
    .insert(transformBlocks)
    .values({
      workflowId: workflow.id,
      sectionId: section3.id,
      name: 'Calculate Disposable Income',
      language: 'javascript',
      code: `// Calculate disposable income (income - expenses)
const income = parseFloat(input.totalMonthlyIncome) || 0;
const expenses = parseFloat(input.totalMonthlyExpenses) || 0;

const disposable = income - expenses;

emit(Math.round(disposable));`,
      inputKeys: ['totalMonthlyIncome', 'totalMonthlyExpenses'],
      outputKey: 'disposableIncome',
      phase: 'onSectionSubmit',
      enabled: true,
      order: 1,
      timeoutMs: 1000,
    })
    .returning();

  const [virtualStep5] = await db
    .insert(steps)
    .values({
      sectionId: section3.id,
      type: 'computed',
      title: 'Disposable Income',
      alias: 'disposableIncome',
      isVirtual: true,
      required: false,
      order: 999,
      config: {},
    })
    .returning();

  await db
    .update(transformBlocks)
    .set({ virtualStepId: virtualStep5.id })
    .where(eq(transformBlocks.id, transformBlock5.id));

  transformBlockIds.disposableIncome = transformBlock5.id;
  stepIds.disposableIncome = virtualStep5.id;

  // Transform Block 6: Calculate Total Assets
  const [transformBlock6] = await db
    .insert(transformBlocks)
    .values({
      workflowId: workflow.id,
      sectionId: section4.id,
      name: 'Calculate Total Assets',
      language: 'javascript',
      code: `// Sum all assets
const cash = parseFloat(input.cashAndBank) || 0;
const vehicle = parseFloat(input.vehicleValue) || 0;
const realEstate = parseFloat(input.realEstateValue) || 0;
const other = parseFloat(input.otherAssets) || 0;

const totalAssets = cash + vehicle + realEstate + other;

emit(totalAssets);`,
      inputKeys: ['cashAndBank', 'vehicleValue', 'realEstateValue', 'otherAssets'],
      outputKey: 'totalAssets',
      phase: 'onSectionSubmit',
      enabled: true,
      order: 0,
      timeoutMs: 1000,
    })
    .returning();

  const [virtualStep6] = await db
    .insert(steps)
    .values({
      sectionId: section4.id,
      type: 'computed',
      title: 'Total Assets',
      alias: 'totalAssets',
      isVirtual: true,
      required: false,
      order: 999,
      config: {},
    })
    .returning();

  await db
    .update(transformBlocks)
    .set({ virtualStepId: virtualStep6.id })
    .where(eq(transformBlocks.id, transformBlock6.id));

  transformBlockIds.totalAssets = transformBlock6.id;
  stepIds.totalAssets = virtualStep6.id;

  // Transform Block 7: Calculate Net Worth
  const [transformBlock7] = await db
    .insert(transformBlocks)
    .values({
      workflowId: workflow.id,
      sectionId: section4.id,
      name: 'Calculate Net Worth',
      language: 'javascript',
      code: `// Calculate net worth (assets - debt)
const assets = parseFloat(input.totalAssets) || 0;
const debt = parseFloat(input.totalDebt) || 0;

const netWorth = assets - debt;

emit(Math.round(netWorth));`,
      inputKeys: ['totalAssets', 'totalDebt'],
      outputKey: 'netWorth',
      phase: 'onSectionSubmit',
      enabled: true,
      order: 1,
      timeoutMs: 1000,
    })
    .returning();

  const [virtualStep7] = await db
    .insert(steps)
    .values({
      sectionId: section4.id,
      type: 'computed',
      title: 'Net Worth',
      alias: 'netWorth',
      isVirtual: true,
      required: false,
      order: 999,
      config: {},
    })
    .returning();

  await db
    .update(transformBlocks)
    .set({ virtualStepId: virtualStep7.id })
    .where(eq(transformBlocks.id, transformBlock7.id));

  transformBlockIds.netWorth = transformBlock7.id;
  stepIds.netWorth = virtualStep7.id;

  logger.info('Created 7 transform blocks with virtual steps');

  // Step 10: Create Conditional Logic Rules
  logger.info('Creating conditional logic rules');

  // Logic Rule 1: Require employer name if employed full-time
  await db.insert(logicRules).values({
    workflowId: workflow.id,
    conditionStepId: stepIds.employmentStatus,
    operator: 'equals',
    conditionValue: 'Employed Full-Time',
    targetType: 'step',
    targetStepId: stepIds.employerName,
    action: 'require',
    order: 1,
  });

  // Logic Rule 2: Require employer name if employed part-time
  await db.insert(logicRules).values({
    workflowId: workflow.id,
    conditionStepId: stepIds.employmentStatus,
    operator: 'equals',
    conditionValue: 'Employed Part-Time',
    targetType: 'step',
    targetStepId: stepIds.employerName,
    action: 'require',
    order: 2,
  });

  // Logic Rule 3: Hide assets section if qualified by income
  // Note: 'skip_to' might not be supported in the current schema, using 'hide' instead
  await db.insert(logicRules).values({
    workflowId: workflow.id,
    conditionStepId: stepIds.qualificationStatus,
    operator: 'equals',
    conditionValue: 'Likely Qualified',
    targetType: 'section',
    targetSectionId: sectionIds.assets,
    action: 'hide',
    order: 3,
  });

  // Logic Rule 4: Require pay stubs if employed full-time
  await db.insert(logicRules).values({
    workflowId: workflow.id,
    conditionStepId: stepIds.employmentStatus,
    operator: 'equals',
    conditionValue: 'Employed Full-Time',
    targetType: 'step',
    targetStepId: stepIds.payStubs,
    action: 'require',
    order: 4,
  });

  // Logic Rule 5: Require pay stubs if employed part-time
  await db.insert(logicRules).values({
    workflowId: workflow.id,
    conditionStepId: stepIds.employmentStatus,
    operator: 'equals',
    conditionValue: 'Employed Part-Time',
    targetType: 'step',
    targetStepId: stepIds.payStubs,
    action: 'require',
    order: 5,
  });

  logger.info('Created 5 conditional logic rules');

  logger.info('Fee Waiver demo workflow created successfully!', {
    projectId: project.id,
    workflowId: workflow.id,
    sectionCount: 6,
    stepCount: Object.keys(stepIds).length,
    transformBlockCount: 7,
    logicRuleCount: 5,
  });

  return {
    projectId: project.id,
    workflowId: workflow.id,
    sectionIds,
    stepIds,
    transformBlockIds,
  };
}

// Main execution
async function main() {
  try {
    await initializeDatabase();
    const db = getDb();

    // Get the first user for demo purposes
    const user = await db.query.users.findFirst();

    if (!user) {
      throw new Error('No users found. Please create a user first.');
    }

    logger.info('Creating Fee Waiver demo workflow', { userId: user.id });

    const demoData = await createFeeWaiverDemo(user.id);

    console.log('\n✅ Fee Waiver Demo Workflow Created Successfully!\n');
    console.log('📋 Summary:');
    console.log(`  - Project ID: ${demoData.projectId}`);
    console.log(`  - Workflow ID: ${demoData.workflowId}`);
    console.log(`  - Sections: 6`);
    console.log(`  - Steps: ${Object.keys(demoData.stepIds).length}`);
    console.log(`  - Transform Blocks: 7`);
    console.log(`  - Logic Rules: 5`);
    console.log('\n🎯 Features Demonstrated:');
    console.log('  ✓ Multiple sections with various step types');
    console.log('  ✓ Step aliases (variables) for easy reference');
    console.log('  ✓ Transform blocks for calculations');
    console.log('  ✓ Virtual steps for computed values');
    console.log('  ✓ Conditional logic (show/hide, skip sections)');
    console.log('  ✓ File uploads with validation');
    console.log('  ✓ Welcome and thank you screens');
    console.log('\n🚀 Next Steps:');
    console.log('  1. View the workflow in the builder');
    console.log('  2. Test the workflow with preview mode');
    console.log('  3. Create a document template for the application');
    console.log(`\n🔗 Workflow URL: http://localhost:5000/workflows/${demoData.workflowId}/builder`);

    process.exit(0);
  } catch (error) {
    logger.error('Failed to create demo workflow', { error });
    console.error('\n❌ Error creating demo workflow:', error);
    process.exit(1);
  }
}

main();
