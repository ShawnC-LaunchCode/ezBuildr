import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PDF_CONVERSION_UNAVAILABLE_NOTICE,
  PDF_FIDELITY_DEGRADED_NOTICE,
} from '../../../server/services/document/PdfConverter';

const {
  analyzeTemplate,
  engineGenerate,
  fileExists,
  findTemplate,
  getSignedUrl,
  readFile,
  unlink,
  uploadFile,
} = vi.hoisted(() => ({
  analyzeTemplate: vi.fn(),
  engineGenerate: vi.fn(),
  fileExists: vi.fn(),
  findTemplate: vi.fn(),
  getSignedUrl: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock('fs', () => ({
  promises: { readFile, unlink },
}));

vi.mock('../../../server/repositories', () => ({
  documentTemplateRepository: { findById: findTemplate },
}));

vi.mock('../../../server/services/document/EnhancedDocumentEngine', () => ({
  enhancedDocumentEngine: { generateWithMapping: engineGenerate },
}));

vi.mock('../../../server/services/storage', () => ({
  storageProvider: { uploadFile, getSignedUrl },
}));

vi.mock('../../../server/services/TemplateAnalysisService', () => ({
  analyzeTemplate,
}));

vi.mock('../../../server/services/templateFiles', () => ({
  getTemplateFilePath: vi.fn(() => 'C:/templates/source.docx'),
  templateFileExists: fileExists,
}));

import { TemplateTestService } from '../../../server/services/TemplateTestService';

describe('TemplateTestService PDF conversion notices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findTemplate.mockResolvedValue({ fileRef: 'source.docx' });
    fileExists.mockResolvedValue(true);
    analyzeTemplate.mockResolvedValue({
      stats: { uniqueVariables: 1, loopCount: 0, conditionalCount: 0 },
    });
    readFile.mockResolvedValue(Buffer.from('generated'));
    unlink.mockResolvedValue(undefined);
    uploadFile.mockResolvedValue(undefined);
    getSignedUrl.mockImplementation(async (key: string) => `/signed/${key}`);
  });

  it('shows authors an actionable error when Gotenberg falls back to reduced fidelity', async () => {
    engineGenerate.mockResolvedValue({
      docxPath: 'C:/outputs/result.docx',
      pdfPath: 'C:/outputs/result.pdf',
      pdfStrategy: 'puppeteer',
      pdfFellBack: true,
      pdfNotice: PDF_FIDELITY_DEGRADED_NOTICE,
      size: 100,
    });

    const result = await new TemplateTestService().runTest({
      workflowId: 'workflow-1',
      templateId: 'template-1',
      outputType: 'both',
      sampleData: { clientName: 'Ada' },
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'rendered',
      errors: [PDF_FIDELITY_DEGRADED_NOTICE],
    });
    expect(result.docxUrl).toContain('.docx');
    expect(result.pdfUrl).toContain('.pdf');
  });

  it('preserves the DOCX download when a PDF-only request cannot be converted', async () => {
    engineGenerate.mockResolvedValue({
      docxPath: 'C:/outputs/result.docx',
      pdfFailed: true,
      pdfNotice: PDF_CONVERSION_UNAVAILABLE_NOTICE,
      size: 100,
    });

    const result = await new TemplateTestService().runTest({
      workflowId: 'workflow-1',
      templateId: 'template-1',
      outputType: 'pdf',
      sampleData: { clientName: 'Ada' },
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'rendered',
      errors: [PDF_CONVERSION_UNAVAILABLE_NOTICE],
    });
    expect(result.docxUrl).toContain('.docx');
    expect(result.pdfUrl).toBeUndefined();
  });

  it('keeps a successful Gotenberg render free of conversion errors', async () => {
    engineGenerate.mockResolvedValue({
      docxPath: 'C:/outputs/result.docx',
      pdfPath: 'C:/outputs/result.pdf',
      pdfStrategy: 'gotenberg',
      pdfFellBack: false,
      size: 100,
    });

    const result = await new TemplateTestService().runTest({
      workflowId: 'workflow-1',
      templateId: 'template-1',
      outputType: 'pdf',
      sampleData: { clientName: 'Ada' },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('rendered');
    expect(result.errors).toBeUndefined();
    expect(result.pdfUrl).toContain('.pdf');
  });
});
