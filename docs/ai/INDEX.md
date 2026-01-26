# AI Features Documentation

ezBuildr's AI-powered workflow generation system documentation.

## Quick Links

| Document | Audience | Description |
|----------|----------|-------------|
| [User Guide](./USER_GUIDE.md) | End Users | How to use AI features in the app |
| [Architecture](./ARCHITECTURE.md) | Developers | System design and components |
| [API Reference](./API_REFERENCE.md) | Developers | Complete API documentation |
| [Troubleshooting](./TROUBLESHOOTING.md) | All | Common issues and solutions |

## Feature Overview

### Workflow Generation
Create complete workflows from natural language descriptions. AI generates sections, steps, field types, and even logic rules.

### Iterative Quality Improvement
Automatic refinement loop that improves workflow quality until targets are met or cost limits reached.

### Conversational Revision
Modify existing workflows through chat-like interface. Describe changes in plain English.

### Logic Generation
Create conditional visibility and validation rules from natural language instructions.

### Quality Scoring
6-dimensional quality assessment (aliases, types, structure, UX, completeness, validation) with actionable feedback.

## Key Files

### Services
- `server/services/AIService.ts` - Main facade
- `server/services/ai/WorkflowGenerationService.ts` - Creates workflows
- `server/services/ai/WorkflowRevisionService.ts` - Modifies workflows
- `server/services/ai/IterativeQualityImprover.ts` - Auto-refinement
- `server/services/WorkflowQualityValidator.ts` - Quality scoring
- `server/services/AliasResolver.ts` - Alias-to-ID resolution

### Types
- `shared/types/ai.ts` - TypeScript/Zod schemas

### Routes
- `server/routes/ai.routes.ts` - API endpoints
