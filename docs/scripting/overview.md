# Custom Scripting System: Overview

The Custom Scripting System in VaultLogic allows creators to extend workflow logic beyond the capabilities of standard blocks. It provides a secure, sandboxed environment to run JavaScript and Python code at specific points in the workflow lifecycle.

## Why Scripting?

While standard blocks (Questions, Logic, Transform, HTTP) cover most use cases, complex business logic often requires specific calculations, data formatting, or conditional execution that cannot be easily modeled with a visual builder.

**Use cases for Scripting:**
- Complex financial calculations (e.g., mortgage amortization).
- Formatting data specifically for legal documents.
- Advanced list manipulation (filtering, sorting, deduplication) beyond the List Query block.
- Conditional logic that depends on multiple complex variables.

**When NOT to use Scripting:**
- **Simple Branching**: Use Logic Blocks.
- **Data Fetching**: Use HTTP Blocks or Query Blocks (scripting HTTP helpers are proxied and less visual).
- **Simple Math**: Use Formula/Transform Blocks.

## Script Types

There are three primary ways to use scripts in VaultLogic:

### 1. JS Blocks (Workflow Steps)
- **What**: A dedicated step in the workflow graph.
- **When**: Executes as part of the normal flow, like any other block.
- **Use**: Calculating intermediate values, transforming previous answers.
- **Context**: Access to all previous variables. Outputs become new variables.

### 2. Lifecycle Hooks
- **What**: Scripts that run automatically at specific "events" in the workflow engine.
- **When**: `beforePage`, `afterPage`, `beforeFinalBlock`, `afterDocumentsGenerated`.
- **Use**: Global validation, cleaning up data between sections, setting up variables before a section starts.

### 3. Document Hooks
- **What**: Scripts tied specifically to the document generation process for a Final Block.
- **When**: `beforeGeneration` (preparing data) or `afterGeneration` (logging metadata).
- **Use**: Formatting dates/currency specifically for a template, filtering list items to show in a document table.

## Security & Safety

Scripts run in a **strictly sandboxed environment**.
- No direct network access (except via proxied helpers).
- No file system access.
- Timeouts enforced (default 1s for hooks, 30s for blocks).
- Memory limits enforced.
- No infinite loops.

This ensures that a bad script cannot crash the server or access data from other tenants.
