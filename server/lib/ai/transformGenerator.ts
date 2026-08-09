import { z } from "zod";
import { TransformBlock } from "shared/schema";
import { logger } from "../../logger";
import { AIProviderClient } from "../../services/ai/AIProviderClient";
import { fenceUntrusted } from "../../services/ai/AIServiceUtils";
import { resolveAiProviderConfig } from "../../services/ai/providerConfig";
interface GenerationRequest {
  workflowContext: unknown;
  description: string;
  currentTransforms?: TransformBlock[];
}
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

export const generateTransforms = async (request: GenerationRequest, tenantId?: string): Promise<{
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
    const client = new AIProviderClient(resolveAiProviderConfig({ tenantId }));
    text = await client.callLLM(userPrompt, "transform_generation", systemPrompt);
  } catch (e) {
    logger.error({ err: e }, "AI Generation failed");
    // Fallback or rethrow
    return { updatedTransforms: [], explanation: ["AI generation failed"] };
  }
  try {
    // Basic JSON cleanup if markdown code blocks are used
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed: unknown = JSON.parse(cleanedText);
    
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
