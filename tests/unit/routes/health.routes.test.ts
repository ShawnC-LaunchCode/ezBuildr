/**
 * Health Route — PDF converter surfacing (DOCH-6)
 *
 * `/health` is unauthenticated, so these tests pin two things that are easy to
 * regress and expensive to get wrong:
 *
 *  1. A configured-but-unreachable converter must be **degraded with HTTP 200**,
 *     never `unhealthy`/503. Documents still generate through the local
 *     fallback, so taking the instance out of the load balancer would turn a
 *     fidelity problem into an outage.
 *  2. The response body must never disclose the converter URL, hostname, or the
 *     raw probe error. Those go to the server log only.
 *
 * `/ready` and `/live` are asserted unchanged: the converter is not required to
 * accept traffic, so it must stay out of the readiness signal.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const { dbExecute, converterHealthCheck, loggerError } = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  converterHealthCheck: vi.fn(),
  loggerError: vi.fn(),
}));

// A mutable stand-in for the PdfConverter singleton: `primaryStrategy` is read
// per request, so each test can set the posture it is describing.
const converter = {
  primaryStrategy: 'puppeteer' as string,
  healthCheck: converterHealthCheck,
};

vi.mock('../../../server/db', () => ({ db: { execute: dbExecute } }));

vi.mock('../../../server/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../server/services/document/PdfConverter', () => ({
  get pdfConverter() { return converter; },
}));

/** A realistic leaky probe error — the exact shape that must not reach a caller. */
const INTERNAL_HOST = 'gotenberg.railway.internal';
const RAW_PROBE_ERROR = `fetch failed: connect ECONNREFUSED ${INTERNAL_HOST}:3000`;

describe('GET /health — PDF converter', () => {
  let app: Express;

  beforeAll(async () => {
    const { default: healthRouter } = await import('../../../server/routes/health');
    app = express();
    app.use(healthRouter);
  });

  beforeEach(() => {
    dbExecute.mockResolvedValue(undefined);
    converter.primaryStrategy = 'puppeteer';
    converterHealthCheck.mockResolvedValue({ strategy: 'puppeteer', reachable: true });
    loggerError.mockClear();
  });

  it('stays healthy and reports no error when no converter API is configured', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.pdfConverter).toEqual({
      strategy: 'puppeteer',
      reachable: true,
    });
    expect(response.body.pdfConverter.error).toBeUndefined();
  });

  it('reports the API strategy and its response time when reachable', async () => {
    converter.primaryStrategy = 'gotenberg';
    converterHealthCheck.mockResolvedValue({
      strategy: 'gotenberg',
      reachable: true,
      responseTimeMs: 28,
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.pdfConverter).toEqual({
      strategy: 'gotenberg',
      reachable: true,
      responseTime: 28,
    });
  });

  it('degrades with HTTP 200 — not 503 — when the converter is unreachable', async () => {
    converter.primaryStrategy = 'gotenberg';
    converterHealthCheck.mockResolvedValue({
      strategy: 'gotenberg',
      reachable: false,
      responseTimeMs: 3,
      error: RAW_PROBE_ERROR,
    });

    const response = await request(app).get('/health');

    // Documents still generate via the fallback, so the instance stays in the
    // load balancer. A 503 here would be a self-inflicted outage.
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.pdfConverter.reachable).toBe(false);
    expect(response.body.pdfConverter.strategy).toBe('gotenberg');
  });

  it('never leaks the converter hostname or raw error to an unauthenticated caller', async () => {
    converter.primaryStrategy = 'gotenberg';
    converterHealthCheck.mockResolvedValue({
      strategy: 'gotenberg',
      reachable: false,
      error: RAW_PROBE_ERROR,
    });

    const response = await request(app).get('/health');

    const body = JSON.stringify(response.body);
    expect(body).not.toContain(INTERNAL_HOST);
    expect(body).not.toContain(RAW_PROBE_ERROR);
    expect(body).not.toContain('ECONNREFUSED');
    expect(response.body.pdfConverter.error).toBe('PDF converter connectivity check failed');

    // ...but the operator still gets the real reason, server-side.
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'gotenberg', err: RAW_PROBE_ERROR }),
      expect.stringContaining('PDF converter unreachable')
    );
  });

  it('keeps an unreachable database unhealthy even though the converter is fine', async () => {
    // The converter check must only ever downgrade `healthy`, never upgrade a
    // failing database back out of `unhealthy`.
    dbExecute.mockRejectedValue(new Error('connection refused'));

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.pdfConverter.reachable).toBe(true);
  });
});

describe('GET /ready and /live — unchanged by the converter', () => {
  let app: Express;

  beforeAll(async () => {
    const { default: healthRouter } = await import('../../../server/routes/health');
    app = express();
    app.use(healthRouter);
  });

  beforeEach(() => {
    dbExecute.mockResolvedValue(undefined);
    converterHealthCheck.mockResolvedValue({ strategy: 'gotenberg', reachable: false });
  });

  it('/ready ignores the converter and never probes it', async () => {
    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['ready', 'timestamp']);
    expect(response.body.ready).toBe(true);
    expect(converterHealthCheck).not.toHaveBeenCalled();
  });

  it('/live ignores the converter and never probes it', async () => {
    const response = await request(app).get('/live');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['alive', 'timestamp', 'uptime']);
    expect(response.body.alive).toBe(true);
    expect(converterHealthCheck).not.toHaveBeenCalled();
  });
});
