# Features & Security Reference

Feature status, security details, and recent architecture changes.

## Complete Features (Production Ready)

| Feature | Description |
|---------|-------------|
| **Visual Workflow Builder** | 5-tab navigation, drag-and-drop, React Flow canvas, inspector panel |
| **15+ Question Types** | Text, email, phone, number, currency, address, choice, scale, date, time, signature, file upload, display, multi-field, computed |
| **DataVault** | Complete data platform: databases, tables, rows, 7 column types, infinite scroll, permissions, API tokens, row notes |
| **Custom Scripting System** | Lifecycle hooks (4 phases) + document hooks (2 phases), 40+ helper functions, JS/Python, script console |
| **Two-Tier Visibility Logic** | Workflow rules + step-level `visibleIf` expressions with real-time evaluation |
| **Transform Blocks** | Sandboxed JS/Python execution, virtual steps, test playground, graph view |
| **Step Aliases** | Human-friendly variable names for logic and transforms |
| **Run Token Authentication** | Bearer token + JWT + session auth, anonymous runs, portal magic links |
| **Conditional Logic** | Show/hide/require/skip sections, 8+ operators, visual editor |
| **Default Values** | Pre-fill with defaults, URL parameter override |
| **HTTP/API Integration** | Full REST client, OAuth2 (Client Credentials + 3-legged), webhooks |
| **Secrets Management** | AES-256-GCM encrypted storage, LRU cache |
| **Review Gates** | Human-in-the-loop approval, assign to users/teams |
| **E-Signature** | DocuSign, HelloSign, native signatures, signing portals |
| **Document Generation** | PDF/DOCX generation, template variables, repeating sections, AI binding |
| **AI-Powered Features** | Workflow generation (OpenAI/Anthropic/Gemini), suggestions, optimization, template binding |
| **Templates & Marketplace** | Reusable templates, sharing, marketplace, test runner, import/export |
| **Advanced Analytics** | Funnel analysis, dropoff tracking, heatmaps, branching analysis, export (JSON/CSV/PDF) |
| **Portal System** | Magic link authentication, external user access, run tracking |
| **Multi-Tenant Workspaces** | Tenants, organizations, workspaces, resource permissions |
| **Team Collaboration** | Teams, roles, project/workflow access control, invitations |
| **Versioning & Snapshots** | Version history, publish workflow, diff viewer, restore, test data snapshots |
| **Real-time Collaboration** | Live presence, cursors, comments on steps, activity logs |
| **Billing Integration** | Stripe subscriptions, plans, usage metering, seat management |
| **Branding & Customization** | Custom colors, logos, domains, white-label intake forms, email templates |
| **Admin & Audit** | Admin dashboard, user management, comprehensive audit logs, system diagnostics |

## In Progress

- **Advanced Analytics Dashboards** - Enhanced visualizations and reporting
- **DataVault-Workflow Integration** - Use DataVault as dynamic data source in workflows

## Planned Features

| Feature | Target | Description |
|---------|--------|-------------|
| Enhanced Versioning | Q1 2026 | Branch management, merge conflicts, change tracking |
| Integration Marketplace | Q2 2026 | Third-party integrations ecosystem, plugin system |
| Advanced Personalization | Q2 2026 | AI-powered user personalization, adaptive workflows |
| Mobile Builder App | Q3 2026 | Native mobile app for workflow building |

---

## Security Features

### Scripting System Sandboxing

**JavaScript (vm2/vm):**
- No access to: `require`, `process`, `Buffer`, `global`, timers
- Only `input`, `context`, and `helpers` objects available
- `emit()` function for output
- Timeout enforced (100-3000ms configurable)
- Code size limit: 32KB
- Output size limit: 64KB

**Python (subprocess):**
- Isolated subprocess execution
- Restricted builtins (no `os`, `sys`, `open`, `subprocess`, `socket`)
- No file system or network access
- Timeout with process termination
- Max output: 64KB

**Helper Library Security:**
- HTTP requests proxied through backend (URL whitelist validation)
- No direct network access from sandbox
- Console capture instead of native console
- Date/math operations use safe libraries (date-fns)
- All helpers designed to prevent code injection

**Script Execution Security:**
- Input/output key whitelisting (explicit allowlists)
- Non-breaking error handling (workflows continue on script failure)
- Execution audit logging (all scripts logged with performance metrics)
- Workflow ownership validation (only owners can create/modify hooks)
- Rate limiting on test endpoints (10 req/min)

### General Security

- Google OAuth2 + JWT authentication
- Session management (PostgreSQL store)
- AES-256-GCM secrets encryption with master key
- CORS configuration
- Zod input validation
- Drizzle ORM (SQL injection protection)
- Rate limiting (10 req/min on test endpoints)
- File upload limits (10MB, MIME validation)

---

## Recent Architecture Changes

### Custom Scripting System - Prompt 12 (Dec 7, 2025)
Comprehensive scripting infrastructure with lifecycle hooks (beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated) and document hooks (beforeGeneration, afterGeneration). Features 40+ helper functions, context injection, console capture, mutation mode, and script console for debugging.

### DataVault v4 (Nov 18-26, 2025)
Complete data management platform with databases, tables, permissions, API tokens, and row comments. 7 column types, infinite scroll, advanced filtering, optimistic updates.

### Visibility Logic Builder (Nov 25, 2025)
Two-tier visibility system with workflow rules + step-level `visibleIf` expressions. React hook for real-time evaluation.

### JWT Auth Improvements (Nov 24, 2025)
New JWT token endpoint, cleaner auth patterns (`AuthRequest.userId` interface), better TypeScript typing.

### Default Values & URL Parameters (Nov 25, 2025)
Steps support `defaultValue` (JSONB), overridable via URL params for deep linking and testing.

### Integrations Hub - Stage 16 (Nov 13, 2025)
Unified connection model with OAuth2 3-legged flow, webhook node, connection health tracking.

### AI-Assisted Builder - Stage 15 (Nov 13, 2025)
Workflow generation from natural language, improvement suggestions, template variable binding with semantic matching.

### Review & E-Signature - Stage 14 (Nov 13, 2025)
Human-in-the-loop workflows with review gates, native e-signature support, token-based signing portals.

### HTTP/Secrets - Stage 9 (Nov 12, 2025)
Full HTTP/API node with OAuth2 Client Credentials, AES-256-GCM secrets encryption, LRU caching.

### Virtual Steps - Stage 8 (Nov 11, 2025)
Transform block outputs persisted via virtual steps with proper UUIDs, step aliases for variables.

### Survey System Removal (Nov 16, 2025)
Complete removal of legacy survey UI (67 files, ~11,763 LOC). ezBuildr is now 100% workflow-focused.

### Builder Navigation Overhaul (Nov 14-17, 2025)
5-tab navigation (Sections, Settings, Templates, Data Sources, Snapshots), mobile-responsive, template test runner.

---

## Version History

- **v1.7.0** (Dec 26, 2025) - Custom Scripting System (Lifecycle & Document Hooks)
- **v1.6.0** (Nov 26, 2025) - DataVault v4 + Visibility Logic Builder
- **v1.5.0** (Nov 17, 2025) - Survey Removal + Navigation Overhaul
