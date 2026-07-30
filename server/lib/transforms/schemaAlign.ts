/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

import { TransformBlock } from "shared/schema";
import { logger } from "../../logger";
import { fenceUntrusted } from "../../services/ai/AIServiceUtils";

interface SchemaAlignRequest {
    transforms: TransformBlock[];
    documents: unknown[];
    workflowVariables: unknown[];
}

interface SchemaAlignmentResult {
    issues: string[];
    missingTransforms: TransformBlock[];
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
            // Env-driven with a registry-known default; no hardcoded model pin (ICW-13).
            model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
            systemInstruction: { role: "system", parts: [{ text: systemPrompt }] }
        });
    } catch (e) {
        logger.warn({ err: e }, "Failed to init AI model in schemaAlign");
        if (process.env.NODE_ENV === 'test') {
            return {
                generateContent: async () => ({
                    response: { text: () => "{ \"issues\": [], \"missingTransforms\": [] }" }
                })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
            } as any;
        }
        throw e;
    }
};

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

export const alignSchema = async (request: SchemaAlignRequest): Promise<SchemaAlignmentResult> => {
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
        const model = getModel(systemPrompt);
        const result = await model.generateContent(userPrompt);
        const response = result.response;
        text = response.text();
    } catch (e) {
        logger.error({ err: e }, "Schema Align AI Error");
        throw new Error("Failed to align schema");
    }

    try {
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        
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
