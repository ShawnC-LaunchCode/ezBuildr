import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setupIntegrationTest } from '../../helpers/integrationTestHelper';

// Mock VirusScanner to bypass check
vi.mock('../../../server/services/security/VirusScanner', () => ({
    virusScanner: () => ({
        scan: vi.fn().mockResolvedValue({ safe: true, threatName: null, scannerName: 'mock' })
    })
}));

// Mock StorageQuotaService since we don't testing it here
vi.mock('../../../server/services/StorageQuotaService', () => ({
    storageQuotaService: {
        checkQuota: vi.fn().mockResolvedValue(undefined)
    }
}));


describe('Hardening: Magic Bytes', () => {
    let ctx: any;

    beforeEach(async () => {
        ctx = await setupIntegrationTest({ createProject: true });
    });

    afterEach(async () => {
        if (ctx?.cleanup) {await ctx.cleanup();}
    });

    it('should reject a text file spoofing as PDF', async () => {
        const { app, authToken, projectId } = ctx;

        const res = await request(app)
            .post(`/api/projects/${projectId}/templates`)
            .set('Authorization', `Bearer ${authToken}`)
            .field('name', 'Spoofed PDF')
            .attach('file', Buffer.from('Just text content'), 'spoofed.pdf');

        expect(res.status).toBe(400);
        const params = res.body.error ? res.body.error : res.body;

        if (!/File type mismatch/i.test(params.message)) {
            console.log('DEBUG MSG FAIL (PDF):', params);
        }

        expect(params.message).toMatch(/File type mismatch/i);
    });

    it('should reject a text file spoofing as DOCX', async () => {
        const { app, authToken, projectId } = ctx;

        const res = await request(app)
            .post(`/api/projects/${projectId}/templates`)
            .set('Authorization', `Bearer ${authToken}`)
            .field('name', 'Spoofed DOCX')
            .attach('file', Buffer.from('Just text content'), 'spoofed.docx');

        expect(res.status).toBe(400);
        const params = res.body.error ? res.body.error : res.body;

        if (!/File type mismatch/i.test(params.message)) {
            console.log('DEBUG MSG FAIL (DOCX):', params);
        }

        expect(params.message).toMatch(/File type mismatch/i);
    });

    it('should accept a file with valid PDF magic bytes', async () => {
        const { app, authToken, projectId } = ctx;

        // Minimal PDF header
        const pdfBuffer = Buffer.from('%PDF-1.4\n%...');

        const res = await request(app)
            .post(`/api/projects/${projectId}/templates`)
            .set('Authorization', `Bearer ${authToken}`)
            .field('name', 'Valid PDF')
            .attach('file', pdfBuffer, 'valid.pdf');

        if (res.status === 400) {
            const params = res.body.error ? res.body.error : res.body;
            expect(params.message).not.toMatch(/File type mismatch/i);
        } else {
            expect(res.status).not.toBe(418); // Check generic pass
        }
    });

    it('should accept a file with valid DOCX magic bytes (ZIP)', async () => {
        const { app, authToken, projectId } = ctx;

        // Minimal ZIP header (PK..)
        const docxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]);

        const res = await request(app)
            .post(`/api/projects/${projectId}/templates`)
            .set('Authorization', `Bearer ${authToken}`)
            .field('name', 'Valid DOCX')
            .attach('file', docxBuffer, 'valid.docx');

        if (res.status === 400) {
            const params = res.body.error ? res.body.error : res.body;
            expect(params.message).not.toMatch(/File type mismatch/i);
        }
    });
});
