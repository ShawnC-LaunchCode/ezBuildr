import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { registerDocsRoutes } from '../../server/routes/docs.routes';

// Importing server/index (the production entrypoint) here used to start a
// real, never-stopped runCompletionJobWorker poller, cron jobs, and a live
// listener on the real PORT (5000) for the lifetime of the whole test worker
// process — corrupting timing-sensitive tests scheduled to the same worker.
// This test only needs the docs route itself, so build a throwaway app with
// just that route mounted instead of pulling in the whole server.
describe('API Documentation', () => {
  it('should serve Swagger UI at /api-docs/', async () => {
    const app = express();
    registerDocsRoutes(app);

    // Note: The trailing slash is important for how swagger-ui-express serves the index
    const res = await request(app).get('/api-docs/');
    // It should return 200 OK
    expect(res.status).toBe(200);
    // It should be HTML
    expect(res.header['content-type']).toContain('text/html');
    // It should contain the customized page title (see swaggerUiOptions.customSiteTitle)
    expect(res.text).toContain('ezBuildr API Documentation');
  });
});
