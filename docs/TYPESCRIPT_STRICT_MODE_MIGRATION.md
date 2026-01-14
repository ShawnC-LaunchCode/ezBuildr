# TypeScript Strict Mode Migration Guide

**Status:** In Progress
**Last Updated:** January 12, 2026
**Owner:** Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Why Strict Mode?](#why-strict-mode)
3. [Migration Strategy](#migration-strategy)
4. [Strict Zones](#strict-zones)
5. [Configuration](#configuration)
6. [Common Issues & Solutions](#common-issues--solutions)
7. [Best Practices](#best-practices)
8. [Validation & CI/CD](#validation--cicd)
9. [Roadmap](#roadmap)

---

## Overview

ezBuildr is gradually migrating to **full TypeScript strict mode** to improve type safety, catch bugs earlier, and enhance code maintainability. Rather than enabling strict mode across the entire codebase at once (which would create thousands of errors), we're using a **zone-based approach** where new code paths must comply with strict mode from the start.

### Current State

- **Base Config (`tsconfig.json`):** Uses `"strict": true` but legacy code may not fully comply
- **Strict Config (`tsconfig.strict.json`):** Extends base with additional strict checks
- **Strict Zones:** Specific directories/files that MUST pass strict mode validation
- **Validation Script:** `scripts/check-strict-zones.ts` enforces compliance

---

## Why Strict Mode?

### Benefits

| Feature | Benefit |
|---------|---------|
| **`noImplicitAny`** | Catch missing type annotations, no silent `any` types |
| **`strictNullChecks`** | Prevent null/undefined errors (billion-dollar mistake) |
| **`strictFunctionTypes`** | Ensure type-safe function parameters |
| **`strictPropertyInitialization`** | Guarantee class properties are initialized |
| **`noImplicitThis`** | Prevent `this` context errors |
| **`noUncheckedIndexedAccess`** | Catch out-of-bounds array/object access |

### Real-World Impact

```typescript
// ❌ Without strict mode - compiles but crashes at runtime
function getUser(id: string) {
  const users = [{ id: '1', name: 'Alice' }];
  return users.find(u => u.id === id); // Could be undefined!
}

const name = getUser('999').name; // 💥 Runtime error: Cannot read property 'name' of undefined

// ✅ With strict mode - caught at compile time
function getUser(id: string): User | undefined {
  const users: User[] = [{ id: '1', name: 'Alice' }];
  return users.find(u => u.id === id);
}

const user = getUser('999');
if (user) {
  const name = user.name; // ✅ Safe!
} else {
  // Handle not found case
}
```

---

## Migration Strategy

### Phased Approach

```
Phase 1: New Code Only (Current)
├── Strict zones for new features
├── Validation script in CI/CD
└── Documentation & training

Phase 2: Service Layer (Q1 2026)
├── Migrate high-value services
├── Repository layer
└── Critical business logic

Phase 3: API Routes (Q2 2026)
├── Route handlers
├── Middleware
└── Request/response types

Phase 4: Full Codebase (Q3 2026)
├── Remaining backend code
├── Shared utilities
└── Frontend components
```

### Principles

1. **Zero Breakage:** Migration never breaks existing functionality
2. **New Code First:** All new code MUST use strict mode
3. **Incremental Expansion:** Gradually expand strict zones
4. **Automated Validation:** CI/CD enforces compliance
5. **Team Education:** Train team on strict mode patterns

---

## Strict Zones

### Current Zones (January 2026)

| Zone | Description | Files |
|------|-------------|-------|
| **`server/services/scripting/**`** | Custom Scripting System | 6 files |
| **`server/routes/lifecycle-hooks.routes.ts`** | Lifecycle Hooks API | 1 file |
| **`server/routes/document-hooks.routes.ts`** | Document Hooks API | 1 file |
| **`server/repositories/LifecycleHookRepository.ts`** | Lifecycle Hook Repository | 1 file |
| **`server/repositories/DocumentHookRepository.ts`** | Document Hook Repository | 1 file |
| **`server/repositories/ScriptExecutionLogRepository.ts`** | Script Execution Log Repository | 1 file |

### Zone Selection Criteria

New code becomes a strict zone if it meets any of:

- ✅ **New feature** (built after Dec 2025)
- ✅ **Critical path** (security, data integrity)
- ✅ **High complexity** (needs strong typing)
- ✅ **Frequent changes** (benefits from type safety)

### Adding a New Zone

1. **Update `tsconfig.strict.json`:**

```json
{
  "include": [
    // ... existing zones
    "server/services/new-feature/**/*",
    "server/routes/new-api.routes.ts"
  ]
}
```

2. **Update `scripts/check-strict-zones.ts`:**

```typescript
const STRICT_ZONES: StrictZone[] = [
  // ... existing zones
  {
    pattern: 'server/services/new-feature/**/*',
    description: 'New Feature Service Layer'
  }
];
```

3. **Validate:**

```bash
npm run check:strict-zones
```

4. **Document in this file** (update [Current Zones](#current-zones) table)

---

## Configuration

### `tsconfig.strict.json`

Extends base config with strict checks:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    // Core strict flags
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    // Additional safety
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": [
    // Strict zones only
  ]
}
```

### Validation Script

`scripts/check-strict-zones.ts` validates compliance:

```bash
# Check all zones
npm run check:strict-zones

# Verbose output
npm run check:strict-zones -- --verbose

# List zones
npm run check:strict-zones -- --list
```

### Package.json Scripts

```json
{
  "scripts": {
    "check:strict-zones": "tsx scripts/check-strict-zones.ts",
    "check:strict-zones:verbose": "tsx scripts/check-strict-zones.ts --verbose",
    "check:strict-zones:list": "tsx scripts/check-strict-zones.ts --list"
  }
}
```

---

## Common Issues & Solutions

### 1. Implicit `any` Types

**Problem:**
```typescript
// ❌ Error: Parameter 'data' implicitly has an 'any' type
function processData(data) {
  return data.value;
}
```

**Solution:**
```typescript
// ✅ Add explicit type annotation
interface Data {
  value: string;
}

function processData(data: Data): string {
  return data.value;
}
```

### 2. Null/Undefined Handling

**Problem:**
```typescript
// ❌ Error: Object is possibly 'undefined'
const users = await db.query.users.findFirst();
return users.name; // Could be undefined!
```

**Solution:**
```typescript
// ✅ Option 1: Guard clause
const user = await db.query.users.findFirst();
if (!user) {
  throw new Error('User not found');
}
return user.name;

// ✅ Option 2: Optional chaining
return user?.name ?? 'Unknown';

// ✅ Option 3: Non-null assertion (use sparingly!)
return user!.name; // Only if you're 100% sure it exists
```

### 3. Array Index Access

**Problem:**
```typescript
// ❌ Error: Element implicitly has an 'any' type (noUncheckedIndexedAccess)
const items = ['a', 'b', 'c'];
const first = items[0]; // Type: string | undefined
const upper = first.toUpperCase(); // Error!
```

**Solution:**
```typescript
// ✅ Option 1: Guard check
const first = items[0];
if (first) {
  const upper = first.toUpperCase();
}

// ✅ Option 2: Non-null assertion (if index is known valid)
const first = items[0]!;
const upper = first.toUpperCase();

// ✅ Option 3: Use .at() method
const first = items.at(0);
if (first) {
  const upper = first.toUpperCase();
}
```

### 4. Function Return Types

**Problem:**
```typescript
// ❌ Error: Not all code paths return a value
function getStatus(code: number) {
  if (code === 200) return 'OK';
  if (code === 404) return 'Not Found';
  // Missing return for other cases!
}
```

**Solution:**
```typescript
// ✅ Option 1: Explicit return
function getStatus(code: number): string {
  if (code === 200) return 'OK';
  if (code === 404) return 'Not Found';
  return 'Unknown'; // Default case
}

// ✅ Option 2: Throw error
function getStatus(code: number): string {
  if (code === 200) return 'OK';
  if (code === 404) return 'Not Found';
  throw new Error(`Unknown status code: ${code}`);
}
```

### 5. Class Property Initialization

**Problem:**
```typescript
// ❌ Error: Property 'name' has no initializer
class User {
  name: string;
  constructor() {
    // Name not initialized!
  }
}
```

**Solution:**
```typescript
// ✅ Option 1: Initialize in constructor
class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

// ✅ Option 2: Default value
class User {
  name: string = 'Unknown';
}

// ✅ Option 3: Definite assignment assertion (use sparingly!)
class User {
  name!: string; // I promise to initialize this before use
  constructor() {
    this.initialize();
  }
  private initialize() {
    this.name = 'Default';
  }
}
```

### 6. `this` Context

**Problem:**
```typescript
// ❌ Error: 'this' implicitly has type 'any'
class Logger {
  log(message) {
    console.log(`[${this.name}] ${message}`);
  }
}
```

**Solution:**
```typescript
// ✅ Add explicit this parameter
class Logger {
  name: string = 'Logger';

  log(this: Logger, message: string): void {
    console.log(`[${this.name}] ${message}`);
  }
}
```

---

## Best Practices

### 1. Type Everything

```typescript
// ❌ Avoid
const data = await fetchData();
const result = processData(data);

// ✅ Explicit types
interface ApiResponse {
  data: string[];
  status: number;
}

const data: ApiResponse = await fetchData();
const result: string[] = processData(data);
```

### 2. Use Type Guards

```typescript
// ✅ Type guard function
function isUser(obj: any): obj is User {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string';
}

// Usage
const data = await fetchData();
if (isUser(data)) {
  console.log(data.name); // TypeScript knows data is User
}
```

### 3. Prefer `unknown` over `any`

```typescript
// ❌ any disables type checking
function processData(data: any) {
  return data.value; // No type checking!
}

// ✅ unknown forces type checking
function processData(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String((data as { value: unknown }).value);
  }
  throw new Error('Invalid data');
}
```

### 4. Use Utility Types

```typescript
// Make all properties optional
type PartialUser = Partial<User>;

// Pick specific properties
type UserName = Pick<User, 'id' | 'name'>;

// Make all properties readonly
type ImmutableUser = Readonly<User>;

// Exclude properties
type UserWithoutPassword = Omit<User, 'password'>;
```

### 5. Nullable Types

```typescript
// ✅ Explicit nullable types
interface User {
  id: string;
  name: string;
  email: string | null; // Can be null
  avatar?: string; // Optional (undefined)
}

// Handle nullables
function getUserEmail(user: User): string {
  return user.email ?? 'no-email@example.com';
}
```

---

## Validation & CI/CD

### Local Development

```bash
# Check before committing
npm run check:strict-zones

# Run tests (also validates types)
npm test

# Full type check (all code)
npm run typecheck
```

### Pre-commit Hook

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run strict zone validation
npm run check:strict-zones

if [ $? -ne 0 ]; then
  echo "❌ Strict mode validation failed. Please fix the errors above."
  exit 1
fi
```

### CI/CD Pipeline

Add to `.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run check:strict-zones
      - run: npm run typecheck
```

### PR Review Checklist

- [ ] New code added to appropriate strict zone
- [ ] `npm run check:strict-zones` passes locally
- [ ] No `@ts-ignore` comments added (use `@ts-expect-error` with explanation)
- [ ] Type annotations are explicit and meaningful
- [ ] Null/undefined cases are handled

---

## Roadmap

### Q1 2026: Service Layer Migration

**Target:** 30+ service classes

- [ ] Migrate `WorkflowService`, `RunService`, `StepService`
- [ ] Migrate DataVault services
- [ ] Migrate integration services
- [ ] Update strict zones configuration
- [ ] Run validation in CI/CD

**Estimated Effort:** 40 hours

### Q2 2026: API Routes & Middleware

**Target:** 66+ route files, 10+ middleware

- [ ] Migrate authentication routes
- [ ] Migrate workflow routes
- [ ] Migrate datavault routes
- [ ] Migrate middleware (auth, validation)
- [ ] Update strict zones

**Estimated Effort:** 60 hours

### Q3 2026: Full Codebase

**Target:** Entire backend + shared code

- [ ] Migrate repositories
- [ ] Migrate utilities
- [ ] Migrate shared types
- [ ] Enable strict mode in base `tsconfig.json`
- [ ] Remove `tsconfig.strict.json` (no longer needed)

**Estimated Effort:** 80 hours

### Q4 2026: Frontend (Optional)

**Target:** React components

- [ ] Evaluate frontend strict mode needs
- [ ] Migrate high-value components
- [ ] Update hooks and contexts
- [ ] Enable in `tsconfig.json`

**Estimated Effort:** 100 hours

---

## Resources

### Internal Documentation

- [Developer Reference](./reference/DEVELOPER_REFERENCE.md)
- [CLAUDE.md](../CLAUDE.md)
- [Testing Framework](./testing/TESTING.md)

### External Resources

- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [TypeScript Deep Dive - Strict Mode](https://basarat.gitbook.io/typescript/intro-1/strictnullchecks)
- [TypeScript Best Practices](https://github.com/typescript-cheatsheets/react)

### Training Materials

- Internal TypeScript Strict Mode Workshop (Q1 2026)
- Code review examples in `/docs/examples/typescript-strict/`
- Team Slack channel: `#typescript-strict-mode`

---

## Contributing

### Adding to This Guide

This guide is a living document. To contribute:

1. Identify common issues or patterns
2. Document the problem and solution
3. Add code examples
4. Update the relevant section
5. Submit PR with label `docs: typescript`

### Questions or Issues?

- Open an issue with label `typescript` or `developer-experience`
- Ask in `#typescript-strict-mode` Slack channel
- Tag `@dev-team` in PR comments

---

**Document Version:** 1.0.0
**Last Review:** January 12, 2026
**Next Review:** April 12, 2026
**Maintainer:** Development Team
