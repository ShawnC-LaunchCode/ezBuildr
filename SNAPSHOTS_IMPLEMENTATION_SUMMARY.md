# Snapshots + Randomized Runs Implementation Summary

**Status:** Backend + API Client Complete ✅ | Frontend UI Pending 🚧
**Date:** November 27, 2025

---

## ✅ COMPLETED: Backend Implementation (100%)

### 1. Database Layer ✅
**File:** `migrations/0050_add_workflow_snapshots.sql`
- Created `workflow_snapshots` table with JSONB values storage
- Indexes: workflow_id, created_at, unique (workflow_id, name)
- Schema pushed to database successfully

**File:** `shared/schema.ts` (lines 978-990)
- Added `workflowSnapshots` table definition
- Exported types for TypeScript

### 2. Repository Layer ✅
**File:** `server/repositories/SnapshotRepository.ts` (100 lines)
- `findByWorkflowId()` - List all snapshots for a workflow
- `findByWorkflowIdAndName()` - Find snapshot by name
- `updateValues()` - Save run values with versioning
- `updateName()` - Rename snapshot
- Singleton instance exported

**File:** `server/repositories/index.ts`
- Exported `SnapshotRepository` and types

### 3. Service Layer ✅
**File:** `server/services/SnapshotService.ts` (217 lines)
- `getSnapshotsByWorkflowId()` - List snapshots
- `createSnapshot()` - Create empty snapshot with name validation
- `renameSnapshot()` - Rename with duplicate checking
- `deleteSnapshot()` - Delete snapshot
- `saveFromRun()` - Save run values to snapshot (versioned with timestamps)
- `getSnapshotValues()` - Get simple key-value map
- `validateSnapshot()` - Check if snapshot is still current

**File:** `server/services/AIService.ts` (lines 555-650)
- Added `suggestValues()` method for random data generation
- Supports 'full' and 'partial' modes
- Type-aware value generation for all step types
- Cohesive data generation (e.g., matching first/last names)

**File:** `server/services/RunService.ts` (lines 155-229, 984-1108)
- Extended `createRun()` with `options` parameter:
  - `snapshotId`: Load snapshot values
  - `randomize`: Generate AI-powered random data
- Added `determineStartSection()` for auto-advance logic:
  - Respects workflow visibility rules
  - Validates required step completion
  - Checks snapshot version timestamps
  - Returns first incomplete section

**File:** `server/services/index.ts`
- Exported `SnapshotService` singleton

### 4. API Routes ✅
**File:** `server/routes/snapshots.routes.ts` (262 lines)
```
GET    /api/workflows/:workflowId/snapshots
GET    /api/workflows/:workflowId/snapshots/:snapshotId
POST   /api/workflows/:workflowId/snapshots
PUT    /api/workflows/:workflowId/snapshots/:snapshotId
DELETE /api/workflows/:workflowId/snapshots/:snapshotId
POST   /api/workflows/:workflowId/snapshots/:snapshotId/save-from-run
GET    /api/workflows/:workflowId/snapshots/:snapshotId/values
GET    /api/workflows/:workflowId/snapshots/:snapshotId/validate
```

**File:** `server/routes/ai.routes.ts` (lines 474-551)
```
POST   /api/ai/suggest-values
```

**File:** `server/routes/runs.routes.ts` (lines 48-123)
- Extended `POST /api/workflows/:workflowId/runs` to accept:
  - `snapshotId` - Load from snapshot
  - `randomize` - Generate random data
  - Returns `currentSectionId` for auto-advance

**File:** `server/routes/index.ts`
- Registered `registerSnapshotRoutes(app)`

---

## ✅ COMPLETED: Frontend API Layer (100%)

### 5. API Client ✅
**File:** `client/src/lib/vault-api.ts`

**Snapshot API** (lines 225-277):
```typescript
export interface ApiSnapshot {
  id: string;
  workflowId: string;
  name: string;
  values: Record<string, { value: any; stepId: string; stepUpdatedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export const snapshotAPI = {
  list(workflowId: string): Promise<ApiSnapshot[]>
  get(workflowId: string, snapshotId: string): Promise<ApiSnapshot>
  create(workflowId: string, name: string): Promise<ApiSnapshot>
  rename(workflowId: string, snapshotId: string, name: string): Promise<ApiSnapshot>
  delete(workflowId: string, snapshotId: string): Promise<void>
  saveFromRun(workflowId: string, snapshotId: string, runId: string): Promise<ApiSnapshot>
  getValues(workflowId: string, snapshotId: string): Promise<Record<string, any>>
  validate(workflowId: string, snapshotId: string): Promise<{ isValid: boolean; outdatedSteps: string[] }>
}
```

**AI API** (lines 1143-1161):
```typescript
export interface AIStepData {
  key: string;
  type: string;
  label?: string;
  options?: string[];
  description?: string;
}

export const aiAPI = {
  suggestValues(steps: AIStepData[], mode: 'full' | 'partial'): Promise<Record<string, any>>
}
```

**Run API** (lines 531-548):
- Extended `runAPI.create()` to accept `snapshotId` and `randomize`
- Returns `currentSectionId` for auto-advance

### 6. React Query Hooks ✅
**File:** `client/src/lib/vault-hooks.ts`

**Query Keys** (lines 20-21):
```typescript
snapshots: (workflowId: string) => ["workflows", workflowId, "snapshots"]
snapshot: (workflowId: string, snapshotId: string) => ["workflows", workflowId, "snapshots", snapshotId]
```

**Hooks** (lines 202-266):
```typescript
useSnapshots(workflowId): UseQueryResult<ApiSnapshot[]>
useSnapshot(workflowId, snapshotId): UseQueryResult<ApiSnapshot>
useCreateSnapshot(): UseMutationResult<...>
useRenameSnapshot(): UseMutationResult<...>
useDeleteSnapshot(): UseMutationResult<...>
useSaveSnapshotFromRun(): UseMutationResult<...>
```

---

## 🚧 REMAINING: Frontend UI Components (3 Components)

### Component 1: SnapshotsPanel
**Location:** `client/src/components/builder/final/SnapshotsPanel.tsx` (create new)

**Purpose:** Display and manage snapshots in the Workflow Builder

**Required Features:**
- List all snapshots for current workflow
- Show snapshot metadata (name, created date, value count)
- Actions per snapshot:
  - ▶️ Preview with Snapshot → Creates run with `snapshotId`
  - ✏️ Rename → Shows inline edit or modal
  - 🗑️ Delete → Shows confirmation
- **Create New Snapshot** button at top
- Empty state when no snapshots exist

**Hooks to Use:**
```typescript
const { data: snapshots, isLoading } = useSnapshots(workflowId);
const createSnapshot = useCreateSnapshot();
const renameSnapshot = useRenameSnapshot();
const deleteSnapshot = useDeleteSnapshot();
const createRun = useMutation({ mutationFn: runAPI.create });
```

**UI Structure:**
```tsx
<div className="p-4">
  <div className="flex justify-between mb-4">
    <h2>Snapshots</h2>
    <Button onClick={handleCreateSnapshot}>
      + New Snapshot
    </Button>
  </div>

  {snapshots?.length === 0 ? (
    <EmptyState />
  ) : (
    <div className="space-y-2">
      {snapshots?.map(snapshot => (
        <SnapshotCard
          key={snapshot.id}
          snapshot={snapshot}
          onPreview={handlePreview}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )}
</div>
```

**Preview with Snapshot Flow:**
1. Click "Preview" on a snapshot
2. Call `runAPI.create(workflowId, { snapshotId: snapshot.id })`
3. Receive `{ runId, runToken, currentSectionId }`
4. Navigate to `/preview/:runId` with auto-advance to `currentSectionId`

**Where to Add:** Inside `WorkflowBuilder` component tabs (alongside Sections, Settings, Templates, etc.)

---

### Component 2: RunWithRandomDataButton
**Location:** `client/src/components/builder/actions/RunWithRandomDataButton.tsx` (create new)

**Purpose:** Button in Workflow Builder to create a run with AI-generated random data

**Required Features:**
- Button with icon (🎲 or similar)
- Loading state while AI generates data
- Error handling for AI failures
- Success → Navigate to preview with new run

**Hooks to Use:**
```typescript
const createRun = useMutation({
  mutationFn: (workflowId: string) => runAPI.create(workflowId, { randomize: true })
});
```

**UI Structure:**
```tsx
<Button
  onClick={handleRandomRun}
  disabled={isCreating}
  variant="secondary"
>
  {isCreating ? (
    <>
      <Spinner /> Generating...
    </>
  ) : (
    <>
      🎲 Run with Random Data
    </>
  )}
</Button>
```

**Flow:**
1. User clicks button
2. Show loading state
3. Call `runAPI.create(workflowId, { randomize: true })`
4. On success: Navigate to `/preview/:runId`
5. On error: Show toast notification

**Where to Add:** In WorkflowBuilder header/toolbar, next to "Preview" button

**Note:** Requires `AI_API_KEY` environment variable configured

---

### Component 3: FillPageWithRandomDataButton
**Location:** `client/src/components/runner/FillPageWithRandomDataButton.tsx` (create new)

**Purpose:** Button in Preview mode to fill current page/section with random data

**Required Features:**
- Only visible in preview mode (not in published runs)
- Generates random data for current section's visible steps only
- Applies values to form fields immediately
- Saves values to run via API
- Does NOT auto-advance to next section

**Hooks to Use:**
```typescript
const fillPage = useMutation({
  mutationFn: async ({ runId, sectionId }: { runId: string; sectionId: string }) => {
    // 1. Get all steps for current section
    const steps = await stepAPI.list(sectionId);

    // 2. Filter visible steps (respect visibility logic)
    const visibleSteps = steps.filter(step => /* visibility check */);

    // 3. Build AIStepData array
    const stepData: AIStepData[] = visibleSteps.map(step => ({
      key: step.alias || step.id,
      type: step.type,
      label: step.title,
      options: step.config?.options,
      description: step.description
    }));

    // 4. Call AI to generate values
    const values = await aiAPI.suggestValues(stepData, 'partial');

    // 5. Save values to run
    await Promise.all(
      Object.entries(values).map(([key, value]) => {
        const step = visibleSteps.find(s => s.alias === key || s.id === key);
        return runAPI.upsertValue(runId, step!.id, value);
      })
    );

    return values;
  }
});
```

**UI Structure:**
```tsx
<Button
  onClick={handleFillPage}
  disabled={isFilling}
  variant="outline"
  className="absolute top-4 right-20"
>
  {isFilling ? (
    <>
      <Spinner /> Filling...
    </>
  ) : (
    <>
      🎲 Fill This Page
    </>
  )}
</Button>
```

**Flow:**
1. User clicks button
2. Show loading state
3. Collect visible steps for current section
4. Call `aiAPI.suggestValues()` with steps
5. Apply values to form fields (update React Hook Form)
6. Save values via `runAPI.upsertValue()`
7. Show success toast
8. User can review and edit values
9. User clicks "Next" when ready

**Where to Add:** In Preview/WorkflowRunner header, next to "Back to Builder" button

**Important:** Only render this button when `mode === 'preview'` (not for published/public runs)

---

## Testing the Implementation

### Backend Testing (curl/Postman)

```bash
# Create a snapshot
curl -X POST http://localhost:5000/api/workflows/{workflowId}/snapshots \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Snapshot 1"}'

# List snapshots
curl http://localhost:5000/api/workflows/{workflowId}/snapshots

# Create run with snapshot
curl -X POST http://localhost:5000/api/workflows/{workflowId}/runs \
  -H "Content-Type: application/json" \
  -d '{"snapshotId": "{snapshotId}"}'

# Create run with random data (requires AI_API_KEY)
curl -X POST http://localhost:5000/api/workflows/{workflowId}/runs \
  -H "Content-Type: application/json" \
  -d '{"randomize": true}'

# Generate random values for specific steps
curl -X POST http://localhost:5000/api/ai/suggest-values \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      {"key": "firstName", "type": "short_text", "label": "First Name"},
      {"key": "age", "type": "short_text", "label": "Age"}
    ],
    "mode": "full"
  }'
```

### Frontend Testing Checklist

**SnapshotsPanel:**
- [ ] Renders empty state when no snapshots
- [ ] Shows list of snapshots with metadata
- [ ] Create new snapshot works
- [ ] Rename snapshot works
- [ ] Delete snapshot shows confirmation
- [ ] Preview with snapshot creates run and navigates
- [ ] Auto-advances to correct section

**RunWithRandomDataButton:**
- [ ] Button renders in workflow builder
- [ ] Click creates run with random data
- [ ] Shows loading state during generation
- [ ] Navigates to preview on success
- [ ] Shows error toast on failure
- [ ] Requires AI_API_KEY configured

**FillPageWithRandomDataButton:**
- [ ] Only visible in preview mode
- [ ] Generates values for current section only
- [ ] Applies values to form immediately
- [ ] Saves values to run
- [ ] Does NOT auto-advance
- [ ] Shows loading state
- [ ] Handles visibility logic correctly

---

## Environment Configuration

**Required Environment Variables:**

```env
# For randomize feature (optional but recommended)
AI_PROVIDER=openai  # or 'anthropic'
AI_API_KEY=your-api-key-here
AI_MODEL_WORKFLOW=gpt-4-turbo-preview  # or claude-3-5-sonnet-20241022
```

**Generate AI Key:**
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/settings/keys

---

## Architecture Decisions

### 1. Versioned Snapshots
Snapshots store `{ value, stepId, stepUpdatedAt }` for each step value. This allows:
- Detection of step changes since snapshot was saved
- Auto-advance stops at first changed/outdated question
- Prevents stale data from being used

### 2. Auto-Advance Logic
The `determineStartSection()` function:
- Evaluates workflow visibility rules
- Checks required field completion
- Validates snapshot timestamps
- Returns first incomplete section
- Jumps to final block if all complete

### 3. Two Random Data Modes
- **Full Run** (`randomize: true`): Generates data for entire workflow, auto-advances to first gap
- **Per-Page** (`aiAPI.suggestValues`): Generates data for current section only, no auto-advance

### 4. Direct API Injection (No URL Hacks)
Values are injected via `initialValues` parameter in `createRun()`, not via URL query parameters. This is cleaner and more maintainable.

---

## Next Steps

1. **Create SnapshotsPanel component** - Add to Workflow Builder tabs
2. **Create RunWithRandomDataButton** - Add to builder toolbar
3. **Create FillPageWithRandomDataButton** - Add to preview header
4. **Test end-to-end** - Verify all flows work together
5. **Update documentation** - Add user-facing guides

---

## Files Modified/Created

### Backend (10 files)
- ✅ `migrations/0050_add_workflow_snapshots.sql`
- ✅ `shared/schema.ts`
- ✅ `server/repositories/SnapshotRepository.ts`
- ✅ `server/repositories/index.ts`
- ✅ `server/services/SnapshotService.ts`
- ✅ `server/services/AIService.ts`
- ✅ `server/services/RunService.ts`
- ✅ `server/services/index.ts`
- ✅ `server/routes/snapshots.routes.ts`
- ✅ `server/routes/ai.routes.ts`
- ✅ `server/routes/runs.routes.ts`
- ✅ `server/routes/index.ts`

### Frontend API (2 files)
- ✅ `client/src/lib/vault-api.ts`
- ✅ `client/src/lib/vault-hooks.ts`

### Frontend UI (3 files - TODO)
- 🚧 `client/src/components/builder/final/SnapshotsPanel.tsx`
- 🚧 `client/src/components/builder/actions/RunWithRandomDataButton.tsx`
- 🚧 `client/src/components/runner/FillPageWithRandomDataButton.tsx`

---

## Summary

**Backend:** 100% Complete ✅
**API Client:** 100% Complete ✅
**UI Components:** 0% Complete (3 components remaining) 🚧

All backend infrastructure is production-ready and tested. The remaining work is purely UI/UX implementation using the provided API client and hooks.
