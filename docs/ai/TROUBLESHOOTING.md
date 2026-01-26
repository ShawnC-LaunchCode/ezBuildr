# AI System Troubleshooting Guide

Solutions to common issues with ezBuildr's AI workflow generation system.

## Table of Contents

- [Configuration Issues](#configuration-issues)
- [Generation Problems](#generation-problems)
- [Quality Issues](#quality-issues)
- [Performance Problems](#performance-problems)
- [Error Messages](#error-messages)
- [Debugging Tips](#debugging-tips)

---

## Configuration Issues

### "No AI provider API key found"

**Symptoms:**
- Error on server startup
- AI endpoints return 500 errors

**Solution:**
Set one of these environment variables:

```env
# Option 1: Gemini (recommended - best cost/performance)
GEMINI_API_KEY=your-gemini-api-key

# Option 2: OpenAI or Anthropic
AI_PROVIDER=openai  # or 'anthropic'
AI_API_KEY=your-api-key
```

**Verify configuration:**
```bash
# Check if AI is configured
curl http://localhost:5000/api/health
# Look for "ai": { "configured": true }
```

### Wrong AI Provider Being Used

**Symptoms:**
- Logs show unexpected provider
- Different behavior than expected

**Cause:** GEMINI_API_KEY takes priority over AI_API_KEY

**Solution:**
```env
# To use OpenAI instead of Gemini, remove or unset GEMINI_API_KEY
unset GEMINI_API_KEY
AI_PROVIDER=openai
AI_API_KEY=sk-...
```

### Rate Limit Errors from Provider

**Symptoms:**
- 429 errors in logs
- "Rate limit exceeded" messages

**Solutions:**
1. Wait for rate limit to reset (check `retry-after` header)
2. Upgrade your API tier with the provider
3. Reduce concurrent AI requests
4. Use a different provider as fallback

---

## Generation Problems

### Workflow Generation Returns Empty or Minimal Results

**Symptoms:**
- Generated workflow has few/no steps
- Only title and description populated

**Causes & Solutions:**

1. **Description too vague**
   ```
   Bad:  "Make a form"
   Good: "Create a customer feedback form that asks for their satisfaction rating (1-5 scale),
          detailed comments about their experience, and optional contact information
          for follow-up (email and phone)"
   ```

2. **Token limit reached** - Simplify request or use chunked generation

3. **AI hallucination** - Retry the request

### Generated Fields Have Wrong Types

**Symptoms:**
- Email fields use `short_text` instead of `email`
- Phone fields not using `phone` type

**Solutions:**

1. Be explicit in your description:
   ```
   "Add an email field for their contact email address"
   "Include a phone number field for callback"
   ```

2. Use the quality loop (auto-corrects types):
   ```typescript
   const result = await aiService.generateWorkflowWithQualityLoop(request, {
     targetQualityScore: 85
   });
   ```

3. Manually review and edit in the builder

### Logic Rules Reference Wrong Steps

**Symptoms:**
- "Step not found" errors
- Logic rules don't work as expected

**Cause:** Alias resolution failed

**Solutions:**

1. Ensure all steps have unique aliases
2. Use the AliasResolver for validation:
   ```typescript
   const resolver = AliasResolver.fromWorkflow(workflow);
   const errors = resolver.getErrors();
   if (errors.length > 0) {
     console.log('Alias issues:', errors);
   }
   ```

3. Regenerate with explicit alias instructions

---

## Quality Issues

### Low Quality Score (< 70)

**Symptoms:**
- `quality.passed: false` in response
- Many issues in `quality.issues` array

**Common Issues & Fixes:**

| Issue | Fix |
|-------|-----|
| Generic aliases (`field1`, `q1`) | Use descriptive names (`customerEmail`, `feedbackRating`) |
| Missing aliases | Ensure every step has an alias |
| Wrong field types | Match type to content (email → `email`, phone → `phone`) |
| Empty sections | Add at least one step per section |
| Too many steps in section | Break into multiple sections (max 15/section recommended) |

**Use Quality Loop:**
```typescript
// Automatic quality improvement
const result = await aiService.generateWorkflowWithQualityLoop(request, {
  targetQualityScore: 80,
  maxIterations: 3,
  minImprovementThreshold: 5
});

console.log('Final score:', result.qualityScore.overall);
console.log('Iterations:', result.improvement.totalIterations);
console.log('Stop reason:', result.improvement.stoppedReason);
```

### Quality Loop Not Improving

**Symptoms:**
- `stoppedReason: 'no_improvement'` or `'diminishing_returns'`
- Score stays low despite iterations

**Causes & Solutions:**

1. **Fundamental issues in description** - Rewrite with more detail
2. **AI limitations** - Some workflows need manual refinement
3. **Conflicting requirements** - Simplify the request

### Quality Score Doesn't Match Visual Review

**Symptoms:**
- High score but workflow looks wrong
- Low score but workflow seems fine

**Note:** Quality scoring is heuristic-based. It catches common issues but can't evaluate semantic correctness.

**Solution:** Use quality scores as guidance, not absolute truth. Manual review is still important.

---

## Performance Problems

### Generation Takes Too Long

**Symptoms:**
- Requests timeout
- > 30 second generation times

**Solutions:**

1. **Reduce complexity:**
   - Fewer sections/steps
   - Simpler logic rules
   - Shorter descriptions

2. **Use faster model:**
   ```env
   GEMINI_MODEL=gemini-2.0-flash  # Fastest
   ```

3. **Check for chunking:**
   - Large workflows trigger chunked processing
   - Each chunk adds ~5-10 seconds

### Revision Jobs Stay Pending

**Symptoms:**
- Job status stays "pending" or "active" forever
- Never completes

**Causes & Solutions:**

1. **Redis not running:**
   ```bash
   # Check Redis
   redis-cli ping
   # Should return PONG
   ```

2. **Queue worker not started:**
   - Ensure worker process is running
   - Check logs for queue errors

3. **Job processing error:**
   ```bash
   # Check job status
   curl http://localhost:5000/api/ai/workflows/revise/{jobId}
   ```

### Memory Issues with Large Workflows

**Symptoms:**
- Server crashes on large workflows
- "JavaScript heap out of memory"

**Solutions:**

1. Increase Node.js memory:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm start
   ```

2. Use chunked processing (automatic for large workflows)

3. Reduce workflow size before AI processing

---

## Error Messages

### "Failed to parse AI response as JSON"

**Cause:** AI returned malformed JSON

**Solutions:**
1. Retry the request (transient issue)
2. Check `logs/ai-response-error-*.json` for the raw response
3. Simplify your request

### "AI response does not match expected schema"

**Cause:** AI returned valid JSON but wrong structure

**Solutions:**
1. Retry the request
2. Check for missing required fields in the response
3. The AI may need more explicit instructions

### "Response truncated - workflow too large"

**Cause:** AI output exceeded token limits

**Solution:** Automatic - system will retry with chunked processing

### "Duplicate alias found"

**Cause:** Two steps have the same alias

**Solutions:**
1. Check generated workflow for duplicate aliases
2. Use AliasResolver to find duplicates:
   ```typescript
   const resolver = AliasResolver.fromWorkflow(workflow);
   const errors = resolver.getErrors().filter(e => e.reason === 'ambiguous');
   ```

---

## Debugging Tips

### Enable Verbose Logging

```env
LOG_LEVEL=debug
```

Key log modules:
- `ai-service` - Main AI operations
- `workflow-generation-service` - Generation specifics
- `workflow-revision-service` - Revision details
- `iterative-quality-improver` - Quality loop progress
- `ai-provider-client` - API calls and retries

### Inspect Raw AI Responses

Failed parse attempts write to:
```
logs/ai-response-error-{timestamp}.json
```

### Test AI Configuration

```typescript
import { validateAIConfig } from './server/services/AIService';

const config = validateAIConfig();
console.log('AI configured:', config.configured);
console.log('Provider:', config.provider);
console.log('Model:', config.model);
if (config.error) {
  console.log('Error:', config.error);
}
```

### Check Quality Details

```typescript
import { workflowQualityValidator } from './server/services/WorkflowQualityValidator';

const score = workflowQualityValidator.validate(workflow);

console.log('Overall:', score.overall);
console.log('Breakdown:', score.breakdown);
console.log('Issues:');
score.issues.forEach(issue => {
  console.log(`  [${issue.type}] ${issue.category}: ${issue.message}`);
  if (issue.suggestion) {
    console.log(`    Suggestion: ${issue.suggestion}`);
  }
});
```

### Test Alias Resolution

```typescript
import { AliasResolver } from './server/services/AliasResolver';

const resolver = AliasResolver.fromWorkflow(workflow);

// Check for setup errors
if (resolver.hasErrors()) {
  console.log('Resolver errors:', resolver.getErrors());
}

// Test specific resolution
const stepId = resolver.resolve('emailAddress');
console.log('emailAddress resolves to:', stepId);

// Get all aliases
console.log('All aliases:', resolver.getAllAliases());
```

---

## Getting Help

If issues persist:

1. **Check logs** - Most errors have detailed log entries
2. **Review configuration** - Environment variables, Redis, etc.
3. **Test with simple workflow** - Isolate the issue
4. **File an issue** - Include logs and reproduction steps

---

## See Also

- [Architecture Guide](./ARCHITECTURE.md) - System design overview
- [API Reference](./API_REFERENCE.md) - Endpoint documentation
- [User Guide](./USER_GUIDE.md) - End-user documentation
