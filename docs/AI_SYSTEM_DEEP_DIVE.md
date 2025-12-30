# AI Workflow Editing System - Deep Dive

## 1. Database Tables & AI Metadata Storage

### workflow_versions Table

**Complete Schema:**

```sql
CREATE TABLE workflow_versions (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  base_id UUID REFERENCES workflows(id) ON DELETE CASCADE,

  -- Version Metadata
  version_number INTEGER NOT NULL DEFAULT 1,
  is_draft BOOLEAN NOT NULL DEFAULT false,        -- ✨ KEY: Draft vs Published
  published BOOLEAN NOT NULL DEFAULT false,        -- Legacy (deprecated)
  published_at TIMESTAMP,

  -- Workflow Definition
  graph_json JSONB NOT NULL,                       -- Complete workflow structure

  -- Change Tracking
  migration_info JSONB,                            -- ✨ AI METADATA STORED HERE
  changelog JSONB,                                 -- Diff from previous version
  notes TEXT,                                      -- Human-readable summary
  checksum TEXT,                                   -- Hash for no-op detection

  -- Audit
  created_by VARCHAR REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX workflow_versions_workflow_idx ON workflow_versions(workflow_id);
CREATE INDEX workflow_versions_version_number_idx ON workflow_versions(workflow_id, version_number);
CREATE INDEX workflow_versions_is_draft_idx ON workflow_versions(is_draft);
CREATE INDEX workflow_versions_published_idx ON workflow_versions(published);
CREATE INDEX workflow_versions_created_by_idx ON workflow_versions(created_by);
CREATE INDEX workflow_versions_checksum_idx ON workflow_versions(checksum);
```

### workflow_snapshots Table

**Complete Schema:**

```sql
CREATE TABLE workflow_snapshots (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version_id UUID REFERENCES workflow_versions(id) ON DELETE SET NULL,

  -- Snapshot Data
  name TEXT NOT NULL,                              -- "AI Edit BEFORE: 2025-12-26T..."
  values JSONB NOT NULL DEFAULT '{}'::jsonb,       -- Test data values { alias: value }
  version_hash TEXT,                               -- Hash of workflow structure

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX workflow_snapshots_workflow_idx ON workflow_snapshots(workflow_id);
CREATE INDEX workflow_snapshots_created_at_idx ON workflow_snapshots(workflow_id, created_at);
CREATE INDEX workflow_snapshots_version_hash_idx ON workflow_snapshots(version_hash);
CREATE UNIQUE INDEX workflow_snapshots_workflow_name_unique ON workflow_snapshots(workflow_id, name);
```

---

## AI Metadata Storage

### migration_info Column Structure

The `migration_info` JSONB column stores AI-specific metadata:

```json
{
  "aiMetadata": {
    "aiGenerated": true,
    "userPrompt": "Add a phone number field to the contact section",
    "confidence": 0.85,
    "beforeSnapshotId": "550e8400-e29b-41d4-a716-446655440001",
    "afterSnapshotId": "550e8400-e29b-41d4-a716-446655440002"
  },
  "restoredFrom": "550e8400-e29b-41d4-a716-446655440003" // Optional: for restored versions
}
```

### Example: AI-Generated Version Row

```sql
INSERT INTO workflow_versions (
  workflow_id,
  version_number,
  is_draft,              -- TRUE for AI edits
  published,             -- FALSE for AI edits
  graph_json,
  migration_info,
  changelog,
  notes,
  checksum,
  created_by
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  5,
  true,                  -- ✅ Draft version
  false,                 -- ❌ Not published
  '{"pages": [...]}',    -- Full workflow structure
  '{
    "aiMetadata": {
      "aiGenerated": true,
      "userPrompt": "Add a phone number field",
      "confidence": 0.85,
      "beforeSnapshotId": "...",
      "afterSnapshotId": "..."
    }
  }',
  '{
    "added": [
      {"id": "step-123", "type": "variable", "description": "Added Phone Number"}
    ],
    "removed": [],
    "modified": [],
    "severity": "safe"
  }',
  'Created step ''Phone Number'' (phone)\nAdded to Contact section',
  'sha256:abc123...',
  'user-id-456'
);
```

### Example: Restored Version Row

```sql
INSERT INTO workflow_versions (
  migration_info
) VALUES (
  '{
    "aiMetadata": {
      "aiGenerated": true,
      "userPrompt": "Original prompt",
      "confidence": 0.85,
      ...
    },
    "restoredFrom": "550e8400-e29b-41d4-a716-446655440003"
  }'
);
```

### Query Examples

**Find all AI-generated versions:**

```sql
SELECT
  id,
  version_number,
  notes,
  migration_info->>'aiMetadata' as ai_metadata,
  created_at
FROM workflow_versions
WHERE
  workflow_id = '123e4567-e89b-12d3-a456-426614174000'
  AND migration_info->'aiMetadata'->>'aiGenerated' = 'true'
ORDER BY created_at DESC;
```

**Get AI confidence scores over time:**

```sql
SELECT
  version_number,
  (migration_info->'aiMetadata'->>'confidence')::float as confidence,
  migration_info->'aiMetadata'->>'userPrompt' as prompt,
  created_at
FROM workflow_versions
WHERE
  workflow_id = '123e4567-e89b-12d3-a456-426614174000'
  AND migration_info->'aiMetadata'->>'aiGenerated' = 'true'
ORDER BY version_number;
```

**Find versions restored from specific version:**

```sql
SELECT *
FROM workflow_versions
WHERE migration_info->>'restoredFrom' = '550e8400-e29b-41d4-a716-446655440003';
```

---

## Snapshot Usage in AI Workflow

### BEFORE Snapshot

Created immediately before AI makes changes:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "workflow_id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "AI Edit BEFORE: 2025-12-26T10:30:45.123Z",
  "values": {},  // Empty for structural snapshots
  "workflow_version_id": "previous-version-id",
  "version_hash": "sha256:def456...",
  "created_at": "2025-12-26T10:30:45.123Z"
}
```

### AFTER Snapshot

Created after AI applies changes:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "workflow_id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "AI Edit AFTER: 2025-12-26T10:30:47.456Z",
  "values": {},
  "workflow_version_id": "new-version-id",
  "version_hash": "sha256:ghi789...",
  "created_at": "2025-12-26T10:30:47.456Z"
}
```

### Snapshot Pair Audit Trail

```sql
SELECT
  v.version_number,
  v.notes,
  before_snap.name as before_snapshot,
  after_snap.name as after_snapshot,
  before_snap.version_hash as before_hash,
  after_snap.version_hash as after_hash
FROM workflow_versions v
LEFT JOIN workflow_snapshots before_snap
  ON before_snap.id = (v.migration_info->'aiMetadata'->>'beforeSnapshotId')::uuid
LEFT JOIN workflow_snapshots after_snap
  ON after_snap.id = (v.migration_info->'aiMetadata'->>'afterSnapshotId')::uuid
WHERE v.workflow_id = '123e4567-e89b-12d3-a456-426614174000'
  AND v.migration_info->'aiMetadata'->>'aiGenerated' = 'true';
```

---

## Version Lifecycle States

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW VERSION STATES                   │
└─────────────────────────────────────────────────────────────┘

State 1: User-Created Published Version
  is_draft: false
  published: true
  published_at: <timestamp>
  migration_info: null

State 2: AI-Created Draft Version
  is_draft: true              ✅ Key field!
  published: false
  published_at: null
  migration_info: { aiMetadata: {...} }

State 3: User-Published (from Draft)
  is_draft: false
  published: true
  published_at: <timestamp>
  migration_info: (preserved from draft if applicable)

State 4: Restored Version (AI Undo)
  is_draft: true
  published: false
  migration_info: {
    restoredFrom: "<version-id>",
    aiMetadata: {...}
  }
```

---

## Checksum-Based No-Op Detection

### How it Works

```typescript
// 1. Compute checksum of new graphJson
const checksum = computeChecksum({ graphJson });

// 2. Fetch latest version
const [latestVersion] = await db
  .select()
  .from(workflowVersions)
  .where(eq(workflowVersions.workflowId, workflowId))
  .orderBy(desc(workflowVersions.createdAt))
  .limit(1);

// 3. Compare checksums
if (latestVersion && latestVersion.checksum === checksum) {
  // NO CHANGES - Return null, don't create version
  return null;
}

// 4. Create new version if different
const [newVersion] = await db.insert(workflowVersions).values({
  checksum,
  // ... other fields
});
```

### Example Checksums

```sql
SELECT
  version_number,
  checksum,
  notes,
  created_at
FROM workflow_versions
WHERE workflow_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY version_number;
```

**Result:**
```
version_number | checksum                        | notes
---------------+---------------------------------+------------------------
1              | sha256:abc123...                | Initial version
2              | sha256:def456...                | Added email field
3              | sha256:def456...                | (duplicate - rejected)
4              | sha256:ghi789...                | Added phone field
```

Version 3 would NOT be created because checksum matches version 2.

---

## 2. Zod Schema for AI Response + Example Multi-Op Payload

### Complete Zod Schema

```typescript
// server/schemas/aiWorkflowEdit.schema.ts

import { z } from "zod";

// Question from AI to user
export const aiQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  type: z.enum(["text", "single_select", "multi_select", "number"]),
  options: z.array(z.string()).optional(),
  blocking: z.boolean().default(false),
});

// Discriminated union of all operation types
export const workflowPatchOpSchema = z.discriminatedUnion("op", [
  // Workflow metadata
  z.object({
    op: z.literal("workflow.setMetadata"),
    title: z.string().optional(),
    description: z.string().optional(),
  }),

  // Section operations
  z.object({
    op: z.literal("section.create"),
    tempId: z.string().optional(),
    title: z.string(),
    order: z.number(),
    config: z.record(z.any()).optional(),
  }),
  z.object({
    op: z.literal("section.update"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    title: z.string().optional(),
    order: z.number().optional(),
    config: z.record(z.any()).optional(),
  }),

  // Step operations
  z.object({
    op: z.literal("step.create"),
    tempId: z.string().optional(),
    sectionId: z.string().optional(),
    sectionRef: z.string().optional(), // Reference to section tempId
    type: z.string(),
    title: z.string(),
    alias: z.string().optional(),
    required: z.boolean().optional(),
    order: z.number().optional(),
    config: z.record(z.any()).optional(),
    defaultValue: z.any().optional(),
  }),

  // ... (20+ total operations)
]);

// AI Model Response
export const aiModelResponseSchema = z.object({
  summary: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  questions: z.array(aiQuestionSchema).optional(),
  warnings: z.array(z.string()).optional(),
  ops: z.array(workflowPatchOpSchema),
});
```

---

## Example Multi-Op TempId Payload

### User Prompt
```
"Add a new 'Emergency Contact' section after 'Personal Info' with name, phone, and relationship fields"
```

### AI Response (Complete JSON)

```json
{
  "summary": [
    "Created section 'Emergency Contact' (order 2)",
    "Created step 'Contact Name' (short_text)",
    "Created step 'Contact Phone' (phone)",
    "Created step 'Relationship' (radio)"
  ],
  "confidence": 0.92,
  "warnings": [
    "Consider making emergency contact fields required for safety-critical workflows"
  ],
  "questions": [
    {
      "id": "q1",
      "prompt": "Should the emergency contact fields be required?",
      "type": "single_select",
      "options": ["Yes", "No"],
      "blocking": false
    }
  ],
  "ops": [
    {
      "op": "section.create",
      "tempId": "sec_temp_emergency",
      "title": "Emergency Contact",
      "order": 2,
      "config": {
        "description": "In case of emergency, who should we contact?"
      }
    },
    {
      "op": "step.create",
      "tempId": "step_temp_ec_name",
      "sectionRef": "sec_temp_emergency",
      "type": "short_text",
      "title": "Contact Name",
      "alias": "emergencyContactName",
      "required": false,
      "order": 1,
      "config": {
        "placeholder": "Full name"
      }
    },
    {
      "op": "step.create",
      "tempId": "step_temp_ec_phone",
      "sectionRef": "sec_temp_emergency",
      "type": "phone",
      "title": "Contact Phone",
      "alias": "emergencyContactPhone",
      "required": false,
      "order": 2,
      "config": {
        "placeholder": "(555) 555-5555",
        "format": "US"
      }
    },
    {
      "op": "step.create",
      "tempId": "step_temp_ec_relationship",
      "sectionRef": "sec_temp_emergency",
      "type": "radio",
      "title": "Relationship",
      "alias": "emergencyContactRelationship",
      "required": false,
      "order": 3,
      "config": {
        "options": [
          "Spouse",
          "Parent",
          "Sibling",
          "Friend",
          "Other"
        ]
      }
    }
  ]
}
```

### TempId Resolution Flow

```typescript
// WorkflowPatchService applies ops sequentially:

// Op 1: section.create
const section = await sectionRepository.create({
  workflowId: "workflow-123",
  title: "Emergency Contact",
  order: 2,
});
// Map: sec_temp_emergency -> section.id (real UUID)
this.mapTempId("sec_temp_emergency", section.id);

// Op 2: step.create (uses sectionRef)
const sectionId = this.resolve("sec_temp_emergency");
// Resolves to real UUID from map!

const step1 = await stepRepository.create({
  sectionId: sectionId,  // Real UUID
  type: "short_text",
  title: "Contact Name",
  alias: "emergencyContactName",
  // ...
});
this.mapTempId("step_temp_ec_name", step1.id);

// Op 3, 4: Same pattern...
```

### Final Database State

```sql
-- New section
INSERT INTO sections (id, workflow_id, title, order)
VALUES ('550e8400-...', 'workflow-123', 'Emergency Contact', 2);

-- New steps (all referencing real section ID)
INSERT INTO steps (id, section_id, type, title, alias, order)
VALUES
  ('660e8400-...', '550e8400-...', 'short_text', 'Contact Name', 'emergencyContactName', 1),
  ('770e8400-...', '550e8400-...', 'phone', 'Contact Phone', 'emergencyContactPhone', 2),
  ('880e8400-...', '550e8400-...', 'radio', 'Relationship', 'emergencyContactRelationship', 3);
```

---

## 3. Rejected Operations & User Feedback

### All Validation Rules & Rejection Scenarios

#### A. Pre-Application Validation (Endpoint Level)

**1. Missing GEMINI_API_KEY**
```typescript
// Location: server/routes/ai/workflowEdit.routes.ts:callGeminiForWorkflowEdit()

if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY not configured");
}
```

**User sees:**
```json
{
  "success": false,
  "error": "AI model call failed: GEMINI_API_KEY not configured"
}
```

**UI Display:**
```
❌ Error in AI panel:
"AI model call failed: GEMINI_API_KEY not configured"
```

---

**2. Invalid JSON Response from AI**
```typescript
// Location: server/routes/ai/workflowEdit.routes.ts:callGeminiForWorkflowEdit()

try {
  const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
  const jsonText = jsonMatch ? jsonMatch[1] : responseText;
  parsedResponse = JSON.parse(jsonText);
} catch (error) {
  throw new Error("Invalid JSON response from AI model");
}
```

**User sees:**
```json
{
  "success": false,
  "error": "AI model call failed: Invalid JSON response from AI model"
}
```

---

**3. Malformed AI Response Structure**
```typescript
if (!parsedResponse.summary || !parsedResponse.ops || typeof parsedResponse.confidence !== 'number') {
  throw new Error("Invalid AI response structure");
}
```

**User sees:**
```json
{
  "success": false,
  "error": "AI model call failed: Invalid AI response structure"
}
```

---

#### B. Operation-Level Validation (WorkflowPatchService)

**4. Unsafe DataVault Operations**
```typescript
// Location: server/services/WorkflowPatchService.ts:validateOp()

if (op.op.startsWith("datavault.")) {
  if (op.op === "datavault.createTable" || op.op === "datavault.addColumns") {
    // Safe operations - allowed
  } else {
    throw new Error(`Unsafe DataVault operation: ${op.op}`);
  }
}
```

**Rejected Ops:**
- `datavault.dropTable`
- `datavault.dropColumn`
- `datavault.deleteRows`
- `datavault.updateRowData`
- Any DataVault op not explicitly whitelisted

**User sees:**
```json
{
  "success": false,
  "error": "Failed to apply operations",
  "details": [
    "Validation failed for datavault.dropTable: Unsafe DataVault operation: datavault.dropTable"
  ]
}
```

**UI Display:**
```
❌ Error in AI panel (red box):
"Failed to apply operations"

Details:
• Validation failed for datavault.dropTable: Unsafe DataVault operation
```

---

**5. Duplicate Step Alias**
```typescript
// Location: server/services/WorkflowPatchService.ts:validateOp()

if ((op.op === "step.create" || op.op === "step.update") && op.alias) {
  const existingSteps = await stepRepository.findByWorkflowId(workflowId);
  const duplicate = existingSteps.find(
    s => s.alias === op.alias && (op.op === "step.create" || s.id !== this.resolve(op.id))
  );
  if (duplicate) {
    throw new Error(`Step alias '${op.alias}' already exists`);
  }
}
```

**User sees:**
```json
{
  "success": false,
  "error": "Failed to apply operations",
  "details": [
    "Validation failed for step.create: Step alias 'emailAddress' already exists"
  ]
}
```

**UI Display:**
```
❌ Error in AI panel:
"Failed to apply operations"

Details:
• Validation failed for step.create: Step alias 'emailAddress' already exists
```

---

**6. Missing Required References (TempId or Real ID)**
```typescript
// Location: server/services/WorkflowPatchService.ts:applyOp()

// Example: step.create without sectionId or sectionRef
const sectionId = this.resolve(op.sectionId || op.sectionRef);
if (!sectionId) throw new Error("Section ID or sectionRef required");
```

**User sees:**
```json
{
  "success": false,
  "error": "Failed to apply operations",
  "details": [
    "Failed to apply step.create: Section ID or sectionRef required"
  ]
}
```

---

**7. Unknown Operation Type**
```typescript
default:
  const _exhaustive: never = op;
  throw new Error(`Unknown operation: ${(op as any).op}`);
```

**User sees:**
```json
{
  "success": false,
  "error": "Failed to apply operations",
  "details": [
    "Failed to apply workflow.deleteAll: Unknown operation: workflow.deleteAll"
  ]
}
```

---

#### C. Access Control Rejections

**8. Insufficient Permissions**
```typescript
// Location: server/routes/ai/workflowEdit.routes.ts

await workflowService.verifyAccess(workflowId, userId, 'edit');
```

**User sees:**
```json
{
  "success": false,
  "error": "Access denied - insufficient permissions for this workflow"
}
```

**HTTP Status:** `403 Forbidden`

---

**9. Unauthorized (No Session)**
```typescript
if (!userId) {
  return res.status(401).json({ success: false, error: "Unauthorized" });
}
```

**User sees:**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**HTTP Status:** `401 Unauthorized`

---

### Complete Rejection Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│              AI WORKFLOW EDIT - REJECTION POINTS                 │
└─────────────────────────────────────────────────────────────────┘

1. Request Validation
   ↓
   ✅ Zod schema validation
   ❌ Invalid request → "Validation error: ..."

2. Authentication
   ↓
   ✅ User session exists
   ❌ No session → "Unauthorized" (401)

3. Authorization
   ↓
   ✅ User has edit access
   ❌ Insufficient permissions → "Access denied" (403)

4. Draft Enforcement
   ↓
   ✅ Workflow set to draft
   (Auto-reverts if needed)

5. Workflow State Fetch
   ↓
   ✅ Current workflow loaded

6. BEFORE Snapshot
   ↓
   ✅ Snapshot created

7. AI API Call
   ↓
   ✅ Gemini responds
   ❌ API error → "AI model call failed: ..."

8. JSON Parsing
   ↓
   ✅ Valid JSON
   ❌ Parse error → "Invalid JSON response from AI model"

9. Response Validation
   ↓
   ✅ Schema matches aiModelResponseSchema
   ❌ Missing fields → "Invalid AI response structure"

10. Operation Validation (BATCH)
    ↓
    FOR EACH op:
      ✅ Not unsafe DataVault op
      ✅ No duplicate aliases
      ✅ Valid references
    ❌ ANY validation fails → ALL ops rejected

11. Operation Application (SEQUENTIAL)
    ↓
    FOR EACH op:
      ✅ Apply via service layer
      ✅ Map tempIds
    ❌ Application error → Error logged, partial rollback

12. AFTER Snapshot
    ↓
    ✅ Snapshot created

13. Version Creation
    ↓
    ✅ Checksum different from latest
    ✅ Draft version created
    ❌ Checksum match → Return "noChanges: true"

14. Response
    ↓
    ✅ Success + workflow + versionId
```

---

### UI Error Display (AiConversationPanel)

**Location:** `client/src/components/builder/ai/AiConversationPanel.tsx`

**Error State:**
```tsx
{error && (
  <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
    {error}
  </div>
)}
```

**Error Message Examples:**

1. **Validation Error:**
   ```
   ┌───────────────────────────────────────────────┐
   │ ❌ Failed to apply operations                  │
   │                                                │
   │ Details:                                       │
   │ • Validation failed for step.create:          │
   │   Step alias 'email' already exists           │
   └───────────────────────────────────────────────┘
   ```

2. **AI API Error:**
   ```
   ┌───────────────────────────────────────────────┐
   │ ❌ AI model call failed:                       │
   │    GEMINI_API_KEY not configured              │
   └───────────────────────────────────────────────┘
   ```

3. **Access Denied:**
   ```
   ┌───────────────────────────────────────────────┐
   │ ❌ Access denied - insufficient permissions    │
   │    for this workflow                          │
   └───────────────────────────────────────────────┘
   ```

**Error appears as assistant message in chat:**
```tsx
const errorMessage: Message = {
  id: (Date.now() + 1).toString(),
  role: "assistant",
  content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
  timestamp: new Date(),
};

setMessages(prev => [...prev, errorMessage]);
```

---

## Summary of All Rejected Operations

### Validation Rejections
| Operation | Rejection Reason | User Feedback |
|-----------|------------------|---------------|
| `datavault.dropTable` | Unsafe (destructive) | "Unsafe DataVault operation: datavault.dropTable" |
| `datavault.dropColumn` | Unsafe (destructive) | "Unsafe DataVault operation: datavault.dropColumn" |
| `datavault.deleteRows` | Unsafe (destructive) | "Unsafe DataVault operation: datavault.deleteRows" |
| `step.create` with duplicate alias | Alias conflict | "Step alias 'email' already exists" |
| `step.create` without section ref | Missing required field | "Section ID or sectionRef required" |
| Unknown op type | Not in schema | "Unknown operation: workflow.invalidOp" |

### System Rejections
| Condition | HTTP Status | User Feedback |
|-----------|-------------|---------------|
| No GEMINI_API_KEY | 500 | "AI model call failed: GEMINI_API_KEY not configured" |
| Invalid AI JSON | 500 | "AI model call failed: Invalid JSON response from AI model" |
| No session | 401 | "Unauthorized" |
| Insufficient permissions | 403 | "Access denied - insufficient permissions" |
| Gemini API error | 500 | "AI model call failed: [original error]" |

---

## Testing Rejection Scenarios

### Test 1: Duplicate Alias

**Prompt:**
```
"Add another email field"
```

**Expected AI Response:**
```json
{
  "ops": [
    {
      "op": "step.create",
      "alias": "email",  // Already exists!
      ...
    }
  ]
}
```

**Result:**
```json
{
  "success": false,
  "error": "Failed to apply operations",
  "details": ["Validation failed for step.create: Step alias 'email' already exists"]
}
```

### Test 2: Unsafe DataVault Op

**Prompt:**
```
"Delete the users table from DataVault"
```

**Expected AI Response:**
```json
{
  "ops": [
    {
      "op": "datavault.dropTable",
      "tableId": "..."
    }
  ]
}
```

**Result:**
```json
{
  "success": false,
  "error": "Failed to apply operations",
  "details": ["Validation failed for datavault.dropTable: Unsafe DataVault operation"]
}
```

---

This covers all three of your questions in complete detail!
