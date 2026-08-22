
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { initTelemetry, shutdownTelemetry } from '../../server/observability/telemetry';
import { registerMetricsRoutes } from '../../server/routes/metrics';

describe('Metrics Integration', () => {
    let app: express.Express;

    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        // Reset env vars and modules
        vi.resetModules();
        process.env.ENABLE_TELEMETRY = 'true';
        process.env.NODE_ENV = 'production'; // Forces enable

        // Initialize telemetry
        initTelemetry();

        delete process.env.METRICS_API_KEY;

        // Setup app
        app = express();
        registerMetricsRoutes(app);
    });

    afterEach(async () => {
        await shutdownTelemetry();
        delete process.env.ENABLE_TELEMETRY;
        // Restore NODE_ENV. Every integration file shares one process, so
        // leaving it at 'production' does not just affect this suite — it
        // changes the behaviour of every file scheduled after it, including
        // the test-only guards in server/utils/rlsContext.ts, which throw
        // outside test/development. Measured: this leak made unrelated suites
        // fail in teardown once an afterEach started touching those helpers.
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    });

    it('should expose /metrics endpoint', async () => {
        const response = await request(app).get('/metrics');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        // Prometheus metrics usually contain comments like # HELP or # TYPE
        expect(response.text).toContain('# HELP');
    });

    it('should protect /metrics if API key is set', async () => {
        process.env.METRICS_API_KEY = 'secret-key';

        // Re-register to pick up new env? 
        // Actually the route handler reads env at request time in metrics.ts:20

        const response = await request(app).get('/metrics');
        expect(response.status).toBe(401);

        const authorizedResponse = await request(app)
            .get('/metrics')
            .set('x-api-key', 'secret-key');

        expect(authorizedResponse.status).toBe(200);

        delete process.env.METRICS_API_KEY;
    });
});
