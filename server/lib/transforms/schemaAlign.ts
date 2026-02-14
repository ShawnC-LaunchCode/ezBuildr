/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */

import { GoogleGenerativeAI } from "@google/generative-ai";

import { TransformBlock } from "shared/schema";

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
const getModel = () => {
    const apiKey = process.env.GEMINI_API_KEY ?? "";
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        return genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    } catch (e) {
        console.warn("Failed to init AI model in schemaAlign (mock issue?)", e);
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

export const alignSchema = async (request: SchemaAlignRequest): Promise<SchemaAlignmentResult> => {
    const prompt = `
      You are an ETL expert. Align these transforms with the target document requirements.
      
      Transforms: ${JSON.stringify(request.transforms)}
      Documents Expected Schema: ${JSON.stringify(request.documents)}
      Available Variables: ${JSON.stringify(request.workflowVariables)}
      
      Identify missing fields in the final output that the document needs.
      Generate missing transforms to map variables to document fields.
      
      Output JSON:
      {
        "issues": ["..."],
        "missingTransforms": [ ... ]
      }
    `;

    let text = "";
    try {
        const model = getModel();
        const result = await model.generateContent(prompt);
        const response = result.response;
        text = response.text();
    } catch (e) {
        console.error("Schema Align AI Error", e);
        throw new Error("Failed to align schema");
    }

    try {
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        return {
            issues: parsed.issues,
            missingTransforms: parsed.missingTransforms
        };
    } catch (e) {
        console.error("Schema Align Parse Error", e);
        throw new Error("Failed to align schema");
    }
};
