// List all available Gemini models
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyDkeugzM3--nvNM3AzIcqajhU4IP1rnBXQ';

console.log('Fetching available Gemini models...\n');

const genAI = new GoogleGenerativeAI(apiKey);

try {
  const models = await genAI.listModels();

  console.log('✅ Available models:');
  console.log('='.repeat(50));

  for await (const model of models) {
    console.log(`\nModel: ${model.name}`);
    console.log(`  Display Name: ${model.displayName}`);
    console.log(`  Description: ${model.description || 'N/A'}`);
    console.log(`  Supported Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
  }

  process.exit(0);
} catch (error) {
  console.error('❌ Error listing models:', error.message);
  process.exit(1);
}
