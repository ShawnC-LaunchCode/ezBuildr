// Quick test script to verify Gemini API key
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyAsO2zCDpQYpT8YYoinxmAPmd0ExJoNcjc';

console.log('Testing Gemini API with key:', apiKey.substring(0, 10) + '...');

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

try {
  console.log('Sending test prompt to gemini-2.5-flash...');
  const result = await model.generateContent('Say "Hello World" and nothing else.');
  const response = result.response;
  const text = response.text();

  console.log('✅ SUCCESS! Gemini API is working');
  console.log('Response:', text);
  process.exit(0);
} catch (error) {
  console.error('❌ FAILED! Gemini API error:');
  console.error('Status:', error.status);
  console.error('Message:', error.message);
  console.error('Full error:', JSON.stringify(error, null, 2));
  process.exit(1);
}
