/**
 * UI Label Constants
 * Centralized labels for Section → Page terminology
 * Backend still uses "sections" but UI shows "Pages"
 */

export const UI_LABELS = {
  // Primary labels
  PAGE: "Page",
  PAGES: "Pages",
  QUESTION: "Question",
  QUESTIONS: "Questions",
  LOGIC: "Logic",
  LOGIC_BLOCK: "Logic Block",

  // Actions
  ADD_PAGE: "Add Page",
  ADD_QUESTION: "Add Question",
  ADD_LOGIC: "Add Logic",
  DELETE_PAGE: "Delete Page",
  PAGE_SETTINGS: "Page Settings",

  // Descriptions
  PAGE_DESCRIPTION: "A page groups related questions and logic blocks",
  QUESTION_DESCRIPTION: "Input field that collects data from participants",
  LOGIC_DESCRIPTION: "Transform, validate, or branch based on collected data",

  // Empty states
  NO_PAGES: "No pages yet. Create your first page to get started.",
  NO_QUESTIONS: "Add your first question or logic block",

  // Block types (friendly names)
  BLOCK_TYPE_PREFILL: "Prefill Data",
  BLOCK_TYPE_VALIDATE: "Validate Input",
  BLOCK_TYPE_BRANCH: "Branch Logic",
  BLOCK_TYPE_JS: "JS Transform",
} as const;

export type UILabel = keyof typeof UI_LABELS;
