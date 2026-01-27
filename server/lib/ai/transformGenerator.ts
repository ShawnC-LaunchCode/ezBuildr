import { GoogleGenerativeAI } from "@google/generative-ai";

import { TransformBlock } from "shared/schema";
interface GenerationRequest {
  workflowContext: any; // Simplified workflow context
  description: string;
  currentTransforms?: TransformBlock[];
}
// Lazy initialization helper
const getModel = () => {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  } catch (e) {
    console.warn("Failed to init AI model (mock issue?)", e);
    // Return a mock-compatible object or throw
    if (process.env.NODE_ENV === 'test') {
      return {
        generateContent: async () => ({
          response: { text: () => "{ \"transforms\": [] }" }
        })
      } as any;
    }
    throw e;
  }
};
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
  let text = "";
  try {
    const model = getModel();
    const result = await model.generateContent(prompt);
    const response = result.response;
    text = response.text();
  } catch (e) {
    console.error("AI Generation failed", e);
    // Fallback or rethrow
    return { updatedTransforms: [], explanation: ["AI generation failed"] };
  }
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