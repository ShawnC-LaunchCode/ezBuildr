
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root using process.cwd()
dotenv.config({ path: path.join(process.cwd(), '.env') });

const apiKey = process.env.GOOGLE_PLACES_API_KEY;

if (apiKey) {
    console.log('✅ GOOGLE_PLACES_API_KEY is set.');
    // validate length or prefix if possible without revealing it
    if (apiKey.startsWith('AIza')) {
        console.log('✅ Key format looks correct (starts with AIza).');
    } else {
        console.warn('⚠️ Key format does not look like a standard Google API key (should start with AIza).');
        console.warn(`Actual start: ${apiKey.substring(0, 5)}...`);
    }
} else {
    console.error('❌ GOOGLE_PLACES_API_KEY is NOT set in the environment.');
}
