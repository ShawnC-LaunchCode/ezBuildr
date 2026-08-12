import fs from "fs/promises";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enhancedDocumentEngine } from "../../../server/services/document/EnhancedDocumentEngine.js";
import { FinalBlockRenderer } from "../../../server/services/document/FinalBlockRenderer.js";
import { storageProvider } from "../../../server/services/storage/index.js";

import type { PdfStrategyName } from "../../../server/services/document/PdfConverter.js";

vi.mock("../../../server/services/scripting/DocumentHookService.js", () => ({
  documentHookService: {
    executeHooksForPhase: vi.fn(async (args: { data: unknown }) => ({ data: args.data, errors: [] })),
  },
}));

vi.mock("../../../server/services/TemplateAnalysisService.js", () => ({
  validateTemplateWithData: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
}));

vi.mock("../../../server/services/document/EnhancedDocumentEngine.js", () => ({
  enhancedDocumentEngine: {
    renderFinalBlock: vi.fn(),
  },
}));

vi.mock("../../../server/services/storage/index.js", () => ({
  storageProvider: {
    uploadFile: vi.fn().mockResolvedValue(undefined),
    getLocalPath: vi.fn().mockImplementation((ref) => `/local/${ref}`),
  },
}));

describe("FinalBlockRenderer", () => {
  const outputDir = path.join(process.cwd(), "tmp", "final-renderer-test");
  const templatePath = path.join(outputDir, "template.docx");

  /**
   * Stub the generation engine to report a specific observed conversion outcome.
   * `pdfStrategy`/`pdfFellBack` are facts the engine discovers at conversion
   * time, so the renderer must surface them rather than echo a request.
   */
  function stubEngine(outcome: { pdfStrategy?: PdfStrategyName; pdfFellBack?: boolean }): void {
    vi.mocked(enhancedDocumentEngine.renderFinalBlock).mockImplementation(async ({ outputDir: targetDir }) => {
      const docxPath = path.join(targetDir ?? outputDir, "contract.docx");
      const pdfPath = path.join(targetDir ?? outputDir, "contract.pdf");
      await fs.writeFile(docxPath, "docx");
      await fs.writeFile(pdfPath, "pdf");

      return {
        documents: [{
          alias: "contract",
          docxPath,
          pdfPath,
          size: 3,
          normalizedData: {},
          unresolvedVariables: ["missingField"],
          ...outcome,
        }],
        skipped: [],
        failed: [],
        totalAttempted: 1,
        totalGenerated: 1,
      };
    });
  }

  function render(
    toPdf = true,
    workflowSettings?: unknown
  ): ReturnType<FinalBlockRenderer["render"]> {
    return new FinalBlockRenderer().render({
      workflowId: "wf-1",
      runId: "run-1",
      outputDir,
      toPdf,
      stepValues: { clientName: "Ada" },
      resolveTemplate: async () => templatePath,
      finalBlockConfig: {
        markdownHeader: "",
        documents: [
          { id: "doc-1", documentId: "template-1", alias: "contract" },
        ],
      },
      workflowSettings,
    });
  }

  function renderBothFormats(): ReturnType<FinalBlockRenderer["render"]> {
    return new FinalBlockRenderer().render({
      workflowId: "wf-1",
      runId: "run-1",
      outputDir,
      stepValues: { clientName: "Ada" },
      resolveTemplate: async () => templatePath,
      finalBlockConfig: {
        markdownHeader: "",
        outputFormats: ['docx', 'pdf'],
        documents: [
          { id: "doc-1", documentId: "template-1", alias: "client-contract" },
        ],
      },
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(templatePath, "template");
    stubEngine({ pdfStrategy: "gotenberg", pdfFellBack: false });
  });

  afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("reports the converter that actually produced the PDF", async () => {
    const result = await render();

    expect(result.documents).toEqual([
      expect.objectContaining({
        alias: "contract",
        filename: "contract.pdf",
        mimeType: "application/pdf",
        pdfStrategy: "gotenberg",
        pdfFellBack: false,
        unresolvedVariables: ["missingField"],
      }),
    ]);
  });

  it("surfaces a fallback to the low-fidelity converter", async () => {
    // This is the case that used to be invisible: Gotenberg failed, Puppeteer
    // produced a materially different PDF, and the record still said the
    // conversion was normal.
    stubEngine({ pdfStrategy: "puppeteer", pdfFellBack: true });

    const result = await render();

    expect(result.documents[0]).toEqual(expect.objectContaining({
      pdfStrategy: "puppeteer",
      pdfFellBack: true,
    }));
  });

  it("never asks the engine for a conversion strategy", async () => {
    // The strategy is chosen from PDF_CONVERTER_API_URL inside PdfConverter.
    // A caller-supplied strategy is what allowed the recorded value to drift
    // from reality, so the request must not carry one.
    await render();

    const request = vi.mocked(enhancedDocumentEngine.renderFinalBlock).mock.calls[0][0];
    expect(request).toEqual(expect.objectContaining({ toPdf: true }));
    expect(request).not.toHaveProperty("pdfStrategy");
  });

  it("passes workflow settings to the document engine", async () => {
    const workflowSettings = { businessDayCalendar: "us-federal" };

    await render(true, workflowSettings);

    expect(enhancedDocumentEngine.renderFinalBlock).toHaveBeenCalledWith(
      expect.objectContaining({ workflowSettings })
    );
  });

  it("omits conversion metadata when no PDF was requested", async () => {
    stubEngine({ pdfStrategy: undefined, pdfFellBack: undefined });

    const result = await render(false);

    expect(result.documents[0]).toEqual(expect.objectContaining({
      filename: "contract.docx",
      pdfStrategy: undefined,
      pdfFellBack: undefined,
    }));
  });

  it("generates, uploads, and returns both selected output formats", async () => {
    const result = await renderBothFormats();

    expect(enhancedDocumentEngine.renderFinalBlock).toHaveBeenCalledWith(
      expect.objectContaining({ toPdf: true })
    );
    expect(result.documents.map((document) => document.filename)).toEqual([
      'contract.docx',
      'contract.pdf',
    ]);
    expect(result.totalGenerated).toBe(2);
    expect(storageProvider.uploadFile).toHaveBeenCalledWith(
      'runs/run-1/documents/contract.docx',
      expect.any(Buffer),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(storageProvider.uploadFile).toHaveBeenCalledWith(
      'runs/run-1/documents/contract.pdf',
      expect.any(Buffer),
      'application/pdf'
    );
  });
});

