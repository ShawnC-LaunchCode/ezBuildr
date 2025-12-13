# Debugging Scripts

Scripts can fail. VaultLogic provides tools to diagnose and fix them.

## 1. Console Logs
Use `console.log()` freely in your scripts.
- **Where**: Viewable in the "Run Logs" or "Dev Tools" pane in Preview Mode.
- **Structure**: Logs are grouped by the script execution event.

```javascript
console.log("Starting calculation");
console.log("Input value:", input.amount); // Check what data you actually got
```

## 2. Preview Mode
Always test scripts in **Preview Mode** before publishing.
- **Safety**: Preview runs are isolated.
- **Speed**: Changes to scripts apply immediately to the next preview run.

## 3. Common Errors

### `ReferenceError: x is not defined`
- **Cause**: You tried to access a variable `x` that wasn't included in the **Input Keys**.
- **Fix**: Add the variable to the Input Keys list in the script configuration.

### `TimeoutError`
- **Cause**: Script ran longer than the allowed limit (default 1s or 3s).
- **Fix**: Check for infinite loops. Optimize list operations. If legitimate heavy compute, consider moving to a specialized backend service connected via HTTP.

### Output ignored?
- **Cause**: You returned a value but didn't add the key to **Output Keys**.
- **Fix**: Add the variable name to Output Keys.

### "Read-only" errors
- **Cause**: Trying to modify `input` directly (e.g. `input.total = 5`).
- **Fix**: `input` is immutable. Return a new object with the desired values.

## Testing Locally
You can use the "Test Script" button in the Advanced Editor to run your code against mock JSON data without running the full workflow.
