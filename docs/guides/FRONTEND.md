# Vault-Logic Frontend Guide

## Running the Client

```bash
cd client
npm install
npm run dev
```

The dev server will start on `http://localhost:5173` (or the next available port).

## Environment Variables

Create a `.env.local` file in the project root (not in `client/`):

```env
# API Base URL (backend server)
VITE_API_BASE_URL=http://localhost:5000

# Google OAuth (optional for development)
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

## Architecture

### Pages
- **WorkflowDashboard** (`/workflows`): List workflows, create new ones
- **WorkflowBuilder** (`/workflows/:id/builder`): 3-pane builder interface
- **WorkflowRunner** (`/run/:id`): Participant/preview runner view

### Store (Zustand)
- `workflow-builder.ts`: UI state management
  - Easy/Advanced mode toggle
  - Selection tracking (workflow/page/step/block)
  - Preview state (runId, isOpen)
  - Inspector tab state

### API Layer
- `vault-api.ts`: Fetch wrappers for all endpoints
- `vault-hooks.ts`: TanStack Query hooks with optimistic updates

### Components

**Builder (`components/builder/`)**:
- `SidebarTree`: Drag-drop page/step tree
- `CanvasEditor`: Property editor with conditional fields
- `Inspector`: Tabbed panel (Properties/Blocks/Logic)
- `BlocksPanel`: Block CRUD with JSON config editor
- `RunnerPreview`: Embedded runner in builder

**Runner**:
- `WorkflowRunner`: Main runner with navigation
- `StepField`: Dynamic field rendering per type

## Features

### Builder
- ✅ Create/edit/delete workflows, pages, steps
- ✅ Easy/Advanced mode (shows/hides advanced fields)
- ✅ Block management (prefill, validate, branch)
- ✅ Live preview with temporary runs
- ✅ Auto-save on blur
- ⏳ Drag-drop reordering (basic implementation, needs dnd-kit integration)
- ⏳ Logic rule editor (placeholder)

### Runner
- ✅ All step types: short_text, long_text, radio, multiple_choice, yes_no, date_time
- ✅ Progress bar
- ✅ Validation errors from blocks
- ✅ Dynamic navigation via branch blocks
- ✅ Complete workflow flow
- ⏳ File upload support (UI ready, backend integration needed)

### Blocks
- ✅ Prefill: static/query mode
- ✅ Validate: conditional rules with error messages
- ✅ Branch: conditional navigation
- ✅ Phase selection (onRunStart, onPageSubmit, onNext, etc.)
- ✅ Enable/disable toggle
- ✅ Order management

## Test Checklist

### Prerequisites
- [ ] Backend server running on port 5000
- [ ] Database migrated (`npm run db:push`)
- [ ] User authenticated (Google OAuth or dev mode)

### Dashboard
- [ ] Navigate to `/workflows`
- [ ] Create new workflow
- [ ] See workflow appear in grid
- [ ] Click workflow card to open builder
- [ ] Archive/activate workflow via dropdown
- [ ] Delete workflow (with confirmation)

### Builder - Basics
- [ ] Open builder for a workflow
- [ ] Click "Add Page" in sidebar
- [ ] Select page, see properties in canvas
- [ ] Edit page title and description
- [ ] Click "+" next to page to add step
- [ ] Select step, see step editor in canvas

### Builder - Steps
- [ ] Change step type dropdown
- [ ] For radio/multiple_choice: add/edit/remove options
- [ ] Toggle "Required" switch
- [ ] Switch to "Advanced" mode - see variable key field
- [ ] Create multiple steps in different pages

### Builder - Blocks
- [ ] Click "Blocks" tab in inspector
- [ ] Create prefill block:
  - Type: prefill
  - Phase: onRunStart
  - Config: `{"mode": "static", "staticMap": {"test_key": "test_value"}}`
- [ ] Create validate block:
  - Type: validate
  - Phase: onPageSubmit
  - Config: `{"rules": [{"assert": {"key": "step_id", "op": "is_not_empty"}, "message": "Field required"}]}`
- [ ] Create branch block:
  - Type: branch
  - Phase: onNext
  - Config: `{"branches": [{"when": {"key": "step_id", "op": "equals", "value": "yes"}, "gotoPageId": "page_id"}]}`
- [ ] Edit block - change config
- [ ] Delete block

### Builder - Preview
- [ ] Toggle "Preview" in header
- [ ] See runner preview pane open
- [ ] Runner should show first page
- [ ] Fill out a step
- [ ] Click "Next" - should validate and navigate
- [ ] Toggle preview off - inspector reappears

### Runner - Standalone
- [ ] Create a run manually or via preview
- [ ] Navigate to `/run/{runId}`
- [ ] See progress bar
- [ ] Fill out short text field
- [ ] Test radio buttons
- [ ] Test multiple choice checkboxes
- [ ] Test yes/no radio
- [ ] Click "Next" without required field - see validation error
- [ ] Fill required field, click "Next" - navigate to next page
- [ ] Complete final page - see "Complete" button
- [ ] Click complete - success toast

### Validation Flow
- [ ] Create validate block with required field rule
- [ ] In runner, leave field empty and click "Next"
- [ ] See validation error message
- [ ] Fill field and click "Next" - should succeed

### Branching Flow
- [ ] Create 2 pages: A and B
- [ ] In page A, add a yes/no step
- [ ] Create branch block on page A (onNext):
  ```json
  {
    "branches": [
      {"when": {"key": "yes_no_step_id", "op": "equals", "value": true}, "gotoPageId": "page_b_id"}
    ],
    "fallbackPageId": "page_a_id"
  }
  ```
- [ ] Run workflow, answer "Yes" - should jump to page B
- [ ] Restart, answer "No" - should use fallback

### Easy/Advanced Mode
- [ ] In builder, click "Easy" mode
- [ ] Open step editor - should see only essential fields
- [ ] Click "Advanced" mode
- [ ] Should see variable key field and additional options

### Edge Cases
- [ ] Try to delete page with steps - should work (cascade)
- [ ] Create workflow with no pages - runner should handle gracefully
- [ ] Create page with no steps - should show "No steps" message
- [ ] Try to navigate past last page - should show "Complete" button
- [ ] Refresh page during editing - changes should persist (auto-save)

## Known Limitations

1. **Drag-drop reordering**: Basic UI in place, needs full dnd-kit integration
2. **Logic rule editor**: Placeholder tab, needs implementation
3. **File upload**: UI ready, needs backend storage integration
4. **Page visibility logic**: Not yet implemented
5. **Block config validation**: Currently accepts any JSON, needs Zod schemas
6. **Real-time collaboration**: Not implemented
7. **Undo/redo**: Not implemented
8. **Block visual editor**: Currently JSON only, could use form builder

## Extending

### Adding a new step type

1. Add to `StepType` in `vault-api.ts`
2. Add to `Select` options in `CanvasEditor.tsx`
3. Add rendering case in `StepField` in `WorkflowRunner.tsx`

### Adding a new block type

1. Add to `BlockType` in `vault-api.ts`
2. Update block config schema in `BlocksPanel.tsx`
3. Backend handles execution automatically

### Adding logic rules

1. Create `LogicEditor.tsx` component
2. Wire up to Inspector "Logic" tab
3. Use existing logic rule hooks (not yet created)

## Troubleshooting

**Problem**: "Cannot read properties of undefined"
- Check that all IDs are valid UUIDs
- Ensure backend is running and accessible
- Check browser console for API errors

**Problem**: Validation not working
- Verify block config matches expected schema
- Check that step IDs in block config match actual step IDs
- Look at Network tab to see validation response

**Problem**: Preview not loading
- Ensure run was created successfully
- Check that workflow has pages and steps
- Verify `VITE_API_BASE_URL` is correct

**Problem**: Styles not loading
- Run `npm install` in client directory
- Restart dev server
- Clear browser cache

## Production Build

```bash
cd client
npm run build
```

The built files will be in `client/dist/`. The backend serves these in production mode.

## Code Style

- TypeScript strict mode
- Functional components only
- Hooks for all state management
- TanStack Query for server state
- Zustand for UI state
- Tailwind for styling
- Radix UI for primitives

---

✅ Vault-Logic frontend revamp implemented — Builder + Runner ready for local testing.
