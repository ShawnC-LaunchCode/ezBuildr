# Centralized Error Handler Middleware

This module provides a comprehensive error handling infrastructure for Express routes, replacing the duplicate error handling pattern that appears 50+ times across route files.

## Features

- **Custom Error Classes**: Type-safe error classes for common HTTP error codes
- **Automatic Error Classification**: Intelligently maps error messages to appropriate status codes
- **Structured Logging**: Integrates with existing Pino logger with request context
- **Zod Validation Support**: Automatic handling of Zod validation errors
- **Development/Production Modes**: Detailed errors in development, safe errors in production
- **Helper Functions**: Utilities for common error patterns
- **Async Route Wrapper**: Eliminates boilerplate try/catch blocks

## Installation

### 1. Register Error Handler Middleware

In your main server file (e.g., `server/index.ts`), register the error handler **after all routes**:

```typescript
import { errorHandler } from './middleware/errorHandler';

// ... route registrations ...

// Register error handler LAST (before server start)
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

**IMPORTANT**: The error handler must be the last middleware registered!

### 2. Update Route Files

Replace manual error handling with the new infrastructure. See examples below.

## Usage

### Option 1: Using asyncHandler (Recommended)

The `asyncHandler` wrapper automatically catches errors and passes them to the error handler:

```typescript
import { asyncHandler, NotFoundError, ForbiddenError } from '../middleware/errorHandler';

app.get('/api/surveys/:id', isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.user.claims.sub;
  const survey = await getSurvey(req.params.id);

  if (!survey) {
    throw new NotFoundError("Survey not found");
  }

  if (survey.creatorId !== userId) {
    throw new ForbiddenError("Access denied - you do not own this survey");
  }

  res.json(survey);
}));
```

### Option 2: Using Helper Functions (Most Concise)

Helper functions provide assertion-style error handling:

```typescript
import { asyncHandler, assertFound, assertAuthorized, assertAuthenticated } from '../middleware/errorHandler';

app.get('/api/surveys/:id', isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.user.claims.sub;
  assertAuthenticated(userId, "Unauthorized - no user ID");

  const survey = await getSurvey(req.params.id);
  assertFound(survey, "Survey not found");
  assertAuthorized(survey.creatorId === userId, "Access denied");

  res.json(survey);
}));
```

### Option 3: Throwing from Services

Services can throw custom errors that are automatically handled:

```typescript
// In service file
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';

class SurveyService {
  async getSurvey(id: string, userId: string) {
    const survey = await db.findSurvey(id);

    if (!survey) {
      throw new NotFoundError("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new ForbiddenError("Access denied");
    }

    return survey;
  }
}

// In route file
app.get('/api/surveys/:id', isAuthenticated, asyncHandler(async (req: any, res) => {
  const survey = await surveyService.getSurvey(req.params.id, req.user.claims.sub);
  res.json(survey);
}));
```

## Custom Error Classes

### NotFoundError (404)

Use when a requested resource doesn't exist:

```typescript
throw new NotFoundError("Survey not found");
throw new NotFoundError("User not found");
throw new NotFoundError(); // Default: "Resource not found"
```

### ForbiddenError (403)

Use when user doesn't have permission:

```typescript
throw new ForbiddenError("Access denied - you do not own this survey");
throw new ForbiddenError("Access denied - team admin access required");
throw new ForbiddenError(); // Default: "Access denied"
```

### UnauthorizedError (401)

Use when authentication is required or has failed:

```typescript
throw new UnauthorizedError("Unauthorized - no user ID");
throw new UnauthorizedError("Token expired");
throw new UnauthorizedError(); // Default: "Unauthorized"
```

### BadRequestError (400)

Use for validation errors or bad input:

```typescript
throw new BadRequestError("Invalid email format");
throw new BadRequestError("Cannot delete published survey");
throw new BadRequestError(); // Default: "Bad request"
```

### ConflictError (409)

Use when request conflicts with current state:

```typescript
throw new ConflictError("User is already a team member");
throw new ConflictError("Survey with this name already exists");
throw new ConflictError(); // Default: "Resource conflict"
```

## Helper Functions

### assertFound

Throws `NotFoundError` if value is null/undefined:

```typescript
const survey = await getSurvey(id);
assertFound(survey, "Survey not found");
// TypeScript now knows survey is not null/undefined
```

### assertAuthorized

Throws `ForbiddenError` if condition is false:

```typescript
assertAuthorized(survey.creatorId === userId, "Access denied");
assertAuthorized(membership?.role === 'admin', "Admin access required");
```

### assertAuthenticated

Throws `UnauthorizedError` if value is falsy:

```typescript
const userId = req.user?.claims?.sub;
assertAuthenticated(userId, "Unauthorized - no user ID");
```

### validateInput

Validates input using Zod schema:

```typescript
const data = validateInput(createSurveySchema, req.body);
// If validation fails, ZodError is thrown and handled automatically
```

## Automatic Error Classification

For generic Error objects, the middleware automatically classifies based on message content:

### 404 Not Found
- "not found"
- "does not exist"
- "cannot find"
- "could not find"

### 403 Forbidden
- "access denied"
- "forbidden"
- "permission denied"
- "not authorized to"
- "you do not own"
- "you are not a member"
- "admin access required"
- "insufficient permissions"

### 401 Unauthorized
- "unauthorized"
- "no user id"
- "not logged in"
- "authentication required"
- "invalid token"
- "token expired"
- "must be logged in"

This means existing service code that throws Error objects will still work:

```typescript
// This will automatically return 404:
throw new Error("Survey not found");

// This will automatically return 403:
throw new Error("Access denied - you are not a member of this team");
```

## Zod Validation Errors

Zod validation errors are automatically handled and return 400 status with details:

```typescript
app.post('/api/surveys', isAuthenticated, asyncHandler(async (req: any, res) => {
  // If validation fails, error handler returns:
  // {
  //   "message": "Validation error",
  //   "error": "Invalid input",
  //   "details": [{ path: [...], message: "..." }]
  // }
  const data = createSurveySchema.parse(req.body);

  const survey = await createSurvey(data);
  res.json(survey);
}));
```

## Migration Guide

### Before (Old Pattern)

```typescript
app.get('/api/surveys/:id', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized - no user ID" });
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
```

### After (New Pattern)

```typescript
import { asyncHandler, assertFound, assertAuthorized, assertAuthenticated } from '../middleware/errorHandler';

app.get('/api/surveys/:id', isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.user.claims.sub;
  assertAuthenticated(userId, "Unauthorized - no user ID");

  const survey = await getSurvey(req.params.id);
  assertFound(survey, "Survey not found");
  assertAuthorized(survey.creatorId === userId, "Access denied");

  res.json(survey);
}));
```

**Benefits:**
- 15 lines → 7 lines (53% reduction)
- No try/catch boilerplate
- Automatic error handling
- Structured logging
- Type-safe assertions
- Consistent error responses

## Response Format

### Success Response
```json
{
  "id": "123",
  "title": "My Survey",
  "status": "draft"
}
```

### Error Response (Production)
```json
{
  "message": "Survey not found"
}
```

### Error Response (Development)
```json
{
  "message": "Survey not found",
  "error": "Survey not found",
  "stack": "Error: Survey not found\n    at ..."
}
```

### Validation Error Response
```json
{
  "message": "Validation error",
  "error": "Invalid input",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "path": ["title"],
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

## Logging

All errors are automatically logged with request context:

```typescript
// Error log format:
{
  "level": "error",
  "requestId": "abc123",
  "method": "GET",
  "url": "/api/surveys/123",
  "statusCode": 404,
  "userId": "user-123",
  "error": {
    "name": "NotFoundError",
    "message": "Survey not found",
    "stack": "..."
  },
  "msg": "Client error: Survey not found"
}
```

Server errors (500+) are logged at `error` level.
Client errors (400-499) are logged at `warn` level.

## Testing

```typescript
import request from 'supertest';
import { NotFoundError } from '../middleware/errorHandler';

describe('Error Handler', () => {
  it('should return 404 for NotFoundError', async () => {
    app.get('/test', asyncHandler(async (req, res) => {
      throw new NotFoundError("Test not found");
    }));

    const response = await request(app)
      .get('/test')
      .expect(404);

    expect(response.body.message).toBe("Test not found");
  });
});
```

## Best Practices

1. **Always use asyncHandler** for async routes to avoid try/catch boilerplate
2. **Use custom error classes** instead of throwing generic Error objects
3. **Use helper functions** (assertFound, assertAuthorized) for cleaner code
4. **Throw errors from services** - let routes focus on HTTP concerns
5. **Provide descriptive error messages** - they're shown to clients
6. **Don't catch errors in routes** - let the error handler deal with them
7. **Use Zod schemas** for validation and let errors bubble up

## API Reference

### Error Classes

- `AppError` - Base class for all custom errors
- `NotFoundError(message?)` - 404 errors
- `ForbiddenError(message?)` - 403 errors
- `UnauthorizedError(message?)` - 401 errors
- `BadRequestError(message?)` - 400 errors
- `ConflictError(message?)` - 409 errors

### Middleware

- `errorHandler(err, req, res, next)` - Main error handler middleware
- `asyncHandler(fn)` - Wrapper for async route handlers

### Helper Functions

- `assertFound<T>(value, message?)` - Assert value exists (throws NotFoundError)
- `assertAuthorized(condition, message?)` - Assert condition is true (throws ForbiddenError)
- `assertAuthenticated(value, message?)` - Assert value is truthy (throws UnauthorizedError)
- `validateInput<T>(schema, data)` - Validate with Zod schema (throws ZodError)

## Troubleshooting

### Error handler not catching errors

Make sure:
1. Error handler is registered AFTER all routes
2. You're using `asyncHandler` wrapper for async routes
3. You're throwing errors (not returning error responses)

### Errors show stack traces in production

Check that `NODE_ENV` is set to `production`. Stack traces are only shown in development mode.

### TypeScript errors with assertFound

Make sure you're using TypeScript 4.0+ which supports assertion signatures:

```typescript
const survey = await getSurvey(id);
assertFound(survey, "Survey not found");
// TypeScript knows survey is not null here
```
