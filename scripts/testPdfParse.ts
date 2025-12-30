
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function test() {
    try {
        const pdfLib = require('pdf-parse');
        console.log("PDFParse class:", pdfLib.PDFParse);

        try {
            const parser = new pdfLib.PDFParse();
            console.log("Parser instance created.");
            console.log("Methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(parser)));
        } catch (err) {
            console.error("Could not instantiate PDFParse:", err);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

test();
