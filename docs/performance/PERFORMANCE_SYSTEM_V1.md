# Performance, Caching, and Efficiency System (V1)

## Overview
This document details the performance improvements, caching mechanisms, and execution guardrails implemented in the VaultLogic Workflow Engine. These changes ensure workflows remain performant, predictable, and safe as they scale.

## Core Features

### 1. Execution Hot Path Instrumentation
The execution engine (`runGraph`) now captures detailed performance metrics for every block.
- **Metrics Collected**:
    - `totalDurationMs`: Total wall-clock time for the workflow.
    - `dbTimeMs`: Aggregated time spent in Data Blocks (Query/Write).
    - `jsTimeMs`: Aggregated time spent in Compute/JS Blocks.
    - `queryCount`: Number of data queries executed.
- **Visibility**: Metrics are available in the `ExecutionTrace` object returned by the engine, visible in debug tools.

### 2. Scoped Query Caching
Data queries are now cached within the scope of a single workflow execution.
- **Mechanism**: `QueryNode` execution inputs (Table ID, Resolved Filters, Limit) are hashed to generate a stable cache key.
- **Behavior**:
    - Repeated queries with identical inputs return cached results instantly.
    - Changing filters (e.g., via variable updates) generates a new key and bypasses cache.
    - **Scope**: Cache is ephemeral (per-run). It does NOT persist across different workflow runs to ensure freshness and security.
- **Preview Mode**: The cache respects `executionMode`, preventing leakage between Preview and Live contexts if they were ever mixed (though they are logically separate).

### 3. JavaScript Execution Efficiency
JS Blocks use `isolated-vm` for secure sandboxing.
- **Isolate Reuse**: The engine now initializes a single `Isolate` per workflow run and reuses it for multiple JS blocks, reducing the high overhead of isolate creation (~50-100ms per block -> ~5ms).
- **Script Caching**: Compiled scripts are cached by code content. Identical scripts (e.g., in loops or reused blocks) are compiled once and run multiple times.

### 4. Side-Effect Idempotency & De-Duplication
Write Blocks and External Send (HTTP/Webhook) Blocks now have guards to prevent accidental double-execution within a single run.
- **Guard**: The engine tracks `executedSideEffects` (Set of Block IDs).
- **Behavior**:
    - If a Write/HTTP block attempts to run a second time (e.g., due to a loop or retry logic that shouldn't happen), it is **skipped** with reason `already executed (idempotency guard)`.
    - This protects against infinite loops creating thousands of DB rows or spamming APIs.
    - **Note**: Intentionally looping writes (if ever supported) would need an explicit bypass (not currently implemented).

### 5. Snapshot Efficiency
Support for efficient "Resume" or "Snapshot" execution.
- **Logic**: In `snapshot` execution mode, the engine checks if a block's output variable is already present in the input inputs (`context.vars`).
- **Optimization**: If the output exists, the block execution is **skipped**, and the pre-computed value is used. This allows re-playing a workflow from a checkpoint without re-executing expensive side effects or queries.

### 6. Limits & Guardrails
Configurable soft limits prevent runaway workflows.
- `maxExecutionTimeMs`: Default 30s. Throws error if exceeded.
- `maxSteps`: Default 1000 steps. Throws error if exceeded (detects infinite loops).

## Developer Guide

### usage in Engine
The `runGraph` function automatically initializes these features.
```typescript
const result = await runGraph({
  workflowVersion,
  inputJson,
  tenantId,
  executionMode: 'live', // or 'preview'
  options: { debug: true }
});
// Metrics available in result.executionTrace.metrics
```

### Adding New Block Types
When creating new block types that perform side effects, ensure you check/add the idempotency guard:
```typescript
if (context.executedSideEffects && context.executedSideEffects.has(nodeId)) {
   return { status: 'skipped', skipReason: 'already executed' };
}
// ... execute ...
context.executedSideEffects.add(nodeId);
```
