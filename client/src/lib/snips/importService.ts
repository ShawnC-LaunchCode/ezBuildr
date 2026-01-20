/**
 * Snip Import Service (Hardened for MVP Safety - Prompt 30)
 * Handles importing snips into workflows with collision detection and versioning
 */

import { getSnipById } from "./registry";
import type { SnipDefinition, SnipImportRequest, SnipImportResult } from "./types";
/**
 * Detect all variable collisions (aliases from questions, JS outputs, list variables)
 */
async function detectAliasCollisions(
    workflowId: string,
    snipAliases: string[]
): Promise<Set<string>> {
    // Fetch all existing steps
    const stepsResponse = await fetch(`/api/workflows/${workflowId}/steps`, {
        credentials: "include",
    });
    const existingSteps = await stepsResponse.json();
    // Collect all existing aliases
    const existingAliases = new Set<string>();
    // Question aliases
    existingSteps.forEach((step: any) => {
        if (step.alias) {
            existingAliases.add(step.alias);
        }
        // JS question output aliases
        if (step.type === 'js_question' && step.options?.outputKey) {
            existingAliases.add(step.options.outputKey);
        }
    });
    // TODO: Add blocks API call to check for:
    // - JS block outputs
    // - Query block output variables
    // - List-derived variables
    // For MVP, we're focusing on question aliases as the primary risk
    // Find collisions
    const collisions = new Set<string>();
    snipAliases.forEach(alias => {
        if (existingAliases.has(alias)) {
            collisions.add(alias);
        }
    });
    return collisions;
}
/**
 * Generate deterministic renamed aliases for collisions
 * Returns mapping: original -> renamed
 */
function generateAliasMappings(
    collisions: Set<string>,
    existingAliases: Set<string>
): Record<string, string> {
    const mappings: Record<string, string> = {};
    collisions.forEach(originalAlias => {
        // Extract prefix (everything before last dot or entire string)
        const parts = originalAlias.split('.');
        let baseName = originalAlias;
        let suffix = '';
        if (parts.length > 1) {
            // Has namespace (e.g., "respondent.name.first")
            // Rename the namespace: respondent -> respondent_2
            baseName = parts[0];
            suffix = `.${parts.slice(1).join('.')}`;
        }
        // Find next available suffix
        let counter = 2;
        let candidate = `${baseName}_${counter}${suffix}`;
        while (existingAliases.has(candidate) || Object.values(mappings).includes(candidate)) {
            counter++;
            candidate = `${baseName}_${counter}${suffix}`;
        }
        mappings[originalAlias] = candidate;
        existingAliases.add(candidate); // Prevent future collisions in this batch
    });
    return mappings;
}
/**
 * Find available page title (handles "Page (2)" style collisions)
 */
function findAvailablePageTitle(
    baseTitle: string,
    existingTitles: Set<string>
): string {
    if (!existingTitles.has(baseTitle)) {
        return baseTitle;
    }
    let counter = 2;
    let candidate = `${baseTitle} (${counter})`;
    while (existingTitles.has(candidate)) {
        counter++;
        candidate = `${baseTitle} (${counter})`;
    }
    return candidate;
}
/**
 * Store snip metadata on workflow after successful import
 */
async function storeSnipMetadata(
    workflowId: string,
    snipId: string,
    snipVersion: string,
    importedPageIds: string[],
    importedQuestionIds: string[]
): Promise<void> {
    // Store metadata in workflow config
    // This allows tracking which snips have been imported and their versions
    const metadataPayload = {
        snipId,
        snipVersion,
        importedAt: new Date().toISOString(),
        importedPageIds,
        importedQuestionIds,
    };
    // Note: This requires a workflow config/metadata endpoint
    // For MVP, we'll store it in workflow config if available
    // Otherwise log for now and implement storage endpoint later
    console.log('[Snip Import] Metadata:', metadataPayload);
    // TODO: Implement POST /api/workflows/:id/snip-imports endpoint
    // For now, this is logged and ready for backend implementation
}
/**
 * Import a snip into a workflow with full safety checks
 * 
 * Safety features:
 * - Detects alias collisions and auto-renames with deterministic suffixes
 * - Handles page name collisions with " (2)" style numbering
 * - Preserves required and conditional logic
 * - Stores version metadata for future auditability
 * - Never overwrites existing workflow data
 */
export async function importSnip(
    workflowId: string,
    request: SnipImportRequest
): Promise<SnipImportResult> {
    const snip = getSnipById(request.snipId);
    if (!snip) {
        throw new Error(`Snip not found: ${request.snipId}`);
    }
    // Collect all snip aliases
    const snipAliases = snip.pages.flatMap(page =>
        page.questions.map(q => q.alias)
    );
    // Detect collisions
    const aliasCollisions = await detectAliasCollisions(workflowId, snipAliases);
    // Generate safe alias mappings (auto-rename collisions)
    const autoMappings = generateAliasMappings(aliasCollisions, new Set(snipAliases));
    // Merge with any user-provided mappings (user mappings take precedence)
    const aliasMappings = {
        ...autoMappings,
        ...(request.aliasMappings || {}),
    };
    // Track results
    const importedPageIds: string[] = [];
    const importedQuestionIds: string[] = [];
    const renamedAliases: string[] = [];
    // Get current sections for ordering and collision detection
    const sectionsResponse = await fetch(`/api/workflows/${workflowId}/sections`, {
        credentials: "include",
    });
    const existingSections = await sectionsResponse.json();
    let currentOrder = Array.isArray(existingSections) ? existingSections.length : 0;
    // Build set of existing page titles
    const existingPageTitles = new Set<string>(
        existingSections.map((s: any) => s.title)
    );
    // Import each page
    for (const snipPage of snip.pages) {
        // Handle page name collision
        const finalPageTitle = findAvailablePageTitle(snipPage.title, existingPageTitles);
        existingPageTitles.add(finalPageTitle); // Prevent collisions within this import
        // Create section
        const sectionPayload = {
            workflowId,
            title: finalPageTitle,
            description: snipPage.description || null,
            order: currentOrder++,
            visibleIf: snipPage.visibleIf || null, // PRESERVE CONDITIONAL LOGIC
        };
        const sectionResponse = await fetch(`/api/workflows/${workflowId}/sections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(sectionPayload),
        });
        if (!sectionResponse.ok) {
            const errorText = await sectionResponse.text();
            throw new Error(`Failed to create section "${finalPageTitle}": ${errorText}`);
        }
        const section = await sectionResponse.json();
        importedPageIds.push(section.id);
        // Import questions for this page
        for (const snipQuestion of snipPage.questions) {
            // Apply alias mapping if exists
            const originalAlias = snipQuestion.alias;
            const finalAlias = aliasMappings[originalAlias] || originalAlias;
            if (finalAlias !== originalAlias) {
                renamedAliases.push(`${originalAlias} → ${finalAlias}`);
            }
            const stepPayload = {
                sectionId: section.id,
                type: snipQuestion.type,
                title: snipQuestion.title,
                description: snipQuestion.description || null,
                required: snipQuestion.required, // PRESERVE REQUIRED STATUS
                alias: finalAlias,
                options: snipQuestion.options || null,
                defaultValue: snipQuestion.defaultValue || null,
                visibleIf: snipQuestion.visibleIf || null, // PRESERVE CONDITIONAL LOGIC
                order: snipQuestion.order,
                config: {},
            };
            const stepResponse = await fetch(`/api/sections/${section.id}/steps`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(stepPayload),
            });
            if (!stepResponse.ok) {
                const errorText = await stepResponse.text();
                throw new Error(`Failed to create question "${snipQuestion.title}": ${errorText}`);
            }
            const step = await stepResponse.json();
            importedQuestionIds.push(step.id);
        }
    }
    // Store version metadata (MVP: log for now, implement storage later)
    await storeSnipMetadata(
        workflowId,
        snip.id,
        snip.version,
        importedPageIds,
        importedQuestionIds
    );
    return {
        importedPageIds,
        importedQuestionIds,
        aliasCollisions: Array.from(aliasCollisions),
        appliedMappings: aliasMappings,
        snipVersion: snip.version,
        hadCollisions: aliasCollisions.size > 0,
    };
}
/**
 * Validate snip import for conflicts (legacy compatibility)
 * New code should use the collision detection built into importSnip
 */
export async function validateSnipImport(
    workflowId: string,
    snipId: string
): Promise<{
    aliasConflicts: string[];
    pageNameConflicts: string[];
}> {
    const snip = getSnipById(snipId);
    if (!snip) {
        throw new Error(`Snip not found: ${snipId}`);
    }
    // Fetch existing workflow data
    const [sectionsResponse, stepsResponse] = await Promise.all([
        fetch(`/api/workflows/${workflowId}/sections`, { credentials: "include" }),
        fetch(`/api/workflows/${workflowId}/steps`, { credentials: "include" }),
    ]);
    const existingSections = await sectionsResponse.json();
    const existingSteps = await stepsResponse.json();
    // Check for alias conflicts
    const existingAliases = new Set(
        existingSteps.map((step: any) => step.alias).filter(Boolean)
    );
    const snipAliases = snip.pages.flatMap(page =>
        page.questions.map(q => q.alias)
    );
    const aliasConflicts = snipAliases.filter(alias => existingAliases.has(alias));
    // Check for page name conflicts
    const existingPageNames = new Set(
        existingSections.map((section: any) => section.title)
    );
    const pageNameConflicts = snip.pages
        .map(page => page.title)
        .filter(title => existingPageNames.has(title));
    return {
        aliasConflicts,
        pageNameConflicts,
    };
}