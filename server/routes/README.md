# VaultLogic Routing Architecture

**Last Updated:** November 16, 2025

## Overview

VaultLogic uses a **dual routing pattern** that separates legacy routes from modern REST API routes. This document explains the architecture and when to use each pattern.

---

## Routing Patterns

### Pattern 1: Legacy Direct Routes (server/routes/*.routes.ts)

**Location:** `server/routes/*.routes.ts`
**Used for:** Legacy survey system, workflow builder UI routes, legacy features

**Characteristics:**
- Direct route registration on Express app
- Function-based route registration: `registerXxxRoutes(app: Express)`
- Routes registered directly in route files
- Typically uses services and repositories directly
- Examples: surveys, pages, questions, responses, workflows, pages, steps

**Example:**
```typescript
// server/routes/surveys.routes.ts
export function registerSurveyRoutes(app: Express) {
  app.get('/api/surveys', isAuthenticated, async (req, res) => {
    // Handler logic here
  });
}
```

---

### Pattern 2: Modern REST API Routes (Stage 4)

**Router Implementation:** `server/api/*.ts`
**Router Registration:** `server/routes/api.*.routes.ts`

**Used for:** New REST API architecture (Stage 4+), modern features with RBAC and pagination

**Characteristics:**
- Separation of router logic and registration
- Express Router-based (modular)
- Built-in RBAC middleware (`requirePermission`)
- Cursor-based pagination support
- Comprehensive error handling
- Request validation with Zod schemas
- Examples: projects, workflows (Stage 4), templates (Stage 21), runs (Engine 2.0)

**Two-File Pattern:**

**File 1: Router Implementation** (`server/api/projects.ts`)
```typescript
import { Router } from 'express';
const router = Router();

router.get('/', hybridAuth, requireTenant, requirePermission('project:view'),
  async (req, res) => {
    // Handler logic with pagination, validation, etc.
  }
);

export default router;
```

**File 2: Router Registration** (`server/routes/api.projects.routes.ts`)
```typescript
import projectsRouter from "../api/projects";

export function registerApiProjectRoutes(app: Express) {
  app.use('/api', projectsRouter);
}
```

---

## When to Use Each Pattern

### Use Legacy Pattern (server/routes/*.routes.ts) when:
- ✅ Working with legacy survey system code
- ✅ Simple CRUD operations without complex RBAC
- ✅ Maintaining existing routes
- ✅ Quick prototypes or MVP features

### Use Modern API Pattern (server/api/*.ts) when:
- ✅ Building new REST APIs (Stage 4+)
- ✅ Need tenant isolation and RBAC
- ✅ Require cursor-based pagination
- ✅ Building features for multi-tenancy
- ✅ Need comprehensive error handling
- ✅ Want request/response validation

---

## Current Routes by Pattern

### Legacy Pattern Routes (35 files)
Located in `server/routes/*.routes.ts`:
- Survey system: surveys, pages, questions, responses, analytics, export
- Workflow builder: workflows, pages, steps, blocks, transformBlocks
- File management: files, templates, templateSharing
- Team management: teams, tenant
- User management: account, userPreferences, auth
- Dashboard and admin: dashboard, admin
- Other: workflowExports, workflowAnalytics, intake, versions, collections, etc.

### Modern API Pattern Routes (4 resources)
**Router implementations:** `server/api/*.ts`
- `projects.ts` - Project CRUD with RBAC
- `workflows.ts` - Workflow API (Stage 4)
- `templates.ts` - Template API (Stage 21)
- `runs.ts` - Workflow Run API (Engine 2.0)

**Router registrations:** `server/routes/api.*.routes.ts`
- `api.projects.routes.ts`
- `api.workflows.routes.ts`
- `api.templates.routes.ts`
- `api.runs.routes.ts`

---

## Migration Path

**Long-term goal:** Gradually migrate legacy routes to modern API pattern

**Priority for migration:**
1. Routes requiring multi-tenancy
2. Routes needing RBAC
3. Routes with pagination needs
4. Frequently used APIs

**Do NOT migrate:**
- Legacy survey system (stable, working)
- Internal admin routes
- Low-traffic endpoints

---

## Route Registration

All routes are registered in `server/routes/index.ts`:

```typescript
// Legacy routes
registerSurveyRoutes(app);
registerWorkflowRoutes(app);
// ... etc

// Modern API routes (Stage 4)
registerApiProjectRoutes(app);
registerApiWorkflowRoutes(app);
registerApiTemplateRoutes(app);
registerApiRunRoutes(app);
```

---

## Best Practices

### For Legacy Routes:
- Keep handler logic in services/repositories
- Use `isAuthenticated` middleware
- Validate with Zod schemas
- Use structured logging (Pino)

### For Modern API Routes:
- Always use `hybridAuth`, `requireTenant`, `requirePermission`
- Implement cursor-based pagination for list endpoints
- Use Zod schemas from `server/api/validators/`
- Return standardized error responses
- Include comprehensive request/response types

---

## Related Documentation
- [API Reference](../../docs/api/API.md)
- [Authentication Guide](../../docs/guides/AUTHENTICATION.md)
- [RBAC Documentation](../../docs/guides/RBAC.md)
- [Testing Guide](../../docs/testing/TESTING.md)

---

**Document Maintainer:** Development Team
**Review Cycle:** Quarterly
**Next Review:** February 2026
