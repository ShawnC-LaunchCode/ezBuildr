# Top 10 Technical Debt Items - Jan 14, 2026

Based on a comprehensive analysis of the codebase, existing debt reports, and test execution logs, here are the top 10 items of technical debt, rated by severity.

## Summary
*   **Total Debt Score**: High
*   **Primary Bottleneck**: Testing infrastructure and stalled refactoring preventing feature velocity.
*   **Recent Progress**: Significant work was done on Jan 13, 2026 to establish strict mode and linting, but it revealed a massive backlog of issues.

---

## Prioritized List

### 1. Broken Test Database Initialization (Severity: CRITICAL)
*   **Description**: Test execution is currently spammed with `error: cannot change name of input parameter "p_prefix"` coming from the `neondatabase/serverless` driver during `setup.ts`. This indicates that test migrations are attempting to modify existing stored procedures in a way that Postgres forbids (or the driver mishandles), leading to uninitialized databases and flaky or failing tests across the board.
*   **Impact**: drastically reduces confidence in CI/CD; developers cannot trust local test results.
*   **Evidence**: `test_failures.txt` logs show this error for almost every unit test file.

### 2. Stalled "Strangler" Refactoring of Core Services (Severity: HIGH)
*   **Description**: The `AIService`, `BlockRunner`, and `RunService` are in a "half-migrated" state (approx. 70% complete). The new modular architecture (`server/services/ai/*`, `server/services/blockRunners/*`) exists but is not fully integrated.
*   **Impact**: Violates the "Single Source of Truth" principle. Developers are unsure whether to look at the massive legacy files (e.g., `AIService.ts` is ~2,100 lines) or the new modules.
*   **Evidence**: `TECHNICAL_DEBT_COMPLETION_REPORT.md` explicitly lists these as "Yellow/Partial".

### 3. Drizzle ORM & Kit Version Mismatch (Severity: HIGH)
*   **Description**: The project uses `drizzle-orm` **v0.39.1** (very new) with `drizzle-kit` **v0.31.5** (older).
*   **Impact**: High risk of schema drift or migration generation failures. `drizzle-kit` versions are tightly coupled to `orm` versions for correct SQL generation.
*   **Evidence**: `package.json` dependency versions.

### 4. Monolithic Schema Definition (Severity: HIGH)
*   **Description**: The `shared/schema.ts` file is approximately **174KB**. It contains the entire database definition, Zod validations, and likely inferred types in one single file.
*   **Impact**: Major contributor to IDE slowness (TypeScript server lag), high collision risk during merges, and poor code navigability.
*   **Evidence**: File size check confirmed 174,713 bytes.

### 5. Excessive Lint & Type Violations (Severity: MEDIUM)
*   **Description**: The newly established linting baseline shows **~23,955 lint issues** and **~9,190 type safety issues**.
*   **Impact**: The "broken windows" effect—developers ignore warnings because there are too many. Type safety is compromised by widespread `any` or loose typing.
*   **Evidence**: `TECHNICAL_DEBT_COMPLETION_REPORT.md` statistics.

### 6. Recurring Integration Test Failures (Severity: MEDIUM)
*   **Description**: Specific critical paths in `ScriptEngine` and `AuthService` have persistent failures (8 failing tests identified as priority).
*   **Impact**: Hides regressions in core security and execution logic.
*   **Evidence**: `test_failures.txt` and report findings.

### 7. Deprecated Library Usage: `docxtemplater` (Severity: MEDIUM)
*   **Description**: The code uses the deprecated `.setData()` method, which is logging warnings during every document generation.
*   **Impact**: Future library updates will break document generation functionality.
*   **Evidence**: Logs show `Deprecated method ".setData", view upgrade guide`.

### 8. Missing Local Dependency: `libreoffice` (Severity: LOW)
*   **Description**: Tests for PDF conversion fail locally because `libreoffice` is not installed or detected in the environment.
*   **Impact**: Developers must skip certain tests or rely solely on CI.
*   **Evidence**: Logs show `libreoffice-convert not available`.

### 9. Unfinished API Documentation (Severity: LOW)
*   **Description**: An 80,000+ line OpenAPI specification (`openapi.yaml`) has been generated but is not exposed via Swagger UI.
*   **Impact**: Frontend developers have to blindly guess API contracts or read backend code, slowing down feature integration.
*   **Evidence**: Report lists this as "30% complete".

### 10. AI Service Rate Limiting Strategy (Severity: LOW)
*   **Description**: Tests are hitting `Rate limit hit, retrying...` errors frequently.
*   **Impact**: Makes the test suite slow and prone to timeouts. The retry logic seems robust but the test strategy should likely mock these calls by default.
*   **Evidence**: CI logs showing frequent retries during AI service tests.

## Recommendations

1.  **Immediate**: Fix the Test DB Init (Item #1) and Drizzle Version Mismatch (Item #3). This will stabilize the foundation.
2.  **Short Term**: Finish the "Strangler" refactoring (Item #2) to clean up the core service architecture.
3.  **Medium Term**: Address the Monolithic Schema (Item #4) by splitting it into domain-specific files.
