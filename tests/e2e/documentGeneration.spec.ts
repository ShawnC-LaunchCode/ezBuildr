/**
 * Stage 21: Document Generation E2E Tests
 *
 * End-to-end tests for the complete document generation pipeline.
 * Tests cover:
 * - Template upload and management
 * - Workflow template mapping
 * - Template analysis and validation
 * - Document generation (DOCX)
 * - PDF conversion
 * - Download and verification
 */

import path from 'path';

import { test, expect } from '@playwright/test';

// Test configuration
const TEST_PROJECT_NAME = 'E2E Doc Gen Project';
const TEST_WORKFLOW_NAME = 'E2E Doc Gen Workflow';
const TEST_TEMPLATE_NAME = 'Test Engagement Letter';

test.describe('Document Generation End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    // Assume login is handled via fixtures or environment
    await page.waitForURL('/projects');
  });

  test('Complete document generation flow', async ({ page }) => {
    // Step 1: Create project
    await test.step('Create project', async () => {
      await page.click('button:has-text("New Project")');
      await page.fill('input[name="name"]', TEST_PROJECT_NAME);
      await page.fill('textarea[name="description"]', 'E2E test project for document generation');
      await page.click('button:has-text("Create")');
      await expect(page.locator(`text=${TEST_PROJECT_NAME}`)).toBeVisible();
    });

    // Step 2: Upload template
    await test.step('Upload DOCX template', async () => {
      await page.click(`text=${TEST_PROJECT_NAME}`);
      await page.click('button:has-text("Templates")');
      await page.click('button:has-text("Upload")');

      // Create a mock DOCX file for testing
      const templatePath = path.join(__dirname, 'fixtures', 'test-template.docx');
      await page.setInputFiles('input[type="file"]', templatePath);

      await page.fill('input[name="name"]', TEST_TEMPLATE_NAME);
      await page.fill('textarea[name="description"]', 'Test engagement letter with placeholders');
      await page.click('button:has-text("Upload")');

      await expect(page.locator(`text=${TEST_TEMPLATE_NAME}`)).toBeVisible();
    });

    // Step 3: Analyze template
    await test.step('Analyze template structure', async () => {
      await page.click(`text=${TEST_TEMPLATE_NAME}`);
      await page.click('button:has-text("Analyze")');

      // Wait for analysis to complete
      await expect(page.locator('text=Variables')).toBeVisible();
      await expect(page.locator('text=Loops')).toBeVisible();
      await expect(page.locator('text=Conditionals')).toBeVisible();

      // Verify some expected placeholders
      await expect(page.locator('code:has-text("name")')).toBeVisible();
      await expect(page.locator('code:has-text("email")')).toBeVisible();
    });

    // Step 4: Generate sample data
    await test.step('Generate and validate sample data', async () => {
      await page.click('button:has-text("Generate Sample Data")');

      // Wait for sample data to populate
      await expect(page.locator('textarea[id="sample-data"]')).not.toBeEmpty();

      // Switch to test tab
      await page.click('text=Test Data');

      // Validate
      await page.click('button:has-text("Validate")');

      // Check for validation success
      await expect(page.locator('text=Validation Passed').or(page.locator('text=Coverage:'))).toBeVisible();
    });

    // Step 5: Create workflow
    await test.step('Create workflow', async () => {
      await page.click('text=Workflows');
      await page.click('button:has-text("New Workflow")');
      await page.fill('input[name="title"]', TEST_WORKFLOW_NAME);
      await page.click('button:has-text("Create")');

      await expect(page.locator(`text=${TEST_WORKFLOW_NAME}`)).toBeVisible();
    });

    // Step 6: Attach template to workflow
    await test.step('Attach template to workflow version', async () => {
      await page.click(`text=${TEST_WORKFLOW_NAME}`);
      await page.click('button:has-text("Templates")');
      await page.click('button:has-text("Attach")');

      // Select template
      await page.click('button[role="combobox"]');
      await page.click(`text=${TEST_TEMPLATE_NAME}`);

      // Set template key
      await page.fill('input[name="key"]', 'engagement_letter');

      // Mark as primary
      await page.check('input[type="checkbox"]#primary');

      await page.click('button:has-text("Attach Template")');

      await expect(page.locator('text=engagement_letter')).toBeVisible();
      await expect(page.locator('text=Primary')).toBeVisible();
    });

    // Step 7: Add template node to workflow
    await test.step('Configure template node', async () => {
      await page.click('text=Builder');

      // Add template node from toolbar
      await page.click('button[title="Add Template Node"]');

      // Configure node
      await page.click('text=Template Node');
      await page.click('button[role="combobox"]'); // Template key selector
      await page.click('text=engagement_letter');

      // Configure bindings
      await page.click('text=Bindings');
      await page.fill('input[name="bindings.name"]', 'user.fullName');
      await page.fill('input[name="bindings.email"]', 'user.email');

      // Enable PDF generation
      await page.check('input[name="toPdf"]');

      await page.click('button:has-text("Save")');
    });

    // Step 8: Publish workflow
    await test.step('Publish workflow version', async () => {
      await page.click('button:has-text("Publish")');
      await page.fill('input[name="version"]', '1.0.0');
      await page.fill('textarea[name="changelog"]', 'Initial version with document generation');
      await page.click('button:has-text("Publish Version")');

      await expect(page.locator('text=Published')).toBeVisible();
    });

    // Step 9: Run workflow
    let runId: string;
    await test.step('Execute workflow run', async () => {
      await page.click('button:has-text("Test Run")');

      // Fill in test data
      await page.fill('input[name="user.fullName"]', 'John Doe');
      await page.fill('input[name="user.email"]', 'john@example.com');

      await page.click('button:has-text("Submit")');

      // Wait for completion
      await expect(page.locator('text=Run Complete').or(page.locator('text=Completed'))).toBeVisible({ timeout: 30000 });

      // Extract run ID from URL
      const url = page.url();
      const match = url.match(/runs\/([a-f0-9-]+)/);
      runId = match?.[1] || '';
    });

    // Step 10: Verify outputs
    await test.step('Verify generated documents', async () => {
      await page.click('text=Outputs');

      // Wait for outputs to appear
      await expect(page.locator('text=Generated Documents')).toBeVisible();

      // Verify DOCX output
      await expect(page.locator('text=DOCX Output')).toBeVisible();
      await expect(page.locator('text=Ready').first()).toBeVisible();

      // Verify PDF output (may still be processing)
      await expect(page.locator('text=PDF Output').or(page.locator('text=Processing'))).toBeVisible({ timeout: 15000 });

      // Wait for PDF to be ready
      await expect(page.locator('text=PDF Output ~ text=Ready')).toBeVisible({ timeout: 30000 });
    });

    // Step 11: Download outputs
    await test.step('Download DOCX and PDF', async () => {
      // Download DOCX
      const [docxDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('button:has-text("Download")').first().click(),
      ]);
      expect(docxDownload.suggestedFilename()).toContain('.docx');

      // Download PDF
      const [pdfDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('button:has-text("Download")').nth(1).click(),
      ]);
      expect(pdfDownload.suggestedFilename()).toContain('.pdf');
    });

    // Step 12: Verify run history
    await test.step('Check run history panel', async () => {
      await page.click('text=Run History');

      // Verify run appears in history
      await expect(page.locator(`text=${TEST_WORKFLOW_NAME}`)).toBeVisible();
      await expect(page.locator('text=Completed')).toBeVisible();

      // Click on run to view details
      await page.click(`text=${runId.substring(0, 8)}`);

      // Verify outputs are listed
      await expect(page.locator('text=engagement_letter')).toBeVisible();
    });

    // Cleanup
    await test.step('Cleanup test data', async () => {
      // Delete workflow
      await page.click('text=Workflows');
      await page.click(`text=${TEST_WORKFLOW_NAME}`);
      await page.click('button[title="Delete Workflow"]');
      await page.click('button:has-text("Confirm")');

      // Delete project
      await page.click('text=Projects');
      await page.click(`text=${TEST_PROJECT_NAME}`);
      await page.click('button[title="Delete Project"]');
      await page.click('button:has-text("Confirm")');
    });
  });

  test('Template validation errors', async ({ page }) => {
    await test.step('Upload invalid template', async () => {
      // Create project
      await page.click('button:has-text("New Project")');
      await page.fill('input[name="name"]', 'Test Invalid Template');
      await page.click('button:has-text("Create")');

      // Try to upload non-DOCX file
      await page.click('button:has-text("Upload Template")');
      const txtPath = path.join(__dirname, 'fixtures', 'test.txt');
      await page.setInputFiles('input[type="file"]', txtPath);

      // Should show error
      await expect(page.locator('text=Only .docx files are supported')).toBeVisible();
    });
  });

  test('PDF conversion retry on failure', async ({ page }) => {
    await test.step('Test PDF retry mechanism', async () => {
      // Navigate to a run with failed PDF output
      // (This would require setting up a scenario where PDF conversion fails)

      await page.goto('/runs/test-run-id');
      await page.click('text=Outputs');

      // Look for failed PDF
      await expect(page.locator('text=Failed')).toBeVisible();

      // Click retry button
      await page.click('button:has-text("Retry")');

      // Should show processing status
      await expect(page.locator('text=Processing')).toBeVisible();

      // Wait for success
      await expect(page.locator('text=Ready')).toBeVisible({ timeout: 30000 });
    });
  });

  test('Multiple templates per workflow', async ({ page }) => {
    await test.step('Attach and use multiple templates', async () => {
      // Create workflow
      await page.click('button:has-text("New Workflow")');
      await page.fill('input[name="title"]', 'Multi-Template Workflow');
      await page.click('button:has-text("Create")');

      // Attach first template
      await page.click('button:has-text("Attach Template")');
      await page.selectOption('select[name="template"]', 'Template 1');
      await page.fill('input[name="key"]', 'engagement_letter');
      await page.check('input#primary');
      await page.click('button:has-text("Attach")');

      // Attach second template
      await page.click('button:has-text("Attach Template")');
      await page.selectOption('select[name="template"]', 'Template 2');
      await page.fill('input[name="key"]', 'schedule_a');
      await page.click('button:has-text("Attach")');

      // Verify both are attached
      await expect(page.locator('text=engagement_letter')).toBeVisible();
      await expect(page.locator('text=schedule_a')).toBeVisible();
      await expect(page.locator('text=Primary')).toHaveCount(1);

      // Add template nodes for both
      await page.click('text=Builder');
      await page.click('button[title="Add Template Node"]');
      await page.selectOption('select[name="templateKey"]', 'engagement_letter');

      await page.click('button[title="Add Template Node"]');
      await page.selectOption('select[name="templateKey"]', 'schedule_a');

      // Run workflow and verify both outputs are generated
      await page.click('button:has-text("Test Run")');
      await page.fill('input[name="name"]', 'Test User');
      await page.click('button:has-text("Submit")');

      await page.click('text=Outputs');
      await expect(page.locator('text=engagement_letter')).toBeVisible();
      await expect(page.locator('text=schedule_a')).toBeVisible();
    });
  });
});
