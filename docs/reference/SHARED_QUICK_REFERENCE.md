# VaultLogic: Quick Reference - Shared vs Separate

## Can I Delete/Modify These?

### 🔴 CRITICAL - DO NOT TOUCH
- `conditionOperatorEnum` - BOTH systems
- `conditionalActionEnum` - BOTH systems  
- `users` table - BOTH systems
- `Survey*` services (SurveyService, ResponseService, etc.) - Production data
- `analyticsEvents` table - Survey-only but production
- `files` table - Survey-only but production

### 🟡 RISKY - CHANGE WITH CARE
- `conditionalLogic.ts` - Surveys depend on it
- `workflowLogic.ts` - Workflows depend on it
- `questionTypeEnum` - Surveys only but established
- `stepTypeEnum` - Workflows but expanding (computed, js_question, repeater)
- LogicService - Workflows depend on it

### 🟢 SAFE - CAN MODIFY
- `WorkflowExportService` - Workflow-only, can refactor
- `TransformBlockService` - New feature, rapidly evolving
- `AIService` - Workflow-only, independent from surveys
- `FileService` - Generic utility (but used by surveys)
- `EmailService` - Generic utility
- Workflow-specific tables (pages, steps, stepValues, etc.)

---

## Dependency Map

```
┌─────────────────────────────────────────┐
│          SHARED INFRASTRUCTURE          │
├─────────────────────────────────────────┤
│ • users (id, email, tenantId, etc)      │
│ • projects (workflows container)        │
│ • tenants (multi-tenancy)               │
│ • conditionOperatorEnum (enum)          │
│ • conditionalActionEnum (enum)          │
└─────────────────────────────────────────┘
         ↓                       ↓
┌──────────────────┐    ┌──────────────────────┐
│  SURVEY SYSTEM   │    │   WORKFLOW SYSTEM    │
├──────────────────┤    ├──────────────────────┤
│ • surveys        │    │ • workflows          │
│ • surveyPages    │    │ • pages           │
│ • questions      │    │ • steps              │
│ • responses      │    │ • stepValues         │
│ • answers        │    │ • logicRules         │
│ • files ────────→┼────│ • transformBlocks    │
│ • conditionalRules  │ • workflowRuns       │
│ • analyticsEvents───┼──│ (no analytics yet)   │
├──────────────────┤    ├──────────────────────┤
│ Services:        │    │ Services:            │
│ • SurveyService  │    │ • WorkflowService    │
│ • ResponseService│    │ • RunService         │
│ • SurveyAIService│    │ • LogicService       │
│ • AnalyticsService   │ • AIService          │
│ • ExportService  │    │ • TransformBlockSvc  │
└──────────────────┘    └──────────────────────┘
```

---

## Critical Coupling Points

### 1. Condition Enums (SHARED)
```
conditionOperatorEnum → Used in:
  └─ conditionalRules (surveys)
  └─ logicRules (workflows)

conditionalActionEnum → Used in:
  └─ conditionalRules (surveys)  
  └─ logicRules (workflows)

❌ If you add an operator/action, BOTH tables need to support it
```

### 2. Files Table (SURVEY-ONLY)
```
files table:
  └─ answerId → answers (SURVEY-ONLY FK)
  └─ Cannot add stepValueId without breaking constraints

Workflows:
  └─ Store files as JSON in stepValues.value
  └─ NOT using files table
```

### 3. Analytics (SURVEY-ONLY)
```
analyticsEvents:
  └─ responseId, surveyId, pageId, questionId (all SURVEY)
  └─ Cannot be extended to workflows without redesign
  └─ Workflows don't use this table at all
```

### 4. Conditional Logic (SEPARATE ENGINES)
```
Survey: conditionalLogic.ts → conditionalRules → ResponseService
Workflow: workflowLogic.ts → logicRules → LogicService

⚠️ Both use same operators/actions but separate implementations
```

---

## Cost of Unification

| What | Unify? | Cost | Better Option |
|------|--------|------|---------------|
| **Type Enums** | questionTypeEnum ↔ stepTypeEnum | HIGH | Keep separate |
| **Files Table** | surveys + workflows | CRITICAL | Separate workflow_files |
| **Logic Engines** | conditionalLogic ↔ workflowLogic | MEDIUM | Keep separate (stable) |
| **Analytics** | analyticsEvents for both | HIGH | Create workflowAnalyticsEvents |
| **Condition Enums** | Already shared ✓ | LOW | Keep as-is |
| **Users/RBAC** | Already shared ✓ | NONE | Keep as-is |

---

## Key Insights

✅ **What's Working Well:**
- Shared enums for operators/actions (minimal coupling)
- Separate table structures (clean isolation)
- Independent service layers
- Proper multi-tenant/user sharing

⚠️ **Watch Out For:**
- Adding new condition operators (affects both systems)
- Survey and workflow logic evolution (must track separately)
- File storage approach differs (JSON vs table)
- Analytics implementations are separate (not unified)

🚫 **What Won't Work:**
- Single files table for both systems (FK constraint issue)
- Unified type enum (stepTypeEnum > questionTypeEnum)
- Shared conditional logic tables (different semantics)

---

## When to Sync Between Systems

Only modify shared infrastructure with:
1. ✅ Unit tests for both systems
2. ✅ Integration tests for both systems  
3. ✅ Data migration plan (if schema change)
4. ✅ Rollback plan
5. ✅ Coordination between teams

**Examples of safe changes:**
- Adding user fields (if not breaking surveys)
- New RBAC roles (if they don't break existing permissions)
- New UI preference settings

**Examples of risky changes:**
- Adding new enum value without testing both systems
- Removing unused survey columns (might break legacy code)
- Changing table constraints
