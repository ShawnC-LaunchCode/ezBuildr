# VaultLogic Testing Strategy

**Version:** 2.0.0
**Last Updated:** December 5, 2025
**Status:** Active Development

---

## Executive Summary

This document defines the comprehensive testing strategy for VaultLogic, a production-grade workflow automation platform. As of December 2025, we are implementing a major overhaul to achieve **80% test coverage** with proper test isolation, maintainable patterns, and comprehensive coverage of critical business logic.

### Current State (Before Refactor)
- **Coverage:** ~8% lines, 5% functions, 5% branches
- **Test Count:** 87 test files, 25,500+ lines of test code
- **Issues:** Broken transaction patterns, placeholder tests, inflexible global mocks
- **Status:** ⚠️ Needs immediate attention

### Target State (After Refactor)
- **Coverage:** 80% lines, 80% functions, 70% branches
- **Test Pyramid:** 70% unit, 20% integration, 10% E2E
- **Patterns:** Clear, documented, consistent
- **Status:** ✅ Production-ready

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Organization](#test-organization)
3. [Test Patterns & Best Practices](#test-patterns--best-practices)
4. [Database Testing Strategy](#database-testing-strategy)
5. [Mocking Strategy](#mocking-strategy)
6. [Coverage Goals](#coverage-goals)
7. [Critical Services to Test](#critical-services-to-test)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Breaking Changes](#breaking-changes)

---

## Testing Philosophy

### The Testing Pyramid

VaultLogic follows the **Testing Pyramid** pattern:

```
        /\
       /  \      E2E Tests (10%)
      /____\     - Full user flows
     /      \    - Playwright browser tests
    /        \   - Expensive, slow, high value
   /          \
  /____________\ Integration Tests (20%)
 /              \ - API route tests
/________________\- Database operations
                  - External service integrations

 ________________  Unit Tests (70%)
|                | - Pure functions
|                | - Service logic
|                | - No database
|________________| - Fast, isolated, high coverage
```

### Principles

1. **Fast Feedback:** Unit tests run in <1s, integration tests <10s
2. **Isolation:** Each test is independent and can run in any order
3. **Clarity:** Tests document expected behavior
4. **Maintainability:** Tests are easy to update when requirements change
5. **Reliability:** Tests are deterministic, no flaky tests
6. **Coverage:** Critical paths have 90%+ coverage

### What Makes a Good Test?

✅ **DO:**
- Test behavior, not implementation
- Use descriptive test names (`it('should create workflow with valid data')`)
- Arrange-Act-Assert pattern
- One assertion per test (generally)
- Use factories for test data
- Clean up after yourself

❌ **DON'T:**
- Test private methods directly
- Use `expect(true).toBe(true)` placeholders
- Share mutable state between tests
- Use sleep/setTimeout for timing
- Commit skipped tests without documentation
- Mock everything (test real integrations)

---

## Test Organization

### Directory Structure

```
tests/
├── unit/                           # Unit tests (no DB, pure logic)
│   ├── services/                   # Service layer tests
│   ├── utils/                      # Utility function tests
│   ├── middleware/                 # Middleware tests
│   ├── validators/                 # Validation logic tests
│   └── engine/                     # Workflow engine tests
│
├── integration/                    # Integration tests (with DB)
│   ├── api/                        # API route tests
│   ├── routes/                     # Route handler tests
│   └── workflows/                  # End-to-end workflow tests
│
├── e2e/                            # Playwright E2E tests
│   ├── fixtures/                   # E2E test fixtures
│   └── *.e2e.ts                    # E2E test specs
│
├── helpers/                        # Test utilities
│   ├── testFactory.ts              # ✅ Test data factory
│   ├── mockFactory.ts              # 🆕 Mock factory functions
│   └── assertions.ts               # 🆕 Custom assertions
│
├── mocks/                          # 🆕 Mock implementations
│   ├── services.ts                 # Service mocks
│   ├── repositories.ts             # Repository mocks
│   └── external.ts                 # External service mocks
│
├── fixtures/                       # Test data fixtures
│   └── docx-integration/           # DOCX template fixtures
│
└── setup.ts                        # Global test setup
```

### File Naming Conventions

- **Unit tests:** `ServiceName.test.ts` (e.g., `WorkflowService.test.ts`)
- **Integration tests:** `api.entity.test.ts` (e.g., `api.workflows.test.ts`)
- **E2E tests:** `feature.e2e.ts` (e.g., `workflow-creation.e2e.ts`)

---

## Test Patterns & Best Practices

### Unit Test Pattern

Unit tests should be **pure** - no database, no external services, no filesystem.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { WorkflowService } from '@server/services/WorkflowService';
import { mockWorkflowRepository } from '../mocks/repositories';

describe('WorkflowService', () => {
  it('should create workflow with valid data', async () => {
    // Arrange
    const mockRepo = mockWorkflowRepository({
      create: vi.fn().mockResolvedValue({ id: '123', title: 'Test' }),
    });
    const service = new WorkflowService(mockRepo);
    const data = { title: 'Test Workflow', projectId: 'proj-1' };

    // Act
    const result = await service.createWorkflow(data);

    // Assert
    expect(result).toEqual({ id: '123', title: 'Test' });
    expect(mockRepo.create).toHaveBeenCalledWith(data);
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });

  it('should throw error for invalid data', async () => {
    // Arrange
    const mockRepo = mockWorkflowRepository();
    const service = new WorkflowService(mockRepo);
    const invalidData = { title: '' }; // Missing required fields

    // Act & Assert
    await expect(service.createWorkflow(invalidData)).rejects.toThrow(
      'Invalid workflow data'
    );
  });
});
```

### Integration Test Pattern

Integration tests can use the database but must **clean up properly**.

**✅ RECOMMENDED: Use runInTransaction**

```typescript
import { describe, it, expect } from 'vitest';
import { runInTransaction } from '../helpers/testTransaction';
import { TestFactory } from '../helpers/testFactory';
import { WorkflowService } from '@server/services/WorkflowService';

describe('WorkflowService Integration', () => {
  it('should persist workflow to database', async () => {
    await runInTransaction(async (tx) => {
      // Arrange
      const factory = new TestFactory();
      const { user, project } = await factory.createTenant();
      const service = new WorkflowService(tx); // Use transaction

      // Act
      const workflow = await service.createWorkflow({
        title: 'Integration Test',
        projectId: project.id,
        createdBy: user.id,
      });

      // Assert
      expect(workflow.id).toBeDefined();
      expect(workflow.title).toBe('Integration Test');

      // Verify in database
      const found = await tx.query.workflows.findFirst({
        where: (w, { eq }) => eq(w.id, workflow.id),
      });
      expect(found).toBeDefined();

      // Transaction rolls back automatically - no cleanup needed!
    });
  });
});
```

**✅ ALTERNATIVE: Use TestFactory.cleanup**

```typescript
describe('WorkflowService Integration', () => {
  const factory = new TestFactory();
  const tenantIds: string[] = [];

  afterEach(async () => {
    await factory.cleanup({ tenantIds });
    tenantIds.length = 0;
  });

  it('should persist workflow to database', async () => {
    // Arrange
    const { tenant, user, project } = await factory.createTenant();
    tenantIds.push(tenant.id);

    // Act
    const workflow = await WorkflowService.createWorkflow({
      title: 'Test',
      projectId: project.id,
    });

    // Assert
    expect(workflow).toBeDefined();
  });
});
```

### E2E Test Pattern

E2E tests use Playwright to test full user flows.

```typescript
import { test, expect } from '@playwright/test';
import { authenticatedPage } from './fixtures/auth';

test.describe('Workflow Creation Flow', () => {
  test('should create workflow from dashboard', async ({ page }) => {
    // Arrange - authenticate
    await authenticatedPage(page);
    await page.goto('/dashboard');

    // Act - create workflow
    await page.click('button:text("New Workflow")');
    await page.fill('input[name="title"]', 'E2E Test Workflow');
    await page.click('button:text("Create")');

    // Assert - verify workflow created
    await expect(page).toHaveURL(/\/workflows\/[a-f0-9-]+\/builder/);
    await expect(page.locator('h1')).toContainText('E2E Test Workflow');
  });
});
```

---

## Database Testing Strategy

### Strategy #1: Transaction Rollback (RECOMMENDED)

Use `runInTransaction()` to automatically rollback all changes:

```typescript
import { runInTransaction } from '../helpers/testTransaction';

it('should do something', async () => {
  await runInTransaction(async (tx) => {
    // All database operations use tx
    await tx.insert(schema.users).values({ ... });

    // Test logic here

    // Automatic rollback when function completes!
  });
});
```

**Benefits:**
- ✅ Fast (no manual cleanup)
- ✅ Complete isolation
- ✅ No cleanup code needed
- ✅ Safe (impossible to leave test data)

**Drawbacks:**
- ⚠️ Must pass `tx` to all service methods
- ⚠️ Can't test commit/rollback behavior

### Strategy #2: TestFactory Cleanup

Use `TestFactory.cleanup()` to manually clean up:

```typescript
import { TestFactory } from '../helpers/testFactory';

describe('My Tests', () => {
  const factory = new TestFactory();
  const tenantIds: string[] = [];

  afterEach(async () => {
    await factory.cleanup({ tenantIds });
    tenantIds.length = 0;
  });

  it('should do something', async () => {
    const { tenant } = await factory.createTenant();
    tenantIds.push(tenant.id);
    // Test logic
  });
});
```

**Benefits:**
- ✅ Tests use normal service methods (no tx parameter)
- ✅ Tests commit behavior
- ✅ Works with external services

**Drawbacks:**
- ⚠️ Slower (commits then deletes)
- ⚠️ Risk of orphaned data if test crashes
- ⚠️ Must track IDs for cleanup

### Strategy #3: Separate Test Database

Use a dedicated test database that's rebuilt between test suites:

```bash
# Set up test database
export TEST_DATABASE_URL="postgresql://localhost/vaultlogic_test"
npm run db:migrate:test
npm run test
```

**Benefits:**
- ✅ Most realistic
- ✅ Can test migrations
- ✅ Parallel test execution

**Drawbacks:**
- ⚠️ Slowest
- ⚠️ Requires separate database
- ⚠️ More complex setup

### Recommendation

- **Unit tests:** No database (pure mocks)
- **Integration tests:** Use `runInTransaction()` for speed
- **E2E tests:** Use separate test database

---

## Mocking Strategy

### Global Mocks (Minimal)

Only mock truly expensive or external operations **globally**:

```typescript
// tests/setup.ts

// ✅ Good: External service (SendGrid)
vi.mock('../server/services/sendgrid', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// ✅ Good: Filesystem operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// ❌ Bad: Internal services (should be per-test)
// vi.mock('../server/services/WorkflowService', ...)
```

**Clear shared state in beforeEach:**

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  // Clear any shared state
  testUsersMap.clear();
});
```

### Per-Test Mocks (Preferred)

Create mock factories for flexibility:

```typescript
// tests/mocks/repositories.ts

export function mockWorkflowRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

// Usage in test:
const mockRepo = mockWorkflowRepository({
  findById: vi.fn().mockResolvedValue({ id: '123', title: 'Test' }),
});
```

### Dependency Injection

Prefer dependency injection for testability:

```typescript
// ✅ Good: Injectable dependencies
class WorkflowService {
  constructor(
    private repo: WorkflowRepository,
    private logger: Logger
  ) {}

  async createWorkflow(data) {
    this.logger.info('Creating workflow');
    return this.repo.create(data);
  }
}

// Easy to test:
const service = new WorkflowService(mockRepo, mockLogger);
```

```typescript
// ❌ Bad: Hard-coded dependencies
class WorkflowService {
  async createWorkflow(data) {
    logger.info('Creating workflow'); // Hard-coded global
    return WorkflowRepository.create(data); // Static method
  }
}

// Hard to test - must mock globals
```

---

## Coverage Goals

### Phase 1: Foundation (Current - Jan 2026)

**Target:** 20% coverage

**Focus:**
- Fix broken test infrastructure
- Remove placeholder tests
- Test critical paths only

**Thresholds:**
```typescript
{
  lines: 20,
  functions: 20,
  branches: 15,
  statements: 20
}
```

### Phase 2: Core Coverage (Feb - Mar 2026)

**Target:** 50% coverage

**Focus:**
- All core services
- Critical API routes
- Workflow execution engine

**Thresholds:**
```typescript
{
  lines: 50,
  functions: 50,
  branches: 40,
  statements: 50
}
```

### Phase 3: Comprehensive (Apr - Jun 2026)

**Target:** 80% coverage

**Focus:**
- All services and routes
- Edge cases and error handling
- DataVault operations
- Transform blocks

**Thresholds:**
```typescript
{
  lines: 80,
  functions: 80,
  branches: 70,
  statements: 80
}
```

### Per-Module Goals

| Module | Target | Priority |
|--------|--------|----------|
| Core Services (Workflow, Run, Step) | 90% | Critical |
| DataVault Services | 85% | High |
| API Routes | 80% | High |
| Utilities | 85% | Medium |
| Middleware | 75% | Medium |
| UI Components | 70% | Medium |
| Legacy Code | 50% | Low |

---

## Critical Services to Test

### Priority 1 (Must Have - 90%+ Coverage)

1. **WorkflowService** - Core business logic
   - Create, update, delete workflows
   - Status management
   - Access control

2. **RunService** - Execution engine
   - Run creation and token generation
   - Progress tracking
   - Completion logic

3. **StepService** - Step management
   - CRUD operations
   - Alias validation
   - Reordering

4. **TransformBlockService** - Code execution
   - JavaScript/Python sandboxing
   - Input/output handling
   - Virtual step creation

5. **IntakeQuestionVisibilityService** - Visibility logic
   - Expression evaluation
   - Two-tier visibility
   - Alias resolution

### Priority 2 (Should Have - 80%+ Coverage)

6. **DatavaultTablesService** - DataVault core
7. **DatavaultRowsService** - Row operations
8. **PageService** - Page management
9. **LogicService** - Conditional logic
10. **DocumentGenerationService** - Template rendering

### Priority 3 (Nice to Have - 70%+ Coverage)

11. **BrandingService** - Branding configuration
12. **TeamService** - Team collaboration
13. **ProjectService** - Project management
14. **VersionService** - Version control
15. **SnapshotService** - Workflow snapshots

---

## Implementation Roadmap

### Week 1: Infrastructure (Dec 5-11, 2025)

- [x] Audit current test infrastructure
- [ ] Create testing strategy document
- [ ] Deprecate broken transaction patterns
- [ ] Remove placeholder tests
- [ ] Create mock factory pattern
- [ ] Fix test setup and cleanup

### Week 2: Core Services (Dec 12-18, 2025)

- [ ] WorkflowService tests (90%+)
- [ ] RunService tests (90%+)
- [ ] StepService tests (90%+)
- [ ] Increase coverage threshold to 20%

### Week 3-4: DataVault & Logic (Dec 19-31, 2025)

- [ ] DatavaultTablesService tests (85%+)
- [ ] DatavaultRowsService tests (85%+)
- [ ] TransformBlockService tests (90%+)
- [ ] IntakeQuestionVisibilityService tests (90%+)
- [ ] Increase coverage threshold to 35%

### January 2026: API Routes

- [ ] All workflow API routes (80%+)
- [ ] All DataVault API routes (80%+)
- [ ] Authentication routes (85%+)
- [ ] Increase coverage threshold to 50%

### February 2026: Comprehensive Coverage

- [ ] Remaining services (70%+)
- [ ] UI components (70%+)
- [ ] E2E tests (critical flows)
- [ ] Increase coverage threshold to 80%

---

## Breaking Changes

### Deprecated Patterns (Remove by Jan 2026)

1. **`beginTestTransaction()`** - DEPRECATED
   - **Reason:** Uses never-resolving promise anti-pattern
   - **Replacement:** Use `runInTransaction()`
   - **Migration:**
     ```typescript
     // ❌ Old (deprecated):
     let tx;
     beforeEach(async () => {
       tx = await beginTestTransaction();
     });
     afterEach(async () => {
       await rollbackTestTransaction(tx);
     });

     // ✅ New (recommended):
     it('test', async () => {
       await runInTransaction(async (tx) => {
         // Test code
       });
     });
     ```

2. **`rollbackTestTransaction()`** - DEPRECATED
   - **Reason:** Fragile, uses raw SQL
   - **Replacement:** Use `runInTransaction()`

3. **Global mock functions** - DEPRECATED
   - **Reason:** Not customizable per-test
   - **Replacement:** Use mock factories
   - **Migration:**
     ```typescript
     // ❌ Old (deprecated):
     import { sendEmail } from '@server/services/sendgrid';
     // sendEmail is hard-mocked globally

     // ✅ New (recommended):
     import { mockSendgridService } from '../mocks/services';
     const sendgrid = mockSendgridService({
       sendEmail: vi.fn().mockResolvedValue({ success: true }),
     });
     ```

4. **Placeholder tests** - REMOVED
   - **Reason:** False coverage
   - **Action:** Deleted all `expect(true).toBe(true)` tests
   - **Files affected:**
     - `tests/integration/datavault.databases.test.ts` (removed)

### New Patterns (Adopt Immediately)

1. **Mock factories** - Use `tests/mocks/*.ts` for all mocks
2. **TestFactory** - Use for all test data creation
3. **runInTransaction** - Use for all integration tests
4. **Arrange-Act-Assert** - Use in all tests

---

## FAQ

### Q: Should unit tests touch the database?

**A:** No. Unit tests should be pure - mock all external dependencies including the database. If you need the database, it's an integration test.

### Q: When should I use `runInTransaction()` vs `TestFactory.cleanup()`?

**A:** Use `runInTransaction()` for most integration tests (faster). Use `TestFactory.cleanup()` only when you need to test commit behavior or multiple transactions.

### Q: How do I test async workflows?

**A:** Mock the async operations or use a test timeout. Don't use `setTimeout` - use `vi.useFakeTimers()` instead.

### Q: What if my test is flaky?

**A:** Flaky tests are usually caused by:
1. Shared mutable state (fix with proper cleanup)
2. Timing issues (fix with proper waits/mocks)
3. External dependencies (fix with mocks)
4. Database state (fix with transactions)

### Q: Should I test private methods?

**A:** No. Test the public API. If a private method is complex enough to need testing, it should probably be a separate class/module.

### Q: How do I know what to test?

**A:** Test:
1. Happy path (expected behavior)
2. Edge cases (boundary conditions)
3. Error cases (invalid input, failures)
4. Business rules (domain logic)

Don't test:
1. Framework code (Express, Drizzle, etc.)
2. Third-party libraries
3. Trivial getters/setters

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)

---

**Maintained by:** Development Team
**Next Review:** January 15, 2026
**Version History:**
- v2.0.0 (Dec 5, 2025) - Complete refactor and strategy overhaul
- v1.0.0 (Nov 2025) - Initial documentation
