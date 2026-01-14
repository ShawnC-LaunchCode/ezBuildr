import fs from 'fs/promises';
import { createServer, type Server } from 'http';
import path from 'path';

import { eq } from 'drizzle-orm';
import express, { type Express } from 'express';
import { nanoid } from 'nanoid';
import PizZip from 'pizzip';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { registerRoutes } from '../../server/routes';

/**
 * Helper to create a minimal valid DOCX file for testing
 */
async function createTestDocx(content: string, outputPath: string): Promise<void> {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${content}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`
  );

  const buffer = zip.generate({ type: 'nodebuffer' });
  await fs.writeFile(outputPath, buffer);
}

describe('Runs API - DOCX Generation Integration Tests', () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let workflowId: string;
  let templateId: string;
  let workflowVersionId: string;
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'docx-integration');

  beforeAll(async () => {
    // Setup express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5013;
        resolve(port);
      });
    });

    baseURL = `http://localhost:${port}`;

    // Create fixtures directory
    await fs.mkdir(fixturesDir, { recursive: true });

    // Create test template file
    await createTestDocx(
      'Invoice for {{client_name}}: Amount {{amount}}',
      path.join(fixturesDir, 'invoice-template.docx')
    );

    // Setup tenant, user, project
    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        name: 'Test Tenant for DOCX',
        plan: 'free',
      })
      .returning();
    tenantId = tenant.id;

    const email = `test-docx-${nanoid()}@example.com`;
    const registerResponse = await request(baseURL)
      .post('/api/auth/register')
      .send({ email, password: 'TestPassword123!@#Strong' })
      .expect(201);

    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;

    await db
      .update(schema.users)
      .set({ tenantId, tenantRole: 'owner' })
      .where(eq(schema.users.id, userId));

    // Create project
    const projectResponse = await request(baseURL)
      .post('/api/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'DOCX Test Project' })
      .expect(201);
    projectId = projectResponse.body.id;

    // Upload template
    const templatePath = path.join(fixturesDir, 'invoice-template.docx');
    const templateBuffer = await fs.readFile(templatePath);

    const templateResponse = await request(baseURL)
      .post(`/api/projects/${projectId}/templates`)
      .set('Authorization', `Bearer ${authToken}`)
      .field('name', 'Invoice Template')
      .attach('file', templateBuffer, 'invoice-template.docx')
      .expect(201);

    templateId = templateResponse.body.id;

    // Create workflow with template node
    const workflowGraph = {
      nodes: [
        {
          id: 'document',
          type: 'template',
          config: {
            templateId,
            bindings: {
              client_name: 'input.client_name',
              amount: 'input.amount',
            },
          },
        },
      ],
      edges: [],
    };

    const workflowResponse = await request(baseURL)
      .post(`/api/projects/${projectId}/workflows`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Invoice Generation Workflow',
        graphJson: workflowGraph,
      })
      .expect(201);

    workflowId = workflowResponse.body.id;

    // Publish workflow
    const publishResponse = await request(baseURL)
      .post(`/api/workflows/${workflowId}/publish`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    workflowVersionId = publishResponse.body.versionId;
  });

  afterAll(async () => {
    // Clean up
    try {
      if (tenantId) {
        // Clean up runs and outputs first to prevent FK violations
        if (workflowVersionId) {
          await db.delete(schema.runOutputs).where(eq(schema.runOutputs.workflowVersionId, workflowVersionId));
          await db.delete(schema.runs).where(eq(schema.runs.workflowVersionId, workflowVersionId));
        }

        // Clean up workflows first (cascades to workflow_versions)
        // clean up workflows manually logic removed as tenant cascade should handle it
        // Or finding workflows by project if needed.
        // await db.delete(schema.workflows).where(eq(schema.workflows.tenantId, tenantId));

        // Delete tenant (cascades to projects, users, etc.)
        await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      }
    } catch (error) {
      console.error('Cleanup error (non-fatal):', error);
      // Don't fail the test suite if cleanup fails
    }

    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    // Clean up fixtures
    try {
      await fs.rm(fixturesDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe('POST /api/workflows/:id/run - Template Node Execution', () => {
    it('should execute workflow with template node and generate DOCX', async () => {
      const response = await request(baseURL)
        .post(`/api/workflows/${workflowId}/run`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          inputJson: {
            client_name: 'Acme Corporation',
            amount: 5000.0,
          },
        })
        .expect(201);

      expect(response.body.runId).toBeDefined();
      expect(response.body.status).toBe('success');

      const runId = response.body.runId;

      // Fetch run details
      const runResponse = await request(baseURL)
        .get(`/api/runs/${runId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(runResponse.body.status).toBe('success');
      expect(runResponse.body.outputRefs).toBeDefined();
    });

    it('should handle missing template data gracefully', async () => {
      const response = await request(baseURL)
        .post(`/api/workflows/${workflowId}/run`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          inputJson: {
            client_name: 'Test Client',
            // amount is missing
          },
        });

      // Should still succeed but with empty/null values for missing data
      expect(response.status).toBe(201);
    });
  });

  describe('GET /api/runs/:id/download - Download Generated DOCX', () => {
    let runId: string;

    beforeAll(async () => {
      // Create a run first
      const runResponse = await request(baseURL)
        .post(`/api/workflows/${workflowId}/run`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          inputJson: {
            client_name: 'Download Test Corp',
            amount: 1234.56,
          },
        })
        .expect(201);

      runId = runResponse.body.runId;
    });

    it('should download DOCX output from successful run', async () => {
      const response = await request(baseURL)
        .get(`/api/runs/${runId}/download?type=docx`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.docx');
      expect(response.body).toBeDefined();
    });

    it('should return 404 for PDF when not generated', async () => {
      const response = await request(baseURL)
        .get(`/api/runs/${runId}/download?type=pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(JSON.stringify(response.body)).toContain('PDF');
    });

    it('should return 404 for non-existent run', async () => {
      const fakeRunId = '00000000-0000-0000-0000-000000000000';
      await request(baseURL)
        .get(`/api/runs/${fakeRunId}/download?type=docx`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Template Placeholder Extraction', () => {
    it('should extract placeholders from uploaded template', async () => {
      const response = await request(baseURL)
        .get(`/api/templates/${templateId}/placeholders`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templateId).toBe(templateId);
      expect(response.body.placeholders).toBeDefined();
      expect(Array.isArray(response.body.placeholders)).toBe(true);

      const placeholderNames = response.body.placeholders.map((p: any) => p.name);
      expect(placeholderNames).toContain('client_name');
      expect(placeholderNames).toContain('amount');
    });
  });
});
