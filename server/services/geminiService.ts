/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

import { logger } from "../logger";
import { fenceUntrusted } from "./ai/AIServiceUtils";

const sentimentResponseSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string()
});

/**
 * Service for Google Gemini AI integration
 * Handles AI-powered analytics and insights
 */
export class GeminiService {
  private genAI!: GoogleGenerativeAI;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Gemini model type is not publicly exported
  private model!: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Allow instantiation without API key in all environments
      // Methods will throw errors if called without proper configuration
      logger.info("GEMINI_API_KEY not configured - AI features will be unavailable");
      return;
    }

    if (process.env.NODE_ENV !== 'test_without_mock') {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Use configurable Gemini model from env, fallback to gemini-2.0-flash
        const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
        this.model = this.genAI.getGenerativeModel({ model });
      } catch (e) {
        logger.warn({ err: e }, "Failed to initialize GoogleGenerativeAI in GeminiService (likely mock issue in tests)");
        this.model = null; // Mark as uninitialized
      }
    } else {
      // Normal initialization if we are somehow here
      this.genAI = new GoogleGenerativeAI(apiKey);
      const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
      this.model = this.genAI.getGenerativeModel({ model });
    }
  }

  /**
   * Check if the service is properly initialized
   */
  private ensureInitialized(): void {
    if (!this.model) {
      throw new Error("GEMINI_API_KEY not configured - AI features are unavailable");
    }
  }

  /**
   * Quick sentiment analysis for text responses
   */
  async analyzeSentiment(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    confidence: number;
    reasoning: string;
  }> {
    this.ensureInitialized();

    const systemPrompt = `Analyze the sentiment of this text and respond in JSON format.
Respond with:
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "confidence": 0-100,
  "reasoning": "brief explanation"
}`;

    let result;
    try {
      const model = this.genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
        systemInstruction: { role: "system", parts: [{ text: systemPrompt }] }
      });
      result = await model.generateContent(`Text: "${fenceUntrusted(text)}"`);
    } catch (e) {
      // Fallback if genAI model creation fails (e.g. in some mock setups)
      const prompt = `${systemPrompt}\n\nText: "${fenceUntrusted(text)}"`;
      result = await this.model.generateContent(prompt);
    }
    
    const response = result.response.text();

    // Parse JSON response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const validation = sentimentResponseSchema.safeParse(parsed);
        if (validation.success) {
          return validation.data;
        }
      }
    } catch (e) {
      // Fallback if JSON parsing fails
    }

    // Fallback response
    return {
      sentiment: 'neutral',
      confidence: 0,
      reasoning: 'Unable to parse AI response',
    };
  }
}

// Export singleton instance
export const geminiService = new GeminiService();
