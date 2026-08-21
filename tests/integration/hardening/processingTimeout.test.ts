import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { eq } from 'drizzle-orm';
import PizZip from 'pizzip';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../../server/db';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../../helpers/integrationTestHelper';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../../helpers/ownerDb";

const processingMocks = vi.hoisted(() => ({
  scanAndFix: vi.fn(() => new Promise<never>(() => {})),
  unlockPdf: vi.fn(() => new Promise<never>(() => {})),
  extractFields: vi.fn(),
}));

vi.mock('../../../server/services/processingLimiter', async () => {
  const { ConcurrencyLimiter } = await import('../../../server/utils/concurrency');
  return {
    DOCUMENT_PROCESSING_TIMEOUT_MS: 10,
    MAX_CONCURRENT_DOCS: 2,
    documentProcessingLimiter: new ConcurrencyLimiter(2),
  };
});

vi.mock('../../../server/services/document/TemplateScanner', () => ({
  templateScanner: { scanAndFix: processingMocks.scanAndFix },
}));

vi.mock('../../../server/services/document/PdfService', () => ({
  pdfService: {
    unlockPdf: processingMocks.unlockPdf,
    extractFields: processingMocks.extractFields,
  },
}));

vi.mock('../../../server/services/security/VirusScanner', () => ({
  virusScanner: () => ({
    scan: vi.fn().mockResolvedValue({
      safe: true,
      threatName: null,
      scannerName: 'mock',
    }),
  }),
}));

vi.mock('../../../server/services/StorageQuotaService', () => ({
  storageQuotaService: {
    checkQuota: vi.fn().mockResolvedValue(undefined),
  },
}));

const createDocx = (): Buffer => {
  const zip = new PizZip();
  zip.file('word/document.xml', '<w:document/>');
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

const createPdf = (): Buffer => Buffer.from('%PDF-1.4\n% timeout test\n');

const leakedCopiesOf = async (buffer: Buffer): Promise<string[]> => {
  const leaked: string[] = [];
  const names = await fs.readdir(os.tmpdir());
  for (const name of names.filter(candidate => /^file-\d+-[a-f0-9]+\.(docx|pdf)$/.test(candidate))) {
    try {
      const contents = await fs.readFile(path.join(os.tmpdir(), name));
      if (contents.equals(buffer)) {
        leaked.push(name);
      }
    } catch {
      // The upload was cleaned up between listing and reading.
    }
  }
  return leaked;
};

const responseMessage = (body: unknown): string => {
  const payload = body as { error?: { message?: string }; message?: string };
  return payload.error?.message ?? payload.message ?? '';
};

describe.sequential('Hardening: template processing timeout', () => {
  let ctx: IntegrationTestContext;
  let templateId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Template Processing Timeout',
      createProject: true,
      projectName: 'Template Processing Timeout',
      userRole: 'admin',
      tenantRole: 'owner',
    });
    const [template] = await getOwnerDb().insert(schema.templates).values({
      projectId: ctx.projectId!,
      name: 'Existing template',
      fileRef: 'existing.docx',
      type: 'docx',
    }).returning();
    templateId = template.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it.each([
    { kind: 'DOCX', buffer: createDocx(), filename: 'hung.docx' },
    { kind: 'PDF', buffer: createPdf(), filename: 'hung.pdf' },
  ])(
    'returns 400 for timed-out $kind processing on POST without inserting or leaking a temp file',
    async ({ buffer, filename }) => {
      const rowsBefore = await getOwnerDb().select({ id: schema.templates.id })
        .from(schema.templates)
        .where(eq(schema.templates.projectId, ctx.projectId!));

      const response = await request(ctx.baseURL)
        .post(`/api/projects/${ctx.projectId!}/templates`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .field('name', `Timed-out ${filename}`)
        .attach('file', buffer, filename);

      expect(response.status).toBe(400);
      expect(responseMessage(response.body)).toMatch(/document processing timeout/i);
      if (filename.endsWith('.docx')) {
        expect(processingMocks.scanAndFix).toHaveBeenCalledTimes(1);
      } else {
        expect(processingMocks.unlockPdf).toHaveBeenCalledTimes(1);
        expect(processingMocks.extractFields).not.toHaveBeenCalled();
      }
      expect(await leakedCopiesOf(buffer)).toEqual([]);
      const rowsAfter = await getOwnerDb().select({ id: schema.templates.id })
        .from(schema.templates)
        .where(eq(schema.templates.projectId, ctx.projectId!));
      expect(rowsAfter).toEqual(rowsBefore);
    }
  );

  it.each([
    { kind: 'DOCX', buffer: createDocx(), filename: 'hung-update.docx' },
    { kind: 'PDF', buffer: createPdf(), filename: 'hung-update.pdf' },
  ])(
    'returns 400 for timed-out $kind processing on PATCH without updating or leaking a temp file',
    async ({ buffer, filename }) => {
      const templateBefore = await db.query.templates.findFirst({
        where: eq(schema.templates.id, templateId),
      });

      const response = await request(ctx.baseURL)
        .patch(`/api/templates/${templateId}`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .field('name', `Rejected ${filename}`)
        .attach('file', buffer, filename);

      expect(response.status).toBe(400);
      expect(responseMessage(response.body)).toMatch(/document processing timeout/i);
      if (filename.endsWith('.docx')) {
        expect(processingMocks.scanAndFix).toHaveBeenCalledTimes(1);
      } else {
        expect(processingMocks.unlockPdf).toHaveBeenCalledTimes(1);
        expect(processingMocks.extractFields).not.toHaveBeenCalled();
      }
      expect(await leakedCopiesOf(buffer)).toEqual([]);
      const templateAfter = await db.query.templates.findFirst({
        where: eq(schema.templates.id, templateId),
      });
      expect(templateAfter).toEqual(templateBefore);
    }
  );

});
