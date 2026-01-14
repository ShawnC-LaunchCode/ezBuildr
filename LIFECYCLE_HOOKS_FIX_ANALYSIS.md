# Lifecycle Hooks Test Failures - Root Cause Analysis

**Date:** January 13, 2026
**Status:** Issues Identified - Ready to Fix

---

## Test Failures Summary

6 tests failing out of 15 (60% pass rate for failing tests):

1. ✅ **should execute beforePage hook with mutation mode enabled** - PASSING
2. ❌ **should execute beforePage hook and capture console output** - FAILING
3. ✅ **should handle errors gracefully without breaking workflow** - PASSING
4. ❌ **should execute afterPage hook with user input data** - FAILING
5. ❌ **should execute Python afterPage hook** - FAILING (expected - Python not installed)
6. ❌ **should execute beforeFinalBlock hook before document generation** - FAILING
7. ❌ **should execute afterDocumentsGenerated hook for cleanup** - FAILING
8. ❌ **should timeout hook that exceeds timeoutMs limit** - FAILING
9. ✅ **should execute multiple hooks in correct order** - PASSING
10. ✅ **should list all hooks for a workflow** - PASSING
11. ✅ **should update a hook** - PASSING
12. ✅ **should delete a hook** - PASSING
13. ✅ **should test a hook with sample data** - PASSING
14. ✅ **should retrieve execution logs for a run** - PASSING
15. ✅ **should clear execution logs for a run** - PASSING

---

## Root Causes

### Issue #1: Console Output Not Captured (isolated-vm path)

**Affected Tests:**
- "should execute beforePage hook and capture console output"

**Root Cause:**
The `isolated-vm` path in `enhancedSandboxExecutor.ts` does not capture console logs. The `helpers.console.*` functions are bridged via `callHost`, but the bridge doesn't capture the logs.

**Current Code (enhancedSandboxExecutor.ts:259):**
```typescript
return {
  ok: true,
  output: output,
  consoleLogs: helperLib.getConsoleLogs ? helperLib.getConsoleLogs() : undefined, // ❌ Returns undefined
  durationMs,
};
```

**Why it fails:**
- `helpers.console.log()` is called inside the isolated-vm context via the bridge
- The bridge executes the original helper function but doesn't capture the arguments
- `helperLib.getConsoleLogs()` returns an empty array because logs aren't being added to it

**VM Fallback (works correctly) - enhancedSandboxExecutor.ts:703-707:**
```typescript
const consoleLogs: any[][] = [];
const sandbox = {
  ...
  console: {
    log: (...args: any[]) => consoleLogs.push(args),
    warn: (...args: any[]) => consoleLogs.push(['[WARN]', ...args]),
    error: (...args: any[]) => consoleLogs.push(['[ERROR]', ...args]),
  },
};
```

**Fix:**
Add console capture in the isolated-vm bootstrap code, similar to VM fallback.

---

### Issue #2: Input Data Not Mapped by Alias

**Affected Tests:**
- "should execute afterPage hook with user input data" (expects `validationPassed=true`)
- "should execute beforeFinalBlock hook before document generation" (expects `documentTitle='Alice wonderland'`)
- "should execute afterDocumentsGenerated hook for cleanup" (expects `totalSteps > 0`)

**Root Cause:**
Tests pass data using stepId as key (e.g., `{ [stepId]: 'John Doe' }`), but hooks expect alias keys (e.g., `input.user_name`).

**Current Test Code (line 312):**
```typescript
const result = await lifecycleHookService.executeHooksForPhase({
  workflowId,
  runId: run.id,
  phase: 'afterPage',
  sectionId,
  data: { [stepId]: 'John Doe' }, // ❌ Uses stepId as key
  userId: ctx.userId,
});
```

**Hook Code (line 274):**
```typescript
const name = input.user_name; // ❌ Expects alias 'user_name'
```

**Why it fails:**
- The data object has keys like `'abc123-stepid': 'John Doe'`
- The hook tries to access `input.user_name`, which doesn't exist
- Result: `name` is undefined, so `normalized` becomes empty string

**Expected behavior:**
The lifecycle hook service should map stepId → alias using the workflow's step definitions.

**Fix Options:**
1. **Option A (Preferred):** Update LifecycleHookService to fetch step aliases and map data keys
2. **Option B:** Update tests to pass data with alias keys instead of stepId

**Recommendation:** Option A - the service should handle this mapping automatically.

---

### Issue #3: Timeout Test Expects Non-Breaking Success

**Affected Tests:**
- "should timeout hook that exceeds timeoutMs limit"

**Root Cause:**
Test expects `success: true` with errors (non-breaking), but service returns `success: false` when there are errors.

**Current Code (LifecycleHookService.ts:216):**
```typescript
return {
  success: errors.length === 0, // ❌ Returns false when there are errors
  data: resultData,
  errors: errors.length > 0 ? errors : undefined,
  consoleOutput: consoleOutput.length > 0 ? consoleOutput : undefined,
};
```

**Test Expectation (line 526):**
```typescript
// Workflow continues despite timeout
expect(result.success).toBe(true); // ❌ Expects true
expect(result.errors).toBeDefined(); // ❌ Expects errors to be defined
```

**Inconsistency:**
- Another test (line 245) expects `success: false` for errors
- This suggests the test at line 526 has incorrect expectations

**Fix:**
Update test expectation to `expect(result.success).toBe(false)` (service behavior is correct).

---

### Issue #4: Python Not Installed (Environment Issue)

**Affected Tests:**
- "should execute Python afterPage hook"

**Root Cause:**
Python is not installed on the Windows test environment.

**Log Output:**
```
PythonProcessError: Python was not found; run without arguments to install from the Microsoft Store
```

**Fix:**
- Either install Python on the test machine
- Or skip Python tests on Windows CI environments

**Recommendation:** Add conditional skip for Python tests when Python is not available.

---

## Proposed Fixes

### Fix #1: Add Console Capture to isolated-vm Path

**File:** `server/utils/enhancedSandboxExecutor.ts`

**Location:** Lines 182-216 (bootstrap code)

**Change:**
Add console capture array and inject console object into sandbox (similar to VM fallback).

**Implementation:**
```typescript
// Add after line 128 (before bootstrap code):
const capturedConsoleLogs: any[][] = [];

// Inject console capture callback:
await jail.set("_consoleLog", new ivm.Reference((...args: any[]) => {
  capturedConsoleLogs.push(args);
}));

await jail.set("_consoleWarn", new ivm.Reference((...args: any[]) => {
  capturedConsoleLogs.push(['[WARN]', ...args]);
}));

await jail.set("_consoleError", new ivm.Reference((...args: any[]) => {
  capturedConsoleLogs.push(['[ERROR]', ...args]);
}));

// Update bootstrap code to inject console:
const bootstrapCode = `
  ...existing buildHelpers function...

  const helpers = buildHelpers(_helpersStructure);

  // Override console for capturing
  global.console = {
    log: function(...args) {
      _consoleLog.applySync(undefined, args, { arguments: { copy: true } });
    },
    warn: function(...args) {
      _consoleWarn.applySync(undefined, args, { arguments: { copy: true } });
    },
    error: function(...args) {
      _consoleError.applySync(undefined, args, { arguments: { copy: true } });
    },
  };

  // Also expose via helpers for backward compatibility
  helpers.console = global.console;

  ...rest of bootstrap...
`;

// Update return statement (line 256):
return {
  ok: true,
  output: output,
  consoleLogs: capturedConsoleLogs.length > 0 ? capturedConsoleLogs : undefined,
  durationMs,
};
```

---

### Fix #2: Map StepId → Alias in LifecycleHookService

**File:** `server/services/scripting/LifecycleHookService.ts`

**Location:** Lines 29-89 (executeHooksForPhase)

**Change:**
Fetch step aliases from workflow and create alias map before executing hooks.

**Implementation:**
```typescript
async executeHooksForPhase(params: {
  workflowId: string;
  runId: string;
  phase: LifecycleHookPhase;
  sectionId?: string;
  data: Record<string, any>;
  userId?: string;
}): Promise<LifecycleHookExecutionResult> {
  const { workflowId, runId, phase, sectionId, data, userId } = params;

  try {
    // Fetch enabled hooks
    const hooks = await lifecycleHookRepository.findEnabledByPhase(
      workflowId,
      phase,
      sectionId
    );

    if (hooks.length === 0) {
      return { success: true, data };
    }

    // ⭐ NEW: Fetch step aliases for data mapping
    const steps = await db.select()
      .from(stepsTable)
      .innerJoin(sectionsTable, eq(stepsTable.sectionId, sectionsTable.id))
      .where(eq(sectionsTable.workflowId, workflowId));

    const aliasMap: Record<string, string> = {};
    for (const step of steps) {
      if (step.alias) {
        aliasMap[step.alias] = step.id; // alias → stepId
      }
    }

    // ... existing code ...

    // Execute hooks sequentially
    for (const hook of hooks) {
      const result = await scriptEngine.execute({
        language: hook.language,
        code: hook.code,
        inputKeys: hook.inputKeys,
        data: resultData,
        aliasMap, // ⭐ Pass aliasMap to ScriptEngine
        context: {
          workflowId,
          runId,
          phase,
          sectionId,
          userId,
        },
        timeoutMs: hook.timeoutMs || 1000,
        consoleEnabled: true,
      });

      // ... rest of execution ...
    }
  }
}
```

---

### Fix #3: Update Timeout Test Expectation

**File:** `tests/integration/lifecycle-hooks-execution.test.ts`

**Location:** Line 526

**Change:**
Update test to expect `success: false` (consistent with service behavior).

**Implementation:**
```typescript
// Line 526 (update):
expect(result.success).toBe(false); // Changed from true

// Comment update (line 525):
// Hook fails due to timeout, but workflow continues (non-breaking)
```

---

### Fix #4: Skip Python Tests When Python Not Available

**File:** `tests/integration/lifecycle-hooks-execution.test.ts`

**Location:** Line 321

**Change:**
Add conditional skip for Python test.

**Implementation:**
```typescript
it.skipIf(process.platform === 'win32')('should execute Python afterPage hook', async () => {
  // ... test code ...
});

// Or detect Python availability:
const hasPython = await checkPythonAvailable();

it.skipIf(!hasPython)('should execute Python afterPage hook', async () => {
  // ... test code ...
});
```

---

## Implementation Priority

1. **High Priority:**
   - Fix #1: Console capture (fixes 1 test)
   - Fix #2: Alias mapping (fixes 3 tests)

2. **Medium Priority:**
   - Fix #3: Test expectation (fixes 1 test)
   - Fix #4: Python skip (fixes 1 test)

3. **Total Impact:** All 6 failing tests will pass

---

## Testing Plan

1. Run lifecycle hooks tests in isolation: `npm test -- tests/integration/lifecycle-hooks-execution.test.ts`
2. Verify all 15 tests pass (or 14 if Python skipped)
3. Run full test suite to ensure no regressions
4. Commit fixes with detailed message

---

## Additional Notes

- The service is architecturally sound (non-breaking execution, proper error handling)
- Most failures are due to test environment issues or minor implementation gaps
- Fixes are localized and low-risk

---

**Next Steps:**
1. Implement Fix #1 and #2
2. Test in isolation
3. Implement Fix #3 and #4
4. Commit and document
