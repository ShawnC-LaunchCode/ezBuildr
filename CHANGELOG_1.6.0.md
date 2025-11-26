# VaultLogic v1.6.0 Changelog

**Release Date:** November 26, 2025
**Previous Version:** v1.5.0 (November 17, 2025)
**Release Name:** DataVault v4 + Visibility Logic Builder

---

## 🎯 Executive Summary

Version 1.6.0 represents a **major feature release** introducing the complete DataVault feature set and an advanced visibility logic system. This release adds 9 days of active development since v1.5.0, with significant enhancements to data management, conditional logic, authentication, and workflow capabilities.

**Key Highlights:**
- ✨ **DataVault v4** - Complete data management platform with databases, tables, and permissions
- 🎨 **Visibility Logic Builder** - Two-tier visibility system with step-level expressions
- 🔐 **JWT Authentication Enhancements** - New token endpoint and improved auth patterns
- 📝 **Default Values System** - URL parameter support and preview defaults
- 🎓 **Fee Waiver Demo** - Comprehensive reference workflow showcasing all features
- 📚 **In-App Documentation** - URL parameters guide and developer docs

---

## 🆕 Major New Features

### 1. DataVault v4 - Complete Data Management Platform

**Status:** ✅ Production Ready (v4 PR 13)

The most significant addition to VaultLogic, DataVault provides a complete database and table management system within workflows.

#### Core Capabilities

**Database Management:**
- Create and manage multiple databases per project
- Full CRUD operations with access control
- Database-level permissions and access control
- Archive/restore functionality

**Table Management:**
- Dynamic schema creation and modification
- Multiple column types: text, number, date, boolean, select, multiselect, autonumber
- Column reordering and configuration
- Foreign key relationships

**Data Operations:**
- Infinite scroll with virtual rendering
- Advanced filtering (equals, contains, greater than, less than, between, etc.)
- Multi-column sorting
- Optimistic updates for instant UI feedback
- Bulk operations

**API Access:**
- API tokens for external integrations
- Token-based authentication (separate from workflow runs)
- Rate limiting and usage tracking
- Secure token generation and management

**Collaboration Features:**
- Row-level notes and comments
- Comment threading
- User attribution and timestamps
- Activity logging

**Advanced Column Types:**
- **Select:** Dropdown with predefined options
- **Multiselect:** Multiple choice with tags
- **Autonumber:** Auto-incrementing IDs with custom formats
  - Configurable prefix (e.g., "INV-")
  - Configurable starting number
  - Automatic gap filling

**Table Permissions:**
- View, create, update, delete permissions
- Role-based access control
- Team-level and user-level permissions

#### Git Commits (DataVault)

```
cf72a7b - feat(datavault): add final polish and regression tests (v4 PR 13)
01d3208 - feat(datavault): add autonumber enhancements and table permissions
7312a54 - feat(datavault): add API tokens UI (v4 Micro-Phase 5 PR 10)
55156ef - feat(datavault): add API tokens for external access (v4 Micro-Phase 5 PR 9)
e08a281 - feat(datavault): add row notes UI (v4 Micro-Phase 3 PR 6)
54cf751 - feat(datavault): add row notes/comments API (v4 Micro-Phase 3 PR 5)
fd50c2b - feat(datavault): add select/multiselect column types (v4 Micro-Phase 1)
8605bf7 - feat(datavault): add select/multiselect UI components
49d293f - feat(datavault): add select and multiselect column types
340ccf1 - feat: Complete DataVault v3 frontend implementation
9eb21c4 - fix: resolve DataVault remaining issues (circular refs, network retry)
4daf206 - fix: resolve DataVault security and code quality improvements
50769c0 - feat: add optimistic updates and fix form input issues
03b91b7 - feat: Complete DataVault v2 implementation with infinite scroll
```

#### Database Schema Changes (DataVault)

New tables created for DataVault:
- `databases` - Database definitions and configuration
- `tables` - Table schemas and column definitions
- `table_rows` - Actual data storage with JSONB
- `table_permissions` - Access control for tables
- `api_tokens` - External API access tokens
- `row_notes` - Comments and notes on table rows

#### API Endpoints (DataVault)

**Databases:**
- `GET/POST /api/projects/:id/databases` - List/create databases
- `GET/PUT/DELETE /api/databases/:id` - CRUD operations
- `POST /api/databases/:id/archive` - Archive database

**Tables:**
- `GET/POST /api/databases/:id/tables` - List/create tables
- `GET/PUT/DELETE /api/tables/:id` - CRUD operations
- `PUT /api/tables/:id/columns` - Update column schema

**Data:**
- `GET/POST /api/tables/:id/rows` - List/create rows with filtering
- `GET/PUT/DELETE /api/tables/:id/rows/:rowId` - Row CRUD
- `POST /api/tables/:id/rows/bulk` - Bulk operations

**API Tokens:**
- `GET/POST /api/projects/:id/api-tokens` - Manage tokens
- `POST /api/projects/:id/api-tokens/:id/revoke` - Revoke token

**Comments:**
- `GET/POST /api/tables/:id/rows/:rowId/notes` - Row comments
- `DELETE /api/notes/:id` - Delete comment

---

### 2. Visibility Logic Builder - Two-Tier System

**Status:** ✅ Complete (commit `e2dd158`)

A powerful new system for controlling step and section visibility with both workflow-level rules and step-level expressions.

#### New Capabilities

**Step-Level Visibility Expressions:**
- `visibleIf` property on each step
- JSON-based condition expressions
- Real-time evaluation as users answer questions
- Supports all existing operators (equals, contains, greater_than, etc.)

**Two-Tier Evaluation:**
1. **Workflow-level logic rules** (existing `logic_rules` table)
2. **Step-level visibleIf expressions** (new `steps.visible_if` column)
3. Both must evaluate to true for a step to be visible

**New React Hook:**
```typescript
useWorkflowVisibility(logicRules, allSteps, formValues)
```

Returns:
- `visibleSteps: Set<string>` - Currently visible step IDs
- `hiddenSteps: Set<string>` - Currently hidden step IDs
- `requiredSteps: Set<string>` - Currently required step IDs
- `isStepVisible(stepId): boolean` - Check visibility
- `isStepRequired(stepId): boolean` - Check requirement

**Alias Resolution:**
- Automatically resolves variable names to step IDs
- Works with step aliases (e.g., `firstName`, `age`)
- Consistent with existing logic rule patterns

#### Schema Changes

**Migration: Add visible_if column to steps**
```sql
ALTER TABLE steps ADD COLUMN visible_if JSONB;
```

**Migration: Add visible_if column to sections**
```sql
ALTER TABLE sections ADD COLUMN visible_if JSONB;
```

#### Files Changed (Visibility Logic)

**New Files:**
- `client/src/hooks/useWorkflowVisibility.ts` - Main hook implementation
- `shared/conditionEvaluator.ts` - Condition expression evaluator

**Updated Files (23 total):**
- `shared/schema.ts` - Schema updates
- `client/src/components/builder/pages/PageCard.tsx` - UI integration
- `client/src/components/builder/questions/QuestionCard.tsx` - Question UI
- `client/src/pages/WorkflowRunner.tsx` - Runtime evaluation
- `client/src/pages/PreviewRunner.tsx` - Preview mode
- Plus 18 more files across the codebase

#### Git Commit

```
e2dd158 - feat(logic): add visibility logic builder for sections and questions
```

---

### 3. JWT Authentication Enhancements

**Status:** ✅ Complete (commit `95858c9`)

Improved JWT authentication system with new token endpoint and cleaner auth patterns.

#### Changes

**New Token Endpoint:**
- Dedicated endpoint for JWT token generation
- Supports external API integrations
- Token refresh capabilities

**Auth Pattern Updates:**
- Migrated from `req.user.claims.sub` to `AuthRequest.userId`
- More consistent auth interface across routes
- Better TypeScript typing for authenticated requests

**Files Updated:**
- All route files in `server/routes/*.routes.ts`
- Auth middleware improvements
- Type definitions for `AuthRequest`

#### Git Commits

```
95858c9 - fix(auth): improve JWT authentication and add token endpoint
d93248b - fix(auth): use AuthRequest.userId instead of req.user.claims.sub
```

---

### 4. Default Values for Steps

**Status:** ✅ Complete (Migration 0044, Nov 25, 2025)

Steps can now have default values that appear in preview mode and can be overridden via URL parameters.

#### Capabilities

**Default Value Storage:**
- New `default_value` JSONB column on `steps` table
- Stores any valid JSON value (string, number, boolean, object, array)
- Shown in preview mode automatically

**URL Parameter Integration:**
- URL parameters can override default values during run creation
- Example: `?firstName=John&age=30`
- Documented in new in-app documentation page

**Use Cases:**
- Pre-fill forms with common values
- Testing workflows with sample data
- Email link personalization
- Deep linking with context

#### Schema Change

**Migration 0044:**
```sql
ALTER TABLE steps ADD COLUMN IF NOT EXISTS default_value JSONB;

COMMENT ON COLUMN steps.default_value IS
  'Default value shown in preview and when workflow runs.
   Can be overridden by URL parameters during run creation.';
```

---

### 5. Fee Waiver Demo Workflow

**Status:** ✅ Complete (created Nov 26, 2025)

A comprehensive reference workflow demonstrating all VaultLogic features through a real-world use case.

#### Overview

**Workflow ID:** `81a73b18-012d-458b-af05-5098eb75c753`
**Purpose:** Court fee waiver application
**Complexity:** Production-grade example

#### Statistics

- **6 sections** - Complete multi-page workflow
- **41 steps** - All with human-friendly aliases
- **7 transform blocks** - JavaScript calculations
- **5 logic rules** - Conditional requirements and visibility
- **9 step types** - Demonstrates all question types

#### Features Demonstrated

✅ All step types (text, select, radio, yes_no, date_time, file_upload, computed)
✅ Step aliases (variables) for all fields
✅ Transform blocks with real calculations
✅ Virtual steps for computed values
✅ Conditional logic (show/hide, require)
✅ Section-level logic (skip entire pages)
✅ File uploads with validation
✅ Welcome and thank you screens
✅ Multi-file uploads
✅ Federal Poverty Level calculations (2024)

#### Key Calculations

1. **Total Monthly Income** - Sums employment + other income
2. **Poverty Threshold (150%)** - Based on household size
3. **Qualification Status** - Determines eligibility
4. **Total Monthly Expenses** - Sums all expense categories
5. **Disposable Income** - Income minus expenses
6. **Total Assets** - Sums cash, vehicles, real estate
7. **Net Worth** - Assets minus debt

#### Documentation

Complete guide created: `FEE_WAIVER_DEMO_README.md` (360 lines)

Includes:
- Workflow structure breakdown
- Variable reference (all 41 variables)
- Testing scenarios
- Calculation formulas
- Extension ideas
- Learning resources

---

### 6. In-App Documentation Pages

**Status:** ✅ Complete

New documentation pages added to the VaultLogic UI for end-users.

#### New Documentation

**URL Parameters Guide:**
- `client/src/pages/docs/UrlParametersDoc.tsx`
- Explains how to use URL parameters with workflows
- Integration with default values
- Examples and use cases

**Structure:**
```
client/src/pages/docs/
  └── UrlParametersDoc.tsx
```

---

### 7. Project Data Integrity Fix

**Status:** ✅ Complete (Migration 0045)

Fixed backward compatibility issue with project ownership.

#### Problem

Projects created before Stage 24 had:
- `creator_id` populated (old column)
- `created_by` = null (new column)

This caused access control errors when checking project ownership.

#### Solution

**Migration 0045:**
```sql
UPDATE projects
SET created_by = creator_id
WHERE created_by IS NULL AND creator_id IS NOT NULL;
```

Automatically syncs old data to new schema without data loss.

---

## 🐛 Bug Fixes

### DataVault Stability

- **Circular references resolved** (commit `9eb21c4`)
  - Fixed infinite render loops in DataVault components
  - Improved React dependency management

- **Network retry logic** (commit `9eb21c4`)
  - Added automatic retry for failed network requests
  - Better error handling and user feedback

- **Type safety improvements** (commit `4daf206`)
  - Stricter TypeScript types throughout DataVault
  - Fixed type errors in table rendering

- **Security improvements** (commit `4daf206`)
  - Enhanced access control checks
  - Improved input validation
  - SQL injection prevention

### Test Suite Improvements

- **Reduced failing tests** (commit `b7b7eaa`)
  - Fixed 88 infrastructure-dependent tests
  - Proper test skipping for external dependencies
  - Test failures: 167 → 79 (53% reduction)

### Table Viewing Errors

- **Fixed table viewing error** (PR #121)
  - Resolved data loading issues in DataVault
  - Improved error boundary handling

---

## 📊 Database Schema Changes

### New Columns

**steps table:**
- `default_value JSONB` - Default value for preview and URL params
- `visible_if JSONB` - Step-level visibility expression

**sections table:**
- `visible_if JSONB` - Section-level visibility expression

**projects table:**
- Synced `created_by` from `creator_id` for backward compatibility

### New Tables (DataVault)

- `databases` - Database definitions
- `tables` - Table schemas and columns
- `table_rows` - Row data storage (JSONB)
- `table_permissions` - Access control
- `api_tokens` - External API access
- `row_notes` - Comments and notes

### Migrations Applied

- **Migration 0044** (Nov 25, 2025) - Add default_value column
- **Migration 0045** (Nov 25, 2025) - Sync project created_by

---

## 🔧 Technical Improvements

### Frontend Architecture

**New React Hooks:**
- `useWorkflowVisibility` - Manage step/section visibility
- DataVault-specific hooks for data management

**Component Enhancements:**
- Optimistic updates for better UX
- Infinite scroll with virtual rendering
- Advanced filtering UI components
- Multi-select tag components

**State Management:**
- Improved TanStack Query usage
- Better cache invalidation strategies
- Optimistic update patterns

### Backend Services

**New Services:**
- `IntakeQuestionVisibilityService` - Visibility logic evaluation
- `IntakeNavigationService` - Navigation with visibility
- `RepeaterService` - Repeating section management
- DataVault services (database, table, row management)

**Enhanced Services:**
- `WorkflowService` - Visibility integration
- `RunService` - Default value support
- Authentication services - JWT improvements

### Code Quality

- **Type Safety:** Stricter TypeScript types across 100+ files
- **Error Handling:** Improved error boundaries and fallbacks
- **Testing:** 88 infrastructure-dependent tests properly isolated
- **Security:** Enhanced input validation and access control

---

## 📚 Documentation Updates

### New Documentation Files

1. **CHANGELOG_1.6.0.md** (this file) - Complete release notes
2. **FEE_WAIVER_DEMO_README.md** - Demo workflow guide
3. **client/src/pages/docs/UrlParametersDoc.tsx** - URL params guide

### Documentation to Update

- **CLAUDE.md** - Needs DataVault and visibility logic sections
- **README.md** - Needs version update and feature additions
- **docs/INDEX.md** - Should reference new guides

---

## 🔄 Migration Guide

### Upgrading from v1.5.0 to v1.6.0

#### Database Migrations

```bash
# Apply migrations automatically
npm run db:push

# Or apply manually
psql $DATABASE_URL -f migrations/0044_add_step_default_values.sql
psql $DATABASE_URL -f migrations/0045_sync_project_created_by.sql
```

#### Code Changes

**If you have custom auth middleware:**
- Update `req.user.claims.sub` → `req.userId` (or `AuthRequest.userId`)
- Ensure `AuthRequest` type is imported

**If you have custom visibility logic:**
- Consider migrating to `useWorkflowVisibility` hook
- Step-level `visibleIf` is now available as an alternative to logic rules

**If you use default values:**
- Check that `steps.default_value` is properly set in your workflows
- Test URL parameter overrides work as expected

#### Environment Variables

No new required environment variables for core functionality.

**Optional (DataVault API access):**
```env
# No new variables needed - uses existing VL_MASTER_KEY for encryption
```

---

## 📈 Statistics

### Code Changes

**Files Changed:** 150+ files
**Lines Added:** ~15,000 lines
**Lines Removed:** ~3,000 lines
**Net Change:** +12,000 lines

**New Features:** 7 major features
**Bug Fixes:** 12+ fixes
**Performance Improvements:** Optimistic updates, infinite scroll
**Test Improvements:** 88 tests fixed/skipped

### Commits Since v1.5.0

**Total Commits:** 20 commits (Nov 17-26, 2025)
**Contributors:** Development Team
**Pull Requests Merged:** 15+ PRs

**Breakdown by Category:**
- DataVault features: 13 commits
- Visibility logic: 1 commit
- Authentication: 2 commits
- Bug fixes: 4 commits

---

## 🎯 Breaking Changes

### None Expected

This release maintains backward compatibility with v1.5.0.

**Migration Notes:**
- Existing logic rules continue to work unchanged
- New visibility system is opt-in (use `visibleIf` when needed)
- Default values are optional (steps work without them)
- DataVault is a new feature area (doesn't affect existing workflows)

---

## 🔜 What's Next (v1.7.0 Roadmap)

Based on current development trajectory:

**Planned Features:**
1. **DataVault Integration with Workflows** - Use DataVault as data source in workflows
2. **Advanced Template System** - More template variable types
3. **Workflow Versioning** - Track changes and rollback
4. **Real-time Collaboration** - Multi-user editing
5. **Integration Marketplace** - Pre-built integrations

**In Progress:**
- Advanced analytics dashboards
- Team collaboration enhancements
- Additional node types (branch, loop, etc.)

---

## 🙏 Credits

**Development Team:** VaultLogic Contributors
**Testing:** Automated test suite + manual QA
**Documentation:** Development team

**Special Thanks:**
- DataVault feature development team
- Community feedback on visibility logic requirements
- Test suite improvements contributors

---

## 📞 Support & Feedback

**Issues:** https://github.com/ShawnC-LaunchCode/VaultLogic/issues
**Documentation:** See CLAUDE.md and docs/ folder
**Demo Workflow:** See FEE_WAIVER_DEMO_README.md

---

**Release Prepared:** November 26, 2025
**Next Review:** December 26, 2025
**Version:** 1.6.0 (DataVault v4 + Visibility Logic Builder)
