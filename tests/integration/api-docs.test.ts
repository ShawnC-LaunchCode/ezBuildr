import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from '../../server/index';
// Mock the openapi.yaml loading if necessary, but integration tests usually run with real app
// We just want to ensure the endpoint serves HTML (Swing UI)
describe('API Documentation', () => {
    it('should serve Swagger UI at /api-docs/', async () => {
        // Note: The trailing slash is important for how swagger-ui-express serves the index
        const res = await request(app).get('/api-docs/');
        // It should return 200 OK
        expect(res.status).toBe(200);
        // It should be HTML
        expect(res.header['content-type']).toContain('text/html');
        // It should contain the title from our spec
        expect(res.text).toContain('Swagger UI');
    });
});