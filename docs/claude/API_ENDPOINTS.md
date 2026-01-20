# API Endpoints Reference

Complete reference for all 66+ API route files organized by domain.

## Workflows & Structure

```
GET/POST    /api/workflows                    # List/Create workflows
GET/PUT/DEL /api/workflows/:id                # CRUD operations
PATCH       /api/workflows/:id/status         # Update status (draft/active/archived)
GET         /api/workflows/:id/variables      # Get step aliases
POST        /api/workflows/:id/publish        # Publish new version
POST        /api/workflows/:id/clone          # Clone workflow

POST        /api/workflows/:id/sections       # Create section
PUT/DELETE  /api/sections/:id                 # Update/Delete section
PUT         /api/workflows/:id/sections/reorder # Reorder sections

POST        /api/workflows/:wid/sections/:sid/steps # Create step
PUT/DELETE  /api/steps/:id                    # Update/Delete step
PUT         /api/workflows/:id/steps/reorder  # Reorder steps
```

## Workflow Execution (Bearer Token or Session Auth)

```
POST        /api/workflows/:id/runs           # Create run (returns runToken)
GET         /api/runs/:id                     # Get run details
GET/POST    /api/runs/:id/values              # Get/Save step values
POST        /api/runs/:id/values/bulk         # Bulk save values
POST        /api/runs/:id/sections/:sid/submit # Submit section
POST        /api/runs/:id/next                # Navigate to next section
PUT         /api/runs/:id/complete            # Complete run (triggers transforms)
GET         /api/runs/:id/trace               # Get execution trace
GET         /api/runs                         # List runs (with filters)
```

## Blocks & Code Execution

```
GET/POST    /api/workflows/:id/blocks         # List/Create blocks
PUT/DELETE  /api/blocks/:id                   # Update/Delete block
POST        /api/blocks/:id/test              # Test block execution

GET/POST    /api/workflows/:id/transform-blocks # Transform blocks
PUT/DELETE  /api/transform-blocks/:id         # Update/Delete
POST        /api/transform-blocks/:id/test    # Test with sample data
```

## Lifecycle & Document Hooks

```
# Lifecycle Hooks (4 phases)
GET/POST    /api/workflows/:workflowId/lifecycle-hooks # List/Create hooks
PUT/DELETE  /api/lifecycle-hooks/:hookId      # Update/Delete hook
POST        /api/lifecycle-hooks/:hookId/test # Test hook with sample data

# Document Hooks (2 phases)
GET/POST    /api/workflows/:workflowId/document-hooks # List/Create hooks
PUT/DELETE  /api/document-hooks/:hookId       # Update/Delete hook
POST        /api/document-hooks/:hookId/test  # Test hook with sample data

# Script Console (Execution Logs)
GET/DELETE  /api/runs/:runId/script-console   # Get/Clear execution logs
```

## DataVault (Complete Data Platform)

```
# Databases
GET/POST    /api/projects/:id/databases       # List/Create databases
GET/PUT/DEL /api/databases/:id                # CRUD databases
POST        /api/databases/:id/archive        # Archive database

# Tables & Rows
GET/POST    /api/databases/:id/tables         # List/Create tables
GET/PUT/DEL /api/tables/:id                   # CRUD tables
GET/POST    /api/tables/:id/rows              # List/Create rows (infinite scroll)
PUT/DELETE  /api/tables/:id/rows/:rowId       # Update/Delete row
POST        /api/tables/:id/rows/bulk         # Bulk operations

# Permissions & API Tokens
GET/POST    /api/tables/:id/permissions       # Table permissions
POST        /api/projects/:id/api-tokens      # Create API token
GET         /api/projects/:id/api-tokens      # List tokens
POST        /api/projects/:id/api-tokens/:tid/revoke # Revoke token

# Row Notes
GET/POST    /api/tables/:tid/rows/:rid/notes  # Row comments
```

## Logic & Visibility

```
GET/POST    /api/workflows/:id/logic          # List/Create logic rules
PUT/DELETE  /api/logic/:id                    # Update/Delete rule
POST        /api/workflows/:id/logic/validate # Validate logic
```

## Connections & Integrations

```
GET/POST    /api/projects/:id/connections     # List/Create connections
PATCH/DEL   /api/projects/:id/connections/:cid # Update/Delete connection
POST        /api/projects/:id/connections/:cid/test # Test connection
GET         /api/connections/oauth/start      # Start OAuth2 flow (3-legged)
GET         /api/connections/oauth/callback   # OAuth2 callback handler

GET/POST    /api/projects/:id/secrets         # Encrypted secrets
DELETE      /api/secrets/:id                  # Delete secret

POST        /api/webhooks                     # Create webhook subscription
GET         /api/webhooks/:id                 # Get webhook details
```

## AI-Powered Features

```
POST        /api/ai/workflows/generate        # Generate workflow from description
POST        /api/ai/workflows/:id/suggest     # Suggest improvements
POST        /api/ai/workflows/:id/optimize    # Optimize workflow structure
POST        /api/ai/templates/:tid/bindings   # AI template variable binding
POST        /api/ai/transform/generate        # Generate transform block code
POST        /api/ai/personalization/:wid      # Personalization suggestions
```

## Templates & Marketplace

```
GET/POST    /api/templates                    # List/Create templates
GET/PUT/DEL /api/templates/:id                # CRUD templates
POST        /api/templates/:id/share          # Share template
GET         /api/templates/:id/test           # Test template
POST        /api/templates/:id/insert         # Insert into workflow
GET         /api/marketplace                  # Browse marketplace
GET         /api/marketplace/:id              # Get marketplace item
```

## Document Generation & E-Signature

```
# Documents
GET/POST    /api/workflows/:id/documents      # Document templates
PUT/DELETE  /api/documents/:id                # Update/Delete template
POST        /api/documents/:id/generate       # Generate document
GET         /api/runs/:rid/documents          # Get run documents

# E-Signature
POST        /api/signatures/request           # Create signature request
GET         /api/signatures/:id               # Get request status
POST        /api/signatures/:id/sign          # Sign document (portal)
GET         /api/signatures/:id/download      # Download signed document

# Review Gates
POST        /api/reviews                      # Create review task
GET         /api/reviews/:id                  # Get review task
POST        /api/reviews/:id/approve          # Approve
POST        /api/reviews/:id/reject           # Reject
```

## Analytics & Reporting

```
GET         /api/workflows/:id/analytics      # Overview analytics
GET         /api/workflows/:id/analytics/funnel # Funnel analysis
GET         /api/workflows/:id/analytics/trends # Response trends
GET         /api/workflows/:id/analytics/heatmap # Field-level heatmap
GET         /api/workflows/:id/analytics/branching # Branching analysis
GET         /api/workflows/:id/export/json    # Export JSON
GET         /api/workflows/:id/export/csv     # Export CSV
GET         /api/workflows/:id/export/pdf     # Export PDF
```

## Portal & External Access

```
POST        /api/portal/login                 # Magic link login
GET         /api/portal/verify/:token         # Verify magic link
GET         /api/portal/runs                  # Portal user runs
POST        /api/portal/runs/:id/resume       # Resume workflow

# Public Access
GET         /api/public/workflows/:slug       # Public workflow access
POST        /api/public/workflows/:slug/runs  # Create anonymous run
```

## Teams & Collaboration

```
GET/POST    /api/teams                        # List/Create teams
GET/PUT/DEL /api/teams/:id                    # CRUD teams
POST        /api/teams/:id/members            # Add member
DELETE      /api/teams/:tid/members/:uid      # Remove member
GET/POST    /api/projects/:pid/access         # Project access control
GET/POST    /api/workflows/:wid/access        # Workflow access control
```

## Versioning & Snapshots

```
GET         /api/workflows/:id/versions       # List versions
GET         /api/workflows/:id/versions/:vid  # Get version
POST        /api/workflows/:id/versions/:vid/restore # Restore version
GET/POST    /api/workflows/:id/snapshots      # Snapshots (test data)
DELETE      /api/snapshots/:id                # Delete snapshot
```

## Admin & System

```
GET         /api/admin/users                  # List users
POST        /api/admin/users/:id/set-admin    # Set admin status
GET         /api/admin/logs                   # Audit logs
GET         /api/admin/stats                  # System stats
POST        /api/admin/diagnostics            # Run diagnostics

GET         /api/account                      # User account
PUT         /api/account                      # Update account
GET/PUT     /api/preferences                  # User preferences
```

## Billing & Enterprise

```
GET         /api/billing/subscription         # Get subscription
POST        /api/billing/subscription         # Create subscription
PUT         /api/billing/subscription         # Update subscription
POST        /api/billing/portal               # Stripe portal session
GET         /api/billing/usage                # Usage metrics
```

## Branding & Customization

```
GET/PUT     /api/branding/:projectId          # Branding settings
POST        /api/branding/:projectId/logo     # Upload logo
GET/POST    /api/branding/:projectId/domains  # Custom domains
GET/POST    /api/email-templates              # Email templates
```
