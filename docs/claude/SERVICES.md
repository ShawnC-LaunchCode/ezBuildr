# Services Reference

Map of service classes in `server/services/` (verified July 2026): ~92 top-level files plus subdirectories (`ai/`, `analytics/`, `document/`, `esign/`, `scripting/`, `blockRunners/`, `runs/`, `storage/`, `security/`, and others) — ~185 files total. **Grep `server/services/` for the class before assuming a name here is current.**

Conventions: services export a module-level singleton (`export const fooService = new FooService()`) with optional constructor repo params for tests; tenancy is checked in the service layer via `verifyTenantOwnership`-style methods. See the `add-api-endpoint` skill.

## Workflow Core

| Service | Purpose |
|---------|---------|
| WorkflowService | Workflow CRUD, status management |
| WorkflowContentIngestService | Normalizes structural blueprints |
| SectionService / StepService | Section and step management |
| LogicService | Conditional logic rules |
| VariableService / AliasResolver / AliasRenameService | Step alias management |
| BlockService | Reusable block management |
| WorkflowClonerService / WorkflowExportService / WorkflowBundleService | Clone, export, bundle |
| WorkflowPatchService | Patch-style workflow edits (used by AI edit) |
| WorkflowQualityValidator | Workflow quality checks |
| VersionService / SnapshotService | Version history, test-data snapshots |

## Execution & Runtime

| Service | Purpose |
|---------|---------|
| RunService | Run lifecycle management |
| RunRuntimeService | Authorized, sanitized runtime definition pinned to a run version |
| RunDataService | Canonical run data views: step-id keyed for runtime logic, alias-keyed for document generation |
| BlockRunner + `blockRunners/*` | Execute workflow blocks (per-type runner classes) |
| TransformBlockService | JS/Python transform execution |
| IntakeService / IntakeNavigationService / IntakeQuestionVisibilityService | Intake flow, navigation, real-time visibility |
| IntakeReceiptService | Intake receipts |
| RepeaterService | Repeating sections |
| QueryService / QueryBlockService | Data queries |
| ListToolsBlockService / ReadTableBlockService | DataVault-backed blocks |
| WritebackExecutionService | Workflow → DataVault writeback |

## Custom Scripting (`scripting/`)

| Service | Purpose |
|---------|---------|
| ScriptEngine | Unified JS/Python orchestrator |
| HelperLibrary | 40+ sandboxed utility functions |
| ScriptContext | Context injection |
| LifecycleHookService / DocumentHookService | Hook management |

## DataVault

| Service | Purpose |
|---------|---------|
| DatavaultDatabasesService / DatavaultTablesService / DatavaultColumnsService / DatavaultRowsService | Core CRUD |
| DatavaultRowNotesService | Row comments |
| DatavaultTablePermissionsService | Table permissions (role enum) |
| DatavaultAclService | Database/table ACLs |
| DatavaultApiTokensService | API tokens |
| TransferService | Database ownership transfer |

## Documents (`document/`)

| Service | Purpose |
|---------|---------|
| DocumentEngine / EnhancedDocumentEngine | Document generation (the legacy `DocumentGenerationService`, `docxRenderer`, `docxRenderer2` are **deleted** — see `server/services/document/README.md`) |
| DocumentTemplateService | Template management |
| FinalBlockRenderer | Final block rendering |
| TemplateParser / TemplateScanner / MappingInterpreter / VariableNormalizer | Template variable pipeline |
| PdfConverter / ZipBundler | PDF conversion, bundling |

## E-Signature (`esign/`)

| Service | Purpose |
|---------|---------|
| SignatureBlockService | Signature block handling |
| EsignProvider / DocusignProvider | Provider interface + DocuSign |
| SignatureRequestService / EnvelopeBuilder | Requests, envelopes |

## AI (`ai/` + top-level)

| Service | Purpose |
|---------|---------|
| AIService | Multi-provider orchestration |
| ai/ModelRegistry + ai/providers/* | AnthropicProvider, OpenAIProvider, ProviderFactory |
| GeminiService | Google Gemini |
| AiSettingsService | Tenant AI settings |
| WorkflowOptimizationService | Optimization wizard backend |
| TemplateAnalysisService | Template analysis / AI binding |

## Analytics (`analytics/` + top-level)

AnalyticsService, DropoffService, BranchingService, AggregationService, HeatmapService, MetricsService, TemplateAnalyticsService.

## Auth & Security

| Service | Purpose |
|---------|---------|
| AuthService | JWT, sessions, refresh tokens |
| MfaService | TOTP MFA, backup codes |
| AccountLockoutService | Brute-force lockout |
| AclService | Access control lists |
| AuditLogService | Audit trail |
| CaptchaService | CAPTCHA verification |
| PortalAuthService / PortalService | Portal magic-link auth |
| PlaceholderUserCleanupService | Cleanup job |

## Integrations

Connections, secrets, and OAuth2 are lowercase **module files**, not PascalCase classes: `connections.ts` / `externalConnections.ts`, `secrets.ts`, `oauth2.ts`. Also: ExternalDestinationService, GooglePlacesService, EmailQueueService.

## Templates

TemplateService, TemplateTestService, TemplateVersionService, TemplateValidationService, TemplatePreviewService, WorkflowTemplateService.

## Business & Utility

ProjectService, TeamService, OrganizationService, AdminOrgStatsService, AdminUserService (transactional admin account deletion), ReviewTaskService (orphaned — its routes were removed), BrandingService, DataSourceService, RandomizerService, ActivityLogService, emailService (SendGrid), fileService, FileStorageService, StorageQuotaService, UserPreferencesService, AccountService, EmailTemplateMetadataService, CollectionService/CollectionFieldService/RecordService (legacy).

## Removed — do not reference

`DocumentGenerationService`, `docxRenderer`, `docxRenderer2`, `TemplateSharingService`, `TemplateInsertionService`, `PdfQueueService`, and the graph execution engine (removed with the graph builder, 2026).
