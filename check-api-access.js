// Check API access directly
const apiKey = 'AIzaSyAsO2zCDpQYpT8YYoinxmAPmd0ExJoNcjc';

console.log('Checking Gemini API access...\n');

// Test 1: List models
const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

try {
  console.log('Fetching available models from v1beta API...');
  const response = await fetch(listModelsUrl);
  const data = await response.json();

  if (!response.ok) {
    console.error('❌ API Error:');
    console.error('Status:', response.status, response.statusText);
    console.error('Response:', JSON.stringify(data, null, 2));

    if (response.status === 400 && data.error?.message?.includes('API key not valid')) {
      console.log('\n⚠️  The API key is not valid or doesn\'t have access to Generative Language API');
      console.log('Please check:');
      console.log('1. Go to https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com');
      console.log('2. Make sure the Generative Language API is ENABLED');
      console.log('3. Check your API key restrictions at https://console.cloud.google.com/apis/credentials');
    }
  } else {
    console.log('✅ API access confirmed!');
    console.log('\nAvailable models:');
    console.log(JSON.stringify(data, null, 2));
  }
} catch (error) {
  console.error('❌ Network error:', error.message);
}
