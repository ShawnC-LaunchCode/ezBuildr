/**
 * PUT /api/workflows/:workflowId — branding validation (GH-158 AC6, AC7).
 *
 * `workflows.settings` used to be declared `z.record(z.any())`, so a logo URL
 * went to the database unexamined and then straight into an `<img src>` on a
 * participant-facing screen. These tests prove the branding keys are now
 * validated at the API boundary, that a rejected payload never reaches the
 * service layer (so nothing is persisted), and that the non-branding settings
 * keys still pass through untouched.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateWorkflowMock } = vi.hoisted(() => ({ updateWorkflowMock: vi.fn() }));

vi.mock('../../../server/services/WorkflowService', () => ({
  workflowService: {
    updateWorkflow: updateWorkflowMock,
    replaceWorkflowContent: vi.fn(),
  },
}));

vi.mock('../../../server/middleware/auth', () => ({
  hybridAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { userId?: string }).userId = 'user-1';
    next();
  },
  optionalHybridAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../../../server/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { registerWorkflowRoutes } from '../../../server/routes/workflows.routes';

const WORKFLOW_ID = '11111111-1111-4111-8111-111111111111';

describe('PUT /api/workflows/:workflowId branding validation', () => {
  let app: Express;

  beforeEach(() => {
    updateWorkflowMock.mockReset();
    updateWorkflowMock.mockResolvedValue({ id: WORKFLOW_ID });

    app = express();
    app.use(express.json());
    registerWorkflowRoutes(app);
  });

  function put(settings: Record<string, unknown>) {
    return request(app).put(`/api/workflows/${WORKFLOW_ID}`).send({ settings });
  }

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html;base64,PHNjcmlwdD4='],
    ['vbscript:', 'vbscript:msgbox(1)'],
  ])('rejects a %s logo URL with 400 and never calls the service', async (_label, logoUrl) => {
    const res = await put({ brandingEnabled: true, logoUrl });

    expect(res.status).toBe(400);
    expect(updateWorkflowMock).not.toHaveBeenCalled();
  });

  it('rejects an unsafe favicon URL', async () => {
    const res = await put({ brandingEnabled: true, faviconUrl: 'javascript:alert(1)' });

    expect(res.status).toBe(400);
    expect(updateWorkflowMock).not.toHaveBeenCalled();
  });

  it('rejects a protocol-relative logo URL', async () => {
    const res = await put({ brandingEnabled: true, logoUrl: '//evil.test/logo.png' });

    expect(res.status).toBe(400);
    expect(updateWorkflowMock).not.toHaveBeenCalled();
  });

  it('rejects a non-hex brand color', async () => {
    const res = await put({ brandingEnabled: true, primaryColor: 'red' });

    expect(res.status).toBe(400);
    expect(updateWorkflowMock).not.toHaveBeenCalled();
  });

  it('accepts safe branding and normalizes the color', async () => {
    const res = await put({
      brandingEnabled: true,
      logoUrl: 'https://cdn.example/logo.png',
      faviconUrl: '/uploads/favicon.ico',
      primaryColor: '#abc',
      organizationName: 'Acme Legal',
      whiteLabel: true,
    });

    expect(res.status).toBe(200);
    expect(updateWorkflowMock).toHaveBeenCalledTimes(1);

    const [, , updateData] = updateWorkflowMock.mock.calls[0] as [string, string, { settings: Record<string, unknown> }];
    expect(updateData.settings).toMatchObject({
      logoUrl: 'https://cdn.example/logo.png',
      faviconUrl: '/uploads/favicon.ico',
      primaryColor: '#AABBCC',
      organizationName: 'Acme Legal',
      whiteLabel: true,
    });
  });

  it('passes non-branding settings keys through untouched', async () => {
    const res = await put({
      completionMessage: 'Thanks!',
      redirectUrl: 'https://example.com/done',
      allowSaveAndResume: false,
    });

    expect(res.status).toBe(200);

    const [, , updateData] = updateWorkflowMock.mock.calls[0] as [string, string, { settings: Record<string, unknown> }];
    expect(updateData.settings).toMatchObject({
      completionMessage: 'Thanks!',
      redirectUrl: 'https://example.com/done',
      allowSaveAndResume: false,
    });
  });
});
