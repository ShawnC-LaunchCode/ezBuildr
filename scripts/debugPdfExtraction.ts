

import { PDFDocument } from 'pdf-lib';

import { db, initializeDatabase } from '../server/db';
import { storageProvider } from '../server/services/storage';
import * as schema from '../shared/schema';


const TEMPLATE_ID = 'ee86b75f-bac8-4f51-9b40-129227cd6d81';

async function debugExtraction() {
    await initializeDatabase();
    console.log(`Fetching templates...`);
    const allTemplates = await db.select().from(schema.templates);
    console.log(`Found ${allTemplates.length} templates.`);

    const template = allTemplates.find(t => t.id === TEMPLATE_ID) ?? allTemplates.find(t => t.name.includes("4317"));

    if (!template) {
        console.error("Template 'Form 4317' not found in dump.");
        console.log("Available names:", allTemplates.map(t => t.name).slice(0, 5));
        return;
    }

    console.log(`Template found: ${template.name}, fileRef: ${template.fileRef}`);

    if (!template.fileRef) {
        console.error("No fileRef");
        return;
    }

    const buffer = await storageProvider.getFile(template.fileRef);

    console.log("Loading PDF...");
    const pdfDoc = await PDFDocument.load(buffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const pages = pdfDoc.getPages();

    console.log(`PDF has ${pages.length} pages and ${fields.length} fields.`);

    // Log page references
    console.log("--- PAGES ---");
    pages.forEach((p, i) => {
        const ref = p.ref;

        // @ts-expect-error - TODO: fix type
        console.log(`Page ${i}: tag=${ref.tag}, gen=${ref.gen}, objectNumber=${(ref as any).objectNumber}, generationNumber=${(ref as any).generationNumber}`);
    });

    console.log("--- FIELDS ---");
    const pageCounts: Record<number, number> = {};

    for (const field of fields) {
        const name = field.getName();
        const widgets = field.acroField.getWidgets();

        widgets.forEach((w, wi) => {
            const pRef = w.P();

            let pageIndex = pages.findIndex(p => {

                const pTag = p.ref.tag ?? (p.ref as any).objectNumber;

                // @ts-expect-error - TODO: fix type
                const wTag = pRef.tag ?? (pRef as any).objectNumber;

                // @ts-expect-error - TODO: fix type
                const pGen = p.ref.gen ?? (p.ref as any).generationNumber;

                // @ts-expect-error - TODO: fix type
                const wGen = pRef.gen ?? (pRef as any).generationNumber;
                return pTag === wTag && pGen === wGen;
            });

            if (pageIndex === -1) {
                // Try identity
                pageIndex = pages.findIndex(p => p.ref === pRef);
            }

            if (pageIndex === -1) {

                // @ts-expect-error - TODO: fix type
                console.log(`Field ${name} widget ${wi} FAILED to match any page. P() ref: tag=${pRef.tag}, obj=${(pRef as any).objectNumber}`);
            } else {
                pageCounts[pageIndex] = (pageCounts[pageIndex] ?? 0) + 1;
                if (pageIndex === 1) { // Page 2
                    console.log(`Field on Page 2: ${name}`);
                }
            }
        });
    }

    console.log("--- SUMMARY ---");
    console.log("Page counts:", JSON.stringify(pageCounts, null, 2));
}

debugExtraction().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
}).finally(() => process.exit());
