# Document Automation Process Audit

I have reviewed the entire document automation pipeline, focusing on the generation of DOCX and PDF files via the Final Block processor (`FinalBlockRenderer.ts`, `DocumentEngine.ts`, `EnhancedDocumentEngine.ts`, `ZipBundler.ts`, `PdfConverter.ts`, `docxHelpers.ts`, etc.). 

Below are the identified weak points and failure scenarios, formulated as actionable tickets.

---

## 🎟️ TICKET-001: High Memory Consumption (OOM Risk) in ZipBundler
**Severity:** HIGH
**Component:** `ZipBundler.ts`
**Description:** 
The `ZipBundler` reads all document buffers into memory before zipping. The current safety limits allow a `MAX_TOTAL_SIZE` of 200MB. When generating a ZIP, Node will hold the 200MB in raw buffers, pass them to `PizZip` (which creates its own internal representations), and then generate the compressed output buffer. This can easily cause a single request to consume 500MB - 600MB of heap memory. On constrained environments (like Railway with 512MB RAM), a moderately sized bundle—or just a few concurrent requests—will immediately crash the Node server with an Out Of Memory (OOM) exception.
**Recommendation:**
- Refactor `ZipBundler.ts` to use a streaming zip library (like `archiver`) instead of `PizZip` for bundling. 
- Stream files directly from the disk into the ZIP archive and pipe the output to the response or disk, avoiding loading full file buffers into memory.

## 🎟️ TICKET-002: In-Memory File Cleanup Leak
**Severity:** MEDIUM
**Component:** `FinalBlockRenderer.ts`
**Description:** 
`scheduleCleanup` uses `setTimeout(..., 1 hour)` to delete generated temporary documents. If the server crashes, restarts, or deploys within that 1-hour window, the memory timers are wiped out. The files will remain orphaned on the disk forever, eventually leading to disk space exhaustion.
**Recommendation:**
- Implement a robust cleanup strategy, such as a cron job that runs periodically (e.g., hourly) and uses `fs.stat` to delete files in the `archives/` and `outputs/` directories older than a configured threshold.

## 🎟️ TICKET-003: Puppeteer Process Zombie State and Hangs
**Severity:** HIGH
**Component:** `PdfConverter.ts`
**Description:** 
`PuppeteerStrategy` shares a single `browserPromise`. If the headless Chrome instance enters a zombie state, hangs, or crashes without explicitly rejecting the promise, the promise retains a broken browser reference. All subsequent PDF conversion requests will hang indefinitely or fail. Additionally, `page.setContent()` and `page.pdf()` have no explicit timeouts configured, relying on Puppeteer's default 30s timeout which doesn't guarantee the browser will recover.
**Recommendation:**
- Add health checks or a mechanism to detect and respawn a dead/hanging shared browser instance.
- Explicitly enforce tight timeouts on `page.setContent` and `page.pdf`.
- Use a pool of browser contexts or externalize PDF generation to a microservice/Gotenberg to isolate process crashes from the main Node server.

## 🎟️ TICKET-004: PDF Fidelity Loss via Mammoth HTML Conversion
**Severity:** MEDIUM / BUSINESS IMPACT
**Component:** `PdfConverter.ts`
**Description:** 
The current PDF conversion strategy converts DOCX to HTML using `mammoth`, and then prints the HTML to PDF via Puppeteer. Mammoth strictly extracts semantic HTML and intentionally drops headers, footers, margins, complex layouts, absolute positioning, and page breaks. The resulting PDF will look drastically different from the original DOCX template, which is unacceptable for strict legal, compliance, or beautifully formatted business documents.
**Recommendation:**
- If high fidelity is required, switch to a true DOCX-to-PDF engine (like Gotenberg, LibreOffice headless, or a dedicated API provider) rather than passing through HTML.

## 🎟️ TICKET-005: Path Traversal Vulnerability in Template Resolver
**Severity:** MEDIUM
**Component:** `FinalBlockRenderer.ts`
**Description:** 
`createTemplateResolver` uses `path.join(templatesDir, template.fileRef)`. If the `fileRef` in the database contains path traversal sequences (e.g., `../../../../etc/passwd`), `fs.access(templatePath)` and subsequent reads will successfully target arbitrary files on the server. While `fileRef` is sourced from the DB, any vulnerability in the file upload/save API could allow an attacker to weaponize this.
**Recommendation:**
- Sanitize `template.fileRef` and ensure the final resolved path strictly stays within `templatesDir`.
```typescript
const resolvedPath = path.resolve(templatesDir, template.fileRef);
if (!resolvedPath.startsWith(path.resolve(templatesDir))) {
    throw new Error("Path traversal detected");
}
```

## 🎟️ TICKET-006: Filename Collision on Concurrent Generation
**Severity:** LOW
**Component:** `DocumentEngine.ts`
**Description:** 
Output filenames are generated using `const timestamp = Date.now(); const docxFileName = \`\${outputName}-\${timestamp}.docx\`;`. If two users trigger a workflow that generates a document with the same `outputName` in the exact same millisecond, they will generate identical filenames and overwrite each other's files.
**Recommendation:**
- Append a UUID, `crypto.randomBytes(4).toString('hex')`, or use a high-resolution time mechanism (like `process.hrtime()`) alongside the timestamp to guarantee uniqueness.

## 🎟️ TICKET-007: Fallback to Empty String for Missing Mapped Variables
**Severity:** LOW
**Component:** `MappingInterpreter.ts`
**Description:** 
In `applyMapping`, if a target field cannot find its source value in the workflow data, it defaults to `result[targetField] = '';`. If the document template expects an array or object to loop over (e.g. `{{#items}}`), supplying `""` changes the variable type and can cause rendering logic errors or docxtemplater exceptions.
**Recommendation:**
- Maintain the undefined/null state, or if a default must be applied, determine the expected type or omit the key entirely so `RenderCore`'s `nullGetter` handles it naturally.

## 🎟️ TICKET-008: Inconsistent Date Parsing
**Severity:** LOW
**Component:** `docxHelpers.ts`
**Description:** 
The `formatDate` and `addDays` helpers rely on `new Date(iso)`. `Date.parse` (which powers the `Date` constructor for strings) is notoriously inconsistent across JavaScript environments when handling non-standard date formats (e.g. `MM-DD-YYYY` vs `YYYY-MM-DD`). Users supplying differently formatted dates from workflow inputs might experience "Invalid Date" outputs or off-by-one errors due to UTC conversions.
**Recommendation:**
- Use `date-fns/parse` with strict formatting tokens, or use a dedicated parsing library to reliably coerce ambiguous strings into valid Dates.
