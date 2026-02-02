
import fs from 'fs/promises';
import path from 'path';

import { PDFDocument, PDFTextField } from 'pdf-lib';

import { pdfService } from '../server/services/document/PdfService';

async function run() {
    console.log('Testing PdfService...');

    try {
        // 1. Create a dummy PDF with a field
        console.log('Creating sample PDF...');
        const doc = await PDFDocument.create();
        const page = doc.addPage([500, 500]);
        const form = doc.getForm();
        const textField = form.createTextField('test_field');
        textField.setText('Initial Value');
        textField.addToPage(page, { x: 50, y: 400, width: 200, height: 50 });

        const pdfBytes = await doc.save();
        const inputBuffer = Buffer.from(pdfBytes);
        console.log('Sample PDF created, size:', inputBuffer.length);

        // 2. Test Unlock
        console.log('Testing unlockPdf...');
        const unlocked = await pdfService.unlockPdf(inputBuffer);
        console.log('Unlock result size:', unlocked.length);

        // 3. Test Extract Fields
        console.log('Testing extractFields...');
        const metadata = await pdfService.extractFields(unlocked);
        console.log('Metadata:', JSON.stringify(metadata, null, 2));

        if (metadata.fields.length !== 1 || metadata.fields[0].name !== 'test_field') {
            throw new Error('Field extraction failed or returned wrong data');
        }

        // 4. Test Fill
        console.log('Testing fillPdf...');
        const filled = await pdfService.fillPdf(unlocked, { 'test_field': 'Filled Value' });
        console.log('Filled PDF size:', filled.length);

        console.log('✅ PdfService Tests Passed!');
    } catch (error) {
        console.error('❌ PdfService Test Failed:', error);
        process.exit(1);
    }
}

run();
