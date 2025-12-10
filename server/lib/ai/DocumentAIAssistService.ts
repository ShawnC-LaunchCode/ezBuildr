
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../../logger"; // Adjust path if needed (../../logger)
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';

export interface AIAnalysisResult {
    variables: AnalyzedVariable[];
    suggestions: string[];
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
    private genAI: GoogleGenerativeAI | null = null;
    private model: any;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        } else {
            logger.warn("GEMINI_API_KEY not found. AI Assist Service will run in degraded mode (deterministic only).");
        }
    }

    /**
     * Analyze a document template (DOCX/PDF/Text) to find variables and suggestions
     */
    async analyzeTemplate(buffer: Buffer, filename: string): Promise<AIAnalysisResult> {
        // 1. Deterministic Extraction (Tags)
        const explicitVariables = await this.extractExplicitVariables(buffer, filename);

        // 2. AI Extraction (Context & Inference)
        let aiVariables: AnalyzedVariable[] = [];
        let aiSuggestions: string[] = [];

        if (this.model) {
            try {
                const textContent = await this.extractTextContent(buffer, filename);
                const aiResult = await this.performAIExtraction(textContent);
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
    async suggestMappings(templateVariables: Partial<AnalyzedVariable>[], workflowVariables: any[]): Promise<MappingSuggestion[]> {
        if (!this.model) return [];

        const prompt = `
        You are a Document Automation Expert. Match the Template Variables to the Workflow Variables.
        
        Template Variables:
        ${JSON.stringify(templateVariables.map(v => ({ name: v.name, context: v.context })))}

        Workflow Variables:
        ${JSON.stringify(workflowVariables.map(v => ({ id: v.id, name: v.name, label: v.label, type: v.type })))}

        Return a JSON array of mappings. For each template variable, suggest the best workflow variable match (if any).
        If no match, suggest creating a new one (isNew: true).
        Format: [{ "templateVariable": "foo", "workflowVariableId": "bar", "confidence": 0.9, "reason": "Exact string match", "isNew": false }]
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const text = result.response.text();
            return this.parseJSON(text) || [];
        } catch (err) {
            logger.error({ err }, "AI Mapping Suggestions failed");
            return [];
        }
    }

    /**
     * Suggest aliases, formatting, and conditions
     */
    async suggestImprovements(templateVariables: string[], textSample?: string): Promise<any> {
        if (!this.model) return {};

        const prompt = `
         Analyze these template variables and suggest improvements.
         Variables: ${JSON.stringify(templateVariables)}
         
         Requirements:
         1. Aliases: camelCase suggestions for messy names (e.g. "Create Date" -> "createDate").
         2. Formatting: Suggest types (date, currency).
         
         Return JSON: { "aliases": { "Old Name": "newName" }, "formatting": { "varName": "date" } }
         `;

        try {
            const result = await this.model.generateContent(prompt);
            return this.parseJSON(result.response.text());
        } catch (err) {
            return {};
        }
    }

    /**
     * Clean up template text automatically (e.g. fix placeholders)
     * For now, this returns a list of *actions* rather than rewriting the file directly via AI, 
     * as modifying binaries via LLM is risky.
     */
    async suggestCleanupActions(buffer: Buffer, filename: string): Promise<any[]> {
        // Implement logic to detect split tags (using TemplateScanner logic usually)
        // and identifying "dead" fields.
        const actions = [];

        // Example: Check for simple inconsistencies
        const text = await this.extractTextContent(buffer, filename);
        if (text.includes("{{ ")) { // Space inside
            actions.push({ type: 'syntax', description: "Found spaces in placeholders '{{ '", fix: "Normalize to '{{'" });
        }

        return actions;
    }

    // --- Helpers ---

    private async extractExplicitVariables(buffer: Buffer, filename: string): Promise<AnalyzedVariable[]> {
        const variables: AnalyzedVariable[] = [];

        if (filename.endsWith('.docx')) {
            try {
                const zip = new PizZip(buffer);
                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: '{{', end: '}}' }
                });

                const text = doc.getFullText();
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
                const unique = new Map();
                variables.forEach(v => unique.set(v.name, v));
                return Array.from(unique.values());

            } catch (e) {
                logger.warn({ error: e }, "Deterministic DOCX extraction failed");
            }
        }
        return variables;
    }

    private async extractTextContent(buffer: Buffer, filename: string): Promise<string> {
        if (filename.endsWith('.docx')) {
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        }
        return buffer.toString('utf-8'); // Fallback for MD/txt
    }

    private async performAIExtraction(text: string): Promise<{ variables: AnalyzedVariable[], suggestions: string[] }> {
        const prompt = `
        Extract potential document variables from this text. Look for:
        1. Explicit placeholders ({{...}})
        2. Form-like labels (e.g. "Client Name: _______")
        3. Entities that should be variable (dates, names, addresses).

        Return JSON: { "variables": [{ "name": "...", "type": "...", "confidence": 0.0-1.0, "context": "..." }], "suggestions": ["..."] }
        
        Text Sample (first 2000 chars):
        ${text.substring(0, 2000)}
        `;

        const result = await this.model.generateContent(prompt);
        const json = this.parseJSON(result.response.text());
        return {
            variables: json?.variables || [],
            suggestions: json?.suggestions || []
        };
    }

    private parseJSON(text: string): any {
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
