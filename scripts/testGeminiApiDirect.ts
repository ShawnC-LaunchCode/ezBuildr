import dotenv from "dotenv";
dotenv.config();

/**
 * Direct HTTP test of Gemini API
 * This bypasses the SDK to see raw API responses
 */
async function testGeminiApiDirect() {
  console.log("🧪 Testing Gemini API with direct HTTP requests...\n");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY not found");
    process.exit(1);
  }

  console.log("✓ API key found");
  console.log(`  Key: ${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 4)}\n`);

  // Test 1: List models using v1 API
  console.log("📋 Test 1: List available models (v1 API)");
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    const listResponse = await fetch(listUrl);
    const listData = await listResponse.json();

    if (!listResponse.ok) {
      console.error(`❌ Error ${listResponse.status}:`);
      console.error(JSON.stringify(listData, null, 2));
      throw new Error("Failed to list models");
    }

    console.log(`✓ Found ${listData.models?.length || 0} models:`);
    if (listData.models) {
      listData.models.forEach((m: any) => {
        console.log(`   - ${m.name}`);
        console.log(`     Display: ${m.displayName}`);
        console.log(`     Methods: ${m.supportedGenerationMethods?.join(', ') || 'none'}`);
      });
    }
    console.log();

    // Test 2: Try generating content with the first available model
    const availableModels = listData.models || [];
    const generateModel = availableModels.find((m: any) =>
      m.supportedGenerationMethods?.includes('generateContent')
    );

    if (!generateModel) {
      console.error("❌ No models support generateContent");
      process.exit(1);
    }

    console.log(`📝 Test 2: Generate content with ${generateModel.name}`);
    const generateUrl = `https://generativelanguage.googleapis.com/v1/${generateModel.name}:generateContent?key=${apiKey}`;
    const generateResponse = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: "Say hello in exactly 5 words"
          }]
        }]
      })
    });

    const generateData = await generateResponse.json();

    if (!generateResponse.ok) {
      console.error(`❌ Error ${generateResponse.status}:`);
      console.error(JSON.stringify(generateData, null, 2));
      throw new Error("Failed to generate content");
    }

    console.log("✓ Response received:");
    const text = generateData.candidates?.[0]?.content?.parts?.[0]?.text || "No text in response";
    console.log(`   "${text}"`);
    console.log();

    console.log("🎉 ALL TESTS PASSED!");
    console.log("\n✅ Gemini API is working correctly");
    console.log(`✅ Active model: ${generateModel.name.replace('models/', '')}`);
    console.log("\n💡 Ready to integrate AI features into Vault-Logic!");

  } catch (error) {
    console.error("\n❌ TEST FAILED!");
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

testGeminiApiDirect();
