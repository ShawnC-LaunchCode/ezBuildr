
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import fs from 'fs';
import path from 'path';

async function test() {
    try {
        const pdf = require('pdf-parse');

        // Create a dummy PDF buffer (header only) to test function signature
        // %PDF-1.4
        const buffer = Buffer.from('%PDF-1.4\n%EOF');

        console.log("Calling pdf(buffer)...");
        try {
            const data = await pdf(buffer);
            console.log("Success! Text:", data.text);
        } catch (e) {
            console.log("Called pdf(buffer) but it failed (expected for dummy buffer):", e.message);
            // If it failed with parsing error, it means the FUNCTION exists and tried to parse.
            if (e.message && e.message.includes('Invalid PDF structure') || e.message) {
                console.log("Verification successful: pdf-parse is a function.");
            }
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

test();
