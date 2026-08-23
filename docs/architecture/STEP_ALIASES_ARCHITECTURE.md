# VaultLogic Codebase Structure Analysis - Step Aliases Implementation Guide

## Overview
VaultLogic is a workflow automation platform with a three-part architecture: Client (React), Server (Express/Node.js), and Shared utilities. The system uses Drizzle ORM for database operations and follows a service-repository pattern on the backend.

---

## 1. Database Schema - Steps Table (Drizzle)

### Location
`/home/user/VaultLogic/shared/schema.ts` (Lines 777-789)

### Steps Table Definition
```typescript
export const steps = pgTable("steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  pageId: uuid("page_id").references(() => pages.id, { onDelete: 'cascade' }).notNull(),
  type: stepTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  required: boolean("required").default(false),
  options: jsonb("options"), // For multiple choice, radio options
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("steps_page_idx").on(table.pageId),
]);
```

### Step Type Enum (Lines 718-726)
```typescript
export const stepTypeEnum = pgEnum('step_type', [
  'short_text',
  'long_text',
  'multiple_choice',
  'radio',
  'yes_no',
  'date_time',
  'file_upload'
]);
```

### Related Tables

#### Pages Table (Lines 765-774)
```typescript
export const pages = pgTable("pages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pages_workflow_idx").on(table.workflowId),
]);
```

#### Workflows Table (Lines 746-762)
```typescript
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'set null' }),
  status: workflowStatusEnum("status").default('draft').notNull(),
  modeOverride: text("mode_override"), // 'easy' | 'advanced'
  publicLink: text("public_link").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Schema Hierarchy
```
Workflow (1)
  ├── Page (N)
  │   └── Step (N)
  │       └── StepValue (N, during runs)
  └── LogicRule (N, conditional logic)
```

---

## 2. Step Service Layer

### Location
`/home/user/VaultLogic/server/services/StepService.ts`

### Key Methods
```typescript
class StepService {
  // Create a new step
  async createStep(workflowId: string, pageId: string, userId: string,
                  data: Omit<InsertStep, 'pageId'>): Promise<Step>

  // Update step properties
  async updateStep(stepId: string, workflowId: string, userId: string, 
                  data: Partial<InsertStep>): Promise<Step>

  // Delete step
  async deleteStep(stepId: string, workflowId: string, userId: string): Promise<void>

  // Reorder steps within page
  async reorderSteps(workflowId: string, pageId: string, userId: string,
                    stepOrders: Array<{ id: string; order: number }>): Promise<void>

  // Get steps for a page
  async getSteps(workflowId: string, pageId: string, userId: string): Promise<Step[]>
}
```

### Step Repository
**Location:** `/home/user/VaultLogic/server/repositories/StepRepository.ts`

```typescript
class StepRepository extends BaseRepository {
  // Find steps by page ID (ordered)
  async findByPageId(pageId: string, tx?: DbTransaction): Promise<Step[]>

  // Find steps by multiple page IDs
  async findByPageIds(pageIds: string[], tx?: DbTransaction): Promise<Step[]>

  // Find step by ID and verify page
  async findByIdAndPage(stepId: string, pageId: string, tx?: DbTransaction): Promise<Step | undefined>

  // Update step order
  async updateOrder(stepId: string, order: number, tx?: DbTransaction): Promise<Step>
}
```

---

## 3. Step Routes (Backend API Endpoints)

### Location
`/home/user/VaultLogic/server/routes/steps.routes.ts`

### Available Endpoints
```typescript
// Create a new step
POST /api/workflows/:workflowId/pages/:pageId/steps
Request: { type, title, description, required, options, order }
Response: Step

// Get all steps for a page
GET /api/workflows/:workflowId/pages/:pageId/steps
Response: Step[]

// Update a step
PUT /api/steps/:stepId
Request: { workflowId, ...updateData }
Response: Step

// Delete a step
DELETE /api/steps/:stepId
Query: workflowId
Response: 204 No Content

// Reorder steps within a page
PUT /api/workflows/:workflowId/pages/:pageId/steps/reorder
Request: { steps: Array<{ id, order }> }
Response: { message: "Steps reordered successfully" }
```

---

## 4. Logic Evaluation Service

### Location
`/home/user/VaultLogic/shared/workflowLogic.ts`

### Key Functions
```typescript
/**
 * Evaluates all logic rules for a workflow run
 * Returns visible pages, visible steps, and required steps
 */
export function evaluateRules(
  rules: LogicRule[],
  data: Record<string, any> // stepId -> value mapping
): WorkflowEvaluationResult {
  visiblePages: Set<string>;
  visibleSteps: Set<string>;
  requiredSteps: Set<string>;
  skipToPageId?: string;
}

/**
 * Validates that all required steps have values
 */
export function validateRequiredSteps(
  requiredStepIds: Set<string>,
  data: Record<string, any>
): { valid: boolean; missingSteps: string[] }

/**
 * Gets effective requirements based on initial requirements and logic rules
 */
export function getEffectiveRequiredSteps(
  initialRequiredSteps: Set<string>,
  rules: LogicRule[],
  data: Record<string, any>
): Set<string>
```

### Logic Rule Evaluation Engine
- **Supported Operators:** equals, not_equals, contains, not_contains, greater_than, less_than, between, is_empty, is_not_empty
- **Actions:** show, hide, require, make_optional
- **Target Types:** page or step level
- **Logical Operators:** AND, OR

### Logic Rule Table (Lines 792-808)
```typescript
export const logicRules = pgTable("logic_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  conditionStepId: uuid("condition_step_id").references(() => steps.id, { onDelete: 'cascade' }).notNull(),
  operator: conditionOperatorEnum("operator").notNull(),
  conditionValue: jsonb("condition_value").notNull(),
  targetType: logicRuleTargetTypeEnum("target_type").notNull(), // 'page' or 'step'
  targetStepId: uuid("target_step_id").references(() => steps.id, { onDelete: 'cascade' }),
  targetPageId: uuid("target_page_id").references(() => pages.id, { onDelete: 'cascade' }),
  action: conditionalActionEnum("action").notNull(),
  logicalOperator: varchar("logical_operator").default("AND"),
  order: integer("order").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Logic Rule Repository
**Location:** `/home/user/VaultLogic/server/repositories/LogicRuleRepository.ts`

```typescript
async findByWorkflowId(workflowId: string): Promise<LogicRule[]>
```

### Conditional Logic Utilities (Survey Support)
**Location:** `/home/user/VaultLogic/shared/conditionalLogic.ts`

Additional evaluation functions for survey-style conditional logic (question-based targeting).

---

## 5. Frontend Step Inspector Component

### Location
`/home/user/VaultLogic/client/src/components/builder/Inspector.tsx`

### Component Structure
```typescript
export function Inspector({ workflowId }: { workflowId: string }) {
  // Tabs: Properties | Blocks | Transform | Logic
  // Shows "Select an element to view its properties" when nothing selected
  // Logic tab shows "Logic rules coming soon..."
}
```

### Inspector Tabs
1. **Properties Tab** - Edit properties in canvas area
2. **Blocks Tab** - Prefill, validate, branch blocks
3. **Transform Tab** - Custom code execution blocks
4. **Logic Tab** - Conditional logic rules (currently placeholder)

### State Management
- Uses Zustand store: `useWorkflowBuilder()`
- Manages `selection`, `inspectorTab`, `mode`, `previewRunId`

---

## 6. Logic Editor Component (Placeholder)

### Location
`/home/user/VaultLogic/client/src/components/builder/Inspector.tsx` (Lines 62-68)

### Current Implementation
```typescript
<TabsContent value="logic" className="flex-1 overflow-y-auto p-4">
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Logic rules coming soon...
    </p>
  </div>
</TabsContent>
```

**Status:** NOT YET IMPLEMENTED - This is where Step Aliases logic editor should go.

---

## 7. Sidebar Tree Component

### Location
`/home/user/VaultLogic/client/src/components/builder/SidebarTree.tsx`

### Key Features
```typescript
export function SidebarTree({ workflowId }: { workflowId: string }) {
  // Left sidebar showing hierarchical structure
  // - Pages (expandable)
  //   - Steps (within pages)
  
  // Features:
  // - Add Page button
  // - Add Step buttons per page (on hover)
  // - Drag-and-drop with dnd-kit
  // - Visual selection highlight
  // - Required indicator (*) for required steps
}
```

### Page Item Component
```typescript
function PageItem({
  page,
  workflowId,
  isExpanded,
  onToggle,
}: {
  page: any;
  workflowId: string;
  isExpanded: boolean;
  onToggle: () => void;
})
```

### Step Item Component
```typescript
function StepItem({ 
  step, 
  pageId
}: { 
  step: any; 
  pageId: string
})
```

### Selection Management
- Uses `useWorkflowBuilder()` store
- Methods: `selectPage(id)`, `selectStep(id)`
- Properties indicate selection type and ID

---

## 8. Existing Variable/Step Selection Components

### Frontend Hooks
**Location:** `/home/user/VaultLogic/client/src/lib/vault-hooks.ts`

```typescript
// Step-related hooks
export function useSteps(pageId: string | undefined)
export function useCreateStep()
export function useUpdateStep()
export function useDeleteStep()
export function useReorderSteps()
```

### Step API Client
**Location:** `/home/user/VaultLogic/client/src/lib/vault-api.ts`

```typescript
export interface ApiStep {
  id: string;
  pageId: string;
  type: StepType;
  title: string;
  description: string | null;
  required: boolean;
  options: any;
  order: number;
  createdAt: string;
}

export const stepAPI = {
  list: (pageId: string) => fetchAPI<ApiStep[]>(...),
  create: (pageId: string, data: ...) => fetchAPI<ApiStep>(...),
  update: (id: string, data: ...) => fetchAPI<ApiStep>(...),
  delete: (id: string) => fetchAPI<void>(...),
  reorder: (pageId: string, steps: ...) => fetchAPI<void>(...),
}
```

### Workflow Builder Store
**Location:** `/home/user/VaultLogic/client/src/store/workflow-builder.ts`

```typescript
interface WorkflowBuilderState {
  // Selection
  selection: Selection | null;  // { type: "page"|"step"|"block", id: string }
  selectPage(id: string): void;
  selectStep(id: string): void;
  selectBlock(id: string): void;
  clearSelection(): void;

  // Inspector Tab
  inspectorTab: "properties" | "blocks" | "logic" | "transform";
  setInspectorTab(tab: ...): void;

  // Mode
  mode: "easy" | "advanced";
  setMode(mode: ...): void;

  // Preview
  previewRunId: string | null;
  isPreviewOpen: boolean;
  startPreview(runId: string): void;
  stopPreview(): void;
}
```

---

## 9. Pages Structure & Relationships

### Database Relationships
```typescript
// Pages contain Steps
export const pagesRelations = relations(pages, ({ one, many }) => ({
  workflow: one(workflows, ...),
  steps: many(steps),
  blocks: many(blocks),
}));

// Steps belong to Pages
export const stepsRelations = relations(steps, ({ one, many }) => ({
  page: one(pages, ...),
  values: many(stepValues),
}));

// Logic Rules target Steps or Pages
export const logicRulesRelations = relations(logicRules, ({ one }) => ({
  workflow: one(workflows, ...),
  conditionStep: one(steps, ...),
  targetStep: one(steps, ...),
  targetPage: one(pages, ...),
}));
```

### Page Service
**Location:** `/home/user/VaultLogic/server/services/PageService.ts`

```typescript
class PageService {
  async createPage(...): Promise<Page>
  async updatePage(...): Promise<Page>
  async deletePage(...): Promise<void>
  async reorderPages(...): Promise<void>
  async getPages(...): Promise<Page[]>
}
```

### Page Repository
**Location:** `/home/user/VaultLogic/server/repositories/PageRepository.ts`

```typescript
class PageRepository extends BaseRepository {
  async findByWorkflowId(workflowId: string): Promise<Page[]>
  async findByIdAndWorkflow(pageId: string, workflowId: string): Promise<Page | undefined>
  async updateOrder(pageId: string, order: number): Promise<Page>
}
```

---

## 10. Step CRUD Implementation

### Create Step Flow
```
Frontend (SidebarTree)
  ↓ useCreateStep().mutate()
  ↓ stepAPI.create(pageId, data)
  ↓ POST /api/workflows/:workflowId/pages/:pageId/steps
  ↓ StepService.createStep()
  ↓ StepRepository.create()
  ↓ Database INSERT
  ↓ Return created Step
  ↓ React Query cache invalidation
```

### Update Step Flow
```
Frontend (CanvasEditor)
  ↓ useUpdateStep().mutate()
  ↓ stepAPI.update(stepId, data)
  ↓ PUT /api/steps/:stepId
  ↓ StepService.updateStep()
  ↓ StepRepository.update()
  ↓ Database UPDATE
  ↓ Return updated Step
```

### Delete Step Flow
```
Frontend (SidebarTree)
  ↓ useDeleteStep().mutate()
  ↓ stepAPI.delete(stepId)
  ↓ DELETE /api/steps/:stepId
  ↓ StepService.deleteStep()
  ↓ StepRepository.delete()
  ↓ Database DELETE
```

### Reorder Steps Flow
```
Frontend (SidebarTree)
  ↓ useReorderSteps().mutate()
  ↓ stepAPI.reorder(pageId, steps)
  ↓ PUT /api/workflows/:workflowId/pages/:pageId/steps/reorder
  ↓ StepService.reorderSteps()
  ↓ For each step: StepRepository.updateOrder()
  ↓ Database UPDATE order field
```

### Read Step Flow
```
Frontend (SidebarTree)
  ↓ useSteps(pageId)
  ↓ stepAPI.list(pageId)
  ↓ GET /api/workflows/:workflowId/pages/:pageId/steps
  ↓ StepService.getSteps()
  ↓ StepRepository.findByPageId()
  ↓ Database SELECT
  ↓ Return Step[] sorted by order
```

---

## 11. Canvas Editor Component

### Location
`/home/user/VaultLogic/client/src/components/builder/CanvasEditor.tsx`

### Component Structure
```typescript
export function CanvasEditor({ workflowId }: { workflowId: string }) {
  // Renders based on selection type:
  // - if (selection.type === "page") → PageCanvas
  // - if (selection.type === "step") → StepCanvas
  // - if (!selection) → No Selection message
}

function PageCanvas({ page, workflowId }) {
  // Edit: title, description
  // Uses useUpdatePage() hook
}

function StepCanvas({ step, pageId }) {
  // Edit: title, description, required, type, options
  // Mode-aware UI (easy vs advanced)
  // Uses useUpdateStep() hook
}
```

---

## 12. Workflow Runner & Run Service

### Location
`/home/user/VaultLogic/server/services/RunService.ts`

### Key Methods
```typescript
class RunService {
  // Create a new workflow run (with onRunStart block execution)
  async createRun(
    workflowId: string,
    userId: string | null,
    data: Omit<InsertWorkflowRun, 'workflowId' | 'runToken' | 'createdBy'>,
    queryParams?: Record<string, any>,
    isAnonymous: boolean = false
  ): Promise<WorkflowRun & { runToken: string }>

  // Get run with step values
  async getRun(runId: string): Promise<WorkflowRun & { stepValues: StepValue[] }>

  // Save step value
  async saveStepValue(runId: string, stepId: string, value: any): Promise<StepValue>

  // Evaluate logic and get next page
  async getNextPage(runId: string): Promise<Page | null>
}
```

### Workflow Run Table
```typescript
export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  runToken: text("run_token").notNull().unique(),
  createdBy: text("created_by"), // "creator:<userId>" or "anon"
  currentPageId: uuid("current_page_id").references(() => pages.id),
  progress: integer("progress").default(0), // 0-100
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Step Values Table
```typescript
export const stepValues = pgTable("step_values", {
  id: uuid("id").primaryKey(),
  runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).notNull(),
  stepId: uuid("step_id").references(() => steps.id, { onDelete: 'cascade' }).notNull(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

---

## 13. Blocks & Transform Blocks Framework

### Block Types
```typescript
type BlockType = "prefill" | "validate" | "branch"

type BlockPhase = 
  | "onRunStart"       // Run creation
  | "onPageEnter"   // Entering a page
  | "onPageSubmit"  // Submitting page values
  | "onNext"           // Navigating to next
  | "onRunComplete"    // Completing the run
```

### Blocks Table
```typescript
export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  pageId: uuid("page_id").references(() => pages.id, { onDelete: 'cascade' }), // nullable
  type: blockTypeEnum("type").notNull(),
  phase: blockPhaseEnum("phase").notNull(),
  config: jsonb("config").notNull(), // type-specific config
  enabled: boolean("enabled").default(true).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Transform Blocks (Custom Code)
```typescript
export const transformBlocks = pgTable("transform_blocks", {
  id: uuid("id").primaryKey(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  name: varchar("name").notNull(),
  language: transformBlockLanguageEnum("language").notNull(), // 'javascript' | 'python'
  code: text("code").notNull(),
  inputKeys: text("input_keys").array().notNull(), // Whitelisted keys
  outputKey: varchar("output_key").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  order: integer("order").notNull(),
  timeoutMs: integer("timeout_ms").default(1000),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

---

## 14. Main Builder Page Component

### Location
`/home/user/VaultLogic/client/src/pages/WorkflowBuilder.tsx`

### Layout Structure
```
┌─────────────────────────────────────────────────┐
│  Top Bar: Settings | Mode Toggle | Run/Preview  │
├──────────────┬──────────────────┬───────────────┤
│              │                  │               │
│  Sidebar     │  Canvas Editor   │  Inspector    │
│  (Tree)      │  (Properties)    │  (Tabs)       │
│              │                  │               │
│              │                  │               │
│ • Pages   │  Page / Step  │ Props|Blocks  │
│   • Steps    │  editor form     │ |Transform|   │
│              │                  │ |Logic[TODO]  │
│              │                  │               │
└──────────────┴──────────────────┴───────────────┘
```

### Key Features
```typescript
export default function WorkflowBuilder() {
  // Manages: workflow loading, mode switching, preview
  // Top bar buttons: Start Preview, Mode dropdown
  // 3-pane layout: Sidebar | Canvas | Inspector
  // Responsive design with flex layout
}
```

---

## 15. Key Integration Points for Step Aliases

### Data Flow for Displaying Steps as Variables
```
1. Load workflow with all pages and steps
   → WorkflowService.getWorkflowWithDetails()
   → Returns workflow with pages[].steps[]

2. In Logic Editor, need to populate step selector dropdowns
   → Available Steps for conditions: All steps in workflow
   → Target Steps: All steps that can be affected by logic

3. When evaluating rules at runtime
   → Use step IDs in conditionStepId, targetStepId
   → Map step IDs to display names in UI
```

### Future Alias Tables Needed
```sql
-- Step Aliases table
CREATE TABLE step_aliases (
  id UUID PRIMARY KEY,
  stepId UUID NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  alias VARCHAR(255) NOT NULL,
  description TEXT,
  workflowId UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(workflowId, alias)
);

-- Step Variable Map (for referencing steps by alias in logic)
CREATE TABLE step_variables (
  id UUID PRIMARY KEY,
  stepId UUID NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  variableName VARCHAR(255) NOT NULL,
  workflowId UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(workflowId, variableName)
);
```

---

## 16. Query Keys & Caching Strategy

### React Query Keys
**Location:** `/home/user/VaultLogic/client/src/lib/vault-hooks.ts`

```typescript
export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  workflows: ["workflows"] as const,
  pages: (workflowId: string) => ["pages", workflowId] as const,
  steps: (pageId: string) => ["steps", pageId] as const,
  blocks: (workflowId: string, phase?: string) => ["blocks", workflowId, phase] as const,
  runs: (workflowId: string) => ["runs", workflowId] as const,
  run: (id: string) => ["runs", id] as const,
  runWithValues: (id: string) => ["runs", id, "values"] as const,
};
```

### Cache Invalidation Pattern
```typescript
export function useUpdateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ...,
    onSuccess: (data, variables) => {
      // Invalidate specific step cache
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.pageId) });
      // Invalidate page cache
      queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
    },
  });
}
```

---

## Summary of Key Findings

### Database Layer
- **Steps are stored** in `steps` table with pageId foreign key
- **Logic rules** stored separately in `logicRules` table
- **Step values** captured in `stepValues` during runs
- **Hierarchy:** Workflow → Pages → Steps

### Service Layer
- **StepService** handles all business logic for CRUD operations
- **WorkflowService** manages workflow-level operations
- **RunService** handles workflow execution and logic evaluation
- **Repository pattern** used for data access

### API Endpoints
- Step CRUD at `/api/steps/:stepId` and `/api/workflows/:workflowId/pages/:pageId/steps`
- Reordering at `/api/workflows/:workflowId/pages/:pageId/steps/reorder`
- All authenticated with `isAuthenticated` middleware

### Frontend Architecture
- **Three-pane layout:** Sidebar (tree) | Canvas (editor) | Inspector (properties)
- **Zustand store** for UI state (selection, mode, tabs)
- **React Query** for server state management
- **Components:** SidebarTree, CanvasEditor, Inspector, BlocksPanel

### Logic Evaluation
- **Shared evaluation engine** in `/shared/workflowLogic.ts`
- Supports step/page level targeting
- Rules evaluated based on current step values
- Return: visible items, required items, skip-to page

### Missing Implementation
- **Logic Editor UI** - placeholder in Inspector's Logic tab
- **Step Aliases** - no current database structure or UI
- **Variable referencing** - steps used only by ID, not by alias

---

## Recommended Structure for Step Aliases

### 1. Database Extension
Add to `/shared/schema.ts`:
```typescript
export const stepAliases = pgTable("step_aliases", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  stepId: uuid("step_id").references(() => steps.id, { onDelete: 'cascade' }).notNull(),
  alias: varchar("alias").notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("step_aliases_workflow_idx").on(table.workflowId),
  index("step_aliases_step_idx").on(table.stepId),
  uniqueIndex("step_aliases_workflow_alias_uq").on(table.workflowId, table.alias),
]);
```

### 2. Service Layer
Create `/server/services/StepAliasService.ts` with:
- `createAlias(stepId, alias, workflowId)`
- `updateAlias(aliasId, newAlias)`
- `deleteAlias(aliasId)`
- `getAliases(workflowId)`
- `resolveAlias(workflowId, alias)` → Step

### 3. API Endpoints
Add routes to `/server/routes/steps.routes.ts`:
- `POST /api/workflows/:workflowId/steps/:stepId/aliases`
- `PUT /api/aliases/:aliasId`
- `DELETE /api/aliases/:aliasId`
- `GET /api/workflows/:workflowId/aliases`

### 4. Frontend Components
Create in `/client/src/components/builder/`:
- `StepAliasPanel.tsx` - Manage aliases in Inspector
- `StepSelector.tsx` - Dropdown with aliases for logic rules
- `AliasInput.tsx` - Input field for creating aliases

### 5. Hooks
Add to `/client/src/lib/vault-hooks.ts`:
- `useStepAliases(workflowId)`
- `useCreateAlias()`
- `useUpdateAlias()`
- `useDeleteAlias()`
- `useResolveAlias()`

