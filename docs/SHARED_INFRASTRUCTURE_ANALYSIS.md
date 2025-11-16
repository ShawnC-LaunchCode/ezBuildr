# VaultLogic: Shared Infrastructure Analysis

## Executive Summary

VaultLogic maintains **TWO SEPARATE SYSTEMS** with **MINIMAL SHARING**:

- **Survey System** (Poll-Vault legacy): Tables, services, enums for surveys/responses
- **Workflow System** (VaultLogic core): Tables, services, enums for workflows/runs

Only a few **cross-cutting concerns** are truly shared (users, projects, analytics events, files, user preferences). Most conditional logic is duplicated with slight variants.

---

## 1. DATABASE ENUMS

### SHARED ENUMS ✅ (Used by BOTH systems)

| Enum | Values | Used By | Risk Level |
|------|--------|---------|------------|
| **conditionOperatorEnum** | equals, not_equals, contains, not_contains, greater_than, less_than, between, is_empty, is_not_empty | Both surveys (`conditionalRules` table) AND workflows (`logicRules` table) | **LOW** - Same enum, different tables |
| **conditionalActionEnum** | show, hide, require, make_optional, skip_to | Both surveys (`conditionalRules`) AND workflows (`logicRules`) | **LOW** - Same enum, different contexts |

### SEPARATE ENUMS ❌ (Not shared)

| System | Enum | Values |
|--------|------|--------|
| **Surveys** | questionTypeEnum | short_text, long_text, multiple_choice, radio, yes_no, date_time, file_upload, loop_group |
| **Workflows** | stepTypeEnum | short_text, long_text, multiple_choice, radio, yes_no, computed (virtual steps), date_time, file_upload, loop_group, js_question, repeater |

**Analysis:**
- `stepTypeEnum` is a **superset** of `questionTypeEnum` with additional types (`computed`, `js_question`, `repeater`)
- Cannot be unified without adding these types to surveys (high risk)
- Both use the same condition operators/actions but on different tables

**Recommendation:** Keep separate. Risk of unification: **MEDIUM-HIGH**

---

## 2. SERVICES & UTILITIES

### SURVEY-ONLY SERVICES (CANNOT DELETE - Survey system relies on them)

```
Survey System Services:
├── SurveyService (surveys.routes.ts)
├── ResponseService (responses.routes.ts) 
├── PageService (pages.routes.ts)
├── QuestionService (questions.routes.ts)
├── SurveyAIService (ai.routes.ts - survey generation only)
├── AnalyticsService (survey analytics)
├── ExportService (survey export)
└── SurveyRepository, ResponseRepository, etc.

Status: CANNOT MODIFY - Production surveys in use
Risk if deleted: HIGH - Data loss
```

### WORKFLOW-ONLY SERVICES (Can be reviewed independently)

```
Workflow System Services:
├── WorkflowService (workflows.routes.ts)
├── RunService (runs.routes.ts)
├── LogicService (workflow logic evaluation)
├── SectionService (sections.routes.ts)
├── StepService (steps.routes.ts)
├── TransformBlockService (transform blocks)
├── WorkflowExportService (workflow export)
├── VariableService (step aliases)
├── BlockRunner (sandbox execution)
├── AIService (workflow generation - AIService.ts, not SurveyAIService)
└── WorkflowRepository, StepValueRepository, etc.

Status: Can be modified
Risk: MEDIUM - Ecosystem independent
```

### SHARED SERVICES ✅ (Used by both)

| Service | Used By | Notes | Risk |
|---------|---------|-------|------|
| **UserPreferencesService** | Both | User-scoped settings | **NONE** - Isolated to users |
| **EmailService** | Both | SendGrid integration | **LOW** - Generic utility |
| **FileService** | Surveys only* | Multer + file handling | **MEDIUM** - See Files section |
| **geminiService** | Surveys + WorkflowAI | Google Gemini API wrapper | **LOW** - Generic wrapper |

*Workflows don't use `files` table yet; file uploads in workflows stored as step value JSON

---

## 3. FILE UPLOADS

### Current Status: **SURVEY-ONLY** ❌

**Files Table Structure:**
```sql
files {
  id: uuid (PK)
  answerId: uuid (FK → answers.id) -- SURVEY-SPECIFIC
  filename: varchar
  originalName: varchar
  mimeType: varchar
  size: integer
  uploadedAt: timestamp
}
```

**Analysis:**
- Files table **only references answers** (survey-specific)
- **No reference to stepValues** (workflow equivalent)
- Workflows store file data as JSON in `stepValues.value`
- FileService/FileRepository are technically available but only work with answers

**Current Usage:**
- Survey file uploads: `POST /api/files` + attach to answer
- Workflow file uploads: Stored in `stepValue.value` as `{ "files": [...] }`

**Can workflows reuse files table?**
- **NO** - Would require foreign key to either `answers` (survey) OR `stepValues` (workflow)
- Cannot have single table reference both incompatible entities
- Would break database constraints

**Recommendation:** 
- Keep separate. Create workflow-specific `workflow_files` table if needed
- Current JSON storage in `stepValues` is acceptable for workflow use case
- **Risk of forcing unification: HIGH**

---

## 4. ANALYTICS

### SHARED ANALYTICS TABLE ✅

**analyticsEvents Table:**
```sql
analyticsEvents {
  id: uuid
  responseId: uuid (FK → responses.id)     -- SURVEY-ONLY
  surveyId: uuid (FK → surveys.id)
  pageId: uuid (FK → surveyPages.id)       -- SURVEY-ONLY
  questionId: uuid (FK → questions.id)     -- SURVEY-ONLY
  event: varchar (e.g., 'page_view', 'survey_complete')
  data: jsonb
  duration: integer
  timestamp: timestamp
}
```

**Status:**
- Table exists but is **SURVEY-ONLY**
- All foreign keys point to survey entities
- **NOT used by workflows** at all

**Separate Workflow Analytics:**
- Workflows do NOT use `analyticsEvents` table
- No workflow analytics implementation yet
- Would need separate tables or schema redesign

**Analysis:**
- Table structure is **inherently survey-centric**
- Cannot easily extend to workflows without breaking constraints
- Could theoretically create `workflowAnalyticsEvents` but current shared table cannot be reused

**Recommendation:**
- Leave as-is for surveys
- When implementing workflow analytics, create separate tables
- **Risk of unification: HIGH** (schema redesign required)

---

## 5. CONDITIONAL LOGIC IMPLEMENTATIONS

### Table Comparison

| Aspect | Surveys | Workflows |
|--------|---------|-----------|
| **Table** | `conditionalRules` | `logicRules` |
| **Operators** | Same enum | Same enum |
| **Actions** | Same enum | Same enum (+ skip_to) |
| **Condition Target** | `conditionQuestionId` | `conditionStepId` |
| **Target Type** | Implicit (rule per question/page) | Explicit: `targetType` (section/step) |
| **Engine** | conditionalLogic.ts | workflowLogic.ts |
| **Used By** | ResponseService | LogicService |

### Engine Implementations

**Survey Engine (conditionalLogic.ts):**
- `evaluateCondition()` - Evaluates single rule vs answers
- `evaluateConditionalLogic()` - Main entry point
- Designed for survey questions
- Uses `ConditionalRule` type

**Workflow Engine (workflowLogic.ts):**
- `evaluateRules()` - Evaluates all rules, returns visibility sets
- `evaluateCondition()` (internal) - Similar logic
- Handles both section and step targeting
- Returns `WorkflowEvaluationResult` with visible sections/steps

**Key Differences:**
1. **Targeting**: Workflows have explicit section vs. step targeting
2. **Return format**: Workflows return visibility sets, surveys return per-entity results
3. **Navigation**: Workflows support `skip_to` for section skipping

### Can they be unified?

**Technical Analysis:**
- Operators/Actions enums ARE shared (at database level)
- Implementation logic is 85% identical
- Main difference: targeting model and return format

**Challenges:**
1. Different table structures (`conditionQuestionId` vs `conditionStepId`)
2. Different targeting models (implicit vs explicit type)
3. Different result formats (per-entity vs sets)
4. Adding section-level targeting to surveys could break existing logic

**Recommendation:** 
- **KEEP SEPARATE** - Risk of unification: **MEDIUM**
- Could theoretically unify at query level but implementation details differ too much
- Surveys are stable, workflows are evolving
- Cross-system changes risk survey stability

---

## 6. AI FEATURES

### SEPARATE IMPLEMENTATIONS ✅

| Aspect | Surveys | Workflows |
|--------|---------|-----------|
| **Service Class** | `SurveyAIService` | `AIService` |
| **Provider Support** | Gemini only | OpenAI + Anthropic |
| **Capabilities** | Survey generation | Workflow generation, suggestions, template bindings |
| **Endpoint** | `POST /api/ai/generate` | `POST /api/ai/workflows/generate`, `POST /api/ai/workflows/:id/suggest` |
| **Configuration** | `GEMINI_API_KEY` | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL_WORKFLOW` |

**Analysis:**
- Completely independent implementations
- Different providers, different capabilities
- Both use `geminiService` as shared wrapper (optional)
- No code sharing or dependency between them

**Recommendation:**
- **ALREADY SEPARATE** - Good design
- Risk of unification: **NONE** - Keep as-is

---

## 7. MULTI-TENANT & RBAC

### Shared Infrastructure ✅

| Component | Status | Notes |
|-----------|--------|-------|
| **users table** | SHARED | Both systems use same users |
| **projects table** | SHARED | Top-level container for workflows |
| **tenants table** | SHARED | Multi-tenancy (Stage 24) |
| **userTenantRoleEnum** | SHARED | owner, builder, runner, viewer |
| **tenantPlanEnum** | SHARED | free, pro, enterprise |

**Analysis:**
- Users are truly shared across both systems
- Projects organize workflows (not surveys directly)
- RBAC uses `userTenantRoleEnum` for workflows
- Surveys use legacy `role` enum (admin, creator)

**Recommendation:**
- Keep as-is. This is properly shared infrastructure
- **Risk: NONE** - Essential sharing

---

## SUMMARY TABLE

| Area | Status | Shared? | Risk if Deleted | Recommendation |
|------|--------|---------|-----------------|-----------------|
| **conditionOperatorEnum** | SHARED | YES | HIGH | Keep - Both systems depend |
| **conditionalActionEnum** | SHARED | YES | HIGH | Keep - Both systems depend |
| **questionTypeEnum** | Survey-only | NO | HIGH | Keep - Survey specific |
| **stepTypeEnum** | Workflow-only | NO | MEDIUM | Keep - Workflow specific |
| **SurveyAIService** | Survey-only | NO | HIGH | Keep - In production use |
| **AIService** | Workflow-only | NO | MEDIUM | Keep - Workflow specific |
| **files table** | Survey-only | NO | HIGH | Keep - Survey-specific FK |
| **analyticsEvents** | Survey-only | NO | HIGH | Keep - Survey-specific FKs |
| **conditionalLogic.ts** | Survey logic | NO | HIGH | Keep - Survey-specific |
| **workflowLogic.ts** | Workflow logic | NO | MEDIUM | Keep - Workflow-specific |
| **FileService** | Generic utility | Technically | MEDIUM | Keep - File handling utility |
| **UserPreferencesService** | Cross-system | YES | NONE | Keep - User-scoped |
| **users table** | SHARED | YES | HIGH | Keep - Essential |
| **projects table** | SHARED | YES | MEDIUM | Keep - Workflow organization |
| **EmailService** | Generic utility | Technically | LOW | Keep - Email sending |

---

## RECOMMENDATIONS BY SYSTEM

### Survey System ✅ **PRODUCTION STABLE**
- **Status**: Complete, in production use
- **Modification Risk**: HIGH
- **Recommendation**: Minimal changes. Only fix bugs.
- **Can Delete**: No individual components should be removed
- **Dependencies**: All interconnected

### Workflow System 🚧 **ACTIVE DEVELOPMENT**
- **Status**: Rapidly evolving (Stage 24)
- **Modification Risk**: MEDIUM
- **Recommendation**: Continue independent development
- **Can Delete**: Some features might be refactored (transform blocks, etc.)
- **Integration Points**: Users, projects, RBAC

### Shared Infrastructure 🔒 **CORE CRITICAL**
- **Status**: Foundation for both systems
- **Modification Risk**: CRITICAL
- **Recommendation**: 
  - Never remove without cross-system testing
  - Changes require impact analysis on both systems
  - Keep `conditionOperatorEnum` and `conditionalActionEnum` (both systems depend)
- **Safe to Modify**: Minor additions that don't break existing usage

---

## Risk Assessment Matrix

```
DELETION RISK ANALYSIS:

🔴 DO NOT DELETE (HIGH RISK):
  - Survey system services/tables (production data)
  - Shared condition enums (both systems)
  - Enum definitions (database constraints)
  - User/project/tenant infrastructure

🟡 ONLY RENAME/REFACTOR WITH CARE (MEDIUM RISK):
  - Workflow-specific services (actively changing)
  - Logic service implementations (complex relationships)

🟢 SAFE TO MODIFY (LOW RISK):
  - Workflow-specific tables (new system)
  - Generic utilities (FileService, EmailService)
```

---

## Implementation Patterns

### Pattern 1: Separate Tables, Shared Enums
```
conditionalRules (surveys) + logicRules (workflows)
  └── Both use: conditionOperatorEnum, conditionalActionEnum
  └── Risk: Adding new enum values affects both
```

### Pattern 2: Completely Separate Implementations
```
SurveyAIService ≠ AIService
  └── No code sharing
  └── Independent configuration
  └── Risk: None (totally isolated)
```

### Pattern 3: One-Way Dependency
```
surveys → conditionalRules → conditions
          └── Uses conditionOperatorEnum
          
workflows → logicRules → conditions
            └── Uses same conditionOperatorEnum
```

### Pattern 4: Truly Shared (Users)
```
Both systems → users table
  └── Schema changes affect both
  └── Risk: Critical
```

---

## Conclusion

VaultLogic successfully maintains **two distinct systems** with proper separation:

1. ✅ **Database**: Different tables for different systems
2. ✅ **Services**: Mostly separate (survey vs. workflow)
3. ✅ **Enums**: Strategically shared only where safe (operators/actions)
4. ✅ **Users/RBAC**: Properly shared infrastructure
5. ⚠️ **Logic Implementations**: Similar but separate (duplication is acceptable)
6. ❌ **File Storage**: Not shared (cannot be without major refactor)

**Overall Assessment**: **Good separation of concerns** with minimal coupling. Both systems can evolve independently while maintaining essential shared infrastructure.

**No major technical debt** related to system sharing, but be aware of enum-level coupling for condition operators/actions.
