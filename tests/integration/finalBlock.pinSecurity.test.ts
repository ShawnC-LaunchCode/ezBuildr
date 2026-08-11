import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { db } from '../../server/db';
import * as schema from '@shared/schema';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
import crypto from 'crypto';

const generateId = () => crypto.randomUUID();

describe('GH-171 Follow-up: Template Version Pinning Security', () => {
  let ctx1: IntegrationTestContext;
  let ctx2: IntegrationTestContext;
  let factory: TestFactory;

  beforeAll(async () => {
    // Create dummy files for storage provider
    const fs = await import('fs/promises');
    const path = await import('path');
    const filesDir = path.join(process.cwd(), 'server', 'files');
    await fs.mkdir(filesDir, { recursive: true });
    
    // Create a valid zip (docx is just a zip) for the tests
    const PizZip = (await import('pizzip')).default;
    const zip = new PizZip();
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:body></w:document>');
    const buf = zip.generate({ type: 'nodebuffer' });
    
    await fs.writeFile(path.join(filesDir, 'tenant-b-v1.docx'), buf);
    await fs.writeFile(path.join(filesDir, 'tenant-a-1-v1.docx'), buf);
    await fs.writeFile(path.join(filesDir, 'tenant-a.docx'), buf);
    await fs.writeFile(path.join(filesDir, 'tenant-a-2.docx'), buf);

    ctx1 = await setupIntegrationTest({
      tenantName: 'Tenant A',
      createProject: true,
      projectName: 'Project A',
      userRole: 'admin',
      tenantRole: 'owner',
    });
    ctx2 = await setupIntegrationTest({
      tenantName: 'Tenant B',
      createProject: true,
      projectName: 'Project B',
      userRole: 'admin',
      tenantRole: 'owner',
    });
    factory = new TestFactory(db);
  });

  afterAll(async () => {
    await ctx1.cleanup();
    await ctx2.cleanup();
  });

  it('rejects a pinned version belonging to a different tenant/project', async () => {
    // 1. Setup Tenant B's template and version
    const { template: templateB } = await factory.createTemplate(ctx2.projectId!, ctx2.userId, { fileRef: 'tenant-b.docx' });
    
    const [versionB] = await db.insert(schema.templateVersions).values({
      id: generateId(),
      templateId: templateB.id,
      versionNumber: 1,
      fileRef: 'tenant-b-v1.docx',
      metadata: {},
      mapping: {},
      createdBy: ctx2.userId,
    }).returning();

    // 2. Setup Tenant A's workflow and template
    const { workflow: workflowA } = await factory.createWorkflow(ctx1.projectId!, ctx1.userId);
    const sectionA = await factory.createSection(workflowA.id);
    const { template: templateA } = await factory.createTemplate(ctx1.projectId!, ctx1.userId, { fileRef: 'tenant-a.docx' });
    
    // We intentionally pin to Tenant B's version!
    const res = await request(ctx1.app)
      .post(`/api/workflows/${workflowA.id}/preview/generate-final`)
      .set('Authorization', `Bearer ${ctx1.authToken}`)
      .send({
        stepId: sectionA.id,
        finalBlockConfig: {
          markdownHeader: '',
          documents: [
            {
              id: generateId(),
              documentId: templateA.id,
              alias: 'doc_a',
              pinnedVersionId: versionB.id, // THE EXPLOIT
              mapping: {},
            }
          ]
        },
        stepValues: {},
        toPdf: false
      });

    // We expect a 404 because the template version doesn't belong to the authorized template/project.
    // The current code has the vulnerability so this test should fail initially.
    expect(res.status).toBe(404);
  });

  it('rejects a pinned version belonging to a different template in the same project', async () => {
    // 1. Setup Tenant A's first template and version
    const { template: templateA1 } = await factory.createTemplate(ctx1.projectId!, ctx1.userId, { fileRef: 'tenant-a-1.docx' });
    
    const [versionA1] = await db.insert(schema.templateVersions).values({
      id: generateId(),
      templateId: templateA1.id,
      versionNumber: 1,
      fileRef: 'tenant-a-1-v1.docx',
      metadata: {},
      mapping: {},
      createdBy: ctx1.userId,
    }).returning();

    // 2. Setup Tenant A's second template (which will be requested)
    const { workflow: workflowA } = await factory.createWorkflow(ctx1.projectId!, ctx1.userId);
    const sectionA = await factory.createSection(workflowA.id);
    const { template: templateA2 } = await factory.createTemplate(ctx1.projectId!, ctx1.userId, { fileRef: 'tenant-a-2.docx' });

    // We intentionally pin template 2 to template 1's version
    const res = await request(ctx1.app)
      .post(`/api/workflows/${workflowA.id}/preview/generate-final`)
      .set('Authorization', `Bearer ${ctx1.authToken}`)
      .send({
        stepId: sectionA.id,
        finalBlockConfig: {
          markdownHeader: '',
          documents: [
            {
              id: generateId(),
              documentId: templateA2.id,
              alias: 'doc_a2',
              pinnedVersionId: versionA1.id, // THE EXPLOIT (same project, wrong template)
              mapping: {},
            }
          ]
        },
        stepValues: {},
        toPdf: false
      });

    expect(res.status).toBe(404);
  });
});
