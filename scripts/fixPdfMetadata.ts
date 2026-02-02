import { eq } from 'drizzle-orm';

import { db, initializeDatabase } from '../server/db';
import { logger } from '../server/logger';
import { getPdfFieldExtractor } from '../server/services/document/extractors/PdfFieldExtractor';
import { LocalStorageProvider } from '../server/services/storage/LocalStorageProvider';
import * as schema from '../shared/schema';

// Hardcoded template ID from user logs
const TEMPLATE_ID = 'ee86b75f-bac8-4f51-9b40-129227cd6d81';
// Wait, the log said `blob:http://localhost:5000/ee86...`. Is that the template ID?
// User request Step 32: `GET http://localhost:5000/api/sections/4471a74b...`
// Let's search for the template first.

async function fixTemplate() {
    await initializeDatabase();
    console.log('Searching for templates...');
    // We'll search by checking which one has fields.
    // Actually, let's just list all templates and update all of them? 
    // Or just the one the user is looking at.
    // The user uploaded `uploaded_image_1766432690146.png` showing Form 4317.
    // We can search for a template named "4317" or similar.

    // Use 'templates' table
    const templateList = await db.select().from(schema.templates);

    console.log(`Found ${templateList.length} templates.`);

    const storage = new LocalStorageProvider();

    for (const template of templateList) {
        console.log(`Processing template: ${template.name} (${template.id})`);

        // To keep this script simple and self-contained, I might need to import the storage service too.

        if (!template.fileRef) {
            console.log('No fileRef, skipping.');
            continue;
        }

        try {
            console.log(`Downloading file from storage: ${template.fileRef}`);
            const buffer = await storage.download(template.fileRef);

            console.log('Extracting fields...');
            const extractor = getPdfFieldExtractor();
            const metadata = await extractor.extract(buffer);

            console.log(`Extracted ${metadata.fields.length} fields.`);
            const pageIndices = new Set(metadata.fields.map(f => f.pageIndex));
            console.log('Page indices found:', Array.from(pageIndices));

            // Update the template
            await db.update(schema.templates)
                .set({
                    metadata: metadata,
                    updatedAt: new Date()
                })
                .where(eq(schema.templates.id, template.id));

            console.log('Updated template metadata.');
        } catch (err) {
            console.error('Failed to process template:', err);
        }
    }
}

fixTemplate().then(() => {
    console.log('Done.');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
