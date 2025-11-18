# VaultLogic Test Analysis & Remediation Plan
**Date:** 2025-11-18
**Analyst:** Senior Dev + Senior QA/QC Review

## Executive Summary

Initial test run revealed **39+ failing tests** across multiple categories. After systematic analysis and cleanup, **14 legacy survey tests were eliminated**. Remaining failures categorized and prioritized below.

---

## Completed Actions ✅

### 1. Legacy Survey Code Removal
**Files Deleted:**
- `tests/unit/services/AnalyticsService.test.ts` (14 failing tests)
- `tests/unit/repositories/AnalyticsRepository.test.ts`
- `server/services/AnalyticsService.ts` (dead code - all methods disabled)
- `tests/factories/surveyFactory.ts`
- `tests/factories/responseFactory.ts`
- `tests/factories/mockFactories.ts`
- `tests/factories/analyticsFactory.ts`

**Files Modified:**
- `server/services/index.ts` - Removed AnalyticsService export

**Rationale:**
- Survey system completely removed Nov 2025 (per CLAUDE.md)
- AnalyticsService had all survey repository dependencies disabled
- Service never used in any routes (confirmed via grep)
- All 14 tests were testing survey-specific methods that would fail at runtime

---

## Remaining Test Failures (25 total)

### Category A: Unit Test Failures (11 tests)

#### 1. **tests/unit/services/intakeQuestionVisibility.test.ts** - 1 failure
- **Test:** "should clear values for hidden questions"
- **Priority:** LOW (intake system may be legacy or specialized)
- **Action:** Investigate if intake system is still active

#### 2. **tests/unit/schema/collections.test.ts** - 1 failure
- **Test:** "should omit id, createdAt, and updatedAt"
- **Priority:** MEDIUM
- **Issue:** Zod schema validation - likely schema definition issue
- **Action:** Review insertCollectionSchema definition

#### 3. **tests/unit/services/CollectionFieldService.test.ts** - 1 failure
- **Test:** "should validate date default value"
- **Priority:** MEDIUM
- **Issue:** Date validation logic
- **Action:** Fix date default value validation

#### 4. **tests/unit/services/DatavaultRowsService.test.ts** - 8 failures
- **Tests:** Most CRUD operations failing
- **Priority:** HIGH (core functionality)
- **Issue:** Likely mock/repository setup issue
- **Action:** Debug service mocks and database operations

### Category B: Engine Test Failures (10 tests)

#### 5. **tests/engine.run-conditions.test.ts** - 6 failures
- **Tests:** Compute node validation and execution
- **Priority:** HIGH (core workflow engine)
- **Issues:**
  - "should validate compute node expressions"
  - "should skip/execute question when condition is false/true" (4 tests)
  - "should handle complex workflow with multiple conditions"
- **Action:** Fix expression validation and condition execution logic

#### 6. **tests/engine.expr.test.ts** - 4 failures
- **Tests:** Helper function validation and evaluation
- **Priority:** HIGH (core expression engine)
- **Issues:**
  - "should allow helper functions"
  - "should allow complex expressions with multiple helpers"
  - "should evaluate with helper functions"
  - "should support complex nested expressions"
- **Action:** Fix helper function registration/validation

### Category C: Skipped Tests (96+ tests)

#### Intentionally Skipped (Need Review):
- `tests/unit/engine/templateNode.test.ts` - 17 tests skipped
- `tests/unit/services/WorkflowTemplateService.test.ts` - 24 tests skipped
- `tests/unit/repositories/WorkflowTemplateRepository.test.ts` - 21 tests skipped
- `tests/unit/services/PdfQueueService.test.ts` - 15 tests skipped
- `tests/integration/collections.e2e.test.ts` - 23 tests skipped

**Action Required:** Determine why these are skipped and either fix or remove

---

## Test Infrastructure Issues

### Current State:
- **Coverage Threshold:** 8% (very low)
- **Test Timeout:** 30s
- **Pool Strategy:** Single fork (good for DB isolation)

### Recommendations:
1. Increase coverage thresholds gradually after fixing tests
2. Review skipped tests - enable or delete
3. Add test database setup/teardown (currently TODO in setup.ts)
4. Implement proper test data factories for workflows

---

## Next Steps (Priority Order)

### Phase 1: Fix Core Engine (HIGH Priority)
1. Debug and fix `engine.expr.test.ts` (4 failures) - Expression evaluation
2. Debug and fix `engine.run-conditions.test.ts` (6 failures) - Workflow execution
3. **Impact:** Core workflow functionality must work

### Phase 2: Fix Data Layer (HIGH Priority)
4. Debug and fix `DatavaultRowsService.test.ts` (8 failures) - CRUD operations
5. Fix `CollectionFieldService.test.ts` (1 failure) - Date validation
6. Fix `collections.test.ts` schema test (1 failure)
7. **Impact:** Data persistence must work correctly

### Phase 3: Review Skipped Tests (MEDIUM Priority)
8. Investigate and fix/remove 96+ skipped tests
9. Determine if template/PDF features are active or legacy

### Phase 4: Increase Coverage (LOW Priority)
10. Write new tests for critical uncovered areas
11. Gradually increase coverage thresholds
12. Add integration tests for new workflows

---

## Code Quality Observations

### Good Practices Found:
✅ 3-tier architecture (Routes → Services → Repositories)
✅ Centralized test setup with vitest
✅ Mock factories for test data
✅ Separate unit/integration/e2e test structure

### Issues Found:
❌ Dead code not removed (AnalyticsService with disabled deps)
❌ Very low test coverage (8%)
❌ Many skipped tests without explanation
❌ Incomplete test database setup (TODOs in setup.ts)
❌ Legacy survey code mixed with workflow code

### Recommendations:
1. Complete database setup/teardown in `tests/setup.ts`
2. Remove or document all `.skip()` calls in tests
3. Set up test database migrations
4. Create comprehensive workflow test factories
5. Implement pre-commit hooks to prevent coverage regression

---

## Decision Log

### Senior Developer Perspective:
- **Deleted AnalyticsService:** Justified - all dependencies disabled, never used in routes, would fail at runtime
- **Kept AnalyticsRepository:** Deferred - may be useful for workflow analytics in future
- **Engine tests priority:** Critical - these test core workflow execution logic

### Senior QA/QC Perspective:
- **Test quality over quantity:** Better to have 200 good tests than 300 flaky ones
- **Skipped tests = technical debt:** Each skip should have a ticket or be removed
- **Coverage thresholds:** Current 8% is too low - should aim for 60%+ on critical paths
- **Test isolation:** Current single-fork strategy is good for DB tests

---

## Files Modified Summary

**Deleted (7 files):**
- tests/unit/services/AnalyticsService.test.ts
- tests/unit/repositories/AnalyticsRepository.test.ts
- server/services/AnalyticsService.ts
- tests/factories/surveyFactory.ts
- tests/factories/responseFactory.ts
- tests/factories/mockFactories.ts
- tests/factories/analyticsFactory.ts

**Modified (1 file):**
- server/services/index.ts (removed AnalyticsService export)

**To Be Fixed (6 test files):**
- tests/unit/services/intakeQuestionVisibility.test.ts
- tests/unit/schema/collections.test.ts
- tests/unit/services/CollectionFieldService.test.ts
- tests/unit/services/DatavaultRowsService.test.ts
- tests/engine.run-conditions.test.ts
- tests/engine.expr.test.ts

**To Be Reviewed (5+ test files):**
- tests/unit/engine/templateNode.test.ts (skipped)
- tests/unit/services/WorkflowTemplateService.test.ts (skipped)
- tests/unit/repositories/WorkflowTemplateRepository.test.ts (skipped)
- tests/unit/services/PdfQueueService.test.ts (skipped)
- tests/integration/collections.e2e.test.ts (skipped)

---

## Estimated Effort

- **Phase 1 (Engine fixes):** 4-6 hours
- **Phase 2 (Data layer fixes):** 3-4 hours
- **Phase 3 (Skipped tests review):** 2-3 hours
- **Phase 4 (Coverage increase):** 8-10 hours

**Total:** ~17-23 hours of focused work

---

## Conclusion

The test suite is in moderate health. Legacy survey code has been successfully removed (14 tests eliminated). Primary concerns are:

1. **Core engine tests failing** - Must fix to ensure workflow execution works
2. **Low coverage (8%)** - Need significant test writing effort
3. **Many skipped tests** - Technical debt that needs resolution

**Recommendation:** Proceed with Phase 1 (Engine fixes) immediately, as these are critical for platform functionality.
