# VaultLogic Documentation Index

Welcome to the VaultLogic documentation! This index provides an organized overview of all available documentation.

**Last Updated:** January 19, 2026

---

## Getting Started

- [README](../README.md) - Project overview, quick start, setup instructions
- [CLAUDE.md](../CLAUDE.md) - Architecture quick reference (Claude-optimized)
- [Developer Reference](reference/DEVELOPER_REFERENCE.md) - Technical architecture guide

---

## API Documentation

- [API Reference](api/API.md) - Complete workflow API endpoints
- [API Documentation](api/API_DOCUMENTATION.md) - Additional API details
- [Block Framework](api/BLOCKS.md) - Block types and examples
- [Transform Blocks](api/TRANSFORM_BLOCKS.md) - JS/Python code blocks

---

## Development Guides

### Authentication
- [Auth System](guides/AUTH_SYSTEM.md) - Full auth architecture (JWT, MFA, sessions, audit)
- [Run Token Auth](guides/AUTHENTICATION.md) - Workflow run authentication

### Features
- [Frontend Guide](guides/FRONTEND.md) - Frontend setup and architecture
- [Step Aliases](guides/STEP_ALIASES.md) - Variable naming system
- [Workflow Enhancements](guides/WORKFLOW_ENHANCEMENTS.md) - Skip logic, navigation
- [Variables in Documents](guides/VARIABLES_IN_DOCUMENTS.md) - Template variables
- [E-Signature Integration](guides/ESIGNATURE_INTEGRATION.md) - DocuSign, HelloSign
- [Easy/Advanced Mode](guides/EASY_ADVANCED_MODE.md) - Mode implementation
- [Autonumber Guide](guides/AUTONUMBER_FRONTEND_GUIDE.md) - Autonumber columns
- [Choice Lists](guides/CHOICE_LIST_OPTIONS.md) - Choice list configuration

### Database
- [Drizzle Upsert](guides/DRIZZLE_UPSERT_QUICK_REFERENCE.md) - Upsert patterns
- [Drizzle Upsert Index](guides/DRIZZLE_UPSERT_INDEX.md) - ORM indexing
- [OnConflict Expressions](guides/DRIZZLE_ONCONFLICT_WITH_EXPRESSIONS.md) - Advanced upserts

---

## Custom Scripting System

- [Overview](scripting/overview.md) - Scripting system introduction
- [Lifecycle Hooks](scripting/lifecycle-hooks.md) - 4 workflow phases
- [Document Hooks](scripting/document-hooks.md) - 2 document phases
- [Helper Library](scripting/helper-library.md) - 40+ utility functions
- [Script Context](scripting/script-context.md) - Context object reference
- [Data Flow](scripting/data-flow.md) - Data flow patterns
- [Debugging](scripting/debugging.md) - Script console, logging
- [Examples](scripting/examples.md) - Code examples

---

## Architecture & Design

- [Shared Components](architecture/SHARED_COMPONENTS.md) - UI component library
- [Step Aliases Architecture](architecture/STEP_ALIASES_ARCHITECTURE.md) - Aliases deep dive
- [Error Handling](architecture/ERROR_HANDLING.md) - Error middleware

---

## Testing

- [Testing Framework](testing/TESTING.md) - Vitest + Playwright overview
- [Testing Strategy](testing/TESTING_STRATEGY.md) - Testing approach
- [Test Improvements](testing/TESTING_IMPROVEMENTS_DEC_2025.md) - Recent improvements

---

## Deployment

- [CI/CD Setup](deployment/CI_CD_SETUP.md) - GitHub Actions, Railway

---

## Troubleshooting

- [Common Issues](troubleshooting/TROUBLESHOOTING.md) - General troubleshooting
- [OAuth Issues](troubleshooting/OAUTH_TROUBLESHOOTING.md) - OAuth debugging
- [DataVault Fixes](troubleshooting/DATAVAULT_TABLE_CREATION_FIX.md) - DataVault issues
- [Slack Bot Setup](troubleshooting/SLACK_BOT_SETUP.md) - Slack notifications

---

## Reference

- [Developer Reference](reference/DEVELOPER_REFERENCE.md) - Comprehensive guide
- [User Stories](reference/USER_STORIES.md) - Feature user stories
- [Shared Quick Reference](reference/SHARED_QUICK_REFERENCE.md) - Shared utilities
- [Metrics Reference](reference/METRICS_QUICK_REFERENCE.md) - Metrics system
- [Teams & Sharing](reference/EPIC4_TEAMS_SHARING_TESTING.md) - Teams API

---

## Claude-Optimized References

Detailed reference docs optimized for Claude:

- [Schema Reference](claude/SCHEMA.md) - All 80+ database tables
- [API Endpoints](claude/API_ENDPOINTS.md) - All routes by domain
- [Services Reference](claude/SERVICES.md) - 90+ service classes
- [Frontend Pages](claude/PAGES.md) - 30+ pages with routes
- [Features & Security](claude/FEATURES.md) - Status, security, changelog

---

## Examples

- [Fee Waiver Demo](examples/FEE_WAIVER_DEMO_README.md) - Demo workflow
- [Upsert Examples](examples/UPSERT_EXAMPLES.md) - Database examples

---

## Documentation Structure

```
docs/
├── INDEX.md                    # This file
├── api/                        # API reference
├── architecture/               # Architecture decisions
├── claude/                     # Claude-optimized references
├── deployment/                 # Deployment guides
├── examples/                   # Code examples
├── guides/                     # Feature guides
├── reference/                  # Reference materials
├── scripting/                  # Custom scripting docs
├── testing/                    # Testing documentation
├── troubleshooting/            # Troubleshooting guides
└── archive/                    # Historical docs
```

---

## Quick Links by Role

### New Developers
1. [README](../README.md)
2. [CLAUDE.md](../CLAUDE.md)
3. [Developer Reference](reference/DEVELOPER_REFERENCE.md)

### Frontend Developers
1. [Frontend Guide](guides/FRONTEND.md)
2. [Shared Components](architecture/SHARED_COMPONENTS.md)
3. [API Reference](api/API.md)

### Backend Developers
1. [API Reference](api/API.md)
2. [Auth System](guides/AUTH_SYSTEM.md)
3. [Error Handling](architecture/ERROR_HANDLING.md)

### DevOps
1. [CI/CD Setup](deployment/CI_CD_SETUP.md)
2. [Troubleshooting](troubleshooting/TROUBLESHOOTING.md)
