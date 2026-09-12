import PizZip from 'pizzip';
import { describe, expect, it } from "vitest";

import { renderDocxBuffer } from "../../../server/services/document/RenderCore";
import { RunDataService, toAliasKeyed } from "../../../server/services/workflow-runs/RunDataService";

describe("RunDataService", () => {
  const steps = [
    { id: "step-name", alias: "clientName", type: "text" as const, pageId: "page-1", isVirtual: false },
    { id: "step-age", alias: null, type: "number" as const, pageId: "page-1", isVirtual: false },
  ];

  it("keeps step-id data canonical while deriving an alias-keyed document view", () => {
    const service = new RunDataService();
    const data = {
      "step-name": "Ada",
      "step-age": 37,
      computedTotal: 42,
    };

    const result = service.fromStepIdData(data, steps);

    expect(result.byStepId).toEqual(data);
    expect(result.byAlias).toEqual({
      clientName: "Ada",
      "step-age": 37,
      computedTotal: 42,
    });
  });

  it("maps known step ids to aliases and passes transform outputs through", () => {
    expect(toAliasKeyed({ "step-name": "Ada", computedTotal: 42 }, steps)).toEqual({
      clientName: "Ada",
      computedTotal: 42,
    });
  });

  // TPL-10 / AC1: byAlias contains an entry for every aliased step in the
  // workflow, seeded null when there is no persisted value -- not merely
  // whatever happened to be answered.
  describe("TPL-10 AC1: seeds every aliased step, even unanswered ones", () => {
    const stepsWithOptional = [
      { id: "step-name", alias: "clientName", type: "text" as const, pageId: "s1", isVirtual: false },
      // Aliased but never answered -- e.g. a skipped optional field or a
      // conditionally-hidden step. No corresponding key in `data` at all.
      { id: "step-middle", alias: "middleName", type: "text" as const, pageId: "s1", isVirtual: false },
      // No alias -- must not appear in byAlias under a synthetic key.
      { id: "step-notes", alias: null, type: "text" as const, pageId: "s1", isVirtual: false },
    ];

    it("fromStepIdData: unanswered aliased step is present-as-null, not absent", () => {
      const service = new RunDataService();
      const result = service.fromStepIdData({ "step-name": "Ada" }, stepsWithOptional);

      expect(result.byAlias).toHaveProperty("middleName", null);
      expect("middleName" in result.byAlias).toBe(true);
      expect(result.byAlias.clientName).toBe("Ada");
      // Unaliased step is not synthesized into byAlias by this seed.
      expect(result.byAlias).not.toHaveProperty("step-notes");
    });

    it("toAliasKeyed: same seeding behavior at the lower-level helper", () => {
      const byAlias = toAliasKeyed({ "step-name": "Ada" }, stepsWithOptional);
      expect(byAlias).toEqual({ clientName: "Ada", middleName: null });
    });

    it("byStepId is untouched by the seed -- it still reflects only persisted rows", () => {
      // TPL-10's blast-radius survey: byStepId feeds RunCompletionService's
      // block-phase data, LogicService.validateCompletion, and an analytics
      // "answered step count" metric. Seeding it would silently redefine
      // that metric to "total steps in the workflow" -- so the seed must
      // stay scoped to byAlias only.
      const service = new RunDataService();
      const result = service.fromStepIdData({ "step-name": "Ada" }, stepsWithOptional);

      expect(result.byStepId).toEqual({ "step-name": "Ada" });
      expect("step-middle" in result.byStepId).toBe(false);
    });
  });

  // TPL-10 / AC2: the falsy-value trap. A naive seed (e.g. `value ?? null`
  // applied after the fact, or an `if (!value)` guard) would clobber a real
  // answer of 0, '', or false back to null. This asserts each survives.
  describe("TPL-10 AC2: persisted falsy values are never overwritten by the seed", () => {
    const falsySteps = [
      { id: "step-zero", alias: "zeroField", type: "number" as const, pageId: "s1", isVirtual: false },
      { id: "step-empty", alias: "emptyField", type: "text" as const, pageId: "s1", isVirtual: false },
      { id: "step-false", alias: "falseField", type: "text" as const, pageId: "s1", isVirtual: false },
      { id: "step-unanswered", alias: "unansweredField", type: "text" as const, pageId: "s1", isVirtual: false },
    ];

    it("0, '', and false survive in byAlias exactly as persisted", () => {
      const service = new RunDataService();
      const result = service.fromStepIdData(
        { "step-zero": 0, "step-empty": "", "step-false": false },
        falsySteps
      );

      expect(result.byAlias.zeroField).toBe(0);
      expect(result.byAlias.emptyField).toBe("");
      expect(result.byAlias.falseField).toBe(false);
      // The genuinely-unanswered sibling still gets the null seed.
      expect(result.byAlias.unansweredField).toBeNull();
    });
  });

  // TPL-10 / AC3 + AC4: proven against a real rendered DOCX, per the
  // ticket's hard requirement -- not a unit test of the service in
  // isolation. Mirrors the fixture-building pattern used by
  // RenderCore.expressions.test.ts (TPL-2/TPL-3).
  describe("TPL-10 AC3/AC4: real DOCX render through TPL-3's strict-undefined mode", () => {
    function createDocxBuffer(bodyXml: string): Buffer {
      const zip = new PizZip();

      zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
      );

      zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
      );

      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`
      );

      return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    }

    function paragraph(text: string): string {
      return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
    }

    async function render(bodyXml: string, data: Record<string, unknown>): Promise<string> {
      const buffer = await renderDocxBuffer({
        templatePath: 'in-memory.docx',
        templateBuffer: createDocxBuffer(bodyXml),
        data,
      });
      const zip = new PizZip(buffer);
      const xml = zip.file('word/document.xml')?.asText() ?? '';
      return xml.replace(/<[^>]+>/g, '');
    }

    // A workflow with a required, answered step and an optional step that
    // the respondent legitimately skipped -- the exact shape described in
    // the ticket's Finding.
    const workflowSteps = [
      { id: "step-name", alias: "client_name", type: "text" as const, pageId: "s1", isVirtual: false },
      { id: "step-middle", alias: "middle_name", type: "text" as const, pageId: "s1", isVirtual: false },
    ];

    it("AC3: an aliased-but-unanswered step renders blank instead of raising", async () => {
      const service = new RunDataService();
      const runData = service.fromStepIdData({ "step-name": "Ada" }, workflowSteps);

      const text = await render(
        paragraph('Name: [{{client_name}}] Middle: [{{middle_name}}]'),
        runData.byAlias
      );

      expect(text).toContain('Name: [Ada] Middle: []');
    });

    it("AC4: a genuinely misspelled alias still raises", async () => {
      const service = new RunDataService();
      const runData = service.fromStepIdData({ "step-name": "Ada" }, workflowSteps);

      await expect(
        render(paragraph('{{clint_name}}'), runData.byAlias)
      ).rejects.toThrow(/clint_name/);
    });
  });
});
