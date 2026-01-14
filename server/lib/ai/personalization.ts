
import { GoogleGenerativeAI } from "@google/generative-ai";

import { type UserPersonalizationSettings, type WorkflowPersonalizationSettings } from '../../../shared/schema';

// Types for input
interface PersonalizationContext {
    userSettings: UserPersonalizationSettings;
    workflowSettings?: WorkflowPersonalizationSettings;
    userAnswers?: Record<string, any>;
    currentBlock?: any; // Todo: Type this properly
}

export class PersonalizationService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("GEMINI_API_KEY is not set. Personalization will be disabled.");
        }
        this.genAI = new GoogleGenerativeAI(apiKey || "");
        const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
        this.model = this.genAI.getGenerativeModel({ model });
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
      
      Original Text: "${originalText}"
      
      User Preferences:
      - Tone: ${tone}
      - Reading Level: ${readingLevel}
      - Verbosity: ${verbosity}
      - Language: ${language}
      
      Output ONLY the rewritten text. Do not add quotes or explanations.
    `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            return text.trim();
        } catch (error) {
            console.error("Personalization AI Error:", error);
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
       
       Question: "${questionText}"
       
       Target Audience Preferences:
       - Tone: ${tone}
       - Reading Level: ${readingLevel}
       - Language: ${language}
       
       Keep it concise and helpful. Return plain text.
     `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error("Help Gen AI Error:", error);
            return "Unable to generate help text at this time.";
        }
    }

    async generateClarification(
        questionText: string,
        userAnswer: string,
        context: PersonalizationContext
    ): Promise<string | null> {
        if (!context.userSettings.allowAIClarification) {return null;}

        const prompt = `
        The user provided an unclear or ambiguous answer to a question.
        Generate a polite clarification request.
        
        Question: "${questionText}"
        User Answer: "${userAnswer}"
        
        If the answer is actually clear enough, return "CLEAR".
        Otherwise, ask the user to clarify or choose from options if applicable.
        
        Language: ${context.userSettings.language}
      `;

        try {
            const result = await this.model.generateContent(prompt);
            const text = result.response.text().trim();
            return text === "CLEAR" ? null : text;
        } catch (error) {
            return null;
        }
    }

    async generateFollowUp(
        questionText: string,
        userAnswer: string,
        context: PersonalizationContext
    ): Promise<{ text: string, type: 'text' | 'yes_no' } | null> {
        const prompt = `
        Analyze the user's answer to see if a follow-up question is needed to get more specific details.
        
        Question: "${questionText}"
        User Answer: "${userAnswer}"
        
        If a follow-up is relevant, provide it in JSON format: { "text": "...", "type": "text" | "yes_no" }.
        If no follow-up is needed, return "NO".
       `;

        try {
            const result = await this.model.generateContent(prompt);
            const text = result.response.text().trim();
            if (text.includes("NO")) {return null;}

            // Clean json block if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            return null;
        }
    }

    async translateText(text: string, targetLanguage: string): Promise<string> {
        if (targetLanguage === 'en') {return text;}

        const prompt = `Translate the following text to ${targetLanguage}. Return only the translation.\n\nText: "${text}"`;
        try {
            const result = await this.model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error) {
            console.error("Translation Error:", error);
            return text;
        }
    }
}

export const personalizationService = new PersonalizationService();
