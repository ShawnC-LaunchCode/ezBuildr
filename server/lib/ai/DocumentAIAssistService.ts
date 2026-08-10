import { createRequire } from 'module';

import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';
import PizZip from 'pizzip';

import { logger } from "../../logger"; // Adjust path if needed (../../logger)
import { AIProviderClient } from "../../services/ai/AIProviderClient";
import { resolveAiProviderConfig } from "../../services/ai/providerConfig";

const require = createRequire(import.meta.url);
import { documentProcessingLimiter } from "../../services/processingLimiter";
import { fenceUntrusted } from "../../services/ai/AIServiceUtils";

type PdfParser = (buffer: Buffer) => Promise<{ text: string }>;

const pdfLib = require('pdf-parse') as PdfParser;

export interface AIAnalysisResult {
    variables: AnalyzedVariable[];
    suggestions: string[];
}

export interface CleanupAction {
    type: string;
    description: string;
    fix: string;
}

export interface ImprovementResult {
    aliases?: Record<string, string>;
    formatting?: Record<string, string>;
}

export interface AnalyzedVariable {
    name: string;
    confidence: number;
    source: 'explicit_tag' | 'ai_inferred';
    type?: 'text' | 'date' | 'number' | 'boolean' | 'array';
    context?: string;
}

export interface MappingSuggestion {
    templateVariable: string;
    workflowVariableId?: string;
    confidence: number;
    reason: string;
    isNew?: boolean;
    suggestedType?: string;
}

export class DocumentAIAssistService {
    private createAIClient(tenantId: string | undefined): AIProviderClient | null {
        try {
            return new AIProviderClient(resolveAiProviderConfig({ tenantId }));
        } catch {
            logger.warn("GEMINI_API_KEY not found. AI Assist Service will run in degraded mode (deterministic only).");
            return null;
        }
    }

    /**
     * Analyze a document template (DOCX/PDF/Text) to find variables and suggestions
     */
    async analyzeTemplate(filePath: string, filename: string, tenantId?: string): Promise<AIAnalysisResult> {
        // 1. Deterministic Extraction (Tags)
        const explicitVariables = await this.extractExplicitVariables(filePath, filename);

        // 2. AI Extraction (Context & Inference)
        let aiVariables: AnalyzedVariable[] = [];
        let aiSuggestions: string[] = [];

        const client = this.createAIClient(tenantId);
        if (client) {
            try {
                const textContent = await this.extractTextContent(filePath, filename);
                const aiResult = await this.performAIExtraction(textContent, client);
                aiVariables = aiResult.variables;
                aiSuggestions = aiResult.suggestions;
            } catch (err) {
                logger.error({ err }, "AI Extraction failed");
                aiSuggestions.push("AI analysis failed temporarily.");
            }
        }

        // 3. Merge Results
        // Explicit tags override inferred ones if names match
        const mergedVariables = [...explicitVariables];
        const explicitNames = new Set(explicitVariables.map(v => v.name));

        for (const aiVar of aiVariables) {
            if (!explicitNames.has(aiVar.name)) {
                mergedVariables.push(aiVar);
            }
        }

        return {
            variables: mergedVariables,
            suggestions: aiSuggestions
        };
    }

    /**
     * Suggest mappings for a list of template variables against existing workflow variables
     */
    async suggestMappings(templateVariables: Partial<AnalyzedVariable>[], workflowVariables: { id: string; name: string; label: string; type: string }[], tenantId?: string): Promise<MappingSuggestion[]> {
        const client = this.createAIClient(tenantId);
        if (!client) { return []; }

        const prompt = `
        You are a Document Automation Expert.Match the Template Variables to the Workflow Variables.
        
        Template Variables:
${fenceUntrusted(JSON.stringify(templateVariables.map(v => ({ name: v.name, context: v.context }))))}

        Workflow Variables:
${fenceUntrusted(JSON.stringify(workflowVariables.map(v => ({ id: v.id, name: v.name, label: v.label, type: v.type }))))}

        Return a JSON array of mappings.For each template variable, suggest the best workflow variable match(if any).
        If no match, suggest creating a new one(isNew: true).
    Format: [{ "templateVariable": "foo", "workflowVariableId": "bar", "confidence": 0.9, "reason": "Exact string match", "isNew": false }]
        `;

        try {
            const text = await client.callLLM(prompt, 'document_mapping');
            return (this.parseJSON(text) as MappingSuggestion[]) ?? [];
        } catch (err) {
            logger.error({ err }, "AI Mapping Suggestions failed");
            return [];
        }
    }

    /**
     * Suggest aliases, formatting, and conditions
     */
    async suggestImprovements(templateVariables: string[], tenantId?: string, _textSample?: string): Promise<ImprovementResult> {
        const client = this.createAIClient(tenantId);
        if (!client) { return {}; }

        const prompt = `
         Analyze these template variables and suggest improvements.
    Variables:
${fenceUntrusted(JSON.stringify(templateVariables))}

Requirements:
1. Aliases: camelCase suggestions for messy names(e.g. "Create Date" -> "createDate").
         2. Formatting: Suggest types(date, currency).
         
         Return JSON: { "aliases": { "Old Name": "newName" }, "formatting": { "varName": "date" } }
`;

        try {
            const text = await client.callLLM(prompt, 'document_mapping');
            return (this.parseJSON(text) as ImprovementResult) ?? {};
        } catch (err) {
            return {};
        }
    }

    /**
     * Clean up template text automatically (e.g. fix placeholders)
     * For now, this returns a list of *actions* rather than rewriting the file directly via AI, 
     * as modifying binaries via LLM is risky.
     */
    async suggestCleanupActions(filePath: string, filename: string, tenantId?: string): Promise<CleanupAction[]> {
        // Implement logic to detect split tags (using TemplateScanner logic usually)
        // and identifying "dead" fields.
        const actions: CleanupAction[] = [];

        // Example: Check for simple inconsistencies
        const text = await this.extractTextContent(filePath, filename);
        if (text.includes("{{ ")) { // Space inside
            actions.push({ type: 'syntax', description: "Found spaces in placeholders '{{ '", fix: "Normalize to '{{'" });
        }

        const client = this.createAIClient(tenantId);
        if (!client) { return actions; }

        const prompt = `
        Review this document text for placeholder syntax, formatting, or dead-field cleanup opportunities.
        Return a JSON array using this shape:
        [{ "type": "syntax", "description": "...", "fix": "..." }]

        Text Sample (first 2000 chars):
${fenceUntrusted(text.substring(0, 2000))}
`;

        try {
            const response = await client.callLLM(prompt, 'document_analysis');
            const parsed = this.parseJSON(response);
            const aiActions = Array.isArray(parsed) ? parsed as CleanupAction[] : [];
            return [...actions, ...aiActions];
        } catch (err) {
            logger.error({ err }, "AI Cleanup Suggestions failed");
        }

        return actions;
    }

    // --- Helpers ---

    private async extractExplicitVariables(filePath: string, filename: string): Promise<AnalyzedVariable[]> {
        const variables: AnalyzedVariable[] = [];

        if (filename.endsWith('.docx')) {
            try {
                const fs = await import('fs/promises');
                const buffer = await fs.readFile(filePath);

                const { validateMagicBytes } = await import('../../utils/magicBytes');
                if (!validateMagicBytes(buffer, filename)) {
                    throw new Error(`File type mismatch: ${filename}`);
                }

                const zip = new PizZip(buffer);
                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: '{{', end: '}}' }
                });

                const text = await documentProcessingLimiter.run(async () => doc.getFullText());
                const matches = text.match(/{{(.*?)}}/g);

                if (matches) {
                    matches.forEach(m => {
                        const name = m.replace('{{', '').replace('}}', '').trim();
                        // Skip specialized tags like {#...} or {/...} for now, just simple vars
                        if (!name.startsWith('#') && !name.startsWith('/') && !name.startsWith('^')) {
                            variables.push({
                                name,
                                confidence: 1.0,
                                source: 'explicit_tag',
                                type: 'text' // Default
                            });
                        }
                    });
                }

                // Dedupe
                const unique = new Map<string, AnalyzedVariable>();
                variables.forEach(v => unique.set(v.name, v));
                return Array.from(unique.values());

            } catch (e) {
                logger.warn({ error: e }, "Deterministic DOCX extraction failed");
            }
        }
        return variables;
    }

    public async extractTextContent(filePath: string, filename: string): Promise<string> {
        await checkFileSignature(filePath, filename);
        if (filename.endsWith('.docx')) {
            const result = await documentProcessingLimiter.run(() => mammoth.extractRawText({ path: filePath }));
            return result.value;
        } else if (filename.endsWith('.pdf')) {
            try {
                const fs = await import('fs/promises');
                const buffer = await fs.readFile(filePath);
                // PDFParse is a function in v1.1.1
                const data = await documentProcessingLimiter.run(() => pdfLib(buffer));
                return data.text;
            } catch (e) {
                logger.error({ error: e }, "PDF parsing failed");
                return "";
            }
        }
        // Fallback for MD/txt
        const fs = await import('fs/promises');
        return fs.readFile(filePath, 'utf-8');
    }

    private async performAIExtraction(text: string, client: AIProviderClient): Promise<{ variables: AnalyzedVariable[], suggestions: string[] }> {
        const prompt = `
        Extract potential document variables from this text.Look for:
    1. Explicit placeholders({{ ...}})
2. Form - like labels(e.g. "Client Name: _______")
3. Entities that should be variable(dates, names, addresses).

        Return JSON: { "variables": [{ "name": "...", "type": "...", "confidence": 0.0 - 1.0, "context": "..." }], "suggestions": ["..."] }
        
        Text Sample(first 2000 chars):
${fenceUntrusted(text.substring(0, 2000))}
`;

        const result = await client.callLLM(prompt, 'document_analysis');
        // Cast the unknown result to the expected shape or null-ish
        const json = this.parseJSON(result) as { variables: AnalyzedVariable[], suggestions: string[] } | null;
        return {
            variables: json?.variables ?? [],
            suggestions: json?.suggestions ?? []
        };
    }

    private parseJSON(text: string | undefined | null): unknown {
        if (!text) { return null; }
        try {
            // Strip markdown code blocks if present
            const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(clean);
        } catch (e) {
            return null;
        }
    }
}

export const documentAIAssistService = new DocumentAIAssistService();

// Helper to validate signature without loading full file if possible
async function checkFileSignature(filePath: string, filename: string): Promise<void> {
    // Import dynamically to avoid circular dep issues in some contexts, or strict dep
    const { validateMagicBytes } = await import('../../utils/magicBytes');
    const fs = await import('fs/promises');

    // Read first 4 bytes
    const handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(4);
    try {
        await handle.read(buffer, 0, 4, 0);
    } finally {
        await handle.close();
    }

    if (!validateMagicBytes(buffer, filename)) {
        throw new Error(`File type mismatch: ${filename} does not match its extension signature.`);
    }
}
