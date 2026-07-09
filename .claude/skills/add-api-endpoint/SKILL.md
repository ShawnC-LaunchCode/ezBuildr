---
name: add-api-endpoint
description: The exact 3-tier pattern (route → service → repository) for adding or modifying ezBuildr API endpoints, including auth middleware, tenancy checks, Zod validation, error classification, and the security invariants that reviews enforce. Use this whenever you add an API route, create/extend a service or repository, wire authorization, or touch anything in server/routes/, server/services/, or server/repositories/ — even for a "small" endpoint, because the error-string contract and tenancy checks are easy to get subtly wrong.
---

# Adding an API Endpoint

Every endpoint is three layers: **route** (HTTP + validation), **service** (business logic + authorization), **repository** (data access). Skipping a layer or putting logic in the wrong one is the most common review finding.

## 1. Route (`server/routes/<domain>.routes.ts`)

Modern style — register-function exporting handlers on `app` (see `server/routes/collections.routes.ts` as the reference):

```ts
export function registerFooRoutes(app: Express): void {
  app.get('/api/tenants/:tenantId/foos', hybridAuth, validateTenantParam,
    asyncHandler(async (req, res) => {
      try {
        const foos = await fooService.list(getTenantId(req));
        res.json(foos);
      } catch (error) {
        logger.error({ error }, 'Error listing foos');
        const { status, message } = classifyRouteError(error, 'Failed to list foos');
        res.status(status).json({ message });
      }
    }));
}
```

Then register it in `server/routes/index.ts` inside `registerAllRoutes(app)`.

**Middleware (import paths matter):**
- `hybridAuth` from `../middleware/auth` — standard auth (JWT bearer, then refresh cookie). `requireAuth` is JWT-only; `optionalHybridAuth` for public+personalized routes.
- `validateTenantParam` from `../middleware/tenant` — when the URL has `:tenantId`, asserts it matches the caller's tenant. Use `requireTenant`/`getTenantId` when tenant comes from auth only.
- `requireUser` from `../middleware/requireUser` — only when you need the full `User` row (`getUser(req)`); it must run after an auth middleware.
- `asyncHandler` from `../utils/asyncHandler` — wrap every async handler.

**Validation:** inline Zod, preferring the drizzle-zod insert schemas from `@shared/schema`:
```ts
const data = insertFooSchema.parse({ ...req.body, tenantId }); // server sets tenantId, never the client
```
Catch `z.ZodError` in-handler → `400 { message: 'Invalid input', errors: error.errors }`.

## 2. Error contract — `classifyRouteError`

`classifyRouteError(error, fallback)` from `server/utils/routeErrors.ts` maps **error message strings** to statuses:
- message contains `"not found"` → 404
- contains `"Access denied"`, `"Unauthorized"`, or `"Only the"` → 403
- anything else → 500 with the generic `fallback` (real message never leaks to the client)

This means services must throw errors with those exact phrasings — e.g. `throw new Error('Foo not found')`, `throw new Error('Access denied - foo belongs to different tenant')`. A differently-worded auth error becomes a 500.

Some route families (snapshots, secrets, esign, ai-workflowEdit) intentionally don't use this pattern — don't convert them in passing.

## 3. Service (`server/services/FooService.ts`)

- Constructor takes **optional** repo params defaulting to singletons (testable, zero-arg in prod):
  ```ts
  constructor(fooRepo?: FooRepository) { this.fooRepo = fooRepo ?? fooRepository; }
  ```
- **Tenancy check first** in every read/update/delete: a `verifyTenantOwnership(id, tenantId, tx?)` method that fetches the row and throws the 404/403-phrased errors above (see `CollectionService.ts:63`).
- Export a module-level singleton at the bottom: `export const fooService = new FooService();`. Routes import the singleton directly — the DI container in `server/di/` exists but only a few services use it; follow the singleton pattern unless working in already-DI'd code (then update `server/di/tokens.ts` ServiceMap + `registrations.ts`).

## 4. Repository (`server/repositories/FooRepository.ts`)

```ts
export class FooRepository extends BaseRepository<typeof foos, Foo, InsertFoo> {
  constructor(dbInstance?: DBInstance) { super(foos, dbInstance); }
  // add custom finders: findByTenantId, findBySlug, ...
}
export const fooRepository = new FooRepository();
```

`BaseRepository` (`server/repositories/BaseRepository.ts`) provides `findById/findAll/create/update/delete/deleteWhere/count/transaction`, all accepting an optional `tx: DbTransaction`. `update` auto-sets `updatedAt`. Add the repo to the barrel `server/repositories/index.ts`.

## Security invariants (see docs/architecture/SECURITY_THREAT_MODEL.md)

- **Mass assignment:** never spread `req.body` straight into a DB write. Parse through a Zod schema with explicit fields; server-controlled fields (`tenantId`, `ownerId`, roles, tokens) are set server-side after parsing, never accepted from the client.
- **SSRF:** any outbound HTTP to a user-supplied URL must go through `safeFetch` — never raw `fetch`/`undici` on user input. Do not add test-mode bypasses.
- **Secrets:** access encrypted secrets only via `SecretService`; never log secret values.
- New auth-sensitive endpoints get an integration test proving the cross-tenant case returns 403/404 (use `createTestUser(ctx, role, otherTenantId)` from `tests/helpers/integrationTestHelper.ts`).

## Checklist

1. Repository (if new table access) → barrel export
2. Service with `verifyTenantOwnership` + singleton export
3. Route module → registered in `server/routes/index.ts`
4. Integration test incl. cross-tenant denial
5. Update `docs/claude/API_ENDPOINTS.md` (and SERVICES.md if a new service)
