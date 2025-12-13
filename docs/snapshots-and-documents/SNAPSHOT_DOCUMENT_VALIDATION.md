# Snapshot & Document Validation System

## Overview
The Snapshot & Document Validation System transforms VaultLogic snapshots into a powerful QA tool. By ensuring deterministic execution and reliable document generation from snapshots, creators can validate their workflows confidently without manual re-entry.

## Core Concepts

### 1. Snapshot Contract
A snapshot is an immutable record of:
- **Variable State**: All user inputs and computed variables at a point in time.
- **Workflow Version**: The logic structure active when the snapshot was taken.

**Guarantee**: Re-running a snapshot against the *same* workflow version will produce identical document outputs. Re-running against a *new* version validates backward compatibility.

### 2. Final Block Integration
The `FinalBlock` is the terminal validation point. 
- **Execution Logic**:
  - In `snapshot` mode, `FinalBlock` executes deterministically using snapshot variables.
  - Documents are generated in an ephemeral state (not persisted to `runOutputs` DB unless specifically desired for comparison).
  - Missing variables trigger clear warnings but do not crash execution if possible.

### 3. Execution Flow
1. **Initialize**: `runGraph` is called with `executionMode: 'snapshot'` and a `snapshotId`.
2. **hydrating**: `EvalContext` is populated with `snapshot.values`.
3. **Traversal**: The engine traverses the graph. 
   - *Optimization*: Blocks with satisfied outputs (inputs present in snapshot) are skipped.
4. **Final Block**: 
   - `FinalBlockExecutor` resolves templates and mappings.
   - Generates documents using `FinalBlockRenderer`.
   - Returns execution metadata (file names, sizes, status).
5. **Stop**: Execution halts immediately after the Final Block completes.

## Developer Guide

### Running a Validation
```typescript
const snapshot = await snapshotService.getSnapshotById('snap-123');
const result = await runGraph({
  workflowVersion,
  inputJson: snapshot.values,
  tenantId,
  executionMode: 'snapshot',
  options: { debug: true }
});

const finalStep = result.executionTrace.steps.find(s => s.blockType === 'final');
// Verify finalStep.outputs contains generated documents
```

### Debugging
- Check `executionTrace` for `skippedReason: 'snapshot satisfied'` to verify optimization.
- Check `FinalBlock` output for `generatedDocuments` list.
- Compare `generatedDocuments` metadata (size, name) across runs to detect regressions.
