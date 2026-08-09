import { z } from "zod";

import { TransformBlock } from "shared/schema";
import { logger } from "../../logger";
import { AIProviderClient } from "../../services/ai/AIProviderClient";
import { fenceUntrusted } from "../../services/ai/AIServiceUtils";
import { resolveAiProviderConfig } from "../../services/ai/providerConfig";

interface SchemaAlignRequest {
    transforms: TransformBlock[];
    documents: unknown[];
    workflowVariables: unknown[];
}

interface SchemaAlignmentResult {
    issues: string[];
    missingTransforms: TransformBlock[];
}

const schemaAlignResultSchema = z.object({
    issues: z.array(z.string()),
    missingTransforms: z.array(
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

export const alignSchema = async (request: SchemaAlignRequest, tenantId?: string): Promise<SchemaAlignmentResult> => {
    const systemPrompt = `
      You are an ETL expert. Align these transforms with the target document requirements.
      
      Identify missing fields in the final output that the document needs.
      Generate missing transforms to map variables to document fields.
      
      Output JSON:
      {
        "issues": ["..."],
        "missingTransforms": [ 
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
      Transforms: ${fenceUntrusted(JSON.stringify(request.transforms))}
      Documents Expected Schema: ${fenceUntrusted(JSON.stringify(request.documents))}
      Available Variables: ${fenceUntrusted(JSON.stringify(request.workflowVariables))}
    `;

    let text = "";
    try {
        const client = new AIProviderClient(resolveAiProviderConfig({ tenantId }));
        text = await client.callLLM(userPrompt, "transform_schema_align", systemPrompt);
    } catch (e) {
        logger.error({ err: e }, "Schema Align AI Error");
        throw new Error("Failed to align schema");
    }

    try {
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed: unknown = JSON.parse(cleanedText);
        
        const validationResult = schemaAlignResultSchema.safeParse(parsed);
        if (!validationResult.success) {
            logger.error({ errors: validationResult.error.errors }, "Generated schema alignment failed schema validation");
            throw new Error("AI generated an invalid response structure");
        }

        return {
            issues: validationResult.data.issues,
            missingTransforms: validationResult.data.missingTransforms as unknown as TransformBlock[]
        };
    } catch (e) {
        logger.error({ err: e }, "Schema Align Parse Error");
        throw new Error("Failed to align schema");
    }
};
