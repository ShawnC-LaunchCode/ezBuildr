import { z } from "zod";
import { TransformBlock, TransformResult } from "shared/schema";
import { logger } from "../../logger";
import { AIProviderClient } from "../../services/ai/AIProviderClient";
import { fenceUntrusted } from "../../services/ai/AIServiceUtils";
import { resolveAiProviderConfig } from "../../services/ai/providerConfig";
interface RevisionRequest {
  currentTransforms: TransformBlock[];
  userRequest: string;
  workflowContext: unknown;
}

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

export const reviseTransforms = async (request: RevisionRequest, tenantId?: string): Promise<TransformResult> => {
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
    const client = new AIProviderClient(resolveAiProviderConfig({ tenantId }));
    text = await client.callLLM(userPrompt, "transform_revision", systemPrompt);
  } catch (e) {
    logger.error({ err: e }, "AI Revision Generation failed");
    throw new Error("Failed to revise transforms");
  }

  try {
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed: unknown = JSON.parse(cleanedText);
    
    const validationResult = transformResultSchema.safeParse(parsed);
    if (!validationResult.success) {
      logger.error({ errors: validationResult.error.errors }, "Generated transform revision failed schema validation");
      throw new Error("AI generated an invalid response structure");
    }

    return {
      updatedTransforms: validationResult.data.transforms as unknown as TransformBlock[],
      diff: validationResult.data.diff as TransformResult["diff"],
      explanation: validationResult.data.explanation ?? []
    };
  } catch (e) {
    logger.error({ err: e }, "Failed to parse AI revision response");
    throw new Error("Failed to revise transforms");
  }
};
