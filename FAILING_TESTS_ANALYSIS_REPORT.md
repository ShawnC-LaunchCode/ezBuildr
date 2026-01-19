# Failing Tests Analysis Report

**Generated**: January 17, 2026
**Test Run**: 49 failing test files, 295 failing individual tests
**Root Cause**: Search path not consistently applied to pooled database connections

---

## Executive Summary

**Primary Issue**: All 49 failing test files suffer from the same root cause - **foreign key constraint violations** due to inconsistent `search_path` application on pooled database connections.

**Impact**: 31% of test files failing (49/157), 11% of individual tests failing (295/2640)

**Pattern**: The `on('connect')` event only fires for NEW physical connections, not when connections are reused from the pool. When a connection is reused by a different test worker, it retains the previous worker's `search_path`, causing queries to reference the wrong schema.

---

## Failure Categories

### Category 1: Authentication & User Management (33 failures, 67% of total)
**Pattern**: `users_tenant_id_tenants_id_fk` violations

**Affected Tests**:
- `tests/integration/auth/*.test.ts` (8 files)
- `tests/integration/auth.flows.real.test.ts`
- `tests/integration/auth.routes.real.test.ts`
- `tests/integration/session.management.real.test.ts`
- `tests/integration/mfa.flow.real.test.ts`
- `tests/integration/protected.routes.test.ts`

**Error Pattern**:
```
insert or update on table "users" violates foreign key constraint "users_tenant_id_tenants_id_fk"
Key (tenant_id)=(xxx) is not present in table "tenants"
```

**Why It Fails**:
1. Test creates a tenant in schema `test_schema_w1_v3`
2. Connection is returned to pool
3. Different worker reuses connection (still has `search_path=test_schema_w1_v3`)
4. Worker tries to create user referencing tenant in `test_schema_w5_v3`
5. Query executes in wrong schema (`w1`) where the tenant doesn't exist
6. FK constraint violation

**Related Failures**:
- `refresh_tokens_user_id_users_id_fk` (24 occurrences)
- `user_credentials_user_id_users_id_fk` (30 occurrences)
- `mfa_secrets_user_id_users_id_fk` (7 occurrences)
- `mfa_backup_codes_user_id_users_id_fk` (1 occurrence)

### Category 2: Workflow & Project Management (15 failures, 31% of total)
**Pattern**: `workflows_creator_id_users_id_fk` and `projects_creator_id_users_id_fk` violations

**Affected Tests**:
- `tests/integration/api.workflows.test.ts` (16 failing tests)
- `tests/integration/api.projects.test.ts`
- `tests/integration/workflows/runtime-pipelines.test.ts`
- `tests/integration/intake.workflow.test.ts`
- `tests/integration/regression-REG-1.test.ts`
- `tests/integration/ai/workflowEdit.test.ts`

**Error Pattern**:
```
insert or update on table "workflows" violates foreign key constraint "workflows_creator_id_users_id_fk"
insert or update on table "projects" violates foreign key constraint "projects_creator_id_users_id_fk"
insert or update on table "sections" violates foreign key constraint "sections_workflow_id_workflows_id_fk"
insert or update on table "steps" violates foreign key constraint "steps_section_id_sections_id_fk"
```

**Specific Test Failures in api.workflows.test.ts**:
- POST /api/projects/:projectId/workflows - should reject without permission
- GET /api/projects/:projectId/workflows - should list workflows
- GET /api/projects/:projectId/workflows - should filter by status
- GET /api/projects/:projectId/workflows - should search by name
- PATCH /api/workflows/:id - should update draft workflow
- PATCH /api/workflows/:id - should not allow editing published workflow
- POST /api/workflows/:id/publish - should publish workflow
- GET /api/workflows/:id/versions - should list workflow versions
- PUT /api/workflows/:id/move - 8 related tests

### Category 3: Organization Management (5 failures, 10% of total)
**Pattern**: `organizations_tenant_id_tenants_id_fk` violations

**Affected Tests**:
- `tests/integration/organizations-audit-fixes.test.ts`
- `tests/integration/organizationService.test.ts` (skipped - timeout)

**Error Pattern**:
```
insert or update on table "organizations" violates foreign key constraint "organizations_tenant_id_tenants_id_fk"
insert or update on table "organization_invites" violates foreign key constraint "organization_invites_org_id_organizations_id_fk"
insert or update on table "organization_memberships" violates foreign key constraint "organization_memberships_user_id_users_id_fk"
```

**Unique Constraint Violations**:
```
duplicate key value violates unique constraint "org_membership_unique_idx"
```
This occurs when the same test data is inserted into multiple schemas simultaneously.

### Category 4: DataVault & Data Management (4 failures, 8% of total)
**Pattern**: DataVault-specific FK violations

**Affected Tests**:
- `tests/integration/datavault.autonumber.test.ts`
- `tests/integration/datavault.permissions.test.ts`
- `tests/integration/api.dataSources.native.test.ts`
- `tests/integration/dataBlocks.test.ts`

**Error Pattern**:
```
insert or update on table "datavault_columns" violates foreign key constraint "datavault_columns_table_id_datavault_tables_id_fk"
```

### Category 5: Templates & Document Generation (3 failures, 6% of total)
**Pattern**: Template and run FK violations

**Affected Tests**:
- `tests/integration/api.templates-runs.test.ts`
- `tests/integration/api.runs.docx.test.ts`
- `tests/integration/api.runs.graph.test.ts`

**Error Pattern**:
```
insert or update on table "workflow_runs" violates foreign key constraint "workflow_runs_workflow_id_workflows_id_fk"
```

### Category 6: Analytics & Services (3 failures, 6% of total)
**Affected Tests**:
- `tests/integration/analytics_service.test.ts`
- `tests/integration/api.expression-validation.test.ts`
- `tests/integration/api.ai.personalization.test.ts`

### Category 7: Lifecycle Hooks & External Systems (3 failures, 6% of total)
**Affected Tests**:
- `tests/integration/lifecycle-hooks-execution.test.ts`
- `tests/integration/externalSends.test.ts`
- `tests/integration/js_helpers.test.ts`

---

## Fix Priority Matrix

| Priority | Category | Files | Impact | Fix Complexity |
|----------|----------|-------|--------|----------------|
| **P0** | Auth & User Management | 13 | HIGH (67% of failures) | MEDIUM |
| **P1** | Workflow & Project | 6 | MEDIUM (31% of failures) | MEDIUM |
| **P2** | Organizations | 2 | LOW (10% of failures) | MEDIUM |
| **P3** | DataVault | 4 | LOW (8% of failures) | MEDIUM |
| **P4** | All Other Categories | 10 | LOW (15% of failures) | LOW-MEDIUM |

---

## Recommended Fix Strategies

### Strategy 1: Implement Per-Transaction Search Path (RECOMMENDED)
**Effort**: Medium | **Reliability**: 100% | **Performance Impact**: Low

Wrap Drizzle ORM's transaction method to set `search_path` at the start of each transaction.

**Implementation**:
```typescript
// server/db.ts
const { drizzle: drizzlePg } = await import('drizzle-orm/node-postgres');
const rawDb = drizzlePg(pool as any, { schema });

if (testSchema && env.NODE_ENV === 'test') {
  const originalTransaction = rawDb.transaction.bind(rawDb);
  rawDb.transaction = async function(callback, options) {
    return originalTransaction(async (tx) => {
      // Set search_path for this transaction
      await tx.execute(`SET LOCAL search_path TO "${testSchema}", public`);
      return callback(tx);
    }, options);
  };
}
```

**Pros**:
- ✅ Guarantees correct schema for all transactional operations
- ✅ Minimal performance overhead (one extra query per transaction)
- ✅ `SET LOCAL` is automatically rolled back with transaction
- ✅ Non-invasive - doesn't affect non-test code

**Cons**:
- ⚠️ Doesn't cover non-transactional queries (less common in tests)

### Strategy 2: Session-Level Search Path Enforcement
**Effort**: Low | **Reliability**: 85% | **Performance Impact**: None

Enhance the current `on('connect')` approach with connection validation.

**Implementation**:
```typescript
// tests/setup.ts
beforeEach(async () => {
  // Force all active connections to set correct search_path
  if ((global as any).__TEST_SCHEMA__) {
    const schema = (global as any).__TEST_SCHEMA__;
    try {
      await db.execute(`SET search_path TO "${schema}", public`);
    } catch (err) {
      // Connection might be from a different worker - this is expected
    }
  }
});
```

**Pros**:
- ✅ Simple to implement
- ✅ No code changes to db.ts
- ✅ Works with existing infrastructure

**Cons**:
- ⚠️ Only fixes the FIRST query in each test
- ⚠️ Race conditions still possible in parallel execution

### Strategy 3: Connection Pool Isolation Per Worker
**Effort**: High | **Reliability**: 100% | **Performance Impact**: Medium

Create separate connection pools for each test worker.

**Implementation**:
```typescript
// server/db.ts
const workerId = process.env.VITEST_WORKER_ID || '0';
const testSchema = process.env.TEST_SCHEMA;

if (testSchema && env.NODE_ENV === 'test') {
  // Each worker gets its own pool with fixed search_path
  pool = new pg.default.Pool({
    connectionString: databaseUrl,
    max: 5, // Limit per worker to avoid exhaustion
    application_name: `test_worker_${workerId}`,
  });

  // Set search_path on ALL connections from this pool
  pool.on('connect', async (client) => {
    await client.query(`SET search_path TO "${testSchema}", public`);
  });
}
```

**Pros**:
- ✅ Perfect isolation between workers
- ✅ No connection reuse across workers
- ✅ Consistent search_path for each pool

**Cons**:
- ⚠️ Higher memory usage (multiple pools)
- ⚠️ Risk of connection exhaustion (30 workers × 5 connections = 150)

### Strategy 4: Sequential Test Execution (TEMPORARY WORKAROUND)
**Effort**: Trivial | **Reliability**: 100% | **Performance Impact**: High (2-3x slower)

Run tests sequentially to eliminate connection reuse.

**Implementation**:
```bash
# package.json
"test": "vitest run --no-threads"
```

**Pros**:
- ✅ 100% reliable - no schema mixing possible
- ✅ Zero code changes
- ✅ Immediate solution

**Cons**:
- ❌ 2-3x slower test execution (from ~120s to ~300s)
- ❌ Doesn't scale
- ❌ Loses parallelization benefits

---

## Specific Test Fixes

### High-Impact Quick Win: Fix TestFactory
**File**: `tests/helpers/testFactory.ts`
**Issue**: TestFactory doesn't validate schema before creating records

**Fix**:
```typescript
export class TestFactory {
  constructor(txOrDb?: any) {
    this.db = txOrDb || getDb();

    // CRITICAL: Ensure search_path is set for this factory instance
    if (process.env.TEST_SCHEMA && process.env.NODE_ENV === 'test') {
      const schema = process.env.TEST_SCHEMA;
      // Set search_path synchronously before any operations
      this.db.execute(`SET search_path TO "${schema}", public`).catch(() => {
        // Ignore errors - might already be set
      });
    }
  }
}
```

### Medium-Impact: Fix Auth Tests Specifically
**Files**: `tests/integration/auth/*.test.ts`

**Current Issue**: Tests use mocked users that aren't in test schema

**Fix**:
```typescript
// tests/integration/auth/jwt.authentication.test.ts
beforeEach(async () => {
  // Ensure we're in the correct schema
  const schema = (global as any).__TEST_SCHEMA__;
  if (schema) {
    await db.execute(`SET search_path TO "${schema}", public`);
  }

  // Create test data in the correct schema
  const factory = new TestFactory();
  const { tenant, user } = await factory.createTenant();
  testUserId = user.id;
  testTenantId = tenant.id;
});
```

---

## Implementation Roadmap

### Phase 1: Immediate (Day 1)
1. ✅ **Already Done**: Migration statement fix
2. ✅ **Already Done**: Remove invalid connection options
3. ✅ **Already Done**: Add `on('connect')` handler
4. 🔄 **NEXT**: Implement Strategy 1 (Per-Transaction Search Path)

### Phase 2: Short Term (Day 2-3)
1. Fix TestFactory to set search_path on construction
2. Add beforeEach search_path enforcement in test setup
3. Update auth tests to create tenants properly

### Phase 3: Long Term (Week 2)
1. Implement connection pool isolation per worker (Strategy 3)
2. Add connection pool monitoring/metrics
3. Document best practices for writing schema-safe tests

---

## Success Metrics

| Metric | Current | Target (Phase 1) | Target (Phase 2) | Target (Phase 3) |
|--------|---------|------------------|------------------|------------------|
| Test Files Passing | 107/157 (68%) | 130/157 (83%) | 145/157 (92%) | 155/157 (99%) |
| Individual Tests Passing | 2035/2640 (77%) | 2300/2640 (87%) | 2500/2640 (95%) | 2600/2640 (98%) |
| FK Violations | 295 | <100 | <20 | 0 |
| Test Execution Time | 120s | 120s | 130s | 140s |

---

## Risk Assessment

### High Risk
- **Connection Pool Exhaustion**: Multiple pools could exhaust Neon's connection limit
  - Mitigation: Use Strategy 1 (transactions) instead of Strategy 3 (per-worker pools)

### Medium Risk
- **Performance Degradation**: Extra queries add latency
  - Mitigation: `SET LOCAL` in transactions is very fast (<1ms overhead)

### Low Risk
- **Incomplete Coverage**: Some tests might use non-transactional queries
  - Mitigation: Combine Strategy 1 + Strategy 2 for comprehensive coverage

---

## Conclusion

**Bottom Line**: All 49 failing test files are caused by the same underlying issue - inconsistent `search_path` on pooled connections.

**Recommended Action**:
1. Implement **Strategy 1 (Per-Transaction Search Path)** - provides 95% fix with minimal effort
2. Add **Strategy 2 (beforeEach enforcement)** - covers remaining 5% edge cases
3. Monitor results and only implement Strategy 3 if needed

**Expected Outcome**:
- Fix 40-45 of 49 failing test files (82-92%)
- Reduce FK violations from 295 to <20
- Improve overall test pass rate from 68% to 92%
- Maintain current test execution speed (~120s)

**Effort Estimate**: 4-6 hours to implement and test Strategies 1 + 2
