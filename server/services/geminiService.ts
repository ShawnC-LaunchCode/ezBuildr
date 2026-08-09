import { z } from "zod";

import { AIProviderClient } from "./ai/AIProviderClient";
import { fenceUntrusted } from "./ai/AIServiceUtils";
import { resolveAiProviderConfig } from "./ai/providerConfig";

const sentimentResponseSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string()
});

const NEUTRAL_FALLBACK = {
  sentiment: 'neutral' as const,
  confidence: 0,
  reasoning: 'Unable to parse AI response',
};

/**
 * Service for AI-powered analytics and insights.
 */
export class GeminiService {
  /**
   * Quick sentiment analysis for text responses.
   */
  async analyzeSentiment(text: string, tenantId?: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    confidence: number;
    reasoning: string;
  }> {
    const systemPrompt = `Analyze the sentiment of this text and respond in JSON format.
Respond with:
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "confidence": 0-100,
  "reasoning": "brief explanation"
}`;
    const prompt = `Text: "${fenceUntrusted(text)}"`;
    const client = new AIProviderClient(resolveAiProviderConfig({ tenantId }));
    const response = await client.callLLM(
      prompt,
      'sentiment_analysis',
      systemPrompt,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed: unknown = JSON.parse(jsonMatch[0]);
        const validation = sentimentResponseSchema.safeParse(parsed);
        if (validation.success) {
          return validation.data;
        }
      }
    } catch {
      return NEUTRAL_FALLBACK;
    }

    return NEUTRAL_FALLBACK;
  }
}

export const geminiService = new GeminiService();
