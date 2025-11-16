/**
 * UI Label Constants
 * PR3: Updated to use "Section" terminology consistently
 * Backend uses "sections" and UI now shows "Sections" (previously "Pages")
 */

export const UI_LABELS = {
  // Primary labels
  PAGE: "Section",  // Updated: Page → Section
  PAGES: "Sections",  // Updated: Pages → Sections
  SECTION: "Section",  // Alias for clarity
  SECTIONS: "Sections",  // Alias for clarity
  QUESTION: "Question",
  QUESTIONS: "Questions",
  STEP: "Step",  // Alternative term for Questions
  STEPS: "Steps",
  LOGIC: "Logic",
  LOGIC_BLOCK: "Logic Block",

  // Actions
  ADD_PAGE: "Add Section",  // Updated: Add Page → Add Section
  ADD_SECTION: "Add Section",  // Alias
  ADD_QUESTION: "Add Question",
  ADD_LOGIC: "Add Logic",
  DELETE_PAGE: "Delete Section",  // Updated: Delete Page → Delete Section
  DELETE_SECTION: "Delete Section",  // Alias
  PAGE_SETTINGS: "Section Settings",  // Updated: Page Settings → Section Settings
  SECTION_SETTINGS: "Section Settings",  // Alias

  // Descriptions
  PAGE_DESCRIPTION: "A section groups related questions and logic blocks",  // Updated
  SECTION_DESCRIPTION: "A section groups related questions and logic blocks",  // Alias
  QUESTION_DESCRIPTION: "Input field that collects data from participants",
  LOGIC_DESCRIPTION: "Transform, validate, or branch based on collected data",

  // Empty states
  NO_PAGES: "No sections yet. Create your first section to get started.",  // Updated
  NO_SECTIONS: "No sections yet. Create your first section to get started.",  // Alias
  NO_QUESTIONS: "Add your first question or logic block",

  // Block types (friendly names for workflow blocks - NOT sections)
  BLOCK_TYPE_PREFILL: "Prefill Data",
  BLOCK_TYPE_VALIDATE: "Validate Input",
  BLOCK_TYPE_BRANCH: "Branch Logic",
  BLOCK_TYPE_JS: "JS Transform",
} as const;

export type UILabel = keyof typeof UI_LABELS;
