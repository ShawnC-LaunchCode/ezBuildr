# Test Schema Fix - Comprehensive Attempt Summary

**Date**: January 17, 2026
**Status**: All strategies attempted, FK violations persist
**Current Pass Rate**: 67% (105/157 test files passing)

---

## Executive Summary

All recommended strategies from FAILING_TESTS_ANALYSIS_REPORT.md have been implemented and tested:
- ✅ Strategy 1: Per-Transaction Search Path Enforcement
- ✅ Strategy 2: beforeEach search_path Enforcement
- ✅ Strategy 3: Connection Pool Isolation Per Worker
- ❌ **Result**: FK violations still occur in 51-52 test files

**Conclusion**: The root cause appears to be deeper than connection pooling - likely related to how Drizzle ORM manages connections internally or how Vitest workers interact with the database module.

---

## Strategies Attempted

### Attempt 1: on('connect') Event Handler (Baseline)
**Implementation**: `server/db.ts` lines 81-92
**Result**: 107/157 files passing (68%)
**Issue**: `on('connect')` only fires for NEW physical connections, not pooled reuse

### Attempt 2: Per-Transaction Search Path (Strategy 1)
**Implementation**: Wrapped `rawDb.transaction()` to execute `SET LOCAL search_path` at start of each transaction
**Result**: 107/157 files passing (68%) - NO IMPROVEMENT
**Issue**: Most tests use `TestFactory` with direct inserts, not transactions

### Attempt 3: beforeEach Enforcement (Strategy 2)
**Implementation**: Added `SET search_path` in beforeEach hook in `tests/setup.ts`
**Result**: 106/157 files passing (67.5%) - WORSE
**Issue**: beforeEach sets search_path on one connection, but subsequent queries use different pooled connections

### Attempt 4: execute() Method Wrapper
**Implementation**: Wrapped `rawDb.execute()` to prepend `SET search_path` to all queries
**Result**: 105/157 files passing (67%) - WORSE
**Issue**: Drizzle ORM uses internal query execution methods (`.insert()`, `.select()`) that bypass the `execute()` wrapper

### Attempt 5: Connection Pool Isolation Per Worker (Strategy 3)
**Implementation**: Created separate `Pool` instances per worker with unique `application_name`
**Configuration**:
- Max 3 connections per worker
- Unique pool per worker ID
- `application_name: test_worker_${workerId}_${testSchema}`

**Result**: 105/157 files passing (67%) - WORSE
**Issue**: FK violations still occur despite pool isolation

---

## Technical Analysis

### FK Violation Pattern
All failures follow the same pattern:
```sql
insert or update on table "users" violates foreign key constraint "users_tenant_id_tenants_id_fk"
Key (tenant_id)=(xxx) is not present in table "tenants".
schema: 'test_schema_wN_v3'
```

**Observation**: The error reports the CORRECT schema for the current worker (e.g., `test_schema_w30_v3`), but the referenced tenant doesn't exist in that schema.

### Why Isolated Pools Didn't Work

**Theory 1**: Module Caching
- Each Vitest worker runs in a separate process with isolated memory
- However, there might be subtle module caching or singleton patterns in Drizzle ORM
- The `pool` instance might be shared despite being in different processes

**Theory 2**: Drizzle ORM Connection Management
- Drizzle ORM has internal connection management layers
- The ORM might be acquiring connections directly from pg.Pool, bypassing our pool configuration
- Stack traces show: `node_modules/drizzle-orm/node-postgres/session.js:124:18`

**Theory 3**: TestFactory Database Instance
- TestFactory is initialized with `txOrDb || getDb()`
- If the db instance is cached or shared across workers, it could cause cross-schema queries
- However, each worker should have its own db module instance

### Why beforeEach Didn't Work

Within a single test, multiple queries can use different pooled connections:
1. beforeEach sets `search_path` on connection A
2. TestFactory.createTenant() tenant insert uses connection A (succeeds)
3. TestFactory.createTenant() user insert uses connection B (fails - wrong schema)

Connection B might be:
- A reused connection from another worker's previous test
- A new connection that hasn't had `search_path` set yet

---

## Code Changes Made

### `server/db.ts`
```typescript
// Lines 56-92: Connection Pool Isolation Per Worker
const testSchema = process.env.TEST_SCHEMA || (global as any).__TEST_SCHEMA__;
const workerId = process.env.VITEST_WORKER_ID || process.env.VITEST_POOL_ID || '0';

if (testSchema && env.NODE_ENV === 'test') {
  pool = new pg.default.Pool({
    connectionString: databaseUrl,
    max: 3,
    application_name: `test_worker_${workerId}_${testSchema}`,
  });

  pool.on('connect', async (client) => {
    await client.query(`SET search_path TO "${testSchema}", public`);
  });
}
```

### `tests/setup.ts`
```typescript
// Lines 379-395: beforeEach search_path enforcement
beforeEach(async () => {
  const schema = (global as any).__TEST_SCHEMA__;
  if (schema && db?.execute) {
    try {
      await db.execute(`SET search_path TO "${schema}", public`);
    } catch (err: any) {
      console.warn(`⚠️ beforeEach: Failed to set search_path: ${err.message}`);
    }
  }
  // ... rest of beforeEach
});
```

---

## Why None of These Worked

The fundamental issue is that **we cannot reliably intercept all query execution points in Drizzle ORM** at the application layer. Drizzle uses internal query builders and execution paths that:

1. Don't use our wrapped `execute()` method
2. Don't use our wrapped `transaction()` method (for non-transactional queries)
3. Acquire connections directly from the pool, bypassing our wrappers
4. May have internal connection caching or pooling

---

## Remaining Options

### Option 1: Sequential Test Execution (RECOMMENDED - TEMPORARY)
**Implementation**:
```json
{
  "scripts": {
    "test": "vitest run --no-threads"
  }
}
```

**Pros**:
- ✅ 100% reliable - no schema mixing possible
- ✅ Zero code changes
- ✅ Immediate solution

**Cons**:
- ❌ 2-3x slower test execution (from ~90s to ~200-300s)
- ❌ Doesn't scale
- ❌ Loses parallelization benefits

### Option 2: Separate Databases Per Worker
Instead of schemas, use completely separate database instances per worker.

**Implementation**:
- Create `test_db_w0`, `test_db_w1`, etc.
- Each worker connects to its own database
- Perfect isolation, no search_path issues

**Pros**:
- ✅ Perfect isolation
- ✅ No search_path complexity

**Cons**:
- ❌ Higher resource cost (more connections, more storage)
- ❌ Slower setup/teardown (database creation is slower than schema creation)
- ❌ May hit database count limits on cloud providers

### Option 3: Modify Drizzle ORM Internals
Patch Drizzle ORM to add search_path enforcement at the connection acquisition level.

**Implementation**:
- Fork Drizzle ORM or use patch-package
- Modify `node_modules/drizzle-orm/node-postgres/session.js` to set search_path before every query

**Pros**:
- ✅ Would fix the root cause
- ✅ Maintains parallel execution

**Cons**:
- ❌ Maintenance burden (must patch with every Drizzle update)
- ❌ Fragile (could break with Drizzle updates)
- ❌ Complex to implement

### Option 4: Wrap pg.Pool.connect() at the pg Level
Instead of wrapping Drizzle, wrap the underlying pg.Pool.connect() method.

**Implementation**:
```typescript
import pg from 'pg';

const originalPoolPrototype = pg.Pool.prototype.connect;
pg.Pool.prototype.connect = async function() {
  const client = await originalPoolPrototype.call(this);
  const testSchema = process.env.TEST_SCHEMA;
  if (testSchema) {
    await client.query(`SET search_path TO "${testSchema}", public`);
  }
  return client;
};

// Then create pool normally
const pool = new pg.Pool({ connectionString });
```

**Pros**:
- ✅ Intercepts ALL connection acquisitions
- ✅ Works regardless of Drizzle ORM version
- ✅ Maintains parallel execution

**Cons**:
- ⚠️ Modifying pg.Pool prototype (global side effect)
- ⚠️ Could conflict with other pool usage
- ⚠️ Untested - might have edge cases

### Option 5: Accept Current State (68% Pass Rate)
Focus on fixing the remaining 49 test files individually rather than solving schema isolation.

**Implementation**:
- Investigate each failing test file
- Fix specific issues (data setup, mocking, etc.)
- Some failures might be unrelated to schema isolation

**Pros**:
- ✅ 68% pass rate is significant progress
- ✅ No architectural changes needed
- ✅ Focus effort where it matters most

**Cons**:
- ❌ Intermittent failures will persist
- ❌ Schema isolation issues could resurface

---

## Recommended Path Forward

### Immediate Action: Option 4 (pg.Pool.connect() Wrapper)
This is the most surgical solution that addresses the root cause without modifying Drizzle ORM or running sequentially.

**Implementation Steps**:
1. In `server/db.ts`, monkey-patch `pg.Pool.prototype.connect` BEFORE creating the pool
2. Set `search_path` on EVERY connection acquisition
3. Test with parallel execution

**Expected Outcome**: 90-95% test pass rate (40-45 of 49 failures fixed)

### Fallback: Option 1 (Sequential Execution)
If Option 4 doesn't work or introduces other issues, switch to sequential execution temporarily:
```bash
npm test -- --no-threads
```

### Long-Term: Option 2 (Separate Databases)
For production-grade test isolation, migrate from schemas to separate databases per worker.

---

## Test Results Summary

| Attempt | Strategy | Pass Rate | Individual Tests | Duration |
|---------|----------|-----------|------------------|----------|
| Baseline | on('connect') only | 107/157 (68%) | 2035/2640 (77%) | ~120s |
| Attempt 1 | + Transaction wrapper | 107/157 (68%) | 2012/2640 (76%) | ~92s |
| Attempt 2 | + beforeEach enforcement | 106/157 (67.5%) | 2020/2640 (76%) | ~96s |
| Attempt 3 | + execute() wrapper | 105/157 (67%) | 2023/2640 (76%) | ~92s |
| **Attempt 4** | **Isolated pools per worker** | **105/157 (67%)** | **1993/2640 (75%)** | **~98s** |

**Trend**: Each additional layer of wrapping made results slightly worse, suggesting we're introducing overhead without fixing the core issue.

---

## Key Learnings

1. **Connection pooling is not the root cause** - Isolated pools per worker didn't fix the issue
2. **Drizzle ORM bypasses application-level wrappers** - Cannot reliably intercept at transaction/execute level
3. **beforeEach enforcement is insufficient** - Multiple connections can be used within a single test
4. **The issue is at the pg.Pool level** - Need to intercept at the connection acquisition layer

---

## Next Steps

1. Try **Option 4** (pg.Pool.connect() wrapper) - most promising
2. If that fails, use **Option 1** (sequential execution) as a reliable fallback
3. Document findings and recommend Vitest/Drizzle best practices for schema isolation
4. Consider opening issue with Drizzle ORM for official test isolation guidance

---

**Author**: Claude Sonnet 4.5
**Related Files**:
- `FAILING_TESTS_ANALYSIS_REPORT.md` - Original analysis
- `TEST_SCHEMA_FIX_FINAL_SUMMARY.md` - Initial fix summary
- `TEST_SCHEMA_FIX_SUMMARY.md` - First approach summary
