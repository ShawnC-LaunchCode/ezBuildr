# Script Context Reference

Every script (Hook or JS Block) runs with a global `context` object populated by the engine. This object provides read-only information about the current execution environment.

## The `input` Object
The primary way to access data is through the `input` object.
- **Content**: Contains only the variables specified in the **Input Keys** configuration.
- **Type**: Plain JSON object.
- **Example**:
  ```javascript
  // Configured Input Keys: ["userName", "age"]
  console.log(input.userName); // "Alice"
  console.log(input.age);      // 30
  ```

## The `context` Object
Meta-information about the run.

| Property | Type | Description |
|---|---|---|
| `context.workflow.id` | `string` | ID of the current workflow. |
| `context.run.id` | `string` | ID of the current execution (run). |
| `context.phase` | `string` | The active phase (e.g., `beforePage`). |
| `context.user.id` | `string?` | User ID of the participant (if authenticated). |
| `context.metadata` | `object` | Additional context (e.g., `documentId` in document hooks). |
| `context.env` | `object` | Environment flags (e.g., `NODE_ENV`). |

## Execution Modes
Scripts should behave correctly in both **Live** and **Preview** modes.
- You generally do not need to check for this, as the engine handles side-effects (like writes) safely in Preview.
- If you need to know: check `context.run.id`. Preview IDs typically start with `preview-`.

## Return Values
Scripts return data back to the engine.

### JavaScript
```javascript
// Return an object to merge into variables
return {
  newVariable: "value"
};

// OR simply return the value if mapped to a single Output Key
return "value";
```

### Python
Python scripts must call `emit()` to return data (conceptually similar to `return`).
*Note: Python support is experimental and currently returns the last evaluations or specific strict dictionary outputs depending on configuration.*
For now, standard recommendation is to use **JavaScript** for complex returns.
