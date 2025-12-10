import { GoogleGenerativeAI } from "@google/generative-ai";
import { TransformBlock } from "shared/schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

interface SchemaAlignRequest {
    transforms: TransformBlock[];
    documents: any[];
    workflowVariables: any[];
}

interface SchemaAlignmentResult {
    issues: string[];
    missingTransforms: TransformBlock[];
}

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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    try {
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        return {
            issues: parsed.issues,
            missingTransforms: parsed.missingTransforms
        };
    } catch (e) {
        console.error("Schema Align Error", e);
        throw new Error("Failed to align schema");
    }
};
