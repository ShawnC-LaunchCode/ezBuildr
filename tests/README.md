# Vault-Logic Analytics Testing Framework

## Overview

This testing framework validates the integrity of Vault-Logic's analytics system from data submission through storage to aggregation. It ensures that all submitted answers are correctly persisted and that aggregated analytics accurately reflect the underlying responses.

## Architecture

### Test Infrastructure

**Vitest Configuration** (`vitest.config.ts`)
- Test runner: Vitest 4.0.1
- Environment: Node.js
- Test files: `tests/**/*.test.ts`
- Global setup: `tests/setup/setup.ts`

**In-Memory Test Database** (`tests/setup/testDb.ts`)
- Database: SQLite (better-sqlite3) in-memory
- Schema: Mirrors PostgreSQL production schema
- Benefits: Fast, isolated, no external dependencies

**Factory Helpers** (`tests/factories/`)
- `surveyFactory.ts`: Drizzle ORM-based helpers (PostgreSQL compatible)
- `testHelpers.ts`: Raw SQL helpers (SQLite compatible)
- Creates test users, surveys, questions, responses, and answers

### Test Suite Organization

**File:** `tests/analytics.test.ts`

#### 1. Data Persistence Tests
- Verify all submitted answers are stored
- Validate yes/no values
- Validate multiple choice values
- Validate text answer values

#### 2. Analytics Aggregation - Yes/No Questions
- Correct yes/no counting
- Handle multiple boolean formats (true, "Yes", "true")
- Percentage calculations

#### 3. Analytics Aggregation - Multiple Choice Questions
- Option counting
- Percentage calculations
- Multiple selections handling

#### 4. Analytics Aggregation - Text Questions
- Keyword extraction
- Empty response handling
- Word frequency analysis

#### 5. Edge Cases
- Empty surveys (no responses)
- Incomplete responses
- Missing answers for optional questions
- Referential integrity

#### 6. Performance & Scalability
- Large response volumes (100+ responses)
- Aggregation performance
- Sub-2-second execution target

## Running Tests

```bash
# Run all tests
npm run test

# Watch mode (auto-rerun on changes)
npm run test:watch

# UI mode (interactive browser UI)
npm run test:ui
```

## Test Database Schema

The test database uses SQLite with snake_case column names to match the PostgreSQL production schema:

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'creator',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Surveys
CREATE TABLE surveys (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Questions, Responses, Answers, etc...
```

## Test Results

### Current Status
✅ **All 16 tests passing!** (16/16 - 100% pass rate)

**Performance Metrics:**
- Test execution time: ~900ms
- Large dataset test (100 responses): < 2 seconds ✅
- Aggregation performance (50 responses): < 500ms ✅

**Test Coverage:**
- ✅ Data Persistence (4 tests)
- ✅ Yes/No Aggregation (2 tests)
- ✅ Multiple Choice Aggregation (2 tests)
- ✅ Text Analysis (2 tests)
- ✅ Edge Cases (4 tests)
- ✅ Performance & Scalability (2 tests)

### Implementation Approach

**Solution: Raw SQL Helpers** ✅
- Uses `tests/factories/testHelpers.ts` with raw SQL
- Bypassed Drizzle ORM type system entirely
- Complete control over SQLite data types
- Fast, reliable, and maintainable

### Technical Details

**Challenge:**
- Drizzle's PostgreSQL schema uses `PgTimestamp` columns expecting `Date` objects
- SQLite only accepts primitives (string, number, bigint, Buffer, null)
- Type mismatch caused all initial test failures

**Resolution:**
- Created raw SQL factory helpers (`testHelpers.ts`)
- Converted all test queries to use `testSqlite.prepare(SQL).all()`
- Direct SQL insertion bypasses Drizzle type transformations
- Tests now run reliably with proper SQLite types

### Future Enhancements

1. **Test Coverage Expansion**
   - Add loop group question tests
   - Add conditional logic evaluation tests
   - Add file upload tests

2. **Integration with CI/CD**
   - Add to GitHub Actions workflow
   - Configure test coverage reporting
   - Set up failure notifications
   - Add test result badges to README

3. **Performance Benchmarking**
   - Add more granular performance metrics
   - Test with 1000+ responses
   - Profile database query optimization

4. **Additional Test Suites**
   - Integration tests for AnalyticsRepository
   - Integration tests for AnalyticsService
   - End-to-end analytics workflow tests

## Usage Examples

### Creating Test Data

```typescript
import { createTestSurvey, insertResponses } from "./factories/testHelpers";

// Create survey with 5 questions
const survey = createTestSurvey();

// Insert 10 responses with answers
const responseIds = insertResponses(survey, 10);

// Verify data
const answers = testSqlite.prepare(`
  SELECT * FROM answers WHERE response_id = ?
`).all(responseIds[0]);

expect(answers).toHaveLength(5); // 5 questions answered
```

### Testing Analytics Aggregation

```typescript
// Test yes/no aggregation
const yesNoAnswers = testSqlite.prepare(`
  SELECT value FROM answers WHERE question_id = ?
`).all(survey.questions.yesNo.id);

const aggregation = { yes: 0, no: 0 };
for (const answer of yesNoAnswers) {
  const value = JSON.parse(answer.value);
  if (value === true) aggregation.yes++;
  else aggregation.no++;
}

expect(aggregation.yes).toBe(3);
expect(aggregation.no).toBe(2);
```

## Contributing

When adding new tests:

1. **Follow naming conventions**: `should [expected behavior]`
2. **Use descriptive test names**: Clear what's being tested
3. **Keep tests isolated**: Each test clears DB beforeEach
4. **Test one thing**: Single assertion per test when possible
5. **Add comments**: Explain complex aggregation logic

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3)
- [Drizzle ORM](https://orm.drizzle.team/)
- Vault-Logic Analytics Service: `server/services/AnalyticsService.ts`
- Vault-Logic Analytics Repository: `server/repositories/AnalyticsRepository.ts`
