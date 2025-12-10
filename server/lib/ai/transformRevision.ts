import { GoogleGenerativeAI } from "@google/generative-ai";
import { TransformBlock, TransformResult } from "shared/schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

interface RevisionRequest {
    currentTransforms: TransformBlock[];
    userRequest: string;
    workflowContext: any;
}

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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    try {
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        return {
            updatedTransforms: parsed.transforms,
            diff: parsed.diff,
            explanation: parsed.explanation
        };
    } catch (e) {
        console.error("Failed to parse AI revision response", e);
        throw new Error("Failed to revise transforms");
    }
};
