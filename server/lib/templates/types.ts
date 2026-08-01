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

    // The workflow structure
    workflow: unknown; // The exported workflow schema

    // Assets (base64 encoded for simplicity in v1)
    thumbnail?: string;

    isPublic?: boolean;

    createdAt: string;
}
