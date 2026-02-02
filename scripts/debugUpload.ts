
import fs from 'fs';
import path from 'path';

import axios from 'axios';
import FormData from 'form-data';

async function run() {
    console.log('Starting upload debug script...');

    // Create a dummy PDF file
    const pdfPath = path.resolve('temp_test.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/MediaBox [0 0 612 792]\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\n>>\n>>\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Hello World) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000157 00000 n\n0000000302 00000 n\ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n400\n%%EOF');

    const form = new FormData();
    form.append('file', fs.createReadStream(pdfPath));
    form.append('name', 'Debug PDF Upload');

    const projectId = 'c5abc0ed-347f-412c-8643-5424ce9bc338'; // From user logs

    // We need a valid session to test this properly, but for 400 Bad Request which happens early,
    // let's see if we can trigger it. Since we don't have auth cookies easily, 
    // we might get 401 instead. 
    // IF we get 401, it means the request IS formatted correctly enough to pass parsing?
    // Actually, Multer runs before Auth? No, `upload.single` is first in the list in `templates.ts`.
    // Wait: router.post(..., upload.single('file'), hybridAuth, ...)
    // So Multer runs FIRST. If Multer rejects it, we get an error before Auth.

    try {
        const response = await axios.post(`http://localhost:5000/api/projects/${projectId}/templates`, form, {
            headers: {
                ...form.getHeaders()
            },
            validateStatus: () => true // parse all status codes
        });

        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response) {
            console.log('Response data:', error.response.data);
        }
    } finally {
        fs.unlinkSync(pdfPath);
    }
}

run();
