# Stage 20 PR 2: Page-Level Conditions (Show/Skip Logic)

## Overview

Adds conditional page navigation to Intake Runner 2.0, allowing pages to be:
- **Hidden** based on user answers (`visibleIf`)
- **Automatically skipped** based on conditions (`skipIf`)

This enables dynamic workflow paths and improves user experience by showing only relevant pages.

## Database Changes

### Migration: `0020_add_page_conditions.sql`

Adds two JSONB columns to the `sections` table:

```sql
ALTER TABLE sections
ADD COLUMN visible_if jsonb DEFAULT NULL;

ALTER TABLE sections
ADD COLUMN skip_if jsonb DEFAULT NULL;
```

Both columns store condition expressions in the format defined by PR 1's condition system.

## Schema Changes

### `sections` table

```typescript
export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  order: integer("order").notNull(),
  // NEW: Page-level conditional logic
  visibleIf: jsonb("visible_if"), // Condition expression for visibility
  skipIf: jsonb("skip_if"), // Condition expression for skip logic
  createdAt: timestamp("created_at").defaultNow(),
});
```

## Core Service: IntakeNavigationService

### Purpose

Evaluates page conditions and calculates navigation state for intake runs.

### Key Methods

#### `evaluateNavigation(workflowId, runId, currentPageId, recordData?)`

Evaluates all page conditions and returns complete navigation state:

```typescript
interface PageNavigationResult {
  visiblePages: string[];        // IDs of navigable pages in order
  currentPageIndex: number;      // Current page index (0-based)
  nextPageId: string | null;     // Next page ID
  previousPageId: string | null; // Previous page ID
  progress: number;              // Progress percentage (0-100)
  skippedPages: string[];        // Pages skipped by skipIf
  hiddenPages: string[];         // Pages hidden by visibleIf
}
```

**Evaluation Order:**
1. Load all pages (sections) for workflow
2. Load all step values to build variable context
3. Evaluate `visibleIf` for each page → filter to visible pages
4. Evaluate `skipIf` for visible pages → filter to navigable pages
5. Calculate current index, next/previous, and progress

#### `getFirstPage(workflowId, runId, recordData?)`

Returns the first navigable page for a workflow run.

#### `isPageNavigable(workflowId, runId, pageId, recordData?)`

Validates that a specific page is currently navigable (visible and not skipped).

#### `getPageSequence(workflowId, runId, recordData?)`

Returns ordered array of all navigable page IDs (useful for breadcrumbs).

#### `validatePageConditions(workflowId)`

Validates page conditions for potential issues (e.g., both visibleIf and skipIf on same page).

## Condition Examples

### Simple Page Visibility

Show employment details page only if user is employed:

```typescript
{
  id: 'employment-page',
  title: 'Employment Details',
  visibleIf: {
    op: 'equals',
    left: { type: 'variable', path: 'employmentStatus' },
    right: { type: 'value', value: 'employed' }
  }
}
```

### Page Skip Logic

Skip tax details if user selected "tax-exempt":

```typescript
{
  id: 'tax-page',
  title: 'Tax Details',
  skipIf: {
    op: 'equals',
    left: { type: 'variable', path: 'taxStatus' },
    right: { type: 'value', value: 'tax-exempt' }
  }
}
```

### Complex Visibility

Show loan application page only for qualified users:

```typescript
{
  id: 'loan-page',
  title: 'Loan Application',
  visibleIf: {
    and: [
      { op: 'gte', left: { type: 'variable', path: 'age' }, right: { type: 'value', value: 21 } },
      { op: 'gte', left: { type: 'variable', path: 'income' }, right: { type: 'value', value: 30000 } },
      { op: 'gte', left: { type: 'variable', path: 'creditScore' }, right: { type: 'value', value: 600 } }
    ]
  }
}
```

## Behavior Specification

### `visibleIf` Behavior

- **Default**: Pages are visible by default (no condition = always visible)
- **Evaluation**: If `visibleIf` evaluates to `false`, page is completely hidden
- **Effect**: Hidden pages are removed from navigation, progress calculation, and validation
- **Error handling**: Evaluation errors default to visible (fail-safe)

### `skipIf` Behavior

- **Default**: Pages are not skipped (no condition = never skip)
- **Evaluation**: If `skipIf` evaluates to `true`, page is automatically skipped
- **Effect**: Runner advances past skipped page without user interaction
- **Error handling**: Evaluation errors default to not skipping (fail-safe)

### Combined `visibleIf` and `skipIf`

- **Evaluation order**: `visibleIf` is evaluated FIRST
- **Interaction**: `skipIf` only applies if page is visible
- **Use case**: A page can be conditionally shown, then conditionally skipped based on different criteria

Example:
```typescript
{
  // Show page if user has dependents
  visibleIf: {
    op: 'gt',
    left: { type: 'variable', path: 'dependentCount' },
    right: { type: 'value', value: 0 }
  },
  // But skip if user already provided details elsewhere
  skipIf: {
    op: 'notEmpty',
    left: { type: 'variable', path: 'dependentDetailsFromRecord' },
    right: { type: 'value', value: null }
  }
}
```

## Progress Calculation

Progress is calculated as: `(currentPageIndex + 1) / totalNavigablePages * 100`

**Important**: Progress is based on NAVIGABLE pages (after applying visibleIf and skipIf), not total pages.

Examples:
- Workflow with 5 pages, all visible: Page 1 = 20%, Page 5 = 100%
- Workflow with 5 pages, 2 hidden: Page 1 = 33%, Page 3 (last navigable) = 100%

## Testing

### Test Coverage

See `tests/unit/services/intakeNavigation.test.ts`:

- ✅ Basic navigation (no conditions)
- ✅ Empty workflow handling
- ✅ Current page index calculation
- ✅ `visibleIf` conditions (true/false/complex)
- ✅ `skipIf` conditions (true/false)
- ✅ Combined `visibleIf` and `skipIf`
- ✅ Helper methods (getFirstPage, isPageNavigable, getPageSequence)
- ✅ Error handling (invalid conditions default to safe behavior)
- ✅ Progress calculation (including with hidden/skipped pages)

## Integration Points

### Intake Runner (PR 7)

The intake runner state machine will use `IntakeNavigationService` to:
- Get first page on run start
- Calculate next/previous on navigation
- Display accurate progress bar
- Validate page access before rendering

### Builder UI (Future)

The workflow builder will provide UI to:
- Set `visibleIf` condition per page
- Set `skipIf` condition per page
- Preview navigation flow
- Validate conditions for circular dependencies

### API (Future)

New endpoints for runtime navigation:
```
GET /api/intake/:slug/runs/:runToken/navigation
  → Returns PageNavigationResult for current run state

GET /api/intake/:slug/runs/:runToken/pages/:pageId/navigable
  → Returns boolean: can user access this page?
```

## Validation & Safety

### Fail-Safe Defaults

On condition evaluation error:
- `visibleIf` error → Default to **visible** (include page)
- `skipIf` error → Default to **not skipping** (show page)

Rationale: Better to show an irrelevant page than hide a required one.

### Circular Skip Detection

Currently not implemented. Future enhancement: detect if skipIf conditions could create infinite loops where all pages are skipped.

### Warning Validation

`validatePageConditions()` warns if a page has both `visibleIf` and `skipIf` (valid but potentially confusing).

## Migration Path

1. **Existing workflows**: No migration needed. Pages without conditions behave as before (all visible, none skipped).
2. **Adding conditions**: Update section records with `visibleIf`/`skipIf` JSONB.
3. **Removing conditions**: Set columns to `NULL`.

## Performance Considerations

- **Evaluation cost**: O(n) where n = number of pages
- **Variable resolution**: O(m) where m = number of step values
- **Caching**: No caching implemented (evaluate on every navigation call)
- **Optimization**: For very large workflows (>50 pages), consider caching navigation results per run

## Known Limitations

1. **No circular skip detection**: Pages can theoretically all be skipped, leaving workflow with no navigable pages
2. **No condition preview**: Builder UI cannot preview which pages will be visible without real run data
3. **No backward navigation limits**: User can navigate back to previously skipped pages if conditions change

## Future Enhancements

- [ ] Circular skip detection
- [ ] Navigation hints in builder (e.g., "Page 3 depends on answer from Page 1")
- [ ] Workflow simulation mode to test condition paths
- [ ] Analytics on most common navigation paths
- [ ] Conditional "jump to page X" actions (beyond auto-skip)

## Files Changed/Added

### New Files

- `server/services/IntakeNavigationService.ts` (240 lines)
- `tests/unit/services/intakeNavigation.test.ts` (600+ lines)
- `migrations/0020_add_page_conditions.sql`
- `docs/STAGE_20_PR2_PAGE_CONDITIONS.md` (this file)

### Modified Files

- `shared/schema.ts` - Added `visibleIf` and `skipIf` columns to `sections` table

## Next PR

**PR 3: Question-Level Conditions**

Will add `visibleIf` to individual questions (steps) for fine-grained conditional display within pages.
