# Document Generation Engine - Architecture Documentation

**Last Updated:** August 10, 2026
**Status:** Production - Extended for Final Block Integration
**Purpose:** Reference documentation for document generation capabilities

---

## Overview

The VaultLogic Document Generation Engine provides enterprise-grade document templating and rendering with support for DOCX templates, PDF conversion, variable substitution, and dynamic field mapping.

### Core Capabilities

✅ **DOCX Template Rendering** - Variable substitution with `{{client_name}}` syntax
✅ **PDF Conversion** - DOCX → Mammoth HTML → Puppeteer PDF
✅ **Pipe Filter Expressions** - Formatting, dates, currency, math, comparisons, and chaining
✅ **Template Analysis** - Extract variables, validate coverage
✅ **Nested Variable Support** - Dot notation `{{client.address.city}}`
✅ **Loops & Conditionals** - `{{#Children}}...{{/Children}}` sections
✅ **Variable Mapping** - (NEW) Override field names for Final Block
✅ **Conditional Output** - (NEW) Logic-based document inclusion
✅ **Multi-Document ZIP** - (NEW) Bundle multiple outputs

---

## Architecture Components

### Layer 1: Template Parser (DOCX Rendering)

**Files:** `RenderCore.ts` (production renderer), `TemplateParser.ts` (wrapper)
**Technology:** docxtemplater + its angular-expression parser + PizZip
**Syntax:** `{{variable}}`, `{{value | filter:argument}}`, and `{{#section}}...{{/section}}`

**Responsibilities:**
- Load DOCX template files (unzip → parse XML)
- Parse placeholder syntax
- Substitute variables with data
- Apply helper functions
- Handle loops and conditionals
- Return rendered DOCX buffer

**Variable Resolution:**
```typescript
// Simple variable
{{client_name}} → resolves from data.client_name

// Nested object (dot notation)
{{client.address.city}} → resolves from data.client.address.city

// Pipe filter; chains run left to right
{{client_name | trim | upper}} → trims, then converts to uppercase

// Array position
{{Children[0].name}} → resolves the first child's name
```

**Supported Placeholder Types:**
- Text substitution: `{{client_name}}`
- Dot paths and array indexing: `{{client.address.city}}`, `{{Children[0].name}}`
- Pipe filters and chaining: `{{client_name | trim | upper}}`
- Colon-form filter arguments: `{{amount | add:tax}}`
- Comparisons in sections: `{{#count > 9}}...{{/count > 9}}`
- Loops and conditions: `{{#Children}}...{{/Children}}`
- Zero-based loop index: `{{$index}}`

**Error Handling:**
- Missing top-level variables → hard failure naming the undefined variable
- Present but empty values → blank; `| default:"..."` provides an explicit fallback
- Invalid syntax → detailed error extraction
- Parenthesised filter arguments → compilation failure; arguments use colon form
- `{%` and bare `{#` statement/comment delimiters → reserved-syntax failure
- Template corruption → validation with repair suggestions

For author-facing syntax and exact table-cell placement, see
[`docs/guides/VARIABLES_IN_DOCUMENTS.md`](../../../docs/guides/VARIABLES_IN_DOCUMENTS.md).

---

### Layer 2: PDF Converter (Format Transformation)

**File:** `PdfConverter.ts`
**Strategies:** Gotenberg (high fidelity) and Puppeteer (degraded fallback)

#### Strategy selection

Chosen at construction from `PDF_CONVERTER_API_URL`:

| `PDF_CONVERTER_API_URL` | Primary | Fallback |
|---|---|---|
| set | `gotenberg` | `puppeteer` |
| unset | `puppeteer` | none |

Callers **cannot request a strategy** — it is environment-derived. `convert()`
returns `{ strategy, fellBack }` reporting which converter actually produced the
file, and that strategy is persisted per document on
`run_generated_documents.pdf_strategy`. Recording a requested (rather than
observed) strategy is what previously made a silent fidelity downgrade
invisible: with a Gotenberg URL configured against an unimplemented client,
every PDF was produced by the fallback while the record claimed otherwise.

#### Gotenberg Pipeline (production default when configured)
```
DOCX → POST /forms/libreoffice/convert → PDF Buffer
```

Preserves headers, footers, page and list numbering, fonts, tables and
section-level layout. Bounded by `PDF_CONVERTER_TIMEOUT_MS` (default 60s); the
uploaded part keeps its `.docx` filename because Gotenberg selects its converter
from the extension. Reachability is probed via `GET /health` and surfaced in the
app's own `/health` response as `pdfConverter`, where an unreachable converter
reports `degraded` (HTTP 200) rather than `unhealthy` — documents still generate,
just at lower fidelity.

#### Puppeteer Pipeline (fallback)
```
DOCX → Mammoth (DOCX→HTML) → Puppeteer (HTML→PDF) → PDF Buffer
```

**Pros:**
- No system dependencies
- Customizable CSS styling
- Consistent across platforms

**Cons:**
- Layout fidelity depends on Mammoth conversion quality
- Complex tables may be simplified by Mammoth
- Headers, footers, comments, tracked changes, and some section-level DOCX
  layout features are not preserved in the HTML intermediate form

**Configuration:**
- Page size: A4
- Margins: 20mm
- Print background: enabled
- Scale: 1.0

When **both** strategies fail, the generation path records `pdfFailed: true` on
the document record and keeps the DOCX output available.

When only the *primary* fails, the fallback runs — that is a deliberate
availability/fidelity trade, and it is made visible three ways rather than being
silent: an `error`-level log naming both strategies, `pdfStrategy` on the
document record reflecting the converter that actually ran, and the `pdfConverter`
field on `GET /health`. A `puppeteer` record on a server with
`PDF_CONVERTER_API_URL` set therefore means the high-fidelity converter failed.

---

### Layer 3: Document Engine (Orchestration)

**File:** `DocumentEngine.ts`
**Role:** High-level wrapper coordinating template parsing and conversion

**Function Signature:**
```typescript
generateDocument({
  templatePath: string,      // Path to DOCX template
  data: Record<string, any>, // Variable data (normalized)
  outputPath: string,        // Output file path
  convertToPdf?: boolean     // Optional PDF conversion
}): Promise<GeneratedDocument>
```

**Workflow:**
1. Load template file from disk
2. Call TemplateParser.render(template, data)
3. Write rendered DOCX to output path
4. If convertToPdf: call PdfConverter.convert()
5. Return file paths and metadata

**Return Type:**
```typescript
interface GeneratedDocument {
  docxPath: string;
  pdfPath?: string;
  fileSize: number;
  generatedAt: Date;
}
```

---

### Layer 4: Variable Normalization (NEW - Final Block Extension)

**File:** `VariableNormalizer.ts` (NEW)
**Purpose:** Flatten nested values and arrays for template compatibility

**Transformation Rules:**

#### Nested Objects → Dot Notation
```typescript
Input:
{
  user: {
    name: { first: "John", last: "Doe" },
    address: { city: "NYC" }
  }
}

Output:
{
  "user.name.first": "John",
  "user.name.last": "Doe",
  "user.address.city": "NYC"
}
```

#### Arrays → Comma-Separated Strings
```typescript
Input:
{
  hobbies: ["biking", "hiking", "reading"]
}

Output:
{
  "hobbies": "biking, hiking, reading"
}
```

#### Multi-Field Values → Flat Structure
```typescript
Input (AddressValue):
{
  street: "123 Main St",
  city: "NYC",
  state: "NY",
  zip: "10001"
}

Output (with prefix):
{
  "address.street": "123 Main St",
  "address.city": "NYC",
  "address.state": "NY",
  "address.zip": "10001"
}
```

**Usage:**
```typescript
const normalized = normalizeVariables(stepValues, {
  flattenNested: true,
});
```

Arrays are preserved by default so templates can loop over them with
`{{#items}}...{{/items}}`. When an array value is used as a plain scalar
`{{tag}}`, the renderer joins it for display ("a, b, c"). Pass
`joinArrays: true` (with optional `arrayDelimiter`) only if you need the
normalized output itself to contain joined strings.

---

### Layer 5: Mapping Interpreter (NEW - Final Block Extension)

**File:** `MappingInterpreter.ts` (NEW)
**Purpose:** Apply custom field mappings from Final Block configuration

**Configuration Format (from FinalBlockConfig):**
```typescript
mapping: {
  "docFieldName": {
    type: "variable",
    source: "stepAlias"  // Workflow variable alias
  }
}
```

**Example:**
```typescript
// Final Block Config
{
  mapping: {
    "client_name": { type: "variable", source: "fullName" },
    "client_email": { type: "variable", source: "email" },
    "total_amount": { type: "variable", source: "invoiceTotal" }
  }
}

// Step Values (normalized)
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "invoiceTotal": "$1,234.56"
}

// Applied Mapping (for template)
{
  "client_name": "John Doe",
  "client_email": "john@example.com",
  "total_amount": "$1,234.56"
}
```

**Behavior:**
- If mapping exists: use mapped field names (high priority)
- If no mapping: pass through original variable names
- Preserves backward compatibility with existing templates

**Implementation:**
```typescript
function applyMapping(
  normalizedData: Record<string, any>,
  mapping: FinalBlockConfig['documents'][0]['mapping']
): Record<string, any> {
  if (!mapping) return normalizedData;

  const mapped: Record<string, any> = {};
  for (const [targetField, config] of Object.entries(mapping)) {
    if (config.type === 'variable') {
      mapped[targetField] = normalizedData[config.source];
    }
  }
  return mapped;
}
```

---

### Layer 6: Conditional Document Output (NEW - Final Block Extension)

**File:** Uses existing `shared/conditionalLogic.ts`
**Purpose:** Evaluate conditions to determine which documents to generate

**Logic Expression Format:**
```typescript
interface LogicExpression {
  operator?: 'AND' | 'OR';
  conditions: Array<{
    key: string;      // Step alias
    op: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
    value?: any;
  }>;
}
```

**Example:**
```typescript
// Only generate invoice if amount > 0
{
  operator: 'AND',
  conditions: [
    { key: 'invoiceTotal', op: 'greater_than', value: 0 },
    { key: 'approved', op: 'equals', value: true }
  ]
}
```

**Evaluation:**
```typescript
function shouldGenerateDocument(
  conditions: LogicExpression | null,
  stepValues: Record<string, any>
): boolean {
  if (!conditions) return true;  // No conditions = always generate
  return evaluateExpression(conditions, stepValues);
}
```

---

### Layer 7: Final Block Renderer (NEW)

**File:** `FinalBlockRenderer.ts` (NEW)
**Purpose:** Orchestrate multi-document generation for Final Blocks

**Workflow:**
```
1. Load Final Block config
2. For each document in config.documents:
   a. Evaluate conditions → skip if false
   b. Load document template
   c. Normalize step values
   d. Apply mapping (if defined)
   e. Call DocumentEngine.generateDocument()
   f. Collect output buffer
3. If multiple outputs → ZIP archive
4. Return download URL(s)
```

**Function Signature:**
```typescript
async function renderFinalBlock(
  finalBlockConfig: FinalBlockConfig,
  stepValues: Record<string, any>,
  workflowId: string,
  runId: string
): Promise<FinalBlockOutput>
```

**Return Type:**
```typescript
interface FinalBlockOutput {
  documents: Array<{
    alias: string;
    filename: string;
    buffer: Buffer;
    mimeType: string;
  }>;
  zipArchive?: {
    filename: string;
    buffer: Buffer;
  };
}
```

---

### Layer 8: ZIP Bundler (NEW)

**File:** `ZipBundler.ts` (NEW)
**Technology:** archiver or pizzip (reuse existing)
**Purpose:** Create ZIP archives for multiple document outputs

**Usage:**
```typescript
const archive = await createZipArchive([
  { filename: "invoice.pdf", buffer: pdfBuffer1 },
  { filename: "receipt.pdf", buffer: pdfBuffer2 },
  { filename: "contract.docx", buffer: docxBuffer }
]);
```

**Output:**
```typescript
{
  filename: "workflow_documents_2025-12-06.zip",
  buffer: Buffer,
  size: 1234567
}
```

**Configuration:**
- Compression level: 6 (balanced)
- Include manifest.txt with file list
- Preserve file timestamps

---

## Template filter registry

**File:** `docxHelpers.ts`

`RenderCore` registers every function in the exported `docxHelpers` object as
an angular-expression pipe filter. Template authors should normally use the
curated `TEMPLATE_FILTER_VOCABULARY`, which is kept in the same file:

- Dates: `longdate`, `shortdate`
- Money and numbers: `usd`, `currency`, `number`, `percent`
- Text and booleans: `upper`, `lower`, `titlecase`, `yesno`, `trim`
- Missing-value fallback: `default`
- Legal drafting primitives (LD-1, implemented in `../draftingPrimitives.ts`
  and merged into the same object): `legalNumber`, `legalLetter`,
  `legalUpperLetter`, `legalRoman`, `legalUpperRoman`; `plural`,
  `partyParties`, `isAre`, `hasHave`, `itsTheir`; `pronounSubject`,
  `pronounObject`, `pronounPossessive`, `pronounReflexive`, `pronounVerb`

Two invariants in that family are load-bearing, not stylistic. Numbering is a
**pure** function of the ordinals the author passes — no hidden counter, which
would be invisible in the Word document and would miscount whenever a
conditional section is skipped or a row loop repeats. Pronouns are resolved
from an **explicit** value only and default to they/them; there is no
name, title, or honorific inference path anywhere, because a wrong guess
misgenders a real client in a document that gets signed.

Lower-level registered filters cover custom date formatting, date arithmetic,
math, arrays, and string operations. They use the same pipe/colon grammar. For
example, `{{amount | add:tax}}` passes `amount` as the input and `tax` as the
second argument. `{{start_date | addMonths:1}}` uses month-end clamping, so one
month after January 31, 2026 is February 28, 2026.

The complete author-facing vocabulary and rendered outputs live in the guide,
and `docSamples.test.ts` renders each documented example through `renderDocxBuffer`.

---

## Database Schema

### Templates Table
```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY,
  projectId UUID NOT NULL,
  name VARCHAR(255),
  description TEXT,
  fileRef VARCHAR(500),  -- Filename in /server/files/
  type VARCHAR(10),      -- 'docx' | 'html'
  helpersVersion INTEGER DEFAULT 1,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

### Run Generated Documents Table
```sql
CREATE TABLE run_generated_documents (
  id UUID PRIMARY KEY,
  runId UUID NOT NULL,
  fileName TEXT,
  fileUrl TEXT,
  mimeType TEXT,
  fileSize INTEGER,
  templateId UUID,
  createdAt TIMESTAMP
);
```

---

## API Endpoints

### Template Management
```
POST   /api/projects/:projectId/templates       # Upload template
GET    /api/templates/:id                       # Get template
GET    /api/templates/:id/placeholders          # Extract variables
DELETE /api/templates/:id                       # Delete template
```

### Template Analysis
```
GET    /api/templates/:templateId/analyze       # Full analysis
POST   /api/templates/:templateId/validate      # Validate with data
```

### Document Generation (NEW - Final Block)
```
POST   /api/workflows/:workflowId/runs/:runId/generate-final   # Generate Final Block docs
GET    /api/runs/:runId/outputs                                 # List generated docs
GET    /api/runs/:runId/outputs/:outputId/download             # Download doc
```

### File Download
```
GET    /api/files/download/:filename            # Download file
```

---

## File Storage Structure

```
server/files/
├── /                        # Uploaded templates
│   └── {nanoid}.docx
├── /outputs/               # Generated documents
│   ├── {name}-{timestamp}.docx
│   └── {name}-{timestamp}.pdf
└── /archives/              # ZIP bundles (NEW)
    └── {runId}-final-{timestamp}.zip
```

**Naming Conventions:**
- Templates: `{nanoid(16)}.docx` (unpredictable, unique)
- Outputs: `{templateName}-run-{runId}-{timestamp}.{ext}`
- Archives: `final-docs-{runId}-{timestamp}.zip`

---

## Error Handling

### Template Errors
```typescript
try {
  const rendered = TemplateParser.render(template, data);
} catch (error) {
  if (error.name === 'TemplateError') {
    // Handle: missing tags, syntax errors, corrupted template
    return { success: false, errors: extractTemplateErrors(error) };
  }
}
```

### Conversion Errors
```typescript
try {
  const pdf = await PdfConverter.convert(docx, 'puppeteer');
} catch (error) {
  // Record pdfFailed: true and keep the DOCX output available.
  logger.warn({ error }, 'PDF conversion failed');
}
```

### Mapping Errors
```typescript
// Missing source variable in mapping
if (mapping[field] && !normalizedData[mapping[field].source]) {
  logger.warn(`Mapping references missing variable: ${mapping[field].source}`);
  // Continue with empty value rather than failing
}
```

---

## Security Considerations

### Template Upload Validation
- File type: Must be `.docx` (MIME type check)
- File size: Max 10MB
- ZIP structure: Valid DOCX structure (not arbitrary ZIP)
- Content scan: No macros or embedded executables

### Variable Injection Protection
- No code execution in templates (static substitution only)
- HTML escaping in converted content
- Path traversal prevention in file references

### Download Security
- Filename sanitization
- Ownership verification (user can only download their runs)
- Temporary URL expiration (future enhancement)

---

## Performance Optimization

### Caching
- Template files cached in memory (LRU cache, max 50 templates)
- Parsed template AST cached (avoid re-parsing)
- Helper function registry initialized once

### Parallel Processing
- Multiple documents rendered in parallel (Promise.all)
- Independent PDF conversions run concurrently

### Resource Limits
- Max template size: 10MB
- Max output size: 50MB per document
- Max documents per Final Block: 20
- ZIP compression level: 6 (balanced speed/size)

---

## Testing Strategy

### Unit Tests
- Variable normalization edge cases
- Mapping application logic
- Conditional evaluation
- Helper function behavior

### Integration Tests
- End-to-end document generation
- PDF conversion through the Puppeteer pipeline
- Multi-document ZIP creation
- API endpoint functionality

### E2E Tests
- Upload template → configure Final Block → run workflow → download docs
- Preview mode document generation
- Conditional document logic

---

## Migration from Existing System (completed July 2026)

The legacy generators (`DocumentGenerationService`, `docxRenderer`,
`docxRenderer2`) have been deleted. All paths — automatic run completion
(`RunLifecycleService.generateDocuments`), the explicit
`POST /api/runs/:runId/generate-final` endpoint, the graph engine template
node, and the Bull queue worker — render through
`FinalBlockRenderer` / `EnhancedDocumentEngine` on top of `RenderCore`.

**Backward compatibility:** legacy "Final Documents" sections
(`section.config.finalBlock` + `config.templates`) are still supported —
`RunLifecycleService.buildLegacyFinalBlockConfig` synthesizes a
`FinalBlockConfig` from them, carrying template-level mapping and
`visibleIf` conditions into the unified path.

---

## Troubleshooting

### Issue: Template variables not rendering
**Check:**
1. Variable names match exactly (case-sensitive)
2. Filter arguments use colons, not parentheses
3. The undefined-variable error names a path present in the template data contract
4. Nested objects use dot paths and array items use bracket indexes
5. Arrays remain arrays for section loops; a plain scalar tag joins an array for display
6. Table section tags are wholly inside the content cells specified by the authoring guide

### Issue: the "Missing Variables" list on a generated document looks wrong
**How it is produced (DOC-104):** `run_generated_documents.unresolved_variables`
names the variables a template referenced that the run had no value for. Two
different things write it, and both are needed:

1. `RenderCore`'s `nullGetter` — for a path genuinely absent from the data.
   Except at the top level, where absence is a typo and raises instead.
2. `RenderCore`'s `recordEmptyVariable` — for a variable that *is* in the data
   contract but unanswered. `RunDataService` seeds every alias, so those arrive
   as `null` and normalization renders them `''`; the names travel separately as
   `emptyVariables` (`EnhancedDocumentEngine.normalizeForRender`) because
   changing the value would change the document.

**Check:** the value reaches the render as `''` — the report says a question was
unanswered, not that rendering failed. A variable the template never mentions is
never listed. Fields inside a `{{#loop}}` are not judged (`scopeList.length > 1`).
Before this existed the column was always `[]`, so an old record proves nothing.

### Issue: PDF conversion fails
**Check:**
1. Puppeteer dependencies installed
2. Template content can survive Mammoth's DOCX-to-HTML conversion
3. Generated document record has `pdfFailed: true` and DOCX download remains available

### Issue: Mapping not working
**Check:**
1. Mapping config structure correct
2. Source variable exists in normalized data
3. Field names in template match mapped names

### Issue: Conditional logic not excluding document
**Check:**
1. Step alias matches condition key
2. Operator and value types match
3. AND/OR logic configured correctly

---

## Future Enhancements

### Planned
- [ ] Email delivery integration (SendGrid available)
- [ ] Batch document generation endpoint
- [ ] Template versioning
- [ ] Document preview (PNG thumbnails)
- [ ] Custom helper function registration

### Under Consideration
- [ ] HTML template support (in addition to DOCX)
- [ ] Excel template rendering
- [ ] Digital signature integration
- [ ] Watermark support
- [ ] Multi-language template support

---

## References

**External Documentation:**
- [docxtemplater](https://docxtemplater.com/docs/get-started/)
- [PizZip](https://github.com/open-xml-templating/pizzip)
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js)
- [Puppeteer](https://pptr.dev/)

**Internal Documentation:**
- [VaultLogic Architecture](../../../CLAUDE.md)
- [Final Block Implementation](../../../docs/FINAL_BLOCKS_COMPLETE_FIX.md)
- [Conditional Logic System](../../../shared/conditionalLogic.ts)

---

**Document Maintainer:** Development Team
**Review Cycle:** Monthly
**Next Review:** January 6, 2026
