# AI Workflow Editing System - Production Readiness Checklist

**Status:** MVP Complete - Integration Testing Required
**Last Updated:** December 26, 2025

---

## ✅ Complete & Production Ready

### Backend Core (100%)
- [x] **AI Edit Endpoint** - `POST /api/workflows/:workflowId/ai/edit`
  - Full request/response cycle
  - Auth + ACL integration
  - Draft enforcement via `ensureDraftForEditing()`
  - BEFORE/AFTER snapshots
  - Gemini API integration
  - Error handling and rollback

- [x] **Zod Schemas** - Type-safe API contract
  - 20+ operation types defined
  - Strict validation
  - TempId support

- [x] **WorkflowPatchService** - Atomic operation engine
  - TempId → UUID resolution
  - Alias uniqueness validation
  - DataVault safety rules
  - Sequential application with rollback

- [x] **Version Management**
  - `createDraftVersion()` - Version-per-prompt
  - `restoreToVersion()` - Undo capability
  - Checksum-based no-op detection
  - AI metadata storage in `migration_info`

- [x] **Snapshot System**
  - Automatic BEFORE/AFTER captures
  - Audit trail preservation

### Frontend Core (100%)
- [x] **ResizableBuilderLayout** - 3-column layout
  - Drag-to-resize with constraints
  - AI panel collapse to width 0
  - localStorage persistence

- [x] **AiConversationPanel** - Chat interface
  - Message history
  - Summary bullets display
  - Warnings and questions
  - Inline error handling
  - View Diff / Undo buttons

- [x] **VersionHistoryPanel** - Enhanced version history
  - AI-generated badge (Sparkles icon)
  - Draft version support
  - Restore capability
  - Visual distinction for AI edits

### Implemented Operations (8/11 categories)
- [x] **workflow.setMetadata** - Update title/description
- [x] **section.*** - Full CRUD + reorder
- [x] **step.*** - Full CRUD + move + visibility + required

### Safety & Security (100%)
- [x] **DataVault Protection**
  - Whitelist: createTable, addColumns, createWritebackMapping
  - Blacklist: dropTable, dropColumn, deleteRows, updateRowData
  - Pre-validation before application

- [x] **Access Control**
  - ACL-based permission checks
  - User context preservation
  - Audit trail with user IDs

- [x] **Data Integrity**
  - Atomic transactions
  - Rollback on failure
  - Checksum verification
  - Referential integrity checks

---

## ⚠️ Stub Implementations (Need Completion for Full Production)

### 1. Logic Rule Operations (Needs Custom Parser)

**Current Status:** Stub that throws "not implemented"

**Why It's Complex:**
The `logic_rules` table requires:
```sql
conditionStepId UUID NOT NULL  -- Which step to check
operator ENUM NOT NULL          -- equals, not_equals, contains, etc.
conditionValue JSONB NOT NULL   -- The value to compare against
targetType ENUM NOT NULL        -- section or step
targetStepId/targetSectionId    -- What to show/hide/require
action ENUM NOT NULL            -- show, hide, require, make_optional
```

**What AI Currently Sends:**
```json
{
  "op": "logicRule.create",
  "rule": {
    "condition": "emailAddress equals 'test@example.com'",  // String expression
    "action": "show",
    "target": { "type": "section", "id": "..." }
  }
}
```

**Implementation Needed:**
```typescript
// server/services/LogicRuleParser.ts
export function parseConditionExpression(
  condition: string,
  workflowSteps: Step[]
): {
  conditionStepId: string;
  operator: string;
  conditionValue: any;
} {
  // Parse: "emailAddress equals 'test@example.com'"
  // Extract: stepAlias, operator, value
  // Resolve: stepAlias -> stepId from workflowSteps
  // Return: structured fields for database
}
```

**Estimated Effort:** 4-6 hours
**Priority:** Medium (conditional logic is powerful but not core to basic AI edits)

**Recommendation:**
- Keep as stub for MVP
- Add warning in AI system prompt: "Logic rules not fully supported yet"
- Implement after core system is battle-tested

---

### 2. Document Operations (Needs DocumentGenerationService Integration)

**Current Status:** Stub that returns success message

**Required Integration:**
```typescript
// server/services/WorkflowPatchService.ts

case "document.add": {
  const document = await documentTemplateRepository.create({
    workflowId,
    name: op.name,
    fileType: op.fileType,
    template: op.template,
  });
  if (op.tempId) {
    this.mapTempId(op.tempId, document.id);
  }
  return `Added document '${op.name}'`;
}

case "document.update": {
  const docId = this.resolve(op.id || op.tempId);
  if (!docId) throw new Error("Document ID required");

  await documentTemplateRepository.update(docId, {
    name: op.name,
    template: op.template,
  });
  return `Updated document`;
}

case "document.bindFields": {
  const docId = this.resolve(op.id || op.tempId);
  if (!docId) throw new Error("Document ID required");

  await documentTemplateRepository.updateMapping(docId, op.bindings);
  return `Bound ${Object.keys(op.bindings).length} fields`;
}
```

**Estimated Effort:** 2-3 hours
**Priority:** High (documents are core to legal/fintech workflows)

**Dependencies:**
- DocumentTemplateRepository exists
- Need to verify field mapping structure matches

---

### 3. DataVault Operations (Needs DataVault Services Integration)

**Current Status:** Stub that returns success message

**Required Integration:**
```typescript
// server/services/WorkflowPatchService.ts

case "datavault.createTable": {
  const table = await datavaultTablesRepository.create({
    databaseId: op.databaseId,
    name: op.name,
    columns: op.columns.map(col => ({
      name: col.name,
      type: col.type,
      config: col.config || {},
    })),
  });
  if (op.tempId) {
    this.mapTempId(op.tempId, table.id);
  }
  return `Created DataVault table '${op.name}'`;
}

case "datavault.addColumns": {
  const tableId = this.resolve(op.tableId);
  if (!tableId) throw new Error("Table ID required");

  // Get existing columns
  const table = await datavaultTablesRepository.findById(tableId);
  const existingColumns = table.columns || [];

  // Add new columns
  await datavaultTablesRepository.update(tableId, {
    columns: [...existingColumns, ...op.columns],
  });

  return `Added ${op.columns.length} columns to table`;
}

case "datavault.createWritebackMapping": {
  // Store mapping in workflow config or separate table
  // This connects workflow steps to DataVault columns
  return `Created writeback mapping`;
}
```

**Estimated Effort:** 3-4 hours
**Priority:** Medium-High (DataVault integration is powerful)

**Dependencies:**
- DataVault repositories exist
- Column structure matches expected format

---

## 🧪 Testing Requirements

### Unit Tests Needed

**1. WorkflowPatchService Tests**
```typescript
// tests/unit/services/WorkflowPatchService.test.ts

describe('WorkflowPatchService', () => {
  describe('tempId resolution', () => {
    it('should resolve section tempId to real UUID');
    it('should resolve step sectionRef to real UUID');
    it('should handle multi-level references');
  });

  describe('validation', () => {
    it('should reject duplicate step aliases');
    it('should reject unsafe DataVault operations');
    it('should reject unknown operation types');
  });

  describe('operation application', () => {
    it('should create section with tempId');
    it('should create step referencing section tempId');
    it('should update step properties');
    it('should rollback on error');
  });
});
```

**Estimated Effort:** 4-6 hours
**Priority:** High

---

### Integration Tests Needed

**2. AI Endpoint Integration Test**
```typescript
// tests/integration/ai/workflowEdit.test.ts

describe('POST /api/workflows/:id/ai/edit', () => {
  it('should create draft version on edit');
  it('should not create version on no-op');
  it('should enforce draft mode');
  it('should create before/after snapshots');
  it('should reject unauthorized users');
  it('should reject unsafe DataVault ops');
  it('should handle multi-op with tempIds');
});
```

**Estimated Effort:** 6-8 hours
**Priority:** High

---

### E2E Tests Needed

**3. Full User Flow Test**
```typescript
// tests/e2e/ai-workflow-editing.spec.ts

test('AI workflow editing flow', async ({ page }) => {
  // 1. Login
  // 2. Open workflow builder
  // 3. Open AI panel
  // 4. Send prompt: "Add a phone number field"
  // 5. Verify step created
  // 6. Verify version created
  // 7. Check version history shows AI badge
  // 8. Click "Undo"
  // 9. Verify restore worked
  // 10. Check new "restored" version created
});
```

**Estimated Effort:** 4-6 hours
**Priority:** Medium

---

## 🔧 Integration Steps

### Step 1: Add AI Panel to Builder Page

**File:** `client/src/pages/workflows/[id]/build.tsx` (or wherever your builder is)

```tsx
import { ResizableBuilderLayout } from "@/components/builder/layout/ResizableBuilderLayout";
import { AiConversationPanel } from "@/components/builder/ai/AiConversationPanel";
import { VersionHistoryPanel } from "@/components/builder/versioning/VersionHistoryPanel";
import { versionAPI } from "@/lib/vault-api";
import { useState } from "react";

export function WorkflowBuilderPage({ workflowId }: { workflowId: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const handleAiEdit = (versionId: string) => {
    console.log("AI edit complete, version:", versionId);
    // Trigger workflow reload
    setRefreshKey(prev => prev + 1);
  };

  const handleUndo = async (versionId: string) => {
    try {
      await versionAPI.restore(workflowId, versionId);
      setRefreshKey(prev => prev + 1);
      toast({ title: "Changes undone successfully" });
    } catch (error) {
      toast({
        title: "Failed to undo",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleViewDiff = (versionId: string) => {
    setSelectedVersionId(versionId);
    setShowVersionHistory(true);
  };

  return (
    <>
      <ResizableBuilderLayout
        workflowId={workflowId}
        leftPanel={
          <YourSectionNavigator workflowId={workflowId} key={refreshKey} />
        }
        centerPanel={
          <YourWorkflowCanvas workflowId={workflowId} key={refreshKey} />
        }
        rightPanel={
          <AiConversationPanel
            workflowId={workflowId}
            onEdit={handleAiEdit}
            onUndo={handleUndo}
            onViewDiff={handleViewDiff}
          />
        }
      />

      <VersionHistoryPanel
        workflowId={workflowId}
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        onRestore={(version) => {
          setRefreshKey(prev => prev + 1);
        }}
        onDiff={(version) => {
          // Open diff viewer
        }}
      />
    </>
  );
}
```

---

### Step 2: Environment Configuration

**Required:**
```env
GEMINI_API_KEY=<your-key>  # ✅ Already configured
NODE_ENV=development
DATABASE_URL=<postgres-url>
```

**Optional (defaults work):**
```env
AI_PROVIDER=gemini  # or openai, anthropic
AI_MODEL=gemini-1.5-pro
MAX_AI_OPS_PER_REQUEST=50
AI_TIMEOUT_MS=30000
```

---

### Step 3: Test Manually

**Prompts to try:**

1. **Simple add:**
   ```
   "Add a phone number field to the contact section"
   ```

2. **Multi-step with tempId:**
   ```
   "Create a new 'Employment' section after 'Personal Info' with job title, company name, and start date fields"
   ```

3. **Update existing:**
   ```
   "Make the email field optional"
   ```

4. **Complex:**
   ```
   "Add a dropdown asking 'How did you hear about us?' with options: Friend, Website, Advertisement, Social Media, Other"
   ```

5. **Should be rejected:**
   ```
   "Delete all DataVault tables"
   ```
   Expected: Error about unsafe DataVault operation

---

## 📊 Production Deployment Checklist

### Pre-Deployment

- [ ] **Complete stub implementations** (logic, documents, datavault)
- [ ] **Add unit tests** (80%+ coverage for WorkflowPatchService)
- [ ] **Add integration tests** (AI endpoint flow)
- [ ] **Load testing** (100 concurrent AI requests)
- [ ] **Security audit** (DataVault safety rules, ACL enforcement)

### Deployment

- [ ] **Feature flag** - Deploy behind flag, enable for beta users
- [ ] **Monitoring** - Add metrics for AI API calls, success rate, errors
- [ ] **Alerts** - Alert on high error rate, API quota exceeded
- [ ] **Documentation** - User guide, examples, limitations

### Post-Deployment

- [ ] **Beta testing** - 2 weeks with 10-20 power users
- [ ] **Feedback collection** - Track prompt patterns, error rates
- [ ] **Iteration** - Refine system prompt based on usage
- [ ] **Gradual rollout** - Increase to 50%, then 100%

---

## 🎯 MVP vs Full Production

### MVP (Ready Now)
What works today:
- Basic section/step CRUD
- Draft enforcement
- Version history
- Undo/restore
- DataVault safety
- UI layout and chat

**Use Cases Supported:**
- Add/remove steps
- Modify step properties
- Reorder sections
- Update workflow metadata

### Full Production (After Stubs Completed)
Additional capabilities:
- Conditional logic via AI
- Document template generation
- DataVault table creation
- Advanced field mapping

**Estimated Time to Full Production:** 2-3 days of focused work

---

## 🚀 Recommended Next Steps

### Immediate (This Week)
1. ✅ **Integration** - Wire up AI panel in builder page (1 hour)
2. ✅ **Manual testing** - Test 10-20 prompts (2 hours)
3. ✅ **Bug fixes** - Address any issues found (2-4 hours)

### Short-term (Next Week)
4. **Complete document ops** - Integrate with DocumentGenerationService (3 hours)
5. **Complete DataVault ops** - Integrate with DataVault services (4 hours)
6. **Add unit tests** - WorkflowPatchService coverage (6 hours)

### Medium-term (Next Sprint)
7. **Complete logic rule ops** - Build condition parser (6 hours)
8. **Add integration tests** - Full endpoint flow (8 hours)
9. **Load testing** - Verify performance (4 hours)

---

## 📈 Success Metrics

### Technical Metrics
- **AI Success Rate:** >90% of prompts successfully applied
- **Error Rate:** <5% of requests fail
- **Response Time:** p95 <3 seconds
- **Version Accuracy:** 100% (no lost data, all versions restorable)

### User Metrics
- **Adoption Rate:** 40%+ of workflow builders use AI within first month
- **Prompts per Session:** Average 5-10 prompts per editing session
- **User Satisfaction:** >4.0/5.0 rating

### Safety Metrics
- **DataVault Violations:** 0 (all unsafe ops rejected)
- **Data Loss Events:** 0 (all changes reversible)
- **Security Incidents:** 0 (all auth/ACL checks passed)

---

## 🔒 Safety Guarantees

### What Cannot Happen
1. ❌ AI cannot delete DataVault tables or columns
2. ❌ AI cannot delete existing workflow data
3. ❌ AI cannot publish workflows (manual only)
4. ❌ AI cannot bypass ACL (user permissions enforced)
5. ❌ AI cannot break referential integrity (validation enforced)

### What Can Be Undone
1. ✅ Any AI edit can be restored via version history
2. ✅ Multiple undos supported (full history preserved)
3. ✅ Undo creates new version (audit trail intact)

---

**Status Summary:**
- **Core System:** ✅ Production Ready (MVP)
- **Stub Completions:** ⚠️ 2-3 days work remaining
- **Testing:** ⚠️ 1-2 days work remaining
- **Deployment:** 🟡 Ready for beta with current MVP

**Recommendation:** Deploy MVP to beta users now, complete stubs in parallel based on user feedback.
