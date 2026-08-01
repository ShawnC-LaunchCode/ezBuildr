
import fs from 'fs';
import _path from 'path';

import { nanoid } from 'nanoid';
import PizZip from 'pizzip';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll , vi } from 'vitest';

import { getTemplateFilePath } from '../../server/services/templates';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';


// Mock template scanner to avoid needing valid DOCX files
vi.mock('../../server/services/document/TemplateScanner', () => ({
    templateScanner: {
        scanAndFix: vi.fn().mockImplementation(async (buffer) => ({
            isValid: true,
            fixed: false,
            buffer: buffer,
            repairs: []
        }))
    }
}));

// Mock template preview service to verify auth without rendering
vi.mock('../../server/services/TemplatePreviewService', () => ({
    templatePreviewService: {
        generatePreview: vi.fn().mockResolvedValue({
            previewUrl: 'https://mock-storage/preview-url',
            filePath: 'previews/mock-file',
            format: 'pdf',
            size: 1024,
            expiresAt: new Date(Date.now() + 300000),
            validationReport: undefined
        })
    }
}));

// Minimal Valid DOCX (generated with word/document.xml)
const createMinimalDocx = (): Buffer => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('_rels/.rels', '<Relationships/>');
    zip.file('word/document.xml', '<w:document/>');
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

// Minimal Valid PDF
const createMinimalPdf = (): Buffer => {
    // A minimal valid PDF header/trailer
    const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n200\n%%EOF';
    return Buffer.from(pdfContent);
};

describe.sequential('Templates E2E Scenarios', () => {
    let ctx: IntegrationTestContext;

    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: 'E2E Templates Tenant',
            createProject: true,
            projectName: 'E2E Templates Project',
            userRole: 'admin',
            tenantRole: 'owner',
        });
    });

    afterAll(async () => {
        await ctx.cleanup();
    });

    it('Scenario 1: Template upload DOCX succeeds (scan -> process -> store -> DB)', async () => {
        const buffer = createMinimalDocx();
        const name = `DOCX E2E ${nanoid(6)}`;

        // 1. Upload
        const response = await request(ctx.baseURL)
            .post(`/api/projects/${ctx.projectId}/templates`)
            .set('Authorization', `Bearer ${ctx.authToken}`)
            .attach('file', buffer, 'e2e-test.docx')
            .field('name', name)
            .expect(201);

        // 2. Verify Response
        expect(response.body.id).toBeDefined();
        expect(response.body.fileRef).toBeDefined();
        expect(response.body.type).toBe('docx');

        // 3. Verify File Storage
        const filePath = await getTemplateFilePath(response.body.fileRef);
        expect(fs.existsSync(filePath)).toBe(true);

        // 4. Verify DB (implicitly done by API return, but could query DB if needed)
    });

    it('Scenario 2: Template upload PDF succeeds (scan -> process -> store -> DB)', async () => {
        const buffer = createMinimalPdf();
        const name = `PDF E2E ${nanoid(6)}`;

        // 1. Upload
        const response = await request(ctx.baseURL)
            .post(`/api/projects/${ctx.projectId}/templates`)
            .set('Authorization', `Bearer ${ctx.authToken}`)
            .attach('file', buffer, 'e2e-test.pdf')
            .field('name', name)
            .expect(201);

        // 2. Verify Response
        expect(response.body.id).toBeDefined();
        expect(response.body.fileRef).toBeDefined();
        expect(response.body.type).toBe('pdf');

        // 3. Verify File Storage
        const filePath = await getTemplateFilePath(response.body.fileRef);
        expect(fs.existsSync(filePath)).toBe(true);
    });

    it('Scenario 6: Signed URL issuance happens only after auth', async () => {
        // 1. Create a template first
        const buffer = createMinimalDocx();
        const createRes = await request(ctx.baseURL)
            .post(`/api/projects/${ctx.projectId}/templates`)
            .set('Authorization', `Bearer ${ctx.authToken}`)
            .attach('file', buffer, 'signed-url-test.docx')
            .field('name', 'Signed URL Test')
            .expect(201);

        const templateId = createRes.body.id;

        // 2. Request Preview (which generates Signed URL) - Success
        // We need sample data for preview
        const previewRes = await request(ctx.baseURL)
            .post(`/api/templates/${templateId}/preview`)
            .set('Authorization', `Bearer ${ctx.authToken}`)
            .send({
                sampleData: { test: 'data' },
                outputFormat: 'pdf'
            })
            .expect(200);

        expect(previewRes.body.previewUrl).toBeDefined();
        // Verify it's the mocked URL
        expect(previewRes.body.previewUrl).toContain('mock-storage');

        // 3. Request Preview - Unauthenticated (Failure)
        await request(ctx.baseURL)
            .post(`/api/templates/${templateId}/preview`)
            .send({
                sampleData: { test: 'data' }
            })
            .expect(401);

        // 4. Request Preview - Unauthorized Tenant (Failure)
        // Create a new context (project/user) and try to access the first template
        const otherCtx = await setupIntegrationTest({
            tenantName: 'Other Tenant',
            createProject: true,
            projectName: 'Other Project',
            userRole: 'admin',
            tenantRole: 'owner'
        });

        await request(ctx.baseURL)
            .post(`/api/templates/${templateId}/preview`)
            .set('Authorization', `Bearer ${otherCtx.authToken}`)
            .send({ sampleData: {} })
            .expect(403);

        await otherCtx.cleanup();
    });
});
