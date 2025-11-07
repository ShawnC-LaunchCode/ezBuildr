# Error Handler Integration Guide

This guide provides step-by-step instructions for integrating the centralized error handler into your Express application.

## Quick Start (5 Minutes)

### Step 1: Register Error Handler

Add the error handler to your main server file **after all route registrations**:

```typescript
// In server/index.ts (or wherever you configure your Express app)

import { errorHandler } from './middleware/errorHandler';
// OR use the index export:
// import { errorHandler } from './middleware';

// ... all your middleware ...
// ... all your route registrations ...

// IMPORTANT: Register error handler LAST (before starting server)
app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

**That's it!** The error handler is now active and will catch any errors thrown in your routes.

### Step 2: Start Using in Routes

You can now use the new error handling patterns in any route:

```typescript
// In any route file
import { asyncHandler, NotFoundError, ForbiddenError } from '../middleware/errorHandler';

// Wrap async handlers with asyncHandler
app.get('/api/surveys/:id', isAuthenticated, asyncHandler(async (req: any, res) => {
  const survey = await getSurvey(req.params.id);

  // Throw custom errors - they'll be caught automatically
  if (!survey) {
    throw new NotFoundError("Survey not found");
  }

  res.json(survey);
}));
```

## Gradual Migration Strategy

You don't need to migrate all routes at once. The error handler works alongside existing error handling patterns.

### Phase 1: Register Middleware (Day 1)

1. Register `errorHandler` middleware in main server file
2. Test that existing routes still work
3. No code changes needed yet

### Phase 2: New Routes Use New Pattern (Ongoing)

For any new routes you create, use the new pattern from the start:

```typescript
app.post('/api/new-feature', isAuthenticated, asyncHandler(async (req, res) => {
  assertAuthenticated(req.user?.claims?.sub);

  const data = validateInput(schema, req.body);
  const result = await service.create(data);

  res.json(result);
}));
```

### Phase 3: Migrate Existing Routes (As Needed)

Migrate existing routes gradually, starting with the most error-prone or frequently modified routes:

```typescript
// BEFORE
app.get('/api/surveys/:id', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const survey = await getSurvey(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: "Survey not found" });
    }

    if (survey.creatorId !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(survey);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to fetch survey" });
  }
});

// AFTER
app.get('/api/surveys/:id', isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.user.claims.sub;
  assertAuthenticated(userId);

  const survey = await getSurvey(req.params.id);
  assertFound(survey, "Survey not found");
  assertAuthorized(survey.creatorId === userId, "Access denied");

  res.json(survey);
}));
```

## Integration Checklist

- [ ] Register `errorHandler` middleware in main server file (after all routes)
- [ ] Test that server starts successfully
- [ ] Test existing routes still work
- [ ] Create a test route using new pattern to verify error handler works
- [ ] Update any new routes to use new pattern
- [ ] Gradually migrate existing routes (optional but recommended)

## Testing the Integration

Create a test route to verify the error handler is working:

```typescript
// Add this temporary test route
if (process.env.NODE_ENV === 'development') {
  app.get('/api/test-errors/404', asyncHandler(async (req, res) => {
    throw new NotFoundError("Test 404");
  }));

  app.get('/api/test-errors/403', asyncHandler(async (req, res) => {
    throw new ForbiddenError("Test 403");
  }));

  app.get('/api/test-errors/401', asyncHandler(async (req, res) => {
    throw new UnauthorizedError("Test 401");
  }));

  app.get('/api/test-errors/500', asyncHandler(async (req, res) => {
    throw new Error("Test 500");
  }));
}
```

Test the routes:
```bash
curl http://localhost:3000/api/test-errors/404
# Should return: {"message": "Test 404"} with status 404

curl http://localhost:3000/api/test-errors/403
# Should return: {"message": "Test 403"} with status 403

curl http://localhost:3000/api/test-errors/401
# Should return: {"message": "Test 401"} with status 401

curl http://localhost:3000/api/test-errors/500
# Should return: {"message": "Test 500"} with status 500
```

## Common Patterns to Replace

### Pattern 1: Manual Status Code Returns

```typescript
// BEFORE
if (!survey) {
  return res.status(404).json({ message: "Survey not found" });
}

// AFTER
if (!survey) {
  throw new NotFoundError("Survey not found");
}
// OR
assertFound(survey, "Survey not found");
```

### Pattern 2: Try/Catch with Console.error

```typescript
// BEFORE
try {
  const result = await service.doSomething();
  res.json(result);
} catch (error) {
  console.error("Error:", error);
  res.status(500).json({ message: "Failed" });
}

// AFTER
const result = await service.doSomething();
res.json(result);
// Errors are automatically caught and logged
```

### Pattern 3: Zod Validation

```typescript
// BEFORE
try {
  const data = schema.parse(req.body);
  const result = await service.create(data);
  res.json(result);
} catch (error) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: "Invalid input",
      details: error.errors
    });
  }
  res.status(500).json({ message: "Failed" });
}

// AFTER
const data = schema.parse(req.body);
const result = await service.create(data);
res.json(result);
// Zod errors are automatically caught and formatted
```

### Pattern 4: Service Error Handling

```typescript
// BEFORE (in service)
async getSurvey(id: string, userId: string) {
  const survey = await db.findSurvey(id);
  if (!survey) {
    throw new Error("Survey not found");
  }
  if (survey.creatorId !== userId) {
    throw new Error("Access denied - you do not own this survey");
  }
  return survey;
}

// BEFORE (in route)
try {
  const survey = await surveyService.getSurvey(req.params.id, userId);
  res.json(survey);
} catch (error) {
  console.error("Error:", error);
  if (error instanceof Error) {
    if (error.message === "Survey not found") {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes("Access denied")) {
      return res.status(403).json({ message: error.message });
    }
  }
  res.status(500).json({ message: "Failed to fetch survey" });
}

// AFTER (in service)
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';

async getSurvey(id: string, userId: string) {
  const survey = await db.findSurvey(id);
  assertFound(survey, "Survey not found");
  assertAuthorized(survey.creatorId === userId, "Access denied");
  return survey;
}

// AFTER (in route)
const survey = await surveyService.getSurvey(req.params.id, userId);
res.json(survey);
// All errors are automatically handled with correct status codes
```

## Updating Services

Services can also benefit from the error handling infrastructure:

```typescript
// Before
import { surveyRepository } from '../repositories';

export class SurveyService {
  async getSurvey(id: string, userId: string) {
    const survey = await surveyRepository.findById(id);
    if (!survey) {
      throw new Error("Survey not found");
    }
    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }
    return survey;
  }
}

// After
import { surveyRepository } from '../repositories';
import { assertFound, assertAuthorized } from '../middleware/errorHandler';

export class SurveyService {
  async getSurvey(id: string, userId: string) {
    const survey = await surveyRepository.findById(id);
    assertFound(survey, "Survey not found");
    assertAuthorized(survey.creatorId === userId, "Access denied");
    return survey;
  }
}
```

## Benefits Summary

| Before | After |
|--------|-------|
| Manual try/catch in every route | Automatic error catching with asyncHandler |
| Manual status code mapping | Automatic status code inference |
| console.error for logging | Structured logging with request context |
| Inconsistent error responses | Standardized error responses |
| ~15-20 lines of error handling | ~5-7 lines of business logic |
| Error logic mixed with route logic | Clear separation of concerns |
| Hard to test error cases | Easy to test by throwing errors |

## Support

For more information, see:
- `errorHandler.README.md` - Complete documentation
- `errorHandler.examples.ts` - Detailed usage examples
- `errorHandler.ts` - Source code with inline documentation
