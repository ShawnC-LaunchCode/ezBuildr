/**
 * Document-to-interview onboarding (GH-167) — end-to-end orchestration.
 *
 * Drives the wizard's full pipeline exactly as the client does: extracted
 * variables (author-approved) -> generate-workflow -> create workflow ->
 * apply content (replaceWorkflowContent) -> attach template -> write
 * mapping. Proves every approved variable lands in the persisted workflow
 * with its approved type/alias (not whatever the LLM produced), that the
 * workflow is left unpublished, and that cross-tenant access is rejected.
 *
 * Follows the fixture/`ctx` pattern in `templates.mapping-workbench.test.ts`.
 * The AI provider is mocked (never a real network call) the same way
 * `api.ai.test.ts` mocks `createAIServiceFromEnv`; `TemplateScanner` is
 * mocked the same way `templates.e2e.test.ts` mocks it, so a minimal
 * hand-built DOCX buffer is enough to exercise the real upload route.
 */
import PizZip from 'pizzip';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

import { setupIntegrationTest, type IntegrationTestContext } from '../../helpers/integrationTestHelper';

const generateWorkflowMock = vi.fn();

vi.mock('../../../server/services/AIService', () => ({
  createAIServiceFromEnv: vi.fn(() => ({
    generateWorkflow: generateWorkflowMock,
  })),
}));

vi.mock('../../../server/services/document/TemplateScanner', () => ({
  templateScanner: {
    scanAndFix: vi.fn().mockImplementation(async (buffer: Buffer) => ({
      isValid: true,
      fixed: false,
      buffer,
      repairs: [],
    })),
  },
}));

// The upload route performs real placeholder extraction after the scanner mock,
// so this fixture must be a valid OOXML package rather than only a ZIP container.
const createMinimalDocx = (): Buffer => {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Test template</w:t></w:r></w:p></w:body>' +
      '</w:document>'
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

/**
 * The LLM's raw output: one step matches the "client_name" variable by name
 * but with the WRONG type/alias (proves the overlay corrects it), one step
 * ("notes") has nothing to do with any approved variable (proves unrelated
 * AI content survives untouched), and "signing_date" is entirely absent
 * (proves an unmatched approved variable gets appended, never dropped).
 * logicRules/transformBlocks are non-empty here specifically to prove the
 * service drops them (the persistence path can't carry them - see
 * DocumentOnboardingService's header comment).
 */
function mockGeneratedWorkflow() {
  return {
    title: 'Client Intake',
    description: 'Generated from an uploaded document',
    sections: [
      {
        id: 'sec1',
        title: 'Details',
        order: 0,
        steps: [
          { id: 'step1', type: 'long_text', title: 'Client Name', alias: 'client_name', required: true },
          { id: 'step2', type: 'short_text', title: 'Notes', alias: 'notes', required: false },
        ],
      },
    ],
    logicRules: [
      { id: 'r1', when: { type: 'group', logic: 'and', conditions: [] }, targetType: 'step', targetAlias: 'notes', action: 'hide' },
    ],
    transformBlocks: [
      { id: 'tb1', name: 'x', language: 'javascript', code: 'return 1;', inputKeys: [], outputKey: 'y' },
    ],
    notes: null,
  };
}

const APPROVED_VARIABLES = [
  { name: 'client_name', type: 'short_text', alias: 'clientName', label: 'Client Name' },
  { name: 'signing_date', type: 'date', alias: 'signingDate', label: 'Signing Date' },
];

describe.sequential('Document onboarding orchestration (GH-167)', () => {
  let ctx: IntegrationTestContext;
  let otherCtx: IntegrationTestContext;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Onboarding Tenant',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    otherCtx = await setupIntegrationTest({
      tenantName: 'Foreign Onboarding Tenant',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
  });

  afterAll(async () => {
    await otherCtx.cleanup();
    await ctx.cleanup();
  });

  beforeEach(() => {
    generateWorkflowMock.mockClear();
  });

  it('overlays approved type/alias onto the generated steps, drops logic/transform blocks, and never drops an approved variable', async () => {
    generateWorkflowMock.mockResolvedValueOnce(mockGeneratedWorkflow());

    const response = await request(ctx.baseURL)
      .post('/api/ai/doc/onboarding/generate-workflow')
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        projectId: ctx.projectId,
        documentName: 'Intake.docx',
        variables: APPROVED_VARIABLES,
      })
      .expect(200);

    const generated = response.body.data;
    expect(generated.logicRules).toEqual([]);
    expect(generated.transformBlocks).toEqual([]);

    const allSteps = generated.sections.flatMap((s: { steps: unknown[] }) => s.steps) as Array<{
      alias: string;
      type: string;
      title: string;
    }>;

    // The matched-and-corrected step.
    const clientNameStep = allSteps.find((s) => s.alias === 'clientName');
    expect(clientNameStep).toBeDefined();
    expect(clientNameStep?.type).toBe('short_text');

    // The unmatched AI step survives untouched.
    const notesStep = allSteps.find((s) => s.alias === 'notes');
    expect(notesStep).toBeDefined();
    expect(notesStep?.type).toBe('short_text');

    // The variable the LLM never produced a step for was appended, not dropped.
    const signingDateStep = allSteps.find((s) => s.alias === 'signingDate');
    expect(signingDateStep).toBeDefined();
    expect(signingDateStep?.type).toBe('date');

    expect(allSteps).toHaveLength(3);
  });

  it('persists the generated workflow (unpublished), attaches the template, and writes the mapping', async () => {
    generateWorkflowMock.mockResolvedValueOnce(mockGeneratedWorkflow());

    const generateResponse = await request(ctx.baseURL)
      .post('/api/ai/doc/onboarding/generate-workflow')
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        projectId: ctx.projectId,
        documentName: 'Intake.docx',
        variables: APPROVED_VARIABLES,
      })
      .expect(200);
    const generated = generateResponse.body.data;

    // 1. Create the workflow (as the client does, before applying content).
    const createResponse = await request(ctx.baseURL)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ title: generated.title, description: generated.description, projectId: ctx.projectId })
      .expect(201);
    const workflowId = createResponse.body.id as string;

    // 2. Apply content via the existing replaceWorkflowContent path.
    await request(ctx.baseURL)
      .put(`/api/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ title: generated.title, sections: generated.sections })
      .expect(200);

    // 3. The workflow is left unpublished (Decision, Senior 2026-08-08).
    const workflowResponse = await request(ctx.baseURL)
      .get(`/api/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .expect(200);
    expect(workflowResponse.body.status).toBe('draft');

    const persistedSteps = (workflowResponse.body.sections as Array<{ steps: Array<{ alias: string; type: string }> }>)
      .flatMap((s) => s.steps);
    expect(persistedSteps.find((s) => s.alias === 'clientName')?.type).toBe('short_text');
    expect(persistedSteps.find((s) => s.alias === 'signingDate')?.type).toBe('date');

    // 4. Attach the original document as a template.
    const templateResponse = await request(ctx.baseURL)
      .post(`/api/projects/${ctx.projectId}/templates`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .attach('file', createMinimalDocx(), 'Intake.docx')
      .field('name', 'Intake.docx')
      .expect(201);
    const templateId = templateResponse.body.id as string;

    // 5. Write the field mapping -- every extracted field binds to the step
    // carrying its approved alias.
    const mapping = Object.fromEntries(
      APPROVED_VARIABLES.map((v) => [v.name, { type: 'variable', source: v.alias }])
    );
    await request(ctx.baseURL)
      .patch(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ mapping })
      .expect(200);

    const templateGetResponse = await request(ctx.baseURL)
      .get(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .expect(200);
    expect(templateGetResponse.body.mapping).toEqual(mapping);
  });

  it('rejects generation for a project belonging to a different tenant', async () => {
    const response = await request(otherCtx.baseURL)
      .post('/api/ai/doc/onboarding/generate-workflow')
      .set('Authorization', `Bearer ${otherCtx.authToken}`)
      .send({
        projectId: ctx.projectId,
        documentName: 'Intake.docx',
        variables: APPROVED_VARIABLES,
      })
      .expect(403);

    expect(String(response.body.error)).toMatch(/access denied/i);
    expect(generateWorkflowMock).not.toHaveBeenCalled();
  });

  it('rejects an empty variable list with a 400', async () => {
    await request(ctx.baseURL)
      .post('/api/ai/doc/onboarding/generate-workflow')
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ projectId: ctx.projectId, documentName: 'Intake.docx', variables: [] })
      .expect(400);
  });
});
