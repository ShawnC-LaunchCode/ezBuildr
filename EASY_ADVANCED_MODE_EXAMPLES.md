# VaultLogic Easy/Advanced Mode - Implementation Guide

## Overview

This implementation adds an Easy/Advanced mode system to VaultLogic with:
- Account-level default mode (stored on users table)
- Per-workflow mode override (stored on workflows table)
- Precedence: `workflow.modeOverride ?? user.defaultMode`
- Frontend mode indicator and switcher in Workflow Builder
- Feature gating based on current mode

## Database Schema

### Users Table
- Added `defaultMode` column (text, default 'easy', not null)
- Valid values: 'easy' | 'advanced'

### Workflows Table
- Added `modeOverride` column (text, nullable)
- Valid values: 'easy' | 'advanced' | null
- null means use user's default mode

## API Endpoints

### Account Preferences

#### Get Account Preferences
```bash
curl -X GET http://localhost:5000/api/account/preferences \
  -H "Cookie: connect.sid=YOUR_SESSION_ID" \
  -H "Content-Type: application/json"

# Response:
# {
#   "success": true,
#   "data": {
#     "defaultMode": "easy"
#   }
# }
```

#### Update Account Preferences
```bash
curl -X PUT http://localhost:5000/api/account/preferences \
  -H "Cookie: connect.sid=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"defaultMode": "advanced"}'

# Response:
# {
#   "success": true,
#   "data": {
#     "defaultMode": "advanced"
#   }
# }
```

### Workflow Mode

#### Get Workflow Mode (Resolved)
```bash
curl -X GET http://localhost:5000/api/workflows/WORKFLOW_ID/mode \
  -H "Cookie: connect.sid=YOUR_SESSION_ID" \
  -H "Content-Type: application/json"

# Response:
# {
#   "success": true,
#   "data": {
#     "mode": "easy",
#     "source": "user"  // or "workflow" if overridden
#   }
# }
```

#### Set Workflow Mode Override to Easy
```bash
curl -X PUT http://localhost:5000/api/workflows/WORKFLOW_ID/mode \
  -H "Cookie: connect.sid=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"modeOverride": "easy"}'

# Response:
# {
#   "success": true,
#   "data": {
#     ... workflow object with modeOverride set ...
#   }
# }
```

#### Set Workflow Mode Override to Advanced
```bash
curl -X PUT http://localhost:5000/api/workflows/WORKFLOW_ID/mode \
  -H "Cookie: connect.sid=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"modeOverride": "advanced"}'
```

#### Clear Workflow Mode Override (Use Account Default)
```bash
curl -X PUT http://localhost:5000/api/workflows/WORKFLOW_ID/mode \
  -H "Cookie: connect.sid=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"modeOverride": null}'
```

## Testing Checklist

### Backend Tests

- [ ] **Database Migration**
  - [ ] Run migration: `npm run db:push` or apply `migrations/0002_add_mode_columns.sql`
  - [ ] Verify `users.default_mode` column exists with default 'easy'
  - [ ] Verify `workflows.mode_override` column exists (nullable)
  - [ ] Check constraints are applied correctly

- [ ] **Account Preferences API**
  - [ ] GET /api/account/preferences returns user's default mode
  - [ ] PUT /api/account/preferences updates default mode successfully
  - [ ] PUT with invalid mode value returns 400 error
  - [ ] Unauthenticated requests return 401

- [ ] **Workflow Mode API**
  - [ ] GET /api/workflows/:id/mode returns resolved mode
  - [ ] When workflow has no override, returns user default with source='user'
  - [ ] When workflow has override, returns override with source='workflow'
  - [ ] PUT /api/workflows/:id/mode sets override successfully
  - [ ] PUT with null clears override
  - [ ] PUT with invalid mode returns 400
  - [ ] Non-owner attempts return 403

### Frontend Tests

- [ ] **Account Settings Page**
  - [ ] Navigate to Settings page
  - [ ] Mode selector shows current default mode
  - [ ] Clicking Easy/Advanced updates mode
  - [ ] Toast notification appears on successful update
  - [ ] Mode persists after page refresh
  - [ ] Reset to Defaults sets mode back to Easy

- [ ] **Workflow Builder**
  - [ ] Mode indicator in header shows correct mode and source
  - [ ] Example: "Easy (from Account)" or "Advanced (overridden)"
  - [ ] Dropdown menu shows current mode options
  - [ ] "Switch to Easy" sets workflow override to easy
  - [ ] "Switch to Advanced" sets workflow override to advanced
  - [ ] "Clear Override" removes workflow override
  - [ ] Mode persists after page refresh
  - [ ] Toast notifications appear for mode changes

- [ ] **Feature Gating**
  - [ ] In Easy mode, Blocks Panel shows all 3 block types (prefill, validate, branch)
  - [ ] Info banner in Blocks Panel explains Easy mode
  - [ ] Block creation dialog respects mode
  - [ ] Mode changes are reflected immediately in UI

### Integration Tests

- [ ] **Mode Precedence**
  - [ ] Create workflow with no override → uses user default
  - [ ] Set user default to Advanced → new workflow inherits Advanced
  - [ ] Override workflow to Easy → workflow uses Easy regardless of user default
  - [ ] Clear workflow override → reverts to user default
  - [ ] Change user default → workflows without override use new default

- [ ] **Multi-User Scenarios**
  - [ ] User A with Easy default creates workflow
  - [ ] User A can override workflow to Advanced
  - [ ] Workflow mode is per-workflow, not affected by other workflows

- [ ] **Edge Cases**
  - [ ] Newly registered users have Easy mode by default
  - [ ] Legacy users (before migration) get Easy mode as default
  - [ ] Invalid mode values are rejected with clear error messages
  - [ ] Mode queries with non-existent workflow IDs return 404

## Feature Gates

### Easy Mode Features
- Block types: prefill, validate, branch
- Basic operators: equals, not_equals, contains, greater_than, less_than, is_empty, is_not_empty
- JSON configuration for blocks

### Advanced Mode Features (Future)
- All Easy mode features, plus:
- Additional operators: not_contains, between
- Raw JSON workflow editor
- Transform blocks (JavaScript/Python execution)
- Advanced branching logic

## Implementation Notes

1. **Default Behavior**: All users start with Easy mode as default
2. **Backward Compatibility**: Existing users get Easy mode (via migration default)
3. **Override Behavior**: Setting override to null explicitly reverts to account default
4. **UI Feedback**: Toast notifications for all mode changes
5. **Persistence**: All mode settings are stored in PostgreSQL
6. **Performance**: Mode queries are indexed for fast lookup

## Files Modified

### Backend
- `migrations/0002_add_mode_columns.sql` - Database migration
- `shared/schema.ts` - Added defaultMode and modeOverride columns
- `server/services/AccountService.ts` - Account preferences service
- `server/services/WorkflowService.ts` - Mode resolution methods
- `server/routes/account.routes.ts` - Account API routes
- `server/routes/workflows.routes.ts` - Workflow mode routes
- `server/routes/index.ts` - Route registration

### Frontend
- `client/src/lib/mode.ts` - Mode utilities and feature gates
- `client/src/lib/vault-api.ts` - API client functions
- `client/src/lib/vault-hooks.ts` - TanStack Query hooks
- `client/src/pages/SettingsPage.tsx` - Mode selector in settings
- `client/src/pages/WorkflowBuilder.tsx` - Mode indicator and switcher
- `client/src/components/builder/BlocksPanel.tsx` - Mode-aware blocks panel

## Success Criteria

✅ Users can set their account default mode (Easy/Advanced)
✅ Users can override mode per-workflow
✅ Mode resolution follows precedence: workflow.modeOverride ?? user.defaultMode
✅ UI clearly indicates current mode and source
✅ Mode switches are persisted and reflected immediately
✅ Feature gating is in place (currently informational, ready for expansion)

---

**VaultLogic Epic 2 — Easy/Advanced Mode implemented with account default, per-workflow override, and feature gating in Builder.**
