/**
 * Create a clean DOCX template without Word formatting issues
 * This ensures tags like {{firstName}} are stored as single XML elements
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import path from 'path';

// Create a minimal DOCX template with clean tags
const content = '{{firstName}} {{lastName}}';

// Minimal DOCX structure
const zip = new PizZip();

// Add required DOCX files
zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

zip.folder('word')!.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${content}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`);

// Generate DOCX file
const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

// Save to outputs directory
const outputPath = path.join(process.cwd(), 'server', 'files', 'clean-template.docx');
fs.writeFileSync(outputPath, buf);

console.log('✅ Clean template created at:', outputPath);
console.log('📝 Content:', content);
console.log('\nUpload this file as your template - it will work perfectly with docxtemplater!');
