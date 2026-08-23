/**
 * UI Label Constants
 * PR3: Updated to use "Page" terminology consistently
 * Backend uses "pages" and UI now shows "Pages" (previously "Pages")
 */

export const UI_LABELS = {
  // Primary labels
  PAGE: "Page",
  PAGES: "Pages",
  QUESTION: "Question",
  QUESTIONS: "Questions",
  STEP: "Step",
  STEPS: "Steps",
  LOGIC: "Logic",
  LOGIC_BLOCK: "Logic Block",

  // Actions
  ADD_PAGE: "Add Page", // Alias using Page now
  ADD_QUESTION: "Add Question",
  ADD_LOGIC: "Add Action",
  DELETE_PAGE: "Delete Page", // Alias
  PAGE_SETTINGS: "Page Settings", // Alias

  // Descriptions
  PAGE_DESCRIPTION: "A page groups related questions and logic blocks",
  QUESTION_DESCRIPTION: "Input field that collects data from participants",
  LOGIC_DESCRIPTION: "Transform, validate, or branch based on collected data",

  // Empty states
  NO_PAGES: "No pages yet. Create your first page to get started.",
  NO_QUESTIONS: "Add your first question or logic block",

  // Block types (friendly names for workflow blocks - NOT pages)
  BLOCK_TYPE_PREFILL: "Prefill Data",
  BLOCK_TYPE_VALIDATE: "Validate Input",
  BLOCK_TYPE_BRANCH: "Branch Logic",
  BLOCK_TYPE_JS: "JS Transform",
} as const;

export type UILabel = keyof typeof UI_LABELS;
