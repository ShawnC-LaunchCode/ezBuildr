# Data Flow & Variable Rules

Understanding how data moves through scripts is key to building reliable workflows.

## Variable Lineage

Variables in VaultLogic are immutable *at their source*.
- A Question Block creates a `userAnswer` variable.
- That specific answer record is never changed.

**Derived Variables**:
- Scripts creates *new* variables or "shadows" existing ones in a future context.
- If you have a variable `price` (100) and a script outputs `price` (200):
  - The original block's storage remains 100.
  - Subsequent blocks reading `input.price` will see 200 (if the script output overwrites the context for them).
  - *Best Practice*: Create new variable names (e.g., `price_adjusted`) instead of overwriting, to preserve lineage visibility.

## Whitelisting (Input/Output Keys)

Scripts execute in a strict sandbox. They do **not** have access to the global variable state by default. you MUST explicitly configure:

1.  **Input Keys**: what data enters the script.
    - Performance: Prevents loading huge datasets unnecessarily.
    - dependency graph: Allows the engine to know which scripts depend on which questions.
2.  **Output Keys**: what data leaves the script.
    - Safety: Prevents scripts from accidentally polluting the namespace.
    - Schema: Allows the frontend to autocomplete these new variable names in later blocks.

## List Handling

Lists (Arrays) are first-class citizens.
- **Reference**: Passed by value-copy. Modifying a list inside a script does not change the source list unless returned.
- **Performance**: Avoid passing massive lists (10k+ items) into scripts if possible. Use Query Blocks for heavy filtering first.

## Document Mapping Flow

1.  **Engine** gathers all active variables.
2.  **Document Hooks (`beforeGeneration`)** run. They can add/modify variables in this temporary context.
3.  **Mapper** looks for variables matching the document template keys (e.g. `{{client_name}}`).
4.  **Renderer** generates the file.
5.  **Temporary Context** is discarded. The generated variables do not pollute the global run state.
