# Epic 4: Teams & Sharing — Testing Guide

This document provides curl examples and a comprehensive test checklist for the Teams & Sharing foundations feature.

## Prerequisites

- Server running at `http://localhost:5001` (or your configured port)
- Valid authentication token (obtain via login)
- User IDs and project/workflow IDs from your database

## Environment Setup

```bash
# Set your auth token and base URL
export TOKEN="your-session-token-here"
export BASE_URL="http://localhost:5001"
export TEAM_ID="team-uuid-here"
export PROJECT_ID="project-uuid-here"
export WORKFLOW_ID="workflow-uuid-here"
export USER_ID="user-uuid-here"
export MEMBER_USER_ID="another-user-uuid-here"
```

---

## 1. TEAMS API Examples

### Create a Team

```bash
curl -X POST "$BASE_URL/api/teams" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "name": "Engineering Team"
  }'

# Expected Response:
# {
#   "success": true,
#   "data": {
#     "id": "<team-id>",
#     "name": "Engineering Team",
#     "createdBy": "<user-id>",
#     "createdAt": "...",
#     "updatedAt": "..."
#   }
# }
```

### List User's Teams

```bash
curl -X GET "$BASE_URL/api/teams" \
  -H "Cookie: connect.sid=$TOKEN"

# Expected Response:
# {
#   "success": true,
#   "data": [
#     {
#       "id": "<team-id>",
#       "name": "Engineering Team",
#       "createdBy": "<user-id>",
#       "memberRole": "admin",
#       ...
#     }
#   ]
# }
```

### Get Team with Members

```bash
curl -X GET "$BASE_URL/api/teams/$TEAM_ID" \
  -H "Cookie: connect.sid=$TOKEN"

# Expected Response:
# {
#   "success": true,
#   "data": {
#     "id": "<team-id>",
#     "name": "Engineering Team",
#     "members": [
#       {
#         "id": "<member-id>",
#         "teamId": "<team-id>",
#         "userId": "<user-id>",
#         "role": "admin",
#         "user": {
#           "id": "<user-id>",
#           "email": "user@example.com",
#           "firstName": "John",
#           "lastName": "Doe"
#         }
#       }
#     ]
#   }
# }
```

### Add Team Member

```bash
curl -X POST "$BASE_URL/api/teams/$TEAM_ID/members" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "userId": "'"$MEMBER_USER_ID"'",
    "role": "member"
  }'

# Expected Response:
# {
#   "success": true,
#   "data": {
#     "id": "<member-id>",
#     "teamId": "<team-id>",
#     "userId": "<member-user-id>",
#     "role": "member",
#     "createdAt": "..."
#   }
# }
```

### Update Team Member Role

```bash
curl -X POST "$BASE_URL/api/teams/$TEAM_ID/members" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "userId": "'"$MEMBER_USER_ID"'",
    "role": "admin"
  }'
```

### Remove Team Member

```bash
curl -X DELETE "$BASE_URL/api/teams/$TEAM_ID/members/$MEMBER_USER_ID" \
  -H "Cookie: connect.sid=$TOKEN"

# Expected Response:
# {
#   "success": true,
#   "message": "Team member removed successfully"
# }
```

### Update Team

```bash
curl -X PUT "$BASE_URL/api/teams/$TEAM_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "name": "Updated Team Name"
  }'
```

### Delete Team

```bash
curl -X DELETE "$BASE_URL/api/teams/$TEAM_ID" \
  -H "Cookie: connect.sid=$TOKEN"

# Expected Response:
# {
#   "success": true,
#   "message": "Team deleted successfully"
# }
```

---

## 2. PROJECT ACL API Examples

### Get Project Access List

```bash
curl -X GET "$BASE_URL/api/projects/$PROJECT_ID/access" \
  -H "Cookie: connect.sid=$TOKEN"

# Expected Response:
# {
#   "success": true,
#   "data": [
#     {
#       "id": "<acl-id>",
#       "projectId": "<project-id>",
#       "principalType": "user",
#       "principalId": "<user-id>",
#       "role": "edit",
#       "createdAt": "..."
#     }
#   ]
# }
```

### Grant Project Access to User

```bash
curl -X PUT "$BASE_URL/api/projects/$PROJECT_ID/access" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "entries": [
      {
        "principalType": "user",
        "principalId": "'"$USER_ID"'",
        "role": "edit"
      }
    ]
  }'

# Expected Response:
# {
#   "success": true,
#   "data": [
#     {
#       "id": "<acl-id>",
#       "projectId": "<project-id>",
#       "principalType": "user",
#       "principalId": "<user-id>",
#       "role": "edit",
#       "createdAt": "..."
#     }
#   ]
# }
```

### Grant Project Access to Team

```bash
curl -X PUT "$BASE_URL/api/projects/$PROJECT_ID/access" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "entries": [
      {
        "principalType": "team",
        "principalId": "'"$TEAM_ID"'",
        "role": "view"
      }
    ]
  }'
```

### Revoke Project Access

```bash
curl -X DELETE "$BASE_URL/api/projects/$PROJECT_ID/access" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "entries": [
      {
        "principalType": "user",
        "principalId": "'"$USER_ID"'"
      }
    ]
  }'

# Expected Response:
# {
#   "success": true,
#   "message": "Access revoked successfully"
# }
```

### Transfer Project Ownership

```bash
curl -X PUT "$BASE_URL/api/projects/$PROJECT_ID/owner" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "userId": "'"$USER_ID"'"
  }'

# Expected Response:
# {
#   "success": true,
#   "data": {
#     "id": "<project-id>",
#     "ownerId": "<new-owner-user-id>",
#     ...
#   }
# }
```

---

## 3. WORKFLOW ACL API Examples

### Get Workflow Access List

```bash
curl -X GET "$BASE_URL/api/workflows/$WORKFLOW_ID/access" \
  -H "Cookie: connect.sid=$TOKEN"

# Expected Response:
# {
#   "success": true,
#   "data": [...]
# }
```

### Grant Workflow Access to User

```bash
curl -X PUT "$BASE_URL/api/workflows/$WORKFLOW_ID/access" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "entries": [
      {
        "principalType": "user",
        "principalId": "'"$USER_ID"'",
        "role": "edit"
      }
    ]
  }'
```

### Grant Workflow Access to Team (Override Project ACL)

```bash
curl -X PUT "$BASE_URL/api/workflows/$WORKFLOW_ID/access" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "entries": [
      {
        "principalType": "team",
        "principalId": "'"$TEAM_ID"'",
        "role": "view"
      }
    ]
  }'
```

### Revoke Workflow Access

```bash
curl -X DELETE "$BASE_URL/api/workflows/$WORKFLOW_ID/access" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "entries": [
      {
        "principalType": "user",
        "principalId": "'"$USER_ID"'"
      }
    ]
  }'

# Expected Response:
# {
#   "success": true,
#   "message": "Access revoked successfully"
# }
```

### Transfer Workflow Ownership

```bash
curl -X PUT "$BASE_URL/api/workflows/$WORKFLOW_ID/owner" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$TOKEN" \
  -d '{
    "userId": "'"$USER_ID"'"
  }'
```

---

## Comprehensive Test Checklist

### ✅ Database Migration

- [ ] Run migration `0004_add_teams_and_acls.sql` successfully
- [ ] Verify `teams` table exists with correct columns
- [ ] Verify `team_members` table exists with correct columns and constraints
- [ ] Verify `project_access` table exists with correct columns and constraints
- [ ] Verify `workflow_access` table exists with correct columns and constraints
- [ ] Verify `projects.owner_id` column exists and is populated
- [ ] Verify `workflows.owner_id` column exists and is populated
- [ ] Check all indexes are created correctly
- [ ] Check all foreign keys are in place

### ✅ Teams Management

- [ ] Create a team (user becomes team admin)
- [ ] List user's teams
- [ ] Get team details with members
- [ ] Add a member to a team (as admin)
- [ ] Update member role from 'member' to 'admin'
- [ ] Remove a team member (as admin)
- [ ] Update team name (as admin)
- [ ] Delete a team (as admin)
- [ ] **Negative test**: Non-admin cannot add/remove members
- [ ] **Negative test**: Cannot remove last admin from team
- [ ] **Negative test**: Non-member cannot view team details

### ✅ Project ACL

- [ ] Owner can grant 'view' access to a user
- [ ] Owner can grant 'edit' access to a user
- [ ] Owner can grant 'owner' access to another user
- [ ] Owner can grant access to a team
- [ ] Get all ACL entries for a project
- [ ] Revoke access from a user
- [ ] Revoke access from a team
- [ ] Transfer project ownership to another user
- [ ] **Negative test**: Non-owner cannot grant access
- [ ] **Negative test**: Non-owner cannot revoke access
- [ ] **Negative test**: Non-owner (even with 'owner' role in ACL) cannot transfer ownership

### ✅ Workflow ACL

- [ ] Owner can grant 'view' access to a user
- [ ] Owner can grant 'edit' access to a user
- [ ] Owner can grant 'owner' access to another user
- [ ] Owner can grant access to a team
- [ ] Get all ACL entries for a workflow
- [ ] Revoke access from a user
- [ ] Revoke access from a team
- [ ] Transfer workflow ownership to another user
- [ ] **Negative test**: Non-owner cannot grant access
- [ ] **Negative test**: Non-owner cannot revoke access

### ✅ Access Resolution & Precedence

- [ ] Owner always has full control (owner > ACL)
- [ ] User with 'edit' role can modify a project
- [ ] User with 'view' role can read but not modify a project
- [ ] User with no access cannot view a project
- [ ] Team member inherits team's ACL role
- [ ] If user has both direct ACL and team ACL, **highest privilege** wins
- [ ] Workflow with no ACL inherits project ACL (fallback)
- [ ] Workflow with explicit ACL **overrides** project ACL
- [ ] Team admin can manage team but not necessarily access shared projects/workflows

### ✅ Edge Cases & Security

- [ ] User cannot create project/workflow without authentication
- [ ] User cannot access another user's private project/workflow
- [ ] Deleted user's ACL entries are removed (cascade)
- [ ] Deleted team's ACL entries are removed (cascade)
- [ ] Granting 'owner' role in ACL does NOT allow ownership transfer (only true owner can)
- [ ] Workflow ACL persists even if project is deleted (projectId set to null)
- [ ] Re-granting access with different role updates existing ACL entry (upsert)
- [ ] Multiple ACL entries can be granted/revoked in a single request

### ✅ Integration Tests

- [ ] Create a team, add members, grant team access to a project
- [ ] Verify all team members can access the project
- [ ] Remove a member from the team
- [ ] Verify removed member loses access to the project
- [ ] Grant workflow-specific ACL that overrides project ACL
- [ ] Verify workflow ACL takes precedence over project ACL
- [ ] Transfer ownership and verify new owner has full control
- [ ] Verify old owner loses ownership (but may retain ACL if granted)

---

## Expected Behavior Summary

| Scenario | Expected Result |
|----------|----------------|
| Owner accesses own project | Full access (owner) |
| User with direct 'edit' ACL | Can modify project |
| User with team 'view' ACL | Can view but not modify |
| User with direct 'edit' + team 'view' | Has 'edit' (highest wins) |
| Workflow with no ACL, project has 'edit' | User inherits 'edit' from project |
| Workflow with 'view' ACL, project has 'edit' | Workflow ACL wins ('view') |
| Non-member tries to access | 403 Forbidden |
| Team admin adds member | Success |
| Team member tries to add member | 403 Forbidden |

---

## Troubleshooting

### Common Issues

1. **403 Forbidden on ACL endpoints**
   - Ensure user is the project/workflow owner
   - Check authentication token is valid

2. **ACL not taking effect**
   - Verify database migration ran successfully
   - Check ACL entry was created in database
   - Verify principalId matches user/team UUID

3. **Team member cannot access shared project**
   - Verify user is actually a member of the team
   - Check team ACL entry exists for the project
   - Verify ACL role is not 'none'

4. **Workflow ACL fallback not working**
   - Ensure workflow.projectId is set
   - Verify no explicit workflow ACL exists (fallback only happens when none exists)

---

## Next Steps (Future Enhancements)

- [ ] Frontend components (Teams page, SharePanel)
- [ ] Email notifications for sharing
- [ ] ACL audit logs
- [ ] Bulk permission management
- [ ] Role templates (e.g., "Viewer", "Contributor", "Admin")
- [ ] Team hierarchies and nested permissions
- [ ] Public link sharing (anyone with link can view)

---

✅ **Vault-Logic Epic 4 — Teams & Sharing foundations implemented, ACLs working for projects and workflows**
