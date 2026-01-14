import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

import { TransformBlock, transformBlockTypeEnum } from "shared/schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

interface GenerationRequest {
    workflowContext: any; // Simplified workflow context
    description: string;
    currentTransforms?: TransformBlock[];
}

export const generateTransforms = async (request: GenerationRequest): Promise<{
    updatedTransforms: Partial<TransformBlock>[];
    explanation: string[];
}> => {
    const prompt = `
    You are an ETL expert for VaultLogic.
    Your goal is to generate data transformation blocks based on the user's natural language request.
    
    Context:
    Workflow Structure: ${JSON.stringify(request.workflowContext, null, 2)}
    Current Transforms: ${JSON.stringify(request.currentTransforms || [], null, 2)}
    
    User Request: "${request.description}"
    
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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    try {
        // Basic JSON cleanup if markdown code blocks are used
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        return {
            updatedTransforms: parsed.transforms,
            explanation: parsed.transforms.map((t: any) => t.explanation)
        };
    } catch (e) {
        console.error("Failed to parse AI response", e);
        throw new Error("Failed to generate transforms");
    }
};
