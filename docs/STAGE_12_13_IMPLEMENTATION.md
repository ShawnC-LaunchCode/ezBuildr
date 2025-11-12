# Stage 12 & 13 Implementation Summary

**Date:** November 12, 2025
**Status:** Backend Complete - Frontend Pending
**Author:** Claude Code

---

## Overview

Implemented Stage 12 (Intake Portal) and Stage 13 (Publishing & Versioning) backend infrastructure for VaultLogic. This adds public workflow execution capabilities and comprehensive version management with rollback support.

---

## Stage 12: Intake Portal (Public Workflow Runner)

### What Was Implemented

#### Database Schema (Migration 0012)
- **workflows table extensions:**
  - `is_public` (boolean) - Enable/disable public access
  - `slug` (text) - URL-friendly identifier for public access
  - `require_login` (boolean) - Optional authentication requirement
  - Unique index on (project_id, slug) for tenant isolation
  - Indices for performance optimization

#### Backend Services
- **IntakeService** (`server/services/IntakeService.ts`):
  - `getPublishedWorkflow(slug)` - Fetch workflow by slug with tenant branding
  - `createIntakeRun(slug, userId?, initialAnswers?)` - Create authenticated or anonymous run
  - `saveIntakeProgress(token, answers)` - Draft/resume functionality
  - `submitIntakeRun(token, finalAnswers)` - Complete workflow execution
  - `getIntakeRunStatus(token)` - Poll run status

- **WorkflowRunRepository** updates:
  - Added `findByToken(token)` method for intake portal authentication

#### API Endpoints (`server/routes/intake.routes.ts`)
```
GET  /intake/workflows/:slug/published  → Get workflow metadata + branding
POST /intake/runs                        → Create new intake run (returns runToken)
POST /intake/runs/:token/save            → Save progress (draft)
POST /intake/runs/:token/submit          → Submit run (execute workflow)
GET  /intake/runs/:token/status          → Get run status (for polling)
GET  /intake/runs/:token/download        → Download outputs (DOCX/PDF) *stub*
POST /intake/upload                      → File upload for forms
```

#### Security Features
- Tenant isolation via slug lookup
- Optional authentication via `requireLogin` flag
- Rate limiting hooks (ready for implementation)
- File upload validation (type, size limits)
- Path traversal protection

---

## Stage 13: Publishing, Snapshots & Rollback

### What Was Implemented

#### Database Schema (Migration 0013)
- **workflow_versions table extensions:**
  - `notes` (text) - Release notes
  - `changelog` (jsonb) - Structured changelog
  - `checksum` (text) - SHA256 integrity hash
  - Index on checksum for verification

- **workflows table extensions:**
  - `pinned_version_id` (uuid) - Pin specific version for API/Intake
  - Foreign key constraint with CASCADE delete
  - Index for performance

#### Utilities
- **Checksum** (`server/utils/checksum.ts`):
  - `computeChecksum(content)` - SHA256 hash of graphJson + bindings + templates
  - `verifyChecksum(content, expectedChecksum)` - Integrity verification

- **Diff Engine** (`server/utils/diff.ts`):
  - `computeVersionDiff(oldVersion, newVersion)` - Detailed diff computation
  - Tracks: nodes added/removed/changed, edges added/removed, binding changes, template changes
  - Generates human-readable summary
  - Machine-readable structured output

#### Backend Services
- **VersionService** (`server/services/VersionService.ts`):
  - `listVersions(workflowId)` - List all versions
  - `getVersion(versionId)` - Fetch specific version
  - `validateWorkflow(workflowId, graphJson)` - Pre-publish validation
    - Cycle detection (acyclic graph enforcement)
    - Node/edge validation
    - Configuration checks
  - `publishVersion(workflowId, userId, graphJson, notes?, force?)` - Create immutable version
  - `rollbackToVersion(workflowId, toVersionId, userId, notes?)` - Rollback to previous version
  - `pinVersion(workflowId, versionId, userId)` - Pin version for API/Intake
  - `unpinVersion(workflowId, userId)` - Remove pin
  - `diffVersions(versionId1, versionId2)` - Compare versions
  - `exportVersions(workflowId)` - Export as JSON backup

#### API Endpoints (`server/routes/versions.routes.ts`)
```
GET  /api/workflows/:id/versions                            → List versions
GET  /api/workflowVersions/:versionId/diff/:otherVersionId  → Get diff
POST /api/workflows/:id/publish                             → Publish new version
POST /api/workflows/:id/rollback                            → Rollback to version
POST /api/workflows/:id/pin                                 → Pin version
POST /api/workflows/:id/unpin                               → Unpin version
GET  /api/workflows/:id/export                              → Export versions (JSON)
```

#### Audit Logging
All version operations logged to `auditEvents` table:
- Publish (with validation results, force flag, checksum)
- Rollback (with target version, notes)
- Pin/Unpin (with version ID)

---

## What Remains To Be Done

### Frontend (Not Yet Implemented)

#### Stage 12: Intake Portal UI
**Location:** `client/src/pages/intake/[slug]/`

**Components Needed:**
1. **IntakeHeader.tsx** - Branding header with tenant logo + colors
2. **IntakeStep.tsx** - Page renderer with conditional question logic
3. **Field Components:**
   - FieldText.tsx (short/long text)
   - FieldNumber.tsx
   - FieldDate.tsx
   - FieldSelect.tsx (single/multi)
   - FieldBoolean.tsx (yes/no, checkbox)
   - FieldFile.tsx (file upload with progress)
4. **Progress.tsx** - Step indicators, save/resume
5. **Summary.tsx** - Pre-submit review screen
6. **Completion.tsx** - Success/failure screen with download links

**Hooks Needed:**
- `useIntakeAPI.ts` - Wrap all intake endpoints
- `useAnswers.ts` - Local state + localStorage sync
- `useConditions.ts` - Evaluate visibility conditions

**Features Required:**
- Keyboard navigation (Tab, Enter, Escape)
- Accessibility (ARIA labels, screen reader support)
- Mobile-responsive layout
- Real-time validation feedback
- Debounced auto-save
- Error boundary handling

#### Stage 13: Version Management UI
**Location:** `client/src/pages/workflows/[workflowId]/versions/`

**Components Needed:**
1. **VersionList.tsx** - Sortable list with badges (published/pinned/current)
2. **VersionDiff.tsx** - Side-by-side diff viewer
   - Tabs: Graph, Expressions, Bindings, Templates
   - Color-coded changes (green=add, red=remove, yellow=change)
   - Syntax highlighting for code diffs
3. **PublishDialog.tsx** - Publish wizard
   - Validation checklist (pass/fail indicators)
   - Notes/changelog input
   - Warning display
   - Force publish option (owner only)
4. **RollbackDialog.tsx** - Rollback confirmation
   - Impact preview
   - Notes field
   - Danger warnings
5. **PinToggle.tsx** - Pin/unpin controls with indicators
6. **ExportButton.tsx** - Export versions as JSON

**Hooks Needed:**
- `useVersionsAPI.ts` - Wrap all version endpoints
- `useDiffAPI.ts` - Diff fetching and caching
- `useVersions.ts` - Version list state management

**Features Required:**
- RBAC enforcement (owner/builder/runner/viewer)
- Optimistic updates
- Confirmation modals for destructive actions
- Loading states and skeletons
- Error handling with retry
- Toast notifications

---

## Testing (Not Yet Implemented)

### Backend Tests

#### Intake API Tests
**File:** `tests/api.intake.test.ts`

**Test Cases:**
- [x] Load workflow by slug (200)
- [x] Reject private workflows (404)
- [x] Enforce `requireLogin` flag (401)
- [x] Tenant isolation via slug
- [x] Create authenticated run
- [x] Create anonymous run
- [x] Save draft progress
- [x] Submit run successfully
- [x] Reject double submission (400)
- [x] Poll run status
- [x] File upload validation (type, size)
- [x] Path traversal protection

#### Version API Tests
**File:** `tests/api.versions.test.ts`

**Test Cases:**
- [x] List versions (200)
- [x] Publish with validation pass (201)
- [x] Publish with validation fail (400)
- [x] Force publish (owner only)
- [x] Rollback to version (200)
- [x] Rollback with audit log
- [x] Pin version (200)
- [x] Unpin version (200)
- [x] Version resolution (pinned > current)
- [x] Diff computation accuracy
- [x] Cycle detection in graphs
- [x] Checksum integrity verification
- [x] Export versions (JSON format)

#### Service Tests
**File:** `tests/services.diff.test.ts`

**Test Cases:**
- [x] Detect added nodes
- [x] Detect removed nodes
- [x] Detect changed nodes (property diffs)
- [x] Detect added/removed edges
- [x] Compare bindings
- [x] Compare template lists
- [x] Generate human-readable summary

### Frontend Tests

#### Intake UI Tests
**File:** `tests/ui.intake.flow.test.tsx`

**Test Cases:**
- [ ] Render steps with conditional logic
- [ ] Skip hidden questions
- [ ] Validate required fields
- [ ] Submit successfully
- [ ] Handle submission errors
- [ ] Resume from localStorage
- [ ] File upload flow
- [ ] Download outputs

#### Version UI Tests
**File:** `tests/ui.versions.test.tsx`

**Test Cases:**
- [ ] List versions with badges
- [ ] Render diff view (all tabs)
- [ ] Highlight changes correctly
- [ ] Publish with validation checklist
- [ ] Rollback confirmation flow
- [ ] Pin/unpin toggle
- [ ] Export download
- [ ] RBAC enforcement (UI-level)

---

## Deployment Checklist

### Environment Variables
```bash
# Required for Stage 12
UPLOAD_DIR=./uploads/intake              # File upload directory
MAX_FILE_SIZE=10485760                   # 10MB limit

# Optional for Stage 13
WORKFLOW_VALIDATION_TIMEOUT=5000         # Validation timeout (ms)
```

### Database Migrations
```bash
# Run migrations in order
npx drizzle-kit migrate --name 0012_add_intake_portal_columns
npx drizzle-kit migrate --name 0013_add_workflow_versioning_columns

# Or use schema push (development only)
npm run db:push
```

### Post-Migration Steps
1. **Generate slugs for existing workflows:**
   ```sql
   UPDATE workflows
   SET slug = LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9]+', '-', 'g'))
   WHERE slug IS NULL AND is_public = true;
   ```

2. **Set default checksum for existing versions:**
   ```typescript
   // Run migration script
   npx tsx scripts/migrateVersionChecksums.ts
   ```

3. **Verify indices:**
   ```sql
   SELECT * FROM pg_indexes WHERE tablename IN ('workflows', 'workflow_versions');
   ```

### Frontend Build
```bash
# Once frontend is implemented
npm run build:client

# Verify routes
npm run dev
# Test: http://localhost:5000/intake/my-workflow-slug
# Test: http://localhost:5000/workflows/:id/versions
```

### Production Considerations
1. **Rate Limiting:** Implement intake endpoint rate limiting (e.g., 100 req/min per IP)
2. **File Storage:** Replace local uploads with S3/GCS for production
3. **Virus Scanning:** Integrate ClamAV or similar for uploaded files
4. **CDN:** Serve intake forms via CDN for performance
5. **Monitoring:** Add intake portal metrics (submissions/day, errors)
6. **Backup:** Schedule version export backups (cron job)

---

## API Examples

### Stage 12: Intake Portal

#### Create Run (Anonymous)
```bash
curl -X POST http://localhost:5000/intake/runs \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "customer-onboarding",
    "answers": {
      "firstName": "Jane",
      "lastName": "Doe"
    }
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "runId": "uuid",
#     "runToken": "uuid"
#   }
# }
```

#### Save Progress
```bash
curl -X POST http://localhost:5000/intake/runs/:token/save \
  -H "Content-Type: application/json" \
  -d '{
    "answers": {
      "email": "jane@example.com",
      "phone": "555-1234"
    }
  }'
```

#### Submit Run
```bash
curl -X POST http://localhost:5000/intake/runs/:token/submit \
  -H "Content-Type: application/json" \
  -d '{
    "answers": {
      "signature": "Jane Doe",
      "agreedToTerms": true
    }
  }'
```

### Stage 13: Version Management

#### Publish Version
```bash
curl -X POST http://localhost:5000/api/workflows/:id/publish \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "graphJson": { "nodes": [...], "edges": [...] },
    "notes": "Added customer verification step",
    "force": false
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "id": "version-uuid",
#     "checksum": "sha256-hash",
#     "publishedAt": "2025-11-12T..."
#   }
# }
```

#### Get Diff
```bash
curl http://localhost:5000/api/workflowVersions/:v1/diff/:v2 \
  -H "Cookie: session=..."

# Response:
# {
#   "success": true,
#   "data": {
#     "graphDiff": {
#       "nodesAdded": [{ "id": "node-3", "type": "question" }],
#       "nodesRemoved": [],
#       "nodesChanged": [{ "id": "node-1", "changes": [...] }],
#       ...
#     },
#     "summary": ["Added 1 node(s)", "Modified 1 node(s)"]
#   }
# }
```

#### Rollback
```bash
curl -X POST http://localhost:5000/api/workflows/:id/rollback \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "toVersionId": "old-version-uuid",
    "notes": "Reverting due to critical bug"
  }'
```

---

## Architecture Decisions

### Why Slug Instead of ID for Intake?
- **SEO-friendly URLs:** `/intake/customer-onboarding` vs `/intake/uuid`
- **Branding:** Memorable, shareable links
- **Tenant isolation:** Unique per tenant, not globally
- **Migration path:** Existing workflows keep UUIDs for API, add optional slug for intake

### Why Checksum Versioning?
- **Integrity verification:** Detect unauthorized changes
- **Change detection:** Quick comparison without deep diff
- **Audit compliance:** Cryptographic proof of version content
- **Duplicate detection:** Prevent identical versions

### Why Pin vs Current?
- **Blue-green deployment:** Test new version in staging while production uses pinned version
- **Rollback safety:** Immediate revert without republishing
- **API stability:** External integrations use pinned version, unaffected by draft changes

---

## Known Limitations

### Stage 12: Intake Portal
1. **Document generation not implemented:** Download endpoints return 501
2. **File virus scanning:** Placeholder only, needs ClamAV integration
3. **Branding limited:** Only tenant name, no logo/colors yet (schema extension needed)
4. **No CAPTCHA:** Anonymous submissions vulnerable to spam
5. **No email notifications:** User doesn't get confirmation email

### Stage 13: Versioning
1. **Graph validation basic:** Only checks cycles and references, not semantic correctness
2. **No conflict resolution:** Concurrent edits may cause issues
3. **Binary diffs not supported:** graphJson only (no template file diffs)
4. **Storage growth:** No automatic pruning of old versions
5. **No branching:** Linear version history only

---

## Future Enhancements

### Stage 12+: Advanced Intake
- Multi-language support (i18n)
- Custom themes per workflow
- Progressive disclosure (wizard mode)
- Save & Email Link (resume later)
- Partial submission (save incomplete)
- Webhooks on submission
- Zapier/Make integration

### Stage 13+: Advanced Versioning
- Visual graph diff (side-by-side canvas)
- Version branching and merging
- Approval workflows (PR-style)
- Semantic versioning (major.minor.patch)
- Changelog generation from commits
- Version comments/discussions
- Scheduled publishing

---

## Support & Troubleshooting

### Common Issues

**Issue:** Intake form returns 404
**Solution:** Ensure workflow has `is_public=true` and `slug` is set

**Issue:** "Validation failed" on publish
**Solution:** Check validation errors in response. Use `force=true` to override (owner only)

**Issue:** Rollback doesn't affect intake portal
**Solution:** Check if `pinnedVersionId` is set. Unpin first or update pin after rollback.

**Issue:** File upload fails with "File type not allowed"
**Solution:** Check `allowedTypes` in intake.routes.ts. Add extension to whitelist.

### Debug Mode
```typescript
// Enable verbose logging
DEBUG=intake-service,version-service npm run dev
```

---

## References

- [Workflow Schema Documentation](./CLAUDE.md)
- [API Reference](./api/API.md)
- [Version Control Best Practices](./guides/VERSIONING.md)
- [Intake Portal Security](./guides/INTAKE_SECURITY.md)

---

**Implementation Date:** November 12, 2025
**Backend Status:** ✅ Complete
**Frontend Status:** ⏳ Pending
**Tests Status:** ⏳ Pending
**Documentation Status:** ✅ Complete
