
import fs from 'fs';
import path from 'path';

import { nanoid } from 'nanoid';
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
    const minimalDocxBase64 = 'UEsDBBQABgAIAAAAIQA4/4cZ6wEAALwCAAAATAAgAHdvcmQvZG9jdW1lbnQueG1sCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiA8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCIgc3RhbmRhbG9uZT0ieWVzIj8+Cjx3OmRvY3VtZW50IHhtbG5zOm89InVybjpzY2hlbWFzLW1pY3Jvc29mdC1jb206b2ZmaWNlOm9mZmljZSIgeG1sbnM6cj0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZSVkb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMiIHhtbG5zOnc9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy93b3JkcHJvY2Vzc2luZ21sLzIwMDYvbWFpbiIgeG1sbnM6dzEwPSJ1cm46c2NoZW1hcy1taWNyb3NvZnQtY29tOm9mZmljZTp3b3JkIiB4bWxuczp3cT0iaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS9vZmZpY2Uvd29yZC8yMDEwL3dvcmRwcm9jZXNzaW5nU2hhcGUiIHhtbG5zOndwPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvZHJhd2luZ21sLzIwMDYvd29yZHByb2Nlc3NpbmciIHhtbG5zOndwMTQ9Imh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vb2ZmaWNlL3dvcmQvMjAxMC93b3JkcHJvY2Vzc2luZ0RyYXdpbmciPjx3OmJvZHk+PHc6cD48dzpwUHI+PHc6cFN0eWxlIHc6dmFsPSJOb3JtYWwiLz48dzpyUHIvPjwvdzpwUHI+PHc6cj48dzpyUHIvPjx3OnQ+PC93OnQ+PC93OnI+PHc6Ym9va21hcmtTdGFydCB3OmlkPSIwIiB3Om5hbWU9Il9HbzBackIxIi8+PHc6Ym9va21hcmtFbmQgdzppZD0iMCIvPjwvdzpwPjx3OnNlY3RQcj48dzpwZ1N6IHc6dz0iMTIyNDAiIHc6aD0iMTU4NDAiLz48dzpwZ01hciB3OnRvcD0iMTQ0MCIgdzpyaWdodD0iMTQ0MCIgdzpib3R0b209IjE0NDAiIHc6bGVmdD0iMTQ0MCIgdzpoZWFkZXI9IjcyMCIgdzpmb290ZXI9IjcyMCIgdzpndXR0ZXI9IjAiLz48dzpjb2xzIHc6c3BhY2U9IjcyMCIvPjx3OmRvY0dyaWQgdzpsaW5lUGl0Y2g9IjM2MCIvPjwvdzpzZWN0UHI+PC93OmJvZHk+PC93OmRvY3VtZW50Pue/vuUAAABQSwMEFAAGAAgAAAAhALV1zftwAQAAIwMAAAALACAAX3JlbHMvLnJlbHMgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiA8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCIgc3RhbmRhbG9uZT0ieWVzIj8+CjxSZWxhdGlvbnNoaXBzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGlja2FnZS8yMDA2L3JlbGF0aW9uc2hpcHMiPjxSZWxhdGlvbnNoaXAgSWQ9InJJZDEiIFR5cGU9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvb2ZmaWNlRG9jdW1lbnQiIFRhcmdldD0id29yZC9kb2N1bWVudC54bWwiLz48L1JlbGF0aW9uc2hpcHM+57++5QAAAFBLAQItABQABgAIAAAAIQA4/4cZ6wEAALwCAAAATAAgAAAAAAAAAAAAAAAxAAAAd29yZC9kb2N1bWVudC54bWwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUEsBAi0AFAAGAAgAAAAhALV1zftwAQAAIwMAAAALACAAAAAAAAAAAAAAADECAABfcmVscy8ucmVscwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUEsFBgAAAAACAAIACwAAAMwDAAAAAA==';
    return Buffer.from(minimalDocxBase64, 'base64');
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
        const filePath = getTemplateFilePath(response.body.fileRef);
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
        const filePath = getTemplateFilePath(response.body.fileRef);
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
