import { type GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";

import { type UserPersonalizationSettings, type WorkflowPersonalizationSettings } from '../../../shared/schema';
import { logger } from "../../logger";
import { fenceUntrusted } from "../../services/ai/AIServiceUtils";

// Types for input
interface PersonalizationContext {
    userSettings: UserPersonalizationSettings;
    workflowSettings?: WorkflowPersonalizationSettings;
    userAnswers?: Record<string, unknown>;
    currentBlock?: unknown;
}

export class PersonalizationService {
    private genAI: GoogleGenerativeAI | null = null;
    private model: GenerativeModel | null = null;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logger.warn("GEMINI_API_KEY is not set. Personalization will be disabled.");
        }

        if (process.env.NODE_ENV !== 'test_without_mock') {
            try {
                this.genAI = new GoogleGenerativeAI(apiKey ?? "");
                const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
                this.model = this.genAI.getGenerativeModel({ model });
            } catch (e) {
                logger.warn({ err: e }, "Failed to initialize GoogleGenerativeAI (likely mock issue in tests)");
                this.model = null;
            }
        } else {
            this.genAI = new GoogleGenerativeAI(apiKey ?? "");
            const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
            this.model = this.genAI.getGenerativeModel({ model });
        }
    }

    private async generateText(prompt: string): Promise<string> {
        if (!this.model) {
            throw new Error("Personalization AI is unavailable");
        }

        const result = await this.model.generateContent(prompt);
        return result.response.text().trim();
    }

    async rewriteBlockText(
        originalText: string,
        context: PersonalizationContext
    ): Promise<string> {
        if (!context.userSettings.allowAdaptivePrompts) {
            return originalText;
        }

        const { tone, readingLevel, verbosity, language } = context.userSettings;

        const prompt = `
      Rewrite the following survey question text to match the user's preferences.
      
      Original Text:
${fenceUntrusted(originalText)}
      
      User Preferences:
      - Tone: ${tone}
      - Reading Level: ${readingLevel}
      - Verbosity: ${verbosity}
      - Language: ${language}
      
      Output ONLY the rewritten text. Do not add quotes or explanations.
        `;

        try {
            return await this.generateText(prompt);
        } catch (error) {
            logger.error({ err: error }, "Personalization AI Error");
            return originalText; // Fallback
        }
    }

    async generateHelpText(
        questionText: string,
        context: PersonalizationContext
    ): Promise<string> {
        const { tone, readingLevel, language } = context.userSettings;

        const prompt = `
       Provide a helpful explanation for why the following question is being asked, and tips for how to answer it.
       
       Question:
${fenceUntrusted(questionText)}
       
       Target Audience Preferences:
       - Tone: ${tone}
       - Reading Level: ${readingLevel}
       - Language: ${language}
       
       Keep it concise and helpful. Return plain text.
     `;

        try {
            return await this.generateText(prompt);
        } catch (error) {
            logger.error({ err: error }, "Help Gen AI Error");
            return "Unable to generate help text at this time.";
        }
    }

    async generateClarification(
        questionText: string,
        userAnswer: string,
        context: PersonalizationContext
    ): Promise<string | null> {
        if (!context.userSettings.allowAIClarification) { return null; }

        const prompt = `
        The user provided an unclear or ambiguous answer to a question.
        Generate a polite clarification request.
        
        Question:
${fenceUntrusted(questionText)}

        User Answer:
${fenceUntrusted(userAnswer)}
        
        If the answer is actually clear enough, return "CLEAR".
        Otherwise, ask the user to clarify or choose from options if applicable.
        
        Language: ${context.userSettings.language}
      `;

        try {
            const text = await this.generateText(prompt);
            return text === "CLEAR" ? null : text;
        } catch (error) {
            return null;
        }
    }

    async generateFollowUp(
        questionText: string,
        userAnswer: string,
        _context: PersonalizationContext
    ): Promise<{ text: string, type: 'text' | 'yes_no' } | null> {
        const prompt = `
        Analyze the user's answer to see if a follow-up question is needed to get more specific details.
        
        Question:
${fenceUntrusted(questionText)}

        User Answer:
${fenceUntrusted(userAnswer)}
        
        If a follow-up is relevant, provide it in JSON format: { "text": "...", "type": "text" | "yes_no" }.
        If no follow-up is needed, return "NO".
       `;

        try {
            const text = await this.generateText(prompt);
            if (text.includes("NO")) { return null; }

            // Clean json block if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed: unknown = JSON.parse(jsonStr);
            if (
                typeof parsed !== "object"
                || parsed === null
                || !("text" in parsed)
                || typeof parsed.text !== "string"
                || !("type" in parsed)
                || (parsed.type !== "text" && parsed.type !== "yes_no")
            ) {
                return null;
            }

            return { text: parsed.text, type: parsed.type };
        } catch (error) {
            return null;
        }
    }

    async translateText(text: string, targetLanguage: string): Promise<string> {
        if (targetLanguage === 'en') { return text; }

        const prompt = `Translate the following text to ${targetLanguage}. Return only the translation.\n\nText:\n${fenceUntrusted(text)}`;
        try {
            return await this.generateText(prompt);
        } catch (error) {
            logger.error({ err: error }, "Translation Error");
            return text;
        }
    }
}

export const personalizationService = new PersonalizationService();
