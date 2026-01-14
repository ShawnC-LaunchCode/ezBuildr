/**
 * Snips Type Definitions
 * Data model for reusable workflow fragments
 */

import type { ConditionExpression } from "@shared/types/conditions";

import type { StepType } from "../vault-api";

export interface SnipDefinition {
    id: string;              // UUID
    name: string;            // PascalCase, e.g., "RespondentInfo"
    displayName: string;     // Human-readable, e.g., "Respondent Information"
    description: string;     // What this snip provides
    version: string;         // Semantic version: "1.0.0"
    category?: string;       // Optional grouping: "Intake", "Financial", etc.

    pages: SnipPage[];       // Pages/sections to import
    logicBlocks?: SnipLogicBlock[];  // Optional logic blocks
    templateAttachments?: string[];  // Reserved for future use

    metadata: {
        createdAt: string;
        updatedAt: string;
        author?: string;
    };
}

export interface SnipPage {
    id: string;              // Stable ID (NOT used after import; replaced by new UUID)
    title: string;
    description?: string;
    order: number;

    questions: SnipQuestion[];
    visibleIf?: ConditionExpression;  // Optional page-level logic
}

export interface SnipQuestion {
    id: string;              // Stable ID (replaced on import)
    title: string;
    type: StepType;
    required: boolean;
    alias: string;           // Dot notation: "respondent.name.first"
    description?: string;
    options?: any;
    defaultValue?: any;
    visibleIf?: ConditionExpression;
    order: number;
}

export interface SnipLogicBlock {
    id: string;
    type: "read" | "write" | "js" | "validate";
    phase: "onSectionEnter" | "onSectionSubmit";
    config: any;
    sectionIndex: number;    // Which snip page this attaches to
    order: number;
}

export interface SnipImportRequest {
    snipId: string;
    aliasMappings?: Record<string, string>;  // Map old aliases to new ones
}

export interface SnipImportResult {
    importedPageIds: string[];
    importedQuestionIds: string[];
    aliasCollisions?: string[];          // List of aliases that had collisions
    appliedMappings?: Record<string, string>;  // Original -> renamed mappings
    snipVersion?: string;                // Version of snip that was imported
    hadCollisions?: boolean;             // Quick check if any collisions occurred
}

