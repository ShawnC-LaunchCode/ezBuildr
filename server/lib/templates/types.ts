import type { WorkflowContentData } from "../../services/WorkflowContentIngestService";

export interface TemplateManifest {
    id?: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    version: string;
    author: string;

    // Technical requirements
    minCompatibleVersion: string;
    requiredBlocks: string[]; // e.g. ['signature_block', 'multi_field']
    requiredFeatures: string[]; // e.g. ['email_integration']

    // The workflow structure — the same pages/steps/logicRules runtime
    // snapshot shape stored in `workflow_versions.graphJson` (see
    // `WorkflowContentIngestService`, `RunDefinitionProvider`'s
    // `VersionRuntimeSchema`, and TM-1's `generateMarketplaceBundles.ts`,
    // which all agree on this shape).
    workflow: WorkflowContentData;

    // Assets (base64 encoded for simplicity in v1)
    thumbnail?: string;

    isPublic?: boolean;

    createdAt: string;
}
