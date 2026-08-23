import { describe, expect, it } from "vitest";

import {
  validateWorkflowStructure,
  type WorkflowReadinessContext,
} from "../../../server/services/workflowStructureRules";

/**
 * Document + provider readiness at publish time (GH-152).
 *
 * The behavioural contract these tests pin down is the line drawn in
 * `workflowStructureRules`' header: a template that does not resolve aborts
 * generation for every respondent, so it blocks the publish; an unresolved field
 * mapping renders a blank and a missing e-sign provider is a property of server
 * env rather than of the workflow, so both only warn.
 */

const PAGE_A = "11111111-1111-4111-8111-111111111111";
const PAGE_FINAL = "22222222-2222-4222-8222-222222222222";
const STEP_QUESTION = "33333333-3333-4333-8333-333333333333";
const STEP_FINAL = "44444444-4444-4444-8444-444444444444";
const STEP_SIGNATURE = "55555555-5555-4555-8555-555555555555";

const REAL_TEMPLATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MISSING_TEMPLATE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Context as `VersionService.buildReadinessContext` produces it. */
function readiness(overrides: Partial<WorkflowReadinessContext> = {}): WorkflowReadinessContext {
  return {
    knownTemplateIds: new Set([REAL_TEMPLATE]),
    availableEsignProviders: new Set(["docusign"]),
    ...overrides,
  };
}

type TestStep = Record<string, unknown>;
type TestPage = Record<string, unknown> & { id: string; title: string; order: number; steps: TestStep[] };

/** A workflow that clears every pre-existing structural check. */
function baseWorkflow(extraPages: TestPage[] = []): { pages: TestPage[]; logicRules: [] } {
  return {
    pages: [
      {
        id: PAGE_A,
        title: "Page 1",
        order: 0,
        steps: [{ id: STEP_QUESTION, type: "short_text", title: "Your name", alias: "name" }],
      },
      ...extraPages,
    ],
    logicRules: [],
  };
}

function finalBlockPage(documents: Record<string, unknown>[]): TestPage {
  return {
    id: PAGE_FINAL,
    title: "Your documents",
    order: 1,
    steps: [{ id: STEP_FINAL, type: "final_documents", title: "Final documents", config: { documents } }],
  };
}

function signaturePage(config: Record<string, unknown>): TestPage {
  return {
    id: PAGE_FINAL,
    title: "Sign",
    order: 1,
    steps: [{ id: STEP_SIGNATURE, type: "signature_block", title: "Sign here", config }],
  };
}

function errorsOf(
  data: Parameters<typeof validateWorkflowStructure>[0],
  context?: WorkflowReadinessContext
): string[] {
  return validateWorkflowStructure(data, context)
    .filter(r => r.type === "error")
    .map(r => r.message);
}

function warningsOf(
  data: Parameters<typeof validateWorkflowStructure>[0],
  context?: WorkflowReadinessContext
): string[] {
  return validateWorkflowStructure(data, context)
    .filter(r => r.type === "warning")
    .map(r => r.message);
}

describe("validateWorkflowStructure — document readiness (GH-152)", () => {
  describe("final block steps", () => {
    it("passes a final block whose template exists in the project", () => {
      const data = baseWorkflow([
        finalBlockPage([{ id: "d1", documentId: REAL_TEMPLATE, alias: "contract" }]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
    });

    it("blocks a template id that is not in the project", () => {
      const data = baseWorkflow([
        finalBlockPage([{ id: "d1", documentId: MISSING_TEMPLATE, alias: "contract" }]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([
        `Final block "Final documents" document "contract" references a template that does not exist in this project: "${MISSING_TEMPLATE}"`,
      ]);
    });

    it("blocks the retired editor's placeholder document id", () => {
      const data = baseWorkflow([
        finalBlockPage([{ id: "d1", documentId: "placeholder", alias: "contract" }]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([
        'Final block "Final documents" document "contract" still has a placeholder template id. Select a real template before publishing.',
      ]);
    });

    it("blocks a document entry with no template selected", () => {
      const data = baseWorkflow([
        finalBlockPage([{ id: "d1", documentId: "   ", alias: "contract" }]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([
        'Final block "Final documents" document "contract" has no template selected, so document generation would fail for every respondent.',
      ]);
    });

    it("warns rather than blocks when a final block has no documents", () => {
      const data = baseWorkflow([finalBlockPage([])]);
      expect(errorsOf(data, readiness())).toEqual([]);
      expect(warningsOf(data, readiness())).toContain(
        'Final block "Final documents" has no documents configured, so no documents will be generated for it.'
      );
    });

    it("reports every bad document in a block, not just the first", () => {
      const data = baseWorkflow([
        finalBlockPage([
          { id: "d1", documentId: MISSING_TEMPLATE, alias: "contract" },
          { id: "d2", documentId: "placeholder", alias: "receipt" },
          { id: "d3", documentId: REAL_TEMPLATE, alias: "invoice" },
        ]),
      ]);
      expect(errorsOf(data, readiness())).toHaveLength(2);
    });
  });

  describe("legacy Final Documents pages (page.config.finalBlock)", () => {
    it("blocks a legacy template id that is not in the project", () => {
      const data = baseWorkflow([
        {
          id: PAGE_FINAL,
          title: "Your documents",
          order: 1,
          steps: [],
          config: { finalBlock: true, templates: [MISSING_TEMPLATE] },
        },
      ]);
      expect(errorsOf(data, readiness())).toEqual([
        `Final documents page "Your documents" references a template that does not exist in this project: "${MISSING_TEMPLATE}"`,
      ]);
    });

    it("passes a legacy page whose templates all exist", () => {
      const data = baseWorkflow([
        {
          id: PAGE_FINAL,
          title: "Your documents",
          order: 1,
          steps: [],
          config: { finalBlock: true, templates: [REAL_TEMPLATE] },
        },
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
    });

    it("warns rather than blocks when a legacy page selects no templates", () => {
      const data = baseWorkflow([
        {
          id: PAGE_FINAL,
          title: "Your documents",
          order: 1,
          steps: [],
          config: { finalBlock: true, templates: [] },
        },
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
      expect(warningsOf(data, readiness())).toContain(
        'Final documents page "Your documents" has no templates selected, so no documents will be generated.'
      );
    });

    it("ignores pages that are not final-document pages", () => {
      const data = baseWorkflow([
        {
          id: PAGE_FINAL,
          title: "Ordinary page",
          order: 1,
          steps: [{ id: STEP_SIGNATURE, type: "short_text", title: "Notes", alias: "notes" }],
          config: { finalBlock: false, templates: [MISSING_TEMPLATE] },
        },
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
    });
  });

  describe("field mappings warn but never block", () => {
    it("warns on a mapping source that is not a known question alias", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: { client_name: { type: "variable", source: "nope" } },
          },
        ]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
      expect(warningsOf(data, readiness())).toContain(
        'Final block "Final documents" document "contract" maps field "client_name" to "nope", which is not a known question alias — that field will render blank.'
      );
    });

    it("accepts a mapping source that is a known question alias", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: { client_name: { type: "variable", source: "name" } },
          },
        ]),
      ]);
      expect(validateWorkflowStructure(data, readiness())).toEqual([]);
    });

    it("accepts a dotted source, because generation flattens nested values", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: { city: { type: "variable", source: "address.city" } },
          },
        ]),
      ]);
      expect(validateWorkflowStructure(data, readiness())).toEqual([]);
    });

    it("warns on an empty mapping source", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: { client_name: { type: "variable", source: "" } },
          },
        ]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
      expect(warningsOf(data, readiness())).toContain(
        'Final block "Final documents" document "contract" maps field "client_name" to an empty source, so that field will render blank.'
      );
    });

    // GH-156: the mapping binding union widened from `variable`-only to
    // include `constant`, `formula`, and `datavault`. Each kind has its own
    // "resolves to nothing" case that must still warn, never block.
    it("never warns on a constant binding — it always resolves", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: { client_name: { type: "constant", value: "N/A" } },
          },
        ]),
      ]);
      expect(validateWorkflowStructure(data, readiness())).toEqual([]);
    });

    it("accepts a formula whose every {{alias}} reference is a known question alias", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: { greeting: { type: "formula", expression: "Dear {{name}}," } },
          },
        ]),
      ]);
      expect(validateWorkflowStructure(data, readiness())).toEqual([]);
    });

    it("warns on a formula referencing an unknown alias", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: { greeting: { type: "formula", expression: "Dear {{nope}}," } },
          },
        ]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
      expect(warningsOf(data, readiness())).toContain(
        'Final block "Final documents" document "contract" formula for field "greeting" references unknown variable(s): nope — that part will render blank.'
      );
    });

    it("warns on an empty formula expression", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: { greeting: { type: "formula", expression: "" } },
          },
        ]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
      expect(warningsOf(data, readiness())).toContain(
        'Final block "Final documents" document "contract" maps field "greeting" to an empty formula, so that field will render blank.'
      );
    });

    it("accepts a complete DataVault binding", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: {
              firm_name: { type: "datavault", tableId: "t1", columnId: "c1", rowId: "r1" },
            },
          },
        ]),
      ]);
      expect(validateWorkflowStructure(data, readiness())).toEqual([]);
    });

    it("warns on an incomplete DataVault binding", () => {
      const data = baseWorkflow([
        finalBlockPage([
          {
            id: "d1",
            documentId: REAL_TEMPLATE,
            alias: "contract",
            mapping: {
              firm_name: { type: "datavault", tableId: "t1", columnId: "", rowId: "r1" },
            },
          },
        ]),
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
      expect(warningsOf(data, readiness())).toContain(
        'Final block "Final documents" document "contract" maps field "firm_name" to an incomplete DataVault reference, so that field will render blank.'
      );
    });
  });

  describe("signature blocks", () => {
    it("blocks a signature block with nothing to sign", () => {
      const data = baseWorkflow([signaturePage({ signerRole: "Client", documents: [] })]);
      expect(errorsOf(data, readiness())).toEqual([
        'Signature block "Sign here" has no documents to sign, so the respondent would reach a signing step with nothing to sign.',
      ]);
    });

    it("blocks a signature document whose template does not exist", () => {
      const data = baseWorkflow([
        signaturePage({
          signerRole: "Client",
          documents: [{ id: "d1", documentId: MISSING_TEMPLATE }],
        }),
      ]);
      expect(errorsOf(data, readiness())).toEqual([
        `Signature block "Sign here" document "d1" references a template that does not exist in this project: "${MISSING_TEMPLATE}"`,
      ]);
    });

    it("warns, and does not block, on an unconfigured provider", () => {
      const data = baseWorkflow([
        signaturePage({
          signerRole: "Client",
          provider: "hellosign",
          documents: [{ id: "d1", documentId: REAL_TEMPLATE }],
        }),
      ]);
      expect(errorsOf(data, readiness())).toEqual([]);
      expect(warningsOf(data, readiness())).toContain(
        'Signature block "Sign here" uses e-signature provider "hellosign", which is not configured on this server — signing will fail until it is enabled.'
      );
    });

    it("accepts a registered provider regardless of case", () => {
      const data = baseWorkflow([
        signaturePage({
          signerRole: "Client",
          provider: "DocuSign",
          documents: [{ id: "d1", documentId: REAL_TEMPLATE }],
        }),
      ]);
      expect(validateWorkflowStructure(data, readiness())).toEqual([]);
    });

    it("stays silent about providers when the registry is unknown", () => {
      // No `availableEsignProviders` — e.g. a caller with no server context.
      const data = baseWorkflow([
        signaturePage({
          signerRole: "Client",
          provider: "hellosign",
          documents: [{ id: "d1", documentId: REAL_TEMPLATE }],
        }),
      ]);
      const context = { knownTemplateIds: new Set([REAL_TEMPLATE]) };
      expect(warningsOf(data, context)).toEqual([]);
    });
  });

  describe("context is optional", () => {
    it("skips template existence checks when no template set is supplied", () => {
      const data = baseWorkflow([
        finalBlockPage([{ id: "d1", documentId: MISSING_TEMPLATE, alias: "contract" }]),
      ]);
      // Same workflow, no context: the id cannot be judged, so it must not block.
      expect(errorsOf(data)).toEqual([]);
      // ...but it does block once the facts are available.
      expect(errorsOf(data, readiness())).toHaveLength(1);
    });

    it("still catches placeholder and empty ids with no context at all", () => {
      const data = baseWorkflow([
        finalBlockPage([
          { id: "d1", documentId: "placeholder", alias: "contract" },
          { id: "d2", documentId: "", alias: "receipt" },
        ]),
      ]);
      expect(errorsOf(data)).toHaveLength(2);
    });
  });
});
