import fs from 'fs';
import path from 'path';

import dotenv from 'dotenv';

// Load .env manually to be sure
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

console.log('--- Google Auth Verification ---');
console.log('Loading .env from:', envPath);
console.log('GOOGLE_CLIENT_ID:', envConfig.GOOGLE_CLIENT_ID);
console.log('VITE_GOOGLE_CLIENT_ID:', envConfig.VITE_GOOGLE_CLIENT_ID);

const expectedId = '627899430742-ok8ul8av8fksq31251h246onaunuce8c.apps.googleusercontent.com';

if (envConfig.GOOGLE_CLIENT_ID === expectedId && envConfig.VITE_GOOGLE_CLIENT_ID === expectedId) {
    console.log('✅ SUCCESS: Client IDs match the expected value.');
} else {
    console.error('❌ FAILURE: Client IDs do NOT match the expected value.');
    console.error('Expected:', expectedId);
}
