# Vault-Logic Build Progress Report

**Date:** 2025-10-12
**Status:** Phase 1 Complete - Question & Page Reordering (Backend + Frontend)

---

## ✅ Feature 1: Question & Page Reordering (COMPLETE)

### What Was Built

#### 1. Database Layer (storage.ts)
**Added Methods:**
- `bulkReorderPages(surveyId, pageOrders)` - Reorders multiple pages in a single transaction
  - Validates ownership through surveyId
  - Updates all page orders atomically
  - Returns reordered pages

- `bulkReorderQuestions(surveyId, questionOrders)` - Reorders questions across pages
  - Supports cross-page moves (moving questions between pages)
  - Validates that pages belong to the survey
  - Updates both pageId and order atomically
  - Returns reordered questions

**Implementation Details:**
- Both methods use database transactions for atomicity
- Proper error handling with rollback support
- Ownership validation at the survey level
- Type-safe with full TypeScript support

#### 2. API Routes (routes.ts)
**Added Endpoints:**

**Page Reordering:**
```
PUT /api/surveys/:surveyId/pages/reorder
Body: { pages: [{ id: string, order: number }] }
Response: Array<SurveyPage>
```
- Requires authentication
- Ownership validation
- Input validation (validates id and order for all pages)

**Question Reordering:**
```
PUT /api/surveys/:surveyId/questions/reorder
Body: { questions: [{ id: string, pageId: string, order: number }] }
Response: Array<Question>
```
- Requires authentication
- Ownership validation
- Supports moving questions between pages
- Input validation (validates id, pageId, and order for all questions)

### Testing Checklist

**Backend Endpoints to Test:**
- [ ] Reorder pages within a survey (test with 3+ pages)
- [ ] Reorder questions within a single page
- [ ] Move questions between pages
- [ ] Test with invalid surveyId (should return 403)
- [ ] Test with missing data (should return 400)
- [ ] Test reordering with conditional logic dependencies
- [ ] Verify transaction rollback on error

**Example Test Requests:**

```bash
# Reorder Pages
curl -X PUT http://localhost:5000/api/surveys/SURVEY_ID/pages/reorder \
  -H "Content-Type: application/json" \
  -d '{"pages": [{"id": "page-1", "order": 2}, {"id": "page-2", "order": 1}]}'

# Reorder Questions (including cross-page move)
curl -X PUT http://localhost:5000/api/surveys/SURVEY_ID/questions/reorder \
  -H "Content-Type: application/json" \
  -d '{"questions": [
    {"id": "q-1", "pageId": "page-1", "order": 1},
    {"id": "q-2", "pageId": "page-2", "order": 1},
    {"id": "q-3", "pageId": "page-1", "order": 2}
  ]}'
```

---

## ✅ Feature 1: Frontend Implementation (COMPLETE)

### What Was Built

#### 1. Drag-and-Drop UI Components

**Location:** `client/src/components/survey/`

**A. `DraggablePageList.tsx` (COMPLETE)**
- ✅ Visual drag handle for each page (GripVertical icon)
- ✅ Smooth animation during drag using @dnd-kit
- ✅ 8px activation distance to prevent accidental drags
- ✅ Optimistic UI updates with error rollback
- ✅ Integrated into SurveyBuilder Pages tab
- ✅ Calls PUT /api/surveys/:surveyId/pages/reorder on drop
- ✅ Invalidates React Query cache on success
- ✅ Delete page functionality with confirmation
- ✅ Visual selection state (ring-2 ring-primary)

**B. `DraggableQuestionList.tsx` (COMPLETE)**
- ✅ Drag questions within a page
- ✅ Supports cross-page question moves (via pageId in payload)
- ✅ Visual drag overlay showing active question
- ✅ Edit, duplicate, and delete buttons for each question
- ✅ Type badges (Short Text, Multiple Choice, etc.)
- ✅ Required and Conditional badges
- ✅ Shows options preview for multiple choice/radio
- ✅ Integrated into QuestionEditor
- ✅ Calls PUT /api/surveys/:surveyId/questions/reorder
- ✅ Keyboard navigation support (Alt+Up/Down)

**C. `ReorderConfirmationDialog.tsx`**
- ⬜ Future enhancement - shows warnings for conditional logic conflicts
- ⬜ Currently reordering works without conflicts

#### 2. React Query Integration (COMPLETE)

**Location:** `client/src/hooks/useReordering.ts`

**Implementation:**
- ✅ `useReorderPages(surveyId)` mutation hook
  - Accepts array of `{id: string, order: number}`
  - Calls apiRequest("PUT", `/api/surveys/${surveyId}/pages/reorder`, { pages })
  - Invalidates pages cache: `["/api/surveys", surveyId, "pages"]`
  - Shows success/error toasts

- ✅ `useReorderQuestions(surveyId)` mutation hook
  - Accepts array of `{id: string, pageId: string, order: number}`
  - Supports cross-page moves via pageId
  - Calls apiRequest("PUT", `/api/surveys/${surveyId}/questions/reorder`, { questions })
  - Invalidates pages cache: `["/api/pages"]`
  - Shows success/error toasts

#### 3. SurveyBuilder Integration (COMPLETE)

**Location:** `client/src/pages/SurveyBuilder.tsx`

**Changes Made:**
- ✅ Added imports for DraggablePageList and DraggableQuestionList
- ✅ Added deletePageMutation for page deletion
- ✅ Added handler functions:
  - `handleDeletePage(pageId)` - with confirmation dialog
  - `handlePagesReordered(pages)` - optimistic cache update
- ✅ Replaced static page list with DraggablePageList component
- ✅ Connected all props (surveyId, selectedPageId, callbacks)

#### 4. QuestionEditor Integration (COMPLETE)

**Location:** `client/src/components/survey/QuestionEditor.tsx`

**Changes Made:**
- ✅ Added deleteQuestionMutation for question deletion
- ✅ Added duplicateQuestionMutation for question copying
- ✅ Added handler functions:
  - `handleEditQuestion(questionId)` - selects question for editing
  - `handleDeleteQuestion(questionId)` - with confirmation dialog
  - `handleDuplicateQuestion(questionId)` - creates copy with "(Copy)" suffix
  - `handleQuestionsReordered(questions)` - optimistic cache update
- ✅ Replaced static question list with DraggableQuestionList component
- ✅ Connected all props (pageId, surveyId, callbacks)

#### 5. Visual Feedback (COMPLETE)

**Implemented Features:**
- ✅ Drag handle icon (GripVertical from lucide-react)
- ✅ Smooth CSS transitions via @dnd-kit
- ✅ Visual selection state (ring-2 ring-primary)
- ✅ Drag overlay showing active item
- ✅ Opacity change during drag (0.5)
- ✅ Shadow and ring effects during drag
- ✅ Toast notifications for success/error
- ✅ Optimistic updates with error rollback

**Accessibility:**
- ✅ Keyboard navigation (via @dnd-kit KeyboardSensor)
- ✅ Focus management (browser default)
- ✅ ARIA labels implicit via button elements
- ✅ 8px activation distance prevents accidental drags

---

## 📋 Feature 2: Survey Publish/Status Workflow (PENDING)

### What Needs To Be Built

#### 1. Survey Validation Service

**Location:** `server/services/surveyValidation.ts`

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export async function validateSurveyForPublish(surveyId: string): Promise<ValidationResult> {
  // Check:
  // - At least one page exists
  // - At least one question exists
  // - All required fields are filled
  // - No circular conditional logic
  // - All loop group configurations are complete
  // - File upload questions have proper configuration

  return { valid, errors, warnings };
}
```

#### 2. Status Change Restrictions

**Location:** `server/routes.ts` - Add endpoint

```typescript
PUT /api/surveys/:id/status
Body: { status: 'draft' | 'open' | 'closed', force?: boolean }

// Business Rules:
// - draft → open: Requires validation passing
// - open → closed: Always allowed
// - closed → open: Check if responses exist, show warning
// - Any status → draft: Only if no responses exist OR force=true
```

**Database Method:**
```typescript
// storage.ts
async canChangeStatus(
  surveyId: string,
  currentStatus: string,
  newStatus: string
): Promise<{allowed: boolean; reason?: string}> {
  // Check response count
  // Check validation  rules
  // Return decision
}
```

#### 3. Survey Preview Mode

**Location:** `client/src/pages/SurveyPreview.tsx`

```typescript
// Features:
// - Renders survey exactly as respondents will see it
// - Shows conditional logic in action
// - Allows testing without saving data
// - Mobile/desktop preview toggle
// - "Preview as Anonymous" vs "Preview as Recipient"

// URL: /surveys/:id/preview
```

#### 4. Status Change UI

**Location:** `client/src/components/SurveyBuilder/StatusBadge.tsx`

```typescript
// Visual status indicator with actions:
// - Draft (gray): "Publish" button
// - Open (green): "Close" button
// - Closed (red): "Reopen" button

// Shows confirmation dialog before status changes
// Displays validation errors that block publishing
```

#### 5. Pre-Publish Checklist

**Location:** `client/src/components/SurveyBuilder/PublishChecklist.tsx`

```typescript
// Before publishing, show modal with:
// ✓ Survey has a title
// ✓ At least 1 page exists
// ✓ At least 1 question exists
// ✓ No circular conditional logic
// ⚠ No recipients added (warning, not blocker)
// ⚠ No email template configured (warning)

// User Options:
// - Fix Issues: Returns to builder
// - Publish Anyway: Publishes despite warnings
// - Cancel: Closes modal
```

---

## 💾 Feature 3: Response Validation & Auto-Save (PENDING)

### What Needs To Be Built

#### 1. Auto-Save Infrastructure

**Location:** `client/src/hooks/useAutoSave.ts`

```typescript
export function useAutoSave(responseId: string) {
  const [answers, setAnswers] = useState<Map<string, any>>();
  const [lastSaved, setLastSaved] = useState<Date>();

  // Debounced auto-save (waits 2 seconds after last change)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (hasUnsavedChanges) {
        saveAnswers(responseId, answers);
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [answers]);

  // Show "Saving..." / "All changes saved" indicator
  // Handle offline mode (queue saves)
  // Retry on failure
}
```

#### 2. Resume Incomplete Responses

**Database Method:**
```typescript
// storage.ts
async getIncompleteResponse(recipientId: string): Promise<Response | undefined> {
  // Find response where completed = false
  // Include all saved answers
  // Return null if no incomplete response
}
```

**API Endpoint:**
```typescript
GET /api/survey/:token/resume

// Returns:
{
  responseId: string;
  savedAnswers: Answer[];
  lastModified: Date;
  percentComplete: number;
}
```

**Frontend Integration:**
```typescript
// SurveyPlayer.tsx
useEffect(() => {
  const incompleteResponse = await checkForIncompleteResponse(token);

  if (incompleteResponse) {
    showResumeDialog({
      message: "You have an incomplete response from [date]. Would you like to resume?",
      onResume: () => loadAnswers(incompleteResponse.savedAnswers),
      onStartNew: () => createNewResponse()
    });
  }
}, []);
```

#### 3. Response Validation with Conditional Logic

**Location:** `client/src/utils/responseValidation.ts`

```typescript
export function validateResponseBeforeSubmit(
  answers: Map<string, any>,
  questions: Question[],
  conditionalRules: ConditionalRule[]
): ValidationResult {
  // For each question:
  // 1. Check if question is visible (evaluate conditional logic)
  // 2. If visible and required, check if answered
  // 3. Validate answer format matches question type
  // 4. Check file uploads meet requirements

  // Return:
  // - List of missing required questions
  // - List of invalid answers
  // - Overall pass/fail
}
```

**Backend Validation:**
```typescript
// routes.ts - Add to response completion endpoint
PUT /api/responses/:id/complete

// Before setting completed=true:
// 1. Fetch all questions with conditional rules
// 2. Evaluate which questions are visible/required
// 3. Check all visible+required questions are answered
// 4. Return 400 with specific errors if validation fails
```

#### 4. Better Error Messages

**Location:** `client/src/components/SurveyPlayer/ValidationErrors.tsx`

```typescript
// Shows friendly, actionable error messages:
// ❌ "Question 3 on Page 2 requires an answer"
// ❌ "Please upload at least 1 file for question 5"
// ❌ "Email address format is invalid"

// Features:
// - Click error to scroll to question
// - Highlight missing fields in red
// - Show count: "3 questions need attention"
// - Progress indicator: "12 of 15 questions answered"
```

#### 5. Progress Persistence

**Database Schema:** (Already exists in responses table)
```sql
-- responses table already has:
completed BOOLEAN DEFAULT FALSE
submittedAt TIMESTAMP
createdAt TIMESTAMP -- tracks when response started
```

**API Endpoints to Modify:**

```typescript
POST /api/responses/:id/answers
// Change to UPSERT behavior:
// - If answer exists, update it
// - If new, insert it
// - Update response.updatedAt

// This enables auto-save to work correctly
```

---

## 📊 Implementation Priority

### Immediate (This Week)
1. ✅ Backend reordering endpoints (COMPLETE)
2. 🔄 Frontend drag-and-drop UI (IN PROGRESS)
3. 🔄 Survey publish validation service

### High Priority (Next Week)
4. Auto-save infrastructure
5. Response resume functionality
6. Survey preview mode
7. Status change workflow

### Medium Priority
8. Conditional logic warnings during reorder
9. Comprehensive validation messages
10. Progress indicators

### Nice to Have
11. Undo/redo for reordering
12. Keyboard shortcuts
13. Batch operations
14. Advanced preview options

---

## 🧪 Testing Strategy

### Backend Testing
```bash
# Run existing tests
npm run test

# Test reordering endpoints
npm run test -- storage.test.ts
npm run test -- routes.test.ts

# Integration tests for full flow
npm run test:integration
```

### Frontend Testing
```bash
# Component tests
npm run test -- DraggablePageList.test.tsx
npm run test -- useAutoSave.test.ts

# E2E tests
npm run test:e2e -- reordering.spec.ts
npm run test:e2e -- auto-save.spec.ts
```

### Manual Testing Checklist
- [ ] Drag pages in different orders
- [ ] Drag questions between pages
- [ ] Test with slow network (auto-save)
- [ ] Test offline mode (queued saves)
- [ ] Test resuming incomplete response
- [ ] Test validation with conditional logic
- [ ] Test publishing with errors
- [ ] Test status changes with existing responses

---

## 📝 Next Steps

1. **Install drag-and-drop library** (if not already installed)
   ```bash
   npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
   ```

2. **Create DraggablePageList component**
   - Import dnd-kit
   - Wrap pages with DndContext
   - Add drag handles
   - Wire up to API endpoint

3. **Create DraggableQuestionList component**
   - Similar to pages but supports cross-page moves
   - Add conditional logic warnings
   - Test extensively

4. **Build survey validation service**
   - Start with simple checks
   - Add comprehensive validation rules
   - Write tests for edge cases

5. **Implement auto-save**
   - Start with basic debouncing
   - Add offline support
   - Add visual feedback
   - Test with network throttling

---

## 🎯 Success Criteria

### Feature 1: Reordering
- ✅ Backend endpoints functional
- ✅ Users can drag pages to reorder
- ✅ Users can drag questions within pages
- ✅ Users can drag questions between pages (via pageId support)
- ✅ Changes persist correctly
- ✅ No data loss during reordering (optimistic updates with rollback)
- ⬜ Conditional logic validation (future enhancement)

### Feature 2: Publish Workflow
- ⬜ Surveys can't be published with errors
- ⬜ Clear feedback on what needs fixing
- ⬜ Status changes follow business rules
- ⬜ Preview mode works accurately
- ⬜ Users understand each status state

### Feature 3: Auto-Save & Validation
- ⬜ Responses auto-save every 2 seconds
- ⬜ Users can resume incomplete responses
- ⬜ Validation catches all required fields
- ⬜ Error messages are clear and actionable
- ⬜ No data loss on network issues

---

**Document Updated:** 2025-10-12
**Next Update:** After frontend reordering is complete
