import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setupIntegrationTest } from '../../helpers/integrationTestHelper';

describe('Hardening: Rate Limiting', () => {
    let ctx: any;
    let oldEnv: NodeJS.ProcessEnv;

    beforeEach(async () => {
        oldEnv = process.env;
        // ENABLE test rate limiting. Limits are default (10 per min for upload).
        process.env = { ...oldEnv, TEST_RATE_LIMIT: 'true' };

        ctx = await setupIntegrationTest({ createProject: true });
    });

    afterEach(async () => {
        process.env = oldEnv;
        if (ctx?.cleanup) {await ctx.cleanup();}
    });

    it('should enforce rate limits on upload endpoint', async () => {
        const { app, authToken, projectId } = ctx;

        const makeRequest = (i: number) => request(app)
            .post(`/api/projects/${projectId}/templates`)
            .set('Authorization', `Bearer ${authToken}`)
            .field('name', `Rate Limit Test ${i}`)
            .attach('file', Buffer.from('fake'), 'test.docx');

        // Send 15 requests to be sure (limit is 10)
        const promises = [];
        for (let i = 0; i < 15; i++) {
            promises.push(makeRequest(i));
        }

        const results = await Promise.all(promises);
        const statuses = results.map(r => r.status);
        const status429 = statuses.filter(s => s === 429).length;

        console.log('RateLimit Statuses:', statuses);

        expect(status429).toBeGreaterThan(0);
    });
});
