# VaultLogic: File Path Reference Guide

## SHARED INFRASTRUCTURE FILES (Both systems depend on)

### Schema & Enums
```
shared/schema.ts
  ├─ conditionOperatorEnum (line 50) ⚠️ SHARED
  ├─ conditionalActionEnum (line 63) ⚠️ SHARED
  ├─ users table (line 85) ⚠️ SHARED
  ├─ tenants table (line 764) ⚠️ SHARED
  ├─ projects table (line 861) ⚠️ SHARED
  ├─ userTenantRoleEnum (line 79) ⚠️ SHARED
  │
  ├─ Survey System:
  │  ├─ surveys table (line 120)
  │  ├─ surveyPages table (line 139)
  │  ├─ questions table (line 148)
  │  ├─ questionTypeEnum (line 38)
  │  ├─ responses table (line 192)
  │  ├─ answers table (line 207)
  │  ├─ conditionalRules table (line 177)
  │  ├─ analyticsEvents table (line 229) ⚠️ Survey-only
  │  └─ files table (line 218) ⚠️ Survey-only
  │
  └─ Workflow System:
     ├─ workflows table (line 884)
     ├─ sections table
     ├─ steps table
     ├─ stepTypeEnum (line 839)
     ├─ logicRules table (line 1338)
     ├─ stepValues table
     ├─ transformBlocks table
     └─ workflowRuns table
```

### Shared Logic Modules
```
shared/conditionalLogic.ts
  ├─ evaluateCondition() - Survey conditional logic
  ├─ Used by: ResponseService
  └─ ⚠️ Cannot remove (survey-critical)

shared/workflowLogic.ts
  ├─ evaluateRules() - Workflow logic
  ├─ evaluateCondition() - (different impl)
  ├─ Used by: LogicService
  └─ ⚠️ Cannot remove (workflow-critical)
```

---

## SURVEY SYSTEM (Production - High Risk)

### Routes
```
server/routes/surveys.routes.ts           - Survey CRUD
server/routes/responses.routes.ts         - Response handling
server/routes/questions.routes.ts         - Question CRUD
server/routes/pages.routes.ts             - Page CRUD
server/routes/analytics.routes.ts         - Survey analytics
server/routes/export.routes.ts            - Survey export
server/routes/files.routes.ts             - File uploads (answer-based)
```

### Services
```
server/services/SurveyService.ts          - Survey business logic
server/services/ResponseService.ts        - Response + answer logic
  └─ Imports: conditionalLogic.ts (evaluateConditionalLogic)
server/services/PageService.ts            - Page management
server/services/QuestionService.ts        - Question management
server/services/AnalyticsService.ts       - Analytics aggregation
  └─ Direct DB access to: responses, analyticsEvents, questions
server/services/ExportService.ts          - CSV/PDF export
server/services/SurveyAIService.ts        - AI survey generation
  └─ Uses: geminiService only
server/services/fileService.ts            - File upload handling
```

### Repositories
```
server/repositories/SurveyRepository.ts    - Survey queries
server/repositories/ResponseRepository.ts - Response queries
server/repositories/QuestionRepository.ts - Question queries
server/repositories/PageRepository.ts     - Page queries
server/repositories/AnswerRepository.ts   - Answer queries
server/repositories/FileRepository.ts     - File queries
  └─ Only finds by answerId (FK constraint)
server/repositories/AnalyticsRepository.ts - Analytics queries
```

---

## WORKFLOW SYSTEM (Active Development - Medium Risk)

### Routes
```
server/routes/workflows.routes.ts         - Workflow CRUD
server/routes/sections.routes.ts          - Section CRUD
server/routes/steps.routes.ts             - Step CRUD
server/routes/api.runs.routes.ts          - Run creation/management
server/routes/transformBlocks.routes.ts   - Transform block CRUD
server/routes/workflowExports.routes.ts   - Workflow export
server/routes/ai.routes.ts                - AI endpoints (both survey + workflow)
server/routes/blocks.routes.ts            - Block management
```

### Services
```
server/services/WorkflowService.ts        - Workflow CRUD
server/services/RunService.ts             - Run management
  └─ Imports: workflowLogic.ts (evaluateRules)
server/services/LogicService.ts           - Logic evaluation
  └─ Imports: workflowLogic.ts
  └─ Evaluates: logicRules table
server/services/SectionService.ts         - Section management
server/services/StepService.ts            - Step management
server/services/VariableService.ts        - Step alias (variable) management
server/services/TransformBlockService.ts  - Transform block execution
server/services/BlockRunner.ts            - JS/Python sandbox execution
server/services/WorkflowExportService.ts  - JSON/CSV export
server/services/AIService.ts              - AI workflow generation
  └─ Uses: OpenAI or Anthropic (configurable)
```

### Repositories
```
server/repositories/WorkflowRepository.ts     - Workflow queries
server/repositories/SectionRepository.ts      - Section queries
server/repositories/StepRepository.ts         - Step queries
server/repositories/StepValueRepository.ts    - Step value queries
server/repositories/WorkflowRunRepository.ts  - Run queries
server/repositories/LogicRuleRepository.ts    - Logic rule queries
server/repositories/TransformBlockRepository.ts - Block queries
```

---

## GENERIC/SHARED SERVICES (Both systems)

### User Management
```
server/services/UserPreferencesService.ts     - User settings
  └─ Queries: userPreferences table (user-scoped, safe)

server/services/auth.ts                       - Authentication
server/middleware/auth.ts                     - Auth middleware
```

### Email & Notifications
```
server/services/emailService.ts               - SendGrid wrapper
  └─ Used by: Both systems for email
  └─ Safe: Generic email utility

server/services/sendgrid.ts                   - SendGrid client
```

### AI Wrappers
```
server/services/geminiService.ts              - Google Gemini wrapper
  └─ Used by: SurveyAIService
  └─ Optional: Not required for surveys

server/services/AIService.ts                  - OpenAI/Anthropic wrapper
  └─ Used by: AIService (workflow-only)
  └─ Independent from SurveyAIService
```

### Utilities
```
server/utils/answerFormatting.ts              - Format answer values
  └─ Used by: ExportService (survey-only currently)
  └─ Could be reused for workflow export

server/utils/encryption.ts                    - Encryption utilities
  └─ Used by: Secret management

server/utils/errorHandler.ts                  - Error handling
server/utils/pagination.ts                    - Pagination helpers
server/utils/jsonselect.ts                    - JSONPath selection
server/utils/sandboxExecutor.ts               - Sandbox execution
  └─ Used by: BlockRunner (workflow-specific)
```

---

## THINGS TO WATCH

### Enum Changes (HIGH RISK - affects BOTH)
When modifying these, test BOTH systems:
```
shared/schema.ts:50   - conditionOperatorEnum
shared/schema.ts:63   - conditionalActionEnum
```

**Impact:**
- Adding enum value → Migration needed for BOTH conditionalRules AND logicRules
- Removing enum value → Survey AND workflow rules could break
- Changing value → Data corruption risk

### Logic Engine Updates (MEDIUM RISK)
When modifying these, test each system independently:
```
shared/conditionalLogic.ts  - Survey logic
shared/workflowLogic.ts     - Workflow logic
```

**Impact:**
- Changes to shared operators/actions must be replicated
- Survey logic is stable, workflow logic is evolving
- Test survey responses before deploying workflow changes

### File Storage (CRITICAL - CANNOT UNIFY)
```
server/repositories/FileRepository.ts

Structure:
  files.answerId → answers.id (SURVEY-ONLY FK)
  
Cannot extend to workflows because:
  1. Would need FK to stepValues (not answers)
  2. Cannot have single FK to multiple tables
  3. Database constraint violation

Solution: Create workflow_files table if needed
```

### Analytics (SURVEY-ONLY, SEPARATE)
When implementing workflow analytics:
```
DO NOT extend: analyticsEvents table
DO create: New workflowAnalyticsEvents table

Current structure is survey-specific:
  responseId, surveyId, pageId, questionId
```

---

## Safe Modification Checklist

Before modifying shared infrastructure:

- [ ] I've identified which systems are affected
- [ ] I've created tests for BOTH systems
- [ ] I've run integration tests
- [ ] I've checked for FK constraints
- [ ] I've planned the data migration
- [ ] I've documented the change
- [ ] I've got a rollback plan

Before modifying shared enums:

- [ ] I've tested surveys with the new enum
- [ ] I've tested workflows with the new enum
- [ ] I've created database migration
- [ ] I've updated all FK references
- [ ] I've updated enum imports in all services
- [ ] I've tested both systems end-to-end

---

## Quick Grep Commands for Finding Dependencies

Find all files using conditionOperatorEnum:
```bash
grep -r "conditionOperatorEnum" /home/user/VaultLogic --include="*.ts"
```

Find all imports of conditionalLogic:
```bash
grep -r "from.*conditionalLogic" /home/user/VaultLogic --include="*.ts"
```

Find all imports of workflowLogic:
```bash
grep -r "from.*workflowLogic" /home/user/VaultLogic --include="*.ts"
```

Find all uses of files table:
```bash
grep -r "fileRepository\|files\(" /home/user/VaultLogic/server --include="*.ts"
```

Find all uses of analyticsEvents:
```bash
grep -r "analyticsEvents\|AnalyticsEvent" /home/user/VaultLogic --include="*.ts"
```
