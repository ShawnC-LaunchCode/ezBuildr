import { buildTestWhen } from "../helpers/conditionFixtures";

export const SECTION_MATRIX_WORKFLOW_ID = "10000000-0000-4000-8000-000000000001";
export const SECTION_MATRIX_RUN_ID = "10000000-0000-4000-8000-000000000002";
export const SECTION_MATRIX_VERSION_ID = "10000000-0000-4000-8000-000000000003";
export const SECTION_MATRIX_SECTION_ID = "10000000-0000-4000-8000-000000000004";
export const SECTION_MATRIX_PAGE_ID = "10000000-0000-4000-8000-000000000005";
export const SECTION_MATRIX_STEP_ID = "10000000-0000-4000-8000-000000000006";

const createdAt = "2026-08-24T00:00:00.000Z";

/**
 * The single SECT-7 parity graph. Shared, client, server, and MAP-7 tests pass
 * these exact collections to their production entry points; only the answer
 * map changes between matrix rows.
 */
export const sectionPageVisibilityFixture = {
  sections: [{
    id: SECTION_MATRIX_SECTION_ID,
    workflowId: SECTION_MATRIX_WORKFLOW_ID,
    title: "Conditional Section",
    description: null,
    visibleIf: buildTestWhen("show-section", "is_true"),
    createdAt,
  }],
  pages: [{
    id: SECTION_MATRIX_PAGE_ID,
    workflowId: SECTION_MATRIX_WORKFLOW_ID,
    sectionId: SECTION_MATRIX_SECTION_ID,
    title: "Conditional member",
    description: null,
    order: 0,
    visibleIf: buildTestWhen("show-page", "is_true"),
    config: {},
    createdAt,
    steps: [{
      id: SECTION_MATRIX_STEP_ID,
      type: "short_text",
      title: "Member question",
      description: null,
      required: true,
      config: null,
      order: 0,
      alias: null,
      isVirtual: false,
    }],
  }],
  steps: [{
    id: SECTION_MATRIX_STEP_ID,
    workflowId: SECTION_MATRIX_WORKFLOW_ID,
    pageId: SECTION_MATRIX_PAGE_ID,
    type: "short_text" as const,
    title: "Member question",
    description: null,
    required: true,
    alias: null,
    order: 0,
    isVirtual: false,
    config: null,
    createdAt,
    updatedAt: createdAt,
  }],
  rules: [],
};

export interface SectionPageVisibilityCase {
  sectionVisible: boolean;
  pageVisible: boolean;
  data: Record<string, unknown>;
  expectedVisiblePageIds: string[];
}

export const sectionPageVisibilityCases: SectionPageVisibilityCase[] = [
  {
    sectionVisible: false,
    pageVisible: false,
    data: { "show-section": false, "show-page": false },
    expectedVisiblePageIds: [],
  },
  {
    sectionVisible: false,
    pageVisible: true,
    data: { "show-section": false, "show-page": true },
    expectedVisiblePageIds: [],
  },
  {
    sectionVisible: true,
    pageVisible: false,
    data: { "show-section": true, "show-page": false },
    expectedVisiblePageIds: [],
  },
  {
    sectionVisible: true,
    pageVisible: true,
    data: { "show-section": true, "show-page": true },
    expectedVisiblePageIds: [SECTION_MATRIX_PAGE_ID],
  },
];

export const resolveSectionMatrixAlias = (name: string): string => name;
