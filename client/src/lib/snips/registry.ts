/**
 * Snips Registry
 * Local registry of available snips (hardcoded for now)
 */

import type { SnipDefinition } from "./types";

/**
 * Demo Snip: Respondent Info
 * Collects basic contact information for a respondent
 */
const respondentInfoSnip: SnipDefinition = {
    id: "snip-respondent-info-001",
    name: "RespondentInfo",
    displayName: "Respondent Information",
    description: "Collects name, address, and contact details for a respondent or client",
    version: "1.0.0",
    category: "Intake",

    pages: [
        {
            id: "page-respondent-name",
            title: "Respondent Name",
            description: "Please provide the respondent's full legal name",
            order: 0,
            questions: [
                {
                    id: "q-first-name",
                    title: "First Name",
                    type: "text",
                    required: true,
                    alias: "respondent.name.first",
                    description: "Legal first name as it appears on official documents",
                    config: { variant: "short" },
                    order: 0,
                },
                {
                    id: "q-middle-name",
                    title: "Middle Name (if applicable)",
                    type: "text",
                    required: false,
                    alias: "respondent.name.middle",
                    config: { variant: "short" },
                    order: 1,
                },
                {
                    id: "q-last-name",
                    title: "Last Name",
                    type: "text",
                    required: true,
                    alias: "respondent.name.last",
                    description: "Legal last name (surname)",
                    config: { variant: "short" },
                    order: 2,
                },
            ],
        },
        {
            id: "page-respondent-contact",
            title: "Contact Information",
            description: "How can we reach the respondent?",
            order: 1,
            questions: [
                {
                    id: "q-email",
                    title: "Email Address",
                    type: "text",
                    required: true,
                    alias: "respondent.contact.email",
                    description: "Primary email for correspondence",
                    config: { variant: "short" },
                    order: 0,
                },
                {
                    id: "q-phone",
                    title: "Phone Number",
                    type: "text",
                    required: true,
                    alias: "respondent.contact.phone",
                    description: "Best phone number to reach you",
                    config: { variant: "short" },
                    order: 1,
                },
                {
                    id: "q-address-street",
                    title: "Street Address",
                    type: "text",
                    required: true,
                    alias: "respondent.address.street",
                    config: { variant: "short" },
                    order: 2,
                },
                {
                    id: "q-address-city",
                    title: "City",
                    type: "text",
                    required: true,
                    alias: "respondent.address.city",
                    config: { variant: "short" },
                    order: 3,
                },
                {
                    id: "q-address-state",
                    title: "State",
                    type: "text",
                    required: true,
                    alias: "respondent.address.state",
                    description: "Two-letter state abbreviation (e.g., CA, NY)",
                    config: { variant: "short" },
                    order: 4,
                },
                {
                    id: "q-address-zip",
                    title: "ZIP Code",
                    type: "text",
                    required: true,
                    alias: "respondent.address.zip",
                    config: { variant: "short" },
                    order: 5,
                },
            ],
        },
    ],

    metadata: {
        createdAt: "2024-12-15T00:00:00Z",
        updatedAt: "2024-12-15T00:00:00Z",
        author: "VaultLogic Team",
    },
};

/**
 * All available snips registry
 */
export const SNIPS_REGISTRY: SnipDefinition[] = [
    respondentInfoSnip,
];

/**
 * Get all available snips
 */
export function getAllSnips(): SnipDefinition[] {
    return SNIPS_REGISTRY;
}

/**
 * Get a snip by ID
 */
export function getSnipById(snipId: string): SnipDefinition | undefined {
    return SNIPS_REGISTRY.find(snip => snip.id === snipId);
}

/**
 * Get snips by category
 */
export function getSnipsByCategory(category: string): SnipDefinition[] {
    return SNIPS_REGISTRY.filter(snip => snip.category === category);
}
