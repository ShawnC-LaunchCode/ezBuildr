/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { GoogleGenerativeAI } from "@google/generative-ai";

import { z } from "zod";
import { TransformBlock, TransformResult } from "shared/schema";
import { logger } from "../../logger";
import { fenceUntrusted } from "./AIServiceUtils";
interface RevisionRequest {
  currentTransforms: TransformBlock[];
  userRequest: string;
  workflowContext: unknown;
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
    logger.warn({ err: e }, "Failed to init AI model in transformRevision");
    if (process.env.NODE_ENV === 'test') {
      return {
        generateContent: async () => ({
          response: { text: () => "{ \"transforms\": [], \"diff\": {}, \"explanation\": [] }" }
        })
      } as unknown as ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
    }
    throw e;
  }
};

const transformResultSchema = z.object({
  transforms: z.array(
    z.object({
      type: z.enum(["map", "rename", "compute", "conditional", "loop", "script"]),
      name: z.string(),
      inputPaths: z.array(z.string()).optional(),
      outputPath: z.string().optional(),
      config: z.record(z.unknown()).optional(),
      explanation: z.string().optional(),
    })
  ),
  diff: z.object({
    added: z.array(z.string()).optional(),
    removed: z.array(z.string()).optional(),
    modified: z.array(z.string()).optional(),
    details: z.record(z.unknown()).optional(),
  }).optional(),
  explanation: z.array(z.string()).optional(),
});

export const reviseTransforms = async (request: RevisionRequest): Promise<TransformResult> => {
  const systemPrompt = `
    You are an ETL expert for VaultLogic.
    Your goal is to REVISE existing data transformations based on the user's request.
    
    Instructions:
    1. Identify what needs to change.
    2. Keep existing valid transforms unless asked to remove/change them.
    3. Output the FULL new list of transforms.
    4. Provide a diff summary and explain the changes.

    Available Transform Types: map, rename, compute, conditional, loop, script.

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
      ],
      "diff": {
        "added": ["name_of_added_block"],
        "removed": ["name_of_removed_block"],
        "modified": ["name_of_modified_block"],
        "details": {
             "blockName": { "before": "...", "after": "..." }
        }
      },
      "explanation": ["Point 1", "Point 2"]
    }
  `;

  const userPrompt = `
    Context:
    Workflow Structure: ${fenceUntrusted(JSON.stringify(request.workflowContext))}
    Current Transforms: ${fenceUntrusted(JSON.stringify(request.currentTransforms))}
    
    User Revision Request: "${fenceUntrusted(request.userRequest)}"
  `;

  let text = "";
  try {
    const model = getModel(systemPrompt);
    const result = await model.generateContent(userPrompt);
    const response = result.response;
    text = response.text();
  } catch (e) {
    logger.error({ err: e }, "AI Revision Generation failed");
    throw new Error("Failed to revise transforms");
  }

  try {
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanedText);
    
    const validationResult = transformResultSchema.safeParse(parsed);
    if (!validationResult.success) {
      logger.error({ errors: validationResult.error.errors }, "Generated transform revision failed schema validation");
      throw new Error("AI generated an invalid response structure");
    }

    return {
      updatedTransforms: validationResult.data.transforms as TransformBlock[],
      diff: validationResult.data.diff as TransformResult["diff"],
      explanation: validationResult.data.explanation ?? []
    };
  } catch (e) {
    logger.error({ err: e }, "Failed to parse AI revision response");
    throw new Error("Failed to revise transforms");
  }
};
