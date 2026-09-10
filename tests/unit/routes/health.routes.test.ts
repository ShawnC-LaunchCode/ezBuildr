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

const { dbExecute, converterHealthCheck, loggerError, pythonCheck, aiCheck } = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  converterHealthCheck: vi.fn(),
  loggerError: vi.fn(),
  pythonCheck: vi.fn(),
  aiCheck: vi.fn(),
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
  // `pythonRuntime` builds a child logger at module scope (CB-11). Without this
  // the route cannot even be imported, and every test here skips.
  createLogger: () => ({ error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../server/services/document/PdfConverter', () => ({
  get pdfConverter() { return converter; },
}));

// Stubbed rather than really spawned: whether THIS machine has python3 is exactly
// the thing that must not decide what the endpoint reports (CB-11).
vi.mock('../../../server/utils/pythonRuntime', () => ({
  checkPythonSandbox: pythonCheck,
}));

// Stubbed so this suite never reaches a vendor. Without it the route's probe would
// make a REAL outbound request whenever an API key happens to resolve in the
// environment — the kind of accident that makes a unit suite slow, flaky and
// dependent on somebody else's uptime.
vi.mock('../../../server/utils/aiRuntime', () => ({
  checkAiProvider: aiCheck,
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
    pythonCheck.mockResolvedValue({ available: true });
    aiCheck.mockResolvedValue({ configured: true, available: true, probe: 'provider' });
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

describe('GET /health — Python sandbox (CB-11)', () => {
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

  it('reports the interpreter as available, with no error', async () => {
    pythonCheck.mockResolvedValue({ available: true });
    aiCheck.mockResolvedValue({ configured: true, available: true, probe: 'provider' });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.pythonSandbox).toEqual({ available: true });
  });

  it('reports a missing interpreter instead of leaving it to be found by a failed run', async () => {
    pythonCheck.mockResolvedValue({ available: false, error: 'Python interpreter is not available' });

    const response = await request(app).get('/health');

    expect(response.body.pythonSandbox).toEqual({
      available: false,
      error: 'Python interpreter is not available',
    });
  });

  it('does NOT degrade the instance when Python is missing', async () => {
    pythonCheck.mockResolvedValue({ available: false, error: 'Python interpreter is not available' });

    const response = await request(app).get('/health');

    // Unlike the PDF converter, Python is opt-in: a deployment whose blocks are
    // all JavaScript is entirely healthy without it. Degrading every such
    // instance would drain the word of meaning. Pinned because it is a
    // deliberate asymmetry with the converter directly above, not an oversight.
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  it('still reports the field when the database is down', async () => {
    // The python probe must not be skipped by an early return on the db failure:
    // "which capability is missing" is exactly what an operator needs during an
    // incident, and 503 is when they are looking.
    dbExecute.mockRejectedValue(new Error('connection refused'));
    pythonCheck.mockResolvedValue({ available: true });
    aiCheck.mockResolvedValue({ configured: true, available: true, probe: 'provider' });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.pythonSandbox).toEqual({ available: true });
  });
});

describe('GET /health — AI provider (AI-P1)', () => {
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
    pythonCheck.mockResolvedValue({ available: true });
    loggerError.mockClear();
  });

  it('reports a reachable provider, saying the vendor was actually asked', async () => {
    aiCheck.mockResolvedValue({ configured: true, available: true, probe: 'provider' });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.aiProvider).toEqual({
      configured: true, available: true, probe: 'provider',
    });
  });

  it('surfaces a withdrawn model instead of leaving it to a 500 on a user request', async () => {
    // The AI-P1 posture exactly: configured, but the vendor no longer serves it.
    aiCheck.mockResolvedValue({
      configured: true, available: false, probe: 'provider',
      error: 'AI provider is not reachable with the configured model',
    });

    const response = await request(app).get('/health');

    expect(response.body.aiProvider).toMatchObject({ configured: true, available: false });
    expect(response.body.aiProvider.error).toBe('AI provider is not reachable with the configured model');
  });

  it('does NOT degrade the instance when the provider is unreachable', async () => {
    aiCheck.mockResolvedValue({
      configured: true, available: false, probe: 'provider', error: 'x',
    });

    const response = await request(app).get('/health');

    // Same asymmetry as pythonSandbox, and equally deliberate: AI is opt-in, so a
    // deployment that never generates a workflow is not unhealthy for lacking it.
    // Pinned so it reads as a choice rather than an oversight.
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  it('distinguishes "not set up" from "broken"', async () => {
    aiCheck.mockResolvedValue({ configured: false, available: false, probe: 'none' });

    const response = await request(app).get('/health');

    // configured:false is a deployment with AI switched off. An operator must be
    // able to tell that apart from a configured provider that is failing.
    expect(response.body.aiProvider).toEqual({
      configured: false, available: false, probe: 'none',
    });
    expect(response.body.aiProvider.error).toBeUndefined();
  });

  it('never lets the field claim more than was checked', async () => {
    aiCheck.mockResolvedValue({ configured: true, available: true, probe: 'registry' });

    const response = await request(app).get('/health');

    // `registry` means only that the model is one this codebase knows — NOT that
    // any vendor confirmed it. The distinction is the whole reason the field is
    // reported, so it must survive the route rather than being flattened to a
    // bare boolean.
    expect(response.body.aiProvider.probe).toBe('registry');
    expect(response.body.aiProvider.available).toBe(true);
  });

  it('still reports the field when the database is down', async () => {
    dbExecute.mockRejectedValue(new Error('connection refused'));
    aiCheck.mockResolvedValue({ configured: true, available: true, probe: 'provider' });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.aiProvider.available).toBe(true);
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
