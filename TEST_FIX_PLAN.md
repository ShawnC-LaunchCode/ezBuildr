# Test Suite Fix Plan

## Executive Summary
**Current State:** 407 failing tests across 57 test files (16.1% failure rate)
**Target:** <5% failure rate (< 127 failing tests)
**Timeline:** 3 phases over ~3-5 days

---

## Phase 1: Low-Hanging Fruit (Target: Fix ~190 failures, ~1-2 days)

### 1.1 Variable Resolver Schema Fix (3 failures) ⭐ EASIEST
**Effort:** 15 minutes
**Impact:** 3 tests fixed

**Problem:**
- Tests expect `title` field, but schema now returns `label`
- Extra fields (`sectionId`, `sectionTitle`, `stepId`) not expected in tests

**Solution:**
```typescript
// In tests/unit/utils/variableResolver.test.ts
// Update assertions to:
expect(result).toEqual({
  key: "step-uuid-123",
  alias: "firstName",
  label: "First Name",      // Changed from title
  sectionId: "sec-1",       // Add
  sectionTitle: "Section 1", // Add
  stepId: "step-1",         // Add
  type: "short_text",
});
```

**Files to fix:**
- `tests/unit/utils/variableResolver.test.ts` (lines 136, 175)

---

### 1.2 Authentication Mock Infrastructure (100+ failures) ⭐ HIGHEST IMPACT
**Effort:** 2-4 hours
**Impact:** ~100 tests fixed

**Problem:**
- `TypeError: actual.getSession is not a function`
- Auth middleware not properly mocked across integration tests
- Session management mocks missing

**Solution:**
Create shared auth mock utilities:

```typescript
// tests/setup/authMocks.ts
import { vi } from 'vitest';

export const createMockSession = (userId: string = 'test-user-id') => ({
  userId,
  email: 'test@example.com',
  tenantId: 'test-tenant',
  sessionId: 'test-session-id',
});

export const createMockRequest = (options = {}) => ({
  session: createMockSession(),
  user: { id: 'test-user-id', email: 'test@example.com' },
  headers: {},
  cookies: {},
  ...options,
});

export const createMockAuthMiddleware = () => ({
  getSession: vi.fn().mockReturnValue(createMockSession()),
  requireAuth: vi.fn((req, res, next) => next()),
  optionalAuth: vi.fn((req, res, next) => next()),
});

// Mock express-session
vi.mock('express-session', () => ({
  default: vi.fn(() => (req, res, next) => {
    req.session = createMockSession();
    next();
  }),
}));
```

**Files to update:**
1. Create `tests/setup/authMocks.ts`
2. Update `tests/setup.ts` to import and apply auth mocks globally
3. Fix individual test files to use proper auth context

**Test files needing auth mocks:**
- `tests/integration/auth/*.test.ts` (all 13 files)
- `tests/integration/session.management.real.test.ts`
- `tests/integration/mfa.flow.real.test.ts`
- `tests/integration/trusted.devices.real.test.ts`
- `tests/unit/services/AuthService.test.ts`
- `tests/unit/middleware/auth.middleware.test.ts`

---

### 1.3 UI Component Navigator Mock (90 failures) ⭐ MEDIUM IMPACT
**Effort:** 1-2 hours
**Impact:** ~90 tests fixed

**Problem:**
- `Cannot read properties of undefined (reading 'navigator')`
- Missing JSDOM setup for browser APIs

**Solution:**
Add to test setup:

```typescript
// tests/setup.ts or vitest.config.ts
import { beforeAll } from 'vitest';

beforeAll(() => {
  // Mock window.navigator
  Object.defineProperty(window, 'navigator', {
    value: {
      userAgent: 'test',
      language: 'en-US',
      languages: ['en-US', 'en'],
      onLine: true,
      platform: 'test',
      clipboard: {
        writeText: vi.fn(),
        readText: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  });

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});
```

**Files to fix:**
- Add to `tests/setup.ts`
- `tests/ui/datavault/EditableCell.test.tsx`
- `tests/ui/runs.components.test.tsx`
- `tests/ui/datavault/ColumnTypeIcon.test.tsx`
- `tests/ui/expression-editor.test.tsx`
- `tests/ui/common/Breadcrumbs.test.tsx`
- `tests/ui/datavault/TableCard.test.tsx`
- `tests/ui/datavault/DatabaseSettingsPage.test.tsx`
- `tests/ui/datavault/TemplateCard.test.tsx`

---

## Phase 2: Medium Priority Fixes (Target: Fix ~150 failures, ~1-2 days)

### 2.1 DataVault Integration Test Auth (44 failures)
**Effort:** 2-3 hours
**Impact:** 44 tests fixed

**Problem:**
- Tests return 401 instead of 200/201
- Missing authenticated request context

**Solution:**
```typescript
// In datavault integration tests
import { createAuthenticatedRequest } from '@/tests/helpers/auth';

describe('DataVault API', () => {
  let authContext;

  beforeEach(async () => {
    authContext = await createAuthenticatedRequest({
      userId: 'test-user-id',
      tenantId: 'test-tenant',
    });
  });

  it('should create database', async () => {
    const response = await request(app)
      .post('/api/datavault/databases')
      .set('Cookie', authContext.cookies)
      .set('Authorization', `Bearer ${authContext.token}`)
      .send({ name: 'Test DB' });

    expect(response.status).toBe(201);
  });
});
```

**Files to fix:**
- `tests/integration/datavault-v4-regression.test.ts`
- `tests/integration/datavault.permissions.test.ts`

---

### 2.2 Write Runner Test Fixes (2 failures)
**Effort:** 30 minutes
**Impact:** 2 tests fixed

**Problem:**
- Mock functions not being called
- Arguments mismatch

**Solution:**
Review and fix mock setup in `tests/unit/writes/WriteRunner.test.ts`

---

### 2.3 ListTools Block Tests (17 failures)
**Effort:** 2-3 hours
**Impact:** 17 tests fixed

**Problem:**
- List operation assertions failing
- Implementation vs test expectations mismatch

**Solution:**
- Review `tests/ListTools.test.ts`
- Update assertions to match current implementation
- May need to fix bugs in implementation if tests are correct

---

### 2.4 IntakeNavigation Service (17 failures)
**Effort:** 2-3 hours
**Impact:** 17 tests fixed

**Problem:**
- Navigation logic tests failing
- Service behavior changed

**Solution:**
- Review `tests/unit/services/intakeNavigation.test.ts`
- Update tests to match current navigation logic
- Check for actual bugs in navigation service

---

## Phase 3: Lower Priority Fixes (Target: Fix ~67 failures, ~1 day)

### 3.1 Workflow API Integration Tests (9 failures)
**Effort:** 1-2 hours
**Impact:** 9 tests fixed

**Files:**
- `tests/integration/api.workflows.test.ts`

---

### 3.2 AI Service Tests (7 failures)
**Effort:** 1 hour
**Impact:** 7 tests fixed

**Problem:**
- AI response schema validation failures
- Mock responses don't match expected schema

**Files:**
- `tests/unit/ai.service.test.ts`

---

### 3.3 Miscellaneous Fixes (30 failures)
**Effort:** 2-3 hours
**Impact:** 30 tests fixed

**Files:**
- `tests/unit/server/transferOwnership.test.ts`
- `tests/unit/api.ai.logic.test.ts`
- Various others

---

## Implementation Order (Recommended)

### Day 1: Quick Wins (Target: ~103 tests fixed)
1. ✅ Variable Resolver (15 min) - 3 tests
2. ✅ Navigator/JSDOM Mocks (2 hours) - 90 tests
3. ✅ Auth Mock Infrastructure Setup (2 hours) - 10 tests
   - Create base mocks
   - Apply to simplest test files

### Day 2: Auth Mock Rollout (Target: ~90 tests fixed)
4. ✅ Apply auth mocks to remaining auth tests (4 hours) - 90 tests
   - Integration tests
   - Unit tests

### Day 3: DataVault & Workflow Tests (Target: ~70 tests fixed)
5. ✅ DataVault Integration Auth (3 hours) - 44 tests
6. ✅ Workflow API Tests (2 hours) - 9 tests
7. ✅ ListTools Tests (3 hours) - 17 tests

### Day 4: Navigation & Services (Target: ~36 tests fixed)
8. ✅ IntakeNavigation Tests (3 hours) - 17 tests
9. ✅ Write Runner Tests (1 hour) - 2 tests
10. ✅ AI Service Tests (1 hour) - 7 tests
11. ✅ Transfer Ownership (2 hours) - 10 tests

### Day 5: Cleanup & Verification
12. ✅ Miscellaneous fixes (3 hours) - 20 tests
13. ✅ Full test suite run and verification (1 hour)
14. ✅ Documentation update (1 hour)

---

## Expected Outcomes

**After Phase 1:**
- ~190 tests fixed (47% of failures)
- Failure rate: ~8.5%
- Auth infrastructure in place
- UI tests working

**After Phase 2:**
- ~340 tests fixed (84% of failures)
- Failure rate: ~2.6%
- Most integration tests working

**After Phase 3:**
- ~407 tests fixed (100% of failures)
- Failure rate: <1%
- Full green test suite

---

## Risk Mitigation

### If Running Out of Time:
**Must-Fix (Core Functionality):**
1. Auth Mock Infrastructure (Phase 1.2)
2. Variable Resolver (Phase 1.1)
3. DataVault Auth (Phase 2.1)

**Can Skip (Lower Impact):**
1. AI Service tests
2. Some miscellaneous tests
3. Workflow API edge cases

### Blockers to Watch For:
1. **Database connection issues** - May need to mock more aggressively
2. **Environment-specific failures** - May need CI/CD config updates
3. **Actual bugs discovered** - May need to fix implementation, not tests

---

## Success Metrics

1. **Test Coverage:** Maintain >80% overall coverage
2. **CI/CD:** All tests pass in CI pipeline
3. **No Flaky Tests:** <1% intermittent failures
4. **Fast Execution:** Full suite runs in <2 minutes

---

## Notes

- Keep running full suite after each phase to catch regressions
- Commit after each major fix category
- Update test documentation as fixes are made
- Consider adding pre-commit hooks to prevent test failures
