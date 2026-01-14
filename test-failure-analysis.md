# Test Suite Failure Analysis

## Summary
- **Total Test Files:** 155
- **Failed:** 57 test files (36.8%)
- **Passed:** 97 test files (62.6%)
- **Skipped:** 1 test file (0.6%)

- **Total Tests:** 2,535
- **Failed:** 407 tests (16.1%)
- **Passed:** 2,061 tests (81.3%)
- **Skipped:** 67 tests (2.6%)

## Failure Categories

### Category 1: Authentication Mock Issues (HIGH PRIORITY - Low Hanging Fruit)
**Files affected:** ~100+ failures
**Pattern:** `TypeError: actual.getSession is not a function`
**Root Cause:** Authentication middleware/session mocking not properly configured

Files:
- tests/integration/auth/auth.middleware.integration.test.ts (29 failures)
- tests/integration/auth/protected.routes.test.ts (25 failures)
- tests/integration/auth/jwt.authentication.test.ts (20 failures)
- tests/integration/auth/session.management.integration.test.ts (15 failures)
- tests/integration/session.management.real.test.ts (16 failures)
- tests/integration/mfa.flow.real.test.ts (16 failures)
- tests/integration/trusted.devices.real.test.ts (11 failures)
- tests/integration/auth/oauth2.token-refresh.test.ts (10 failures)
- tests/integration/auth/oauth2.sessions.test.ts (9 failures)
- tests/integration/auth.flows.real.test.ts (9 failures)
- tests/integration/auth.routes.real.test.ts (4 failures)
- tests/unit/services/AuthService.test.ts (7 failures)
- tests/unit/middleware/auth.middleware.test.ts (3 failures)

**Fix:** Create proper auth middleware mocks

### Category 2: UI Component Testing Library Issues (MEDIUM - Low Hanging Fruit)
**Files affected:** ~90 failures
**Pattern:** `Cannot read properties of undefined (reading 'navigator')`, Component not found
**Root Cause:** Missing JSDOM setup, window.navigator mock, or component imports

Files:
- tests/ui/datavault/EditableCell.test.tsx (58 failures) 
- tests/ui/runs.components.test.tsx (19 failures)
- tests/ui/datavault/ColumnTypeIcon.test.tsx (15 failures)
- tests/ui/expression-editor.test.tsx (10 failures)
- tests/ui/common/Breadcrumbs.test.tsx (10 failures)
- tests/ui/datavault/TableCard.test.tsx (7 failures)
- tests/ui/datavault/DatabaseSettingsPage.test.tsx (7 failures)
- tests/ui/datavault/TemplateCard.test.tsx (6 failures)

**Fix:** Add window.navigator mock and proper JSDOM environment setup

### Category 3: DataVault API Test Issues (MEDIUM)
**Files affected:** ~44 failures
**Pattern:** `expected 401 to be 200/201`, unauthorized access
**Root Cause:** Auth context not properly set up in integration tests

Files:
- tests/integration/datavault-v4-regression.test.ts (22 failures)
- tests/integration/datavault.permissions.test.ts (22 failures)

**Fix:** Add proper authentication context to datavault integration tests

### Category 4: Variable Resolver Schema Mismatch (HIGH PRIORITY - Quick Fix)
**Files affected:** 3 failures
**Pattern:** Expected `title` but got `label`, extra fields returned
**Root Cause:** Schema changed but tests not updated

Files:
- tests/unit/utils/variableResolver.test.ts (3 failures)

**Fix:** Update test assertions to match new schema

### Category 5: Write Runner Test Issues (MEDIUM)
**Files affected:** 2 failures
**Pattern:** `expected "vi.fn()" to be called with arguments`
**Root Cause:** Mocks not being called or wrong arguments

Files:
- tests/unit/writes/WriteRunner.test.ts (2 failures)

**Fix:** Fix mock expectations and ensure runner actually calls the mocked functions

### Category 6: ListTools Block Tests (MEDIUM)
**Files affected:** 17 failures
**Pattern:** Various assertion failures in list operations

Files:
- tests/ListTools.test.ts (17 failures)

**Fix:** Review list tool block implementation vs test expectations

### Category 7: IntakeNavigation Service Tests (MEDIUM)
**Files affected:** 17 failures
**Pattern:** Navigation logic failures

Files:
- tests/unit/services/intakeNavigation.test.ts (17 failures)

**Fix:** Update navigation service tests to match current implementation

### Category 8: Workflow API Tests (LOW PRIORITY)
**Files affected:** 9 failures
**Pattern:** Various API endpoint failures

Files:
- tests/integration/api.workflows.test.ts (9 failures)

**Fix:** Update workflow API integration tests

### Category 9: AI Service Tests (LOW PRIORITY)
**Files affected:** 7 failures
**Pattern:** AI generation schema validation failures

Files:
- tests/unit/ai.service.test.ts (7 failures)

**Fix:** Update AI service test mocks

### Category 10: Miscellaneous (MIXED PRIORITY)
**Files affected:** ~30 failures
Files:
- tests/unit/server/transferOwnership.test.ts (3 failures)
- tests/unit/api.ai.logic.test.ts (3 failures)
- tests/integration/organizations-audit-fixes.test.ts
- Various others

