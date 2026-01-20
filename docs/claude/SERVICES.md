# Services Reference

Complete reference for all 90+ service classes organized by domain.

## Workflow Core Services

| Service | Purpose |
|---------|---------|
| WorkflowService | Workflow CRUD, status management |
| SectionService | Section management, ordering |
| StepService | Step CRUD, type handling |
| RunService | Run creation, execution |
| LogicService | Conditional logic rules |
| VariableService | Step alias management |
| BlockService | Reusable block management |
| WorkflowClonerService | Workflow cloning |
| WorkflowExportService | Export workflows |
| WorkflowBundleService | Bundle workflows |
| VersionService | Version history |
| SnapshotService | Test data snapshots |

## Execution & Runtime Services

| Service | Purpose |
|---------|---------|
| RunService | Run lifecycle management |
| BlockRunner | Execute workflow blocks |
| IntakeService | Intake form processing |
| TransformBlockService | JS/Python code execution |
| QueryBlockService | Query execution |
| IntakeNavigationService | Section navigation |
| IntakeQuestionVisibilityService | Real-time visibility |
| RepeaterService | Repeating sections |
| QueryService | Data queries |

## Custom Scripting Services

| Service | Purpose |
|---------|---------|
| ScriptEngine | Unified JS/Python orchestrator |
| HelperLibrary | 40+ utility functions |
| ScriptContext | Context injection |
| LifecycleHookService | Lifecycle hook management |
| DocumentHookService | Document hook management |
| LifecycleHookRepository | Lifecycle hook data access |
| DocumentHookRepository | Document hook data access |
| ScriptExecutionLogRepository | Execution audit logging |

## DataVault Services

| Service | Purpose |
|---------|---------|
| DatavaultDatabasesService | Database CRUD |
| DatavaultTablesService | Table CRUD |
| DatavaultColumnsService | Column management |
| DatavaultRowsService | Row CRUD, pagination |
| DatavaultRowNotesService | Row comments |
| DatavaultTablePermissionsService | Access control |
| DatavaultApiTokensService | API token management |

## Document Generation Services

| Service | Purpose |
|---------|---------|
| DocumentGenerationService | Generate documents |
| DocumentTemplateService | Template management |
| DocumentEngine | Core document engine |
| EnhancedDocumentEngine | Advanced features |
| FinalBlockRenderer | Final block rendering |
| TemplateParser | Parse templates |
| TemplateScanner | Scan for variables |
| MappingInterpreter | Variable mapping |
| VariableNormalizer | Normalize variables |
| PdfConverter | PDF conversion |
| ZipBundler | Bundle documents |
| docxRenderer | DOCX rendering |
| docxRenderer2 | Enhanced DOCX rendering |

## E-Signature Services

| Service | Purpose |
|---------|---------|
| SignatureBlockService | Signature block handling |
| EsignProvider | E-signature provider interface |
| DocusignProvider | DocuSign integration |
| SignatureRequestService | Signature request management |
| EnvelopeBuilder | Build signing envelopes |

## AI & Optimization Services

| Service | Purpose |
|---------|---------|
| AIService | Multi-provider AI (OpenAI, Anthropic, Gemini) |
| GeminiService | Google Gemini integration |
| WorkflowOptimizationService | Workflow optimization |
| TemplateAnalysisService | Template analysis |

## Analytics & Reporting Services

| Service | Purpose |
|---------|---------|
| AnalyticsService | Overview metrics |
| DropoffService | Funnel/dropoff analysis |
| BranchingService | Conditional flow analysis |
| AggregationService | Data aggregation |
| HeatmapService | Heatmap generation |

## Collections Services (Legacy)

| Service | Purpose |
|---------|---------|
| CollectionService | Collection CRUD |
| CollectionFieldService | Field management |
| RecordService | Record CRUD |

## Integration & Connection Services

| Service | Purpose |
|---------|---------|
| ConnectionService | API connection management |
| SecretService | Encrypted secret storage |
| OAuth2Service | OAuth2 flow handling |
| ExternalDestinationService | External destinations |
| GooglePlacesService | Google Places API |
| WebhookService | Webhook management |

## Authentication & Security Services

| Service | Purpose |
|---------|---------|
| AuthService | JWT, session management |
| AclService | Access control lists |
| CaptchaService | CAPTCHA verification |
| PortalAuthService | Portal authentication |
| PortalService | Portal user management |

## Template & Sharing Services

| Service | Purpose |
|---------|---------|
| TemplateService | Template CRUD |
| TemplateSharingService | Template sharing |
| TemplateTestService | Template testing |
| WorkflowTemplateService | Workflow template management |
| TemplateInsertionService | Insert templates into workflows |

## Business Logic Services

| Service | Purpose |
|---------|---------|
| ProjectService | Project management |
| TeamService | Team management |
| ReviewTaskService | Review task handling |
| BrandingService | Branding configuration |
| DataSourceService | Data source management |
| RandomizerService | Randomization logic |

## Utility Services

| Service | Purpose |
|---------|---------|
| ActivityLogService | Activity logging |
| emailService | Email sending (SendGrid) |
| fileService | File upload/management |
| UserPreferencesService | User preferences |
| AccountService | Account management |
| PdfQueueService | PDF generation queue |
