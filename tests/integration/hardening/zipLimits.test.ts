import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { eq } from 'drizzle-orm';
import PizZip from 'pizzip';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../../server/db';
import { MAX_ZIP_UNCOMPRESSED_BYTES } from '../../../server/utils/zipLimits';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../../helpers/integrationTestHelper';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../../helpers/ownerDb";

const { scanAndFix } = vi.hoisted(() => ({
  scanAndFix: vi.fn(),
}));

vi.mock('../../../server/services/document/TemplateScanner', () => ({
  templateScanner: { scanAndFix },
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

const createZip = (entryName: string, content: string): Buffer => {
  const zip = new PizZip();
  zip.file(entryName, content);
  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
};

const withDeclaredUncompressedSize = (
  buffer: Buffer,
  uncompressedSize: number
): Buffer => {
  const result = Buffer.from(buffer);
  const centralDirectory = result.indexOf(Buffer.from([0x50, 0x4B, 0x01, 0x02]));
  expect(centralDirectory).toBeGreaterThanOrEqual(0);
  result.writeUInt32LE(uncompressedSize, centralDirectory + 24);
  return result;
};

const listTempUploads = async (): Promise<string[]> => {
  const names = await fs.readdir(os.tmpdir());
  return names.filter((name) => /^file-\d+-[a-f0-9]+\.docx$/.test(name)).sort();
};

/**
 * Temp files still holding *the archive we just uploaded*.
 *
 * Attribution is by content, not by filename or by diffing the directory
 * listing. `os.tmpdir()` is shared: the integration project runs four workers,
 * other template suites upload through the same multer instance, and multer's
 * `file-<timestamp>-<hex>.docx` names carry nothing that identifies the request
 * that created them. Both a set-equality check and an additions-only check
 * therefore fail intermittently on files another worker created or cleaned up
 * inside the measurement window — this suite passed alone and failed all four
 * cases alongside the other template suites for exactly that reason.
 *
 * The hostile archives below are unique to this suite, so a byte-identical
 * leftover is unambiguously ours and unambiguously a leak.
 */
const leakedCopiesOf = async (buffer: Buffer): Promise<string[]> => {
  const leaked: string[] = [];
  for (const name of await listTempUploads()) {
    try {
      const contents = await fs.readFile(path.join(os.tmpdir(), name));
      if (contents.equals(buffer)) { leaked.push(name); }
    } catch {
      // Raced with a concurrent worker's cleanup; it was not ours to inspect.
    }
  }
  return leaked;
};

const responseMessage = (body: unknown): string => {
  const payload = body as { error?: { message?: string }; message?: string };
  return payload.error?.message ?? payload.message ?? '';
};

describe.sequential('Hardening: DOCX ZIP limits', () => {
  let ctx: IntegrationTestContext;
  let templateId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'DOCX ZIP Limits',
      createProject: true,
      projectName: 'DOCX ZIP Limits',
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

  const rejectionCases = [
    {
      label: 'declared uncompressed size over 256 MB',
      createBuffer: () => withDeclaredUncompressedSize(
        createZip('word/document.xml', 'small'),
        MAX_ZIP_UNCOMPRESSED_BYTES + 1
      ),
      expectedMessage: /uncompressed size.*256 MB limit/i,
    },
    {
      label: 'compression ratio over 100x',
      createBuffer: () => createZip('word/document.xml', 'A'.repeat(200_000)),
      expectedMessage: /compression ratio.*100x limit/i,
    },
    {
      label: 'path traversal entry',
      createBuffer: () => createZip('../word/document.xml', 'safe'),
      expectedMessage: /escapes archive root/i,
    },
    {
      label: 'absolute-path entry',
      createBuffer: () => createZip('/word/document.xml', 'safe'),
      expectedMessage: /escapes archive root/i,
    },
  ];

  it.each(rejectionCases)(
    'rejects $label on POST and PATCH without temp-file or database mutation',
    async ({ createBuffer, expectedMessage }) => {
      const projectId = ctx.projectId!;
      const hostile = createBuffer();
      const rowsBeforePost = await getOwnerDb().select({ id: schema.templates.id })
        .from(schema.templates)
        .where(eq(schema.templates.projectId, projectId));

      const postResponse = await request(ctx.baseURL)
        .post(`/api/projects/${projectId}/templates`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .field('name', 'Rejected template')
        .attach('file', hostile, 'hostile.docx');

      expect(postResponse.status).toBe(400);
      expect(responseMessage(postResponse.body)).toMatch(expectedMessage);
      expect(await leakedCopiesOf(hostile)).toEqual([]);
      const rowsAfterPost = await getOwnerDb().select({ id: schema.templates.id })
        .from(schema.templates)
        .where(eq(schema.templates.projectId, projectId));
      expect(rowsAfterPost).toEqual(rowsBeforePost);

      const templateBeforePatch = await db.query.templates.findFirst({
        where: eq(schema.templates.id, templateId),
      });

      const patchResponse = await request(ctx.baseURL)
        .patch(`/api/templates/${templateId}`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .field('name', 'Rejected update')
        .attach('file', hostile, 'hostile.docx');

      expect(patchResponse.status).toBe(400);
      expect(responseMessage(patchResponse.body)).toMatch(expectedMessage);
      expect(await leakedCopiesOf(hostile)).toEqual([]);
      const templateAfterPatch = await db.query.templates.findFirst({
        where: eq(schema.templates.id, templateId),
      });
      expect(templateAfterPatch).toEqual(templateBeforePatch);
    }
  );

  it('leaves scan/parse work untouched for every rejected archive', () => {
    expect(scanAndFix).not.toHaveBeenCalled();
  });
});
