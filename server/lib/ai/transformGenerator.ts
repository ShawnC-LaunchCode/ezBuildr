/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { GoogleGenerativeAI } from "@google/generative-ai";

import { z } from "zod";
import { TransformBlock } from "shared/schema";
import { logger } from "../../logger";
import { fenceUntrusted } from "../../services/ai/AIServiceUtils";
interface GenerationRequest {
  workflowContext: unknown;
  description: string;
  currentTransforms?: TransformBlock[];
}
// Lazy initialization helper
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getModel = (systemPrompt: string) => {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] }
    });
  } catch (e) {
    logger.warn({ err: e }, "Failed to init AI model in transformGenerator");
    // Return a mock-compatible object or throw
    if (process.env.NODE_ENV === 'test') {
      return {
        generateContent: async () => ({
          response: { text: () => "{ \"transforms\": [] }" }
        })
      } as unknown as ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
    }
    throw e;
  }
};

const transformResponseSchema = z.object({
  transforms: z.array(
    z.object({
      type: z.enum(["map", "rename", "compute", "conditional", "loop", "script"]),
      name: z.string(),
      inputPaths: z.array(z.string()).optional(),
      outputPath: z.string().optional(),
      config: z.record(z.unknown()).optional(),
      explanation: z.string().optional(),
    })
  )
});

export const generateTransforms = async (request: GenerationRequest): Promise<{
  updatedTransforms: Partial<TransformBlock>[];
  explanation: string[];
}> => {
  const systemPrompt = `
    You are an ETL expert for VaultLogic.
    Your goal is to generate data transformation blocks based on the user's natural language request.
    Available Transform Types:
    - map: Simple value mapping
    - rename: Rename a key
    - compute: Mathematical or string computation
    - conditional: If/Else logic
    - loop: Iterate over array
    - script: Custom JS code (use sparingly, prefer structured types)
    Output JSON format:
    {
      "transforms": [
        {
          "type": "...",
          "name": "...",
          "inputPaths": ["..."],
          "outputPath": "...",
          "config": { ... },
          "explanation": "..."
        }
      ]
    }
  `;

  const userPrompt = `
    Context:
    Workflow Structure: ${fenceUntrusted(JSON.stringify(request.workflowContext))}
    Current Transforms: ${fenceUntrusted(JSON.stringify(request.currentTransforms ?? []))}
    User Request: "${fenceUntrusted(request.description)}"
  `;

  let text = "";
  try {
    const model = getModel(systemPrompt);
    const result = await model.generateContent(userPrompt);
    const response = result.response;
    text = response.text();
  } catch (e) {
    logger.error({ err: e }, "AI Generation failed");
    // Fallback or rethrow
    return { updatedTransforms: [], explanation: ["AI generation failed"] };
  }
  try {
    // Basic JSON cleanup if markdown code blocks are used
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanedText);
    
    // Strict Schema Validation
    const validationResult = transformResponseSchema.safeParse(parsed);
    if (!validationResult.success) {
      logger.error({ errors: validationResult.error.errors }, "Generated transforms failed schema validation");
      return { updatedTransforms: [], explanation: ["Failed to generate safe transforms"] };
    }

    return {
      updatedTransforms: validationResult.data.transforms as Partial<TransformBlock>[],
      explanation: validationResult.data.transforms.map((t) => t.explanation ?? "")
    };
  } catch (e) {
    logger.error({ err: e }, "Failed to parse AI response");
    throw new Error("Failed to generate transforms");
  }
};