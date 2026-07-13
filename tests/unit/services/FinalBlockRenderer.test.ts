import fs from "fs/promises";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enhancedDocumentEngine } from "../../../server/services/document/EnhancedDocumentEngine.js";
import { FinalBlockRenderer } from "../../../server/services/document/FinalBlockRenderer.js";

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

describe("FinalBlockRenderer", () => {
  const outputDir = path.join(process.cwd(), "tmp", "final-renderer-test");
  const templatePath = path.join(outputDir, "template.docx");

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(templatePath, "template");

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
        }],
        skipped: [],
        failed: [],
        totalAttempted: 1,
        totalGenerated: 1,
      };
    });
  });

  afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("passes pdfStrategy through PDF rendering and response metadata", async () => {
    const renderer = new FinalBlockRenderer();

    const result = await renderer.render({
      workflowId: "wf-1",
      runId: "run-1",
      outputDir,
      toPdf: true,
      pdfStrategy: "puppeteer",
      stepValues: { clientName: "Ada" },
      resolveTemplate: async () => templatePath,
      finalBlockConfig: {
        markdownHeader: "",
        documents: [
          { id: "doc-1", documentId: "template-1", alias: "contract" },
        ],
      },
    });

    expect(enhancedDocumentEngine.renderFinalBlock).toHaveBeenCalledWith(expect.objectContaining({
      toPdf: true,
      pdfStrategy: "puppeteer",
    }));
    expect(result.documents).toEqual([
      expect.objectContaining({
        alias: "contract",
        filename: "contract.pdf",
        mimeType: "application/pdf",
        pdfStrategy: "puppeteer",
        unresolvedVariables: ["missingField"],
      }),
    ]);
  });
});
