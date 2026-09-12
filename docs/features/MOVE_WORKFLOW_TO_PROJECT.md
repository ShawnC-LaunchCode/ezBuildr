# Move Workflow to Project Feature

**Status:** ✅ Complete
**Version:** 1.0
**PRs:** #1-5 (Move Workflow Project)

---

## Overview

The Move Workflow to Project feature allows users to organize workflows by assigning them to projects or keeping them in the "Main Folder" (unfiled). This feature is accessible from the Workflow Builder → Settings tab.

## User Experience

### Location
- **Page:** Workflow Builder → Settings Tab
- **Section:** "Project Assignment" card
- **Position:** Between "General" and "Branding" sections

### Features
- View current workflow location (project name or "Main Folder")
- Dropdown to select target project or Main Folder
- Confirmation modal before moving
- Success/error toast notifications
- Loading states and skeletons during data fetch
- Disabled state during move operation

### User Flow
1. User opens Workflow Builder → Settings tab
2. User sees "Project Assignment" section
3. Current location is displayed (e.g., "Customer Onboarding" or "Main Folder")
4. User selects new location from dropdown
5. Confirmation modal appears:
   - Title: "Move Workflow?"
   - Message: "Are you sure you want to move "{workflowName}" to {targetName}?"
   - Buttons: "Cancel" and "Move Workflow"
6. User confirms or cancels
7. On confirm:
   - API call to move workflow
   - Success toast: "Workflow moved to {targetName}."
   - Workflow data refreshes
8. On error:
   - Error toast with error message
   - User can try again

---

## Technical Implementation

### Backend (Node.js + Express)

#### API Endpoint
```
PUT /api/workflows/:workflowId/move
```

**Request Body:**
```json
{
  "projectId": "uuid-string" | null
}
```

**Response:**
```json
{
  "id": "workflow-uuid",
  "projectId": "project-uuid" | null,
  "title": "Workflow Name",
  ...
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid input (invalid UUID, missing projectId)
- `401` - Unauthorized (no auth token)
- `403` - Forbidden (user doesn't own workflow or target project)
- `404` - Not found (workflow or project doesn't exist)

#### Service Layer

**File:** `server/services/WorkflowService.ts`

**Method:** `moveToProject(workflowId, userId, projectId)`

**Validations:**
1. User owns the workflow (via `verifyOwnership`)
2. If `projectId !== null`:
   - Target project exists
   - User owns or has access to target project
3. Database update via `WorkflowRepository.moveToProject()`

#### Repository Layer

**File:** `server/repositories/WorkflowRepository.ts`

**Method:** `moveToProject(workflowId, projectId, tx?)`

**SQL:**
```sql
UPDATE workflows
SET project_id = $1, updated_at = NOW()
WHERE id = $2
RETURNING *;
```

#### Database Schema

**Table:** `workflows`

**Column:** `projectId` (uuid, nullable, foreign key to `projects.id`)

**Constraint:** `ON DELETE CASCADE`

---

### Frontend (React + TypeScript)

#### Components

**1. ProjectAssignmentSection.tsx**

**Location:** `client/src/components/workflows/settings/ProjectAssignmentSection.tsx`

**Props:**
```typescript
interface ProjectAssignmentSectionProps {
  workflowId: string;
  workflowName: string;
  currentProjectId: string | null;
  currentProjectName?: string;
  projects: Array<{ id: string; name: string }>;
  onMove: (projectId: string | null) => Promise<void>;
  disabled?: boolean;
  isMoving?: boolean;
  isLoading?: boolean;
}
```

**Features:**
- Displays current location
- ShadCN Select dropdown with groups
- Modal trigger on selection change
- Loading skeleton during data fetch
- Empty state handling

**2. ConfirmMoveWorkflowModal.tsx**

**Location:** `client/src/components/workflows/settings/ConfirmMoveWorkflowModal.tsx`

**Props:**
```typescript
interface ConfirmMoveWorkflowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowName: string;
  targetName: string;
  onConfirm: () => void;
  isLoading?: boolean;
}
```

**Features:**
- AlertDialog-based confirmation
- Cancel and confirm buttons
- Loading state during move

**3. SettingsTab.tsx**

**Location:** `client/src/components/builder/tabs/SettingsTab.tsx`

**Integration:**
- Fetches workflow data via `useWorkflow()`
- Fetches projects via `useProjects(true)` (active only)
- Uses `useMoveWorkflow()` mutation hook
- Handles success/error toasts
- Passes loading and moving states

#### API Integration

**File:** `client/src/lib/vault-api.ts`

**Method:** `workflowAPI.moveToProject(id, projectId)`

**File:** `client/src/lib/vault-hooks.ts`

**Hook:** `useMoveWorkflow()`

**Implementation:**
```typescript
export function useMoveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string | null }) =>
      workflowAPI.moveToProject(id, projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(data.id) });
      // Invalidate project queries if moving to/from a project
      if (data.projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.project(data.projectId) });
      }
    },
  });
}
```

---

## Testing

### Backend Integration Tests

**File:** `tests/integration/api.workflows.test.ts`

**Test Suite:** `PUT /api/workflows/:id/move`

**Tests (8 total):**
1. ✅ Should move workflow to a project
2. ✅ Should move workflow to Main Folder (projectId = null)
3. ✅ Should reject move to non-existent project (404)
4. ✅ Should reject move without authentication (401)
5. ✅ Should reject move of workflow user doesn't own (403)
6. ✅ Should reject move with invalid projectId format (400)
7. ✅ Should reject move without projectId in body (400)
8. ✅ Should reject move to project user doesn't have access to (403)

### Manual Testing Checklist

- [ ] Settings tab loads with correct current location
- [ ] Dropdown shows "Main Folder" and all active projects
- [ ] Modal appears when selecting new location
- [ ] Modal shows correct workflow and target names
- [ ] Cancel button closes modal without moving
- [ ] Move button triggers API call
- [ ] Success toast appears on successful move
- [ ] Error toast appears on failed move
- [ ] Workflow data refreshes after move
- [ ] Loading skeleton appears while data loads
- [ ] Select is disabled during move operation
- [ ] Empty projects message shows when no projects exist

---

## Security

### Backend Validations
1. ✅ Authentication required (`isAuthenticated` middleware)
2. ✅ User owns the workflow
3. ✅ User has access to target project (if not null)
4. ✅ Input validation (UUID format, required fields)
5. ✅ SQL injection prevention (parameterized queries via Drizzle ORM)

### Frontend Protections
1. ✅ No direct SQL or sensitive data exposure
2. ✅ Proper error handling without stack traces
3. ✅ Loading states prevent race conditions
4. ✅ Confirmation modal prevents accidental moves

---

## Edge Cases Handled

1. **Moving to same location:** No-op, modal doesn't appear
2. **No projects exist:** Shows helpful message
3. **Project deleted after load:** 404 error, error toast
4. **User loses access during session:** 403 error, error toast
5. **Network error:** Error toast with retry option
6. **Workflow loading:** Skeleton UI
7. **Projects loading:** Skeleton UI
8. **Move in progress:** Select disabled, modal shows "Moving..."

---

## Future Enhancements

1. **Bulk move:** Move multiple workflows at once
2. **Move from dashboard:** Move workflows without opening builder
3. **Drag-and-drop:** Drag workflows between projects in dashboard
4. **Recent projects:** Quick access to recently used projects
5. **Move history:** Track workflow movement history
6. **Undo move:** Revert recent move operation

---

## Related Documentation

- [API Documentation](../api/API.md)
- [Testing Guide](../testing/TESTING.md)

---

**Last Updated:** November 17, 2025
**Maintainer:** Development Team
