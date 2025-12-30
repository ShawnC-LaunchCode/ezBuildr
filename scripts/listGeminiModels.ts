
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("GEMINI_API_KEY not found");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Dummy init to access model manager if needed, but SDK has direct listModels usually on manager? 
        // Actually the SDK doesn't expose listModels directly on the top level class in all versions.
        // Let's try to use the verify script instead or write a simple fetch.

        // Using fetch for raw listing to be safe
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        if (data.models) {
            console.log("\n--- BEGIN MODEL LIST ---");
            for (const m of data.models) {
                console.log(m.name);
            }
            console.log("--- END MODEL LIST ---\n");
        } else {
            console.log("ERROR:", JSON.stringify(data));
        }

    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
