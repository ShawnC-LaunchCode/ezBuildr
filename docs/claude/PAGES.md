# Frontend Pages Reference

Complete reference for all 30+ frontend pages with routes and features.

## Authentication & Landing

| Page | Route | Purpose |
|------|-------|---------|
| Landing Page | `/` | Public homepage, unauthenticated users |
| Login Page | `/login` | Google OAuth2 authentication |
| Dashboard | `/dashboard` | Main hub after login, workflow overview |

## Workflow Management

| Page | Route | Purpose |
|------|-------|---------|
| Workflows List | `/workflows` | Browse all workflows with filters |
| New Workflow | `/workflows/new` | Create new workflow |
| Workflow Builder | `/workflows/:id/build` | 5-tab builder interface |
| Visual Workflow Builder | `/workflows/:id/visual` | React Flow canvas editor |
| Workflow Preview | `/workflows/:id/preview` | In-memory preview mode |
| Workflow Analytics | `/workflows/:id/analytics` | Funnel, dropoff, trends |

### Workflow Builder Tabs
- **Sections Tab** - Manage pages/sections
- **Templates Tab** - Insert reusable templates
- **Data Sources Tab** - Configure DataVault connections
- **Settings Tab** - Workflow properties
- **Snapshots Tab** - Save/restore test data

## Workflow Execution

| Page | Route | Purpose |
|------|-------|---------|
| Workflow Runner | `/workflows/:id/run` | Participant completion view |
| Public Runner | `/w/:slug` | Public workflow access (no login) |
| Intake Preview | `/workflows/:id/intake` | Branded intake form preview |
| Runs Dashboard | `/runs` | List all completed/in-progress runs |
| Run Details | `/runs/:id` | View specific run (trace, inputs, outputs, logs) |
| Run Comparison | `/runs/compare` | Compare multiple runs side-by-side |
| Shared Run View | `/share/:token` | Public share view of completed runs |

## DataVault (Data Management)

| Page | Route | Purpose |
|------|-------|---------|
| DataVault Dashboard | `/datavault` | Home, database overview |
| Databases | `/datavault/databases` | List/create databases |
| Database Details | `/datavault/databases/:id` | View tables in database |
| Database Settings | `/datavault/databases/:id/settings` | Permissions, columns |
| Tables List | `/datavault/tables` | All tables across projects |
| Table View | `/datavault/tables/:id` | Data grid with infinite scroll, filtering |
| Collections | `/datavault/collections` | Legacy data structure (deprecated) |

## Templates & Marketplace

| Page | Route | Purpose |
|------|-------|---------|
| Templates | `/templates` | Browse, create, share templates |
| Marketplace | `/marketplace` | Discover shared templates |
| Template Test Runner | `/templates/:id/test` | Test with sample data |
| Template Upload | `/templates/upload` | Import templates |

## Integrations & Settings

| Page | Route | Purpose |
|------|-------|---------|
| Connections | `/connections` | API connections, OAuth2 setup |
| Branding Settings | `/branding` | Custom domains, colors, logos |
| Domain List | `/domains` | Custom domain management |
| Email Templates | `/email-templates` | Email template editor |
| Settings | `/settings` | User preferences |

## Portal System

| Page | Route | Purpose |
|------|-------|---------|
| Portal Login | `/portal/login` | Magic link authentication |
| Portal Magic Link | `/portal/verify/:token` | Verify magic link |
| Portal Dashboard | `/portal/dashboard` | Run history for portal users |

## Teams & Collaboration

| Page | Route | Purpose |
|------|-------|---------|
| Teams | `/teams` | Team management, member invitations |
| Team Details | `/teams/:id` | Team members, permissions |
| Project Access | `/projects/:id/access` | Project permissions |

## Admin & Enterprise

| Page | Route | Purpose |
|------|-------|---------|
| Admin Dashboard | `/admin` | System overview |
| Admin Users | `/admin/users` | User management |
| Admin Logs | `/admin/logs` | Audit trail |
| Billing Dashboard | `/billing` | Subscription management |
| Pricing Page | `/pricing` | Plan comparison |
