
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { initTelemetry, shutdownTelemetry } from '../../server/observability/telemetry';
import { registerMetricsRoutes } from '../../server/routes/metrics';

describe('Metrics Integration', () => {
    let app: express.Express;

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
