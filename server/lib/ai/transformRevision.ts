/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { GoogleGenerativeAI } from "@google/generative-ai";

import { TransformBlock, TransformResult } from "shared/schema";
import { logger } from "../../logger";

interface RevisionRequest {
  currentTransforms: TransformBlock[];
  userRequest: string;
  workflowContext: unknown;
}

// Lazy initialization helper
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getModel = () => {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
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

export const reviseTransforms = async (request: RevisionRequest): Promise<TransformResult> => {
  const prompt = `
    You are an ETL expert for VaultLogic.
    Your goal is to REVISE existing data transformations based on the user's request.
    
    Context:
    Workflow Structure: ${JSON.stringify(request.workflowContext, null, 2)}
    Current Transforms: ${JSON.stringify(request.currentTransforms, null, 2)}
    
    User Revision Request: "${request.userRequest}"
    
    Instructions:
    1. Identify what needs to change.
    2. Keep existing valid transforms unless asked to remove/change them.
    3. Output the FULL new list of transforms.
    4. Provide a diff summary and explain the changes.

    Available Transform Types: map, rename, compute, conditional, loop, script.

    Output JSON format:
    {
      "transforms": [ ... ],
      "diff": {
        "added": ["name_of_added_block"],
        "removed": ["name_of_removed_block"],
        "modified": ["name_of_modified_block"],
        "details": {
             "blockName": { "before": ..., "after": ... }
        }
      },
      "explanation": ["Point 1", "Point 2"]
    }
  `;

  let text = "";
  try {
    const model = getModel();
    const result = await model.generateContent(prompt);
    const response = result.response;
    text = response.text();
  } catch (e) {
    logger.error({ err: e }, "AI Revision Generation failed");
    throw new Error("Failed to revise transforms");
  }

  try {
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanedText);
    return {
      updatedTransforms: parsed.transforms,
      diff: parsed.diff,
      explanation: parsed.explanation
    };
  } catch (e) {
    logger.error({ err: e }, "Failed to parse AI revision response");
    throw new Error("Failed to revise transforms");
  }
};
