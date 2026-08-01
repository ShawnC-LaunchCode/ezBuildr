import PizZip from 'pizzip';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { storageQuotaService } from '../../../server/services/StorageQuotaService';
import { setupIntegrationTest } from '../../helpers/integrationTestHelper';

/**
 * A real, parseable DOCX archive.
 *
 * Magic bytes followed by arbitrary padding is no longer enough: DOCH-3 added a
 * ZIP-limits gate that runs before the quota check and rejects an unreadable
 * archive with 400, which would mask the 403 this suite is asserting.
 */
const createMinimalDocx = (): Buffer => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('_rels/.rels', '<Relationships/>');
    zip.file('word/document.xml', '<w:document/>');
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

// Mock VirusScanner
vi.mock('../../../server/services/security/VirusScanner', () => ({
    virusScanner: () => ({
        scan: vi.fn().mockResolvedValue({ safe: true, threatName: null })
    })
}));

describe('Hardening: Storage Quota', () => {
    let ctx: any;

    beforeEach(async () => {
        ctx = await setupIntegrationTest({ createProject: true });
    });

    afterEach(async () => {
        vi.restoreAllMocks(); // Restore spies
        if (ctx?.cleanup) {await ctx.cleanup();}
    });

    it('should reject upload when quota exceeded', async () => {
        const { app, authToken, projectId } = ctx;

        // Spy on singleton instance
        vi.spyOn(storageQuotaService, 'getTenantUsage').mockResolvedValue(524287900);

        const fileContent = createMinimalDocx();

        const res = await request(app)
            .post(`/api/projects/${projectId}/templates`)
            .set('Authorization', `Bearer ${authToken}`)
            .field('name', 'Large Doc')
            .attach('file', fileContent, 'large.docx');

        // If 500, log body
        if (res.status === 500) {console.log('Quota 500 Body:', JSON.stringify(res.body));}

        expect(res.status).toBe(403);
        const params = res.body.error ? res.body.error : res.body;
        expect(params.message).toMatch(/Storage quota exceeded/i);
    });

    it('should allow upload when quota has space', async () => {
        const { app, authToken, projectId } = ctx;

        vi.spyOn(storageQuotaService, 'getTenantUsage').mockResolvedValue(0);

        const res = await request(app)
            .post(`/api/projects/${projectId}/templates`)
            .set('Authorization', `Bearer ${authToken}`)
            .field('name', 'Small Doc')
            .attach('file', Buffer.from('PK..SmallDOCX'), 'small.docx');

        expect(res.status).not.toBe(403);
    });
});
