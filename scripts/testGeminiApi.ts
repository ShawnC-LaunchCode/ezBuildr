import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Test script to verify Gemini API key is working correctly
 */
async function testGeminiApi() {
  console.log("🧪 Testing Gemini API connection...\n");

  // Check if API key is loaded
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ ERROR: GEMINI_API_KEY not found in environment variables");
    console.error("   Please ensure your .env file contains GEMINI_API_KEY");
    process.exit(1);
  }

  console.log("✓ API key found in environment");
  console.log(`  Key prefix: ${apiKey.substring(0, 12)}...`);
  console.log();

  try {
    // Initialize the Gemini API client
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("✓ GoogleGenerativeAI client initialized");
    console.log();

    // List available models
    console.log("🔍 Fetching list of available models...");
    try {
      const models = await genAI.listModels();
      console.log(`✓ Found ${models.length} available models:`);
      models.forEach((m: any) => {
        console.log(`   - ${m.name.replace('models/', '')} (${m.displayName || 'No display name'})`);
      });
      console.log();
    } catch (listError) {
      console.log("⚠ Could not list models, will try common model names");
      if (listError instanceof Error) {
        console.log(`  Error: ${listError.message}`);
      }
      console.log();
    }

    // Try different model names (starting with newer Gemini 2.x models)
    let model;
    let modelName = "";
    const modelsToTry = [
      "gemini-2.5-flash",      // Latest and fastest
      "gemini-2.5-flash-lite", // Lightweight version
      "gemini-2.5-pro",        // Most capable
      "gemini-2.0-flash",      // Fallback to 2.0
      "gemini-1.5-pro",        // Fallback to 1.5
      "gemini-pro"             // Legacy fallback
    ];

    console.log("🔍 Finding available model...");
    for (const testModel of modelsToTry) {
      try {
        console.log(`  Trying ${testModel}...`);
        model = genAI.getGenerativeModel({ model: testModel });
        // Test if model works with a simple call
        await model.generateContent("test");
        modelName = testModel;
        console.log(`✓ Model selected: ${modelName}`);
        break;
      } catch (e) {
        if (e instanceof Error) {
          console.log(`  ✗ ${testModel}: Not available`);
        }
      }
    }

    if (!model || !modelName) {
      throw new Error("No available Gemini models found. Your API key may not have access to Gemini models.");
    }

    console.log();

    // Test 1: Simple text generation
    console.log("📝 Test 1: Simple text generation");
    console.log("   Prompt: 'Say hello in exactly 5 words'");

    const result = await model.generateContent("Say hello in exactly 5 words");
    const response = result.response;
    const text = response.text();

    console.log(`   Response: "${text}"`);
    console.log("✅ Test 1 PASSED\n");

    // Test 2: Structured output (survey-related example)
    console.log("📊 Test 2: Survey analysis simulation");
    console.log("   Prompt: 'Analyze this survey response: \"The service was great but slow\"'");

    const surveyTest = await model.generateContent(
      'Analyze this survey response and return just the sentiment (positive, negative, or neutral): "The service was great but slow"'
    );
    const surveyResponse = surveyTest.response.text();

    console.log(`   Response: "${surveyResponse}"`);
    console.log("✅ Test 2 PASSED\n");

    // Test 3: Check rate limits and quota
    console.log("🔍 Test 3: Testing multiple requests (rate limit check)");
    for (let i = 1; i <= 3; i++) {
      const quickTest = await model.generateContent(`Count to ${i}`);
      console.log(`   Request ${i}/3: ${quickTest.response.text().substring(0, 30)}...`);
    }
    console.log("✅ Test 3 PASSED (no rate limit issues)\n");

    // Success summary
    console.log("🎉 ALL TESTS PASSED!");
    console.log("\n✅ Gemini API is configured correctly and working");
    console.log("✅ Ready to build AI-powered features");
    console.log(`\n📋 Active model: ${modelName}`);
    console.log("\n💡 Suggested features for Vault-Logic:");
    console.log("   - Automatic survey question generation");
    console.log("   - Response sentiment analysis");
    console.log("   - Text response summarization");
    console.log("   - Smart question suggestions based on survey topic");
    console.log("   - Automatic categorization of text responses");

  } catch (error) {
    console.error("\n❌ TEST FAILED!");
    console.error("\nError details:");

    if (error instanceof Error) {
      console.error(`  Message: ${error.message}`);

      // Check for common errors
      if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
        console.error("\n🔧 Issue: Invalid API key");
        console.error("   Solution: Verify your API key at https://aistudio.google.com/app/apikey");
      } else if (error.message.includes("quota") || error.message.includes("RATE_LIMIT")) {
        console.error("\n🔧 Issue: Rate limit or quota exceeded");
        console.error("   Solution: Wait a few minutes or check your quota at https://aistudio.google.com");
      } else if (error.message.includes("PERMISSION_DENIED")) {
        console.error("\n🔧 Issue: API key doesn't have permission");
        console.error("   Solution: Enable Generative Language API in Google Cloud Console");
      } else {
        console.error(`\n🔧 Full error: ${error.stack}`);
      }
    } else {
      console.error(`  Unknown error: ${error}`);
    }

    process.exit(1);
  }
}

// Run the test
testGeminiApi()
  .then(() => {
    console.log("\n✨ Test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Unexpected error:", error);
    process.exit(1);
  });
