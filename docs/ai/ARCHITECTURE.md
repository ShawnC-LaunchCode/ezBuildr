# AI System Architecture

This document provides a comprehensive overview of ezBuildr's AI-powered workflow generation system for developers.

## Table of Contents

- [Overview](#overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Quality System](#quality-system)
- [Provider Abstraction](#provider-abstraction)
- [Key Files Reference](#key-files-reference)

---

## Overview

The AI system enables users to generate, revise, and optimize workflows using natural language. Key capabilities include:

- **Workflow Generation**: Create complete workflows from text descriptions
- **Iterative Revision**: Refine workflows through conversational AI
- **Quality Validation**: 6-dimensional scoring with automatic improvement
- **Logic Generation**: Create conditional logic rules from natural language
- **Template Binding**: Suggest variable mappings for document templates
- **Multi-Provider Support**: OpenAI, Anthropic (Claude), and Google Gemini

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  NewWorkflow.tsx        AIAssistPanel.tsx         AiDiffView.tsx        │
│       │                       │                        │                 │
│       ▼                       ▼                        ▼                 │
│  useReviseWorkflow()    Message History         Diff Visualization      │
│       │                       │                        │                 │
│       ▼                       ▼                        ▼                 │
│  Poll /revise/{jobId}   Quality Scores         Apply/Discard Controls   │
└─────────────────────────────────────────────────────────────────────────┘
                                │ HTTP
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            API LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  ai.routes.ts ──► AiController.ts ──► Zod Validation                    │
│       │                  │                                               │
│       ▼                  ▼                                               │
│  Rate Limiting     Size Validation     Auth (hybridAuth + requireBuilder)│
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SERVICE LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                        AIService (Facade)                                │
│                              │                                           │
│  ┌───────────────┬───────────────┬───────────────┬───────────────┐      │
│  │  Generation   │   Revision    │  Suggestion   │    Logic      │      │
│  │   Service     │    Service    │   Service     │   Service     │      │
│  └───────────────┴───────────────┴───────────────┴───────────────┘      │
│                              │                                           │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │           IterativeQualityImprover (Auto-refinement)          │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                              │                                           │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │              AIPromptBuilder (Prompt Templates)                │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                              │                                           │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │      AIProviderClient (Retry, Backoff, Token Tracking)         │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                              │                                           │
│  ┌─────────────┬─────────────┬─────────────┐                            │
│  │   OpenAI    │  Anthropic  │   Gemini    │  (Provider Implementations) │
│  └─────────────┴─────────────┴─────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        VALIDATION LAYER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Zod Schema Parse ──► Type Normalization ──► Structure Validation       │
│                              │                                           │
│                              ▼                                           │
│  WorkflowQualityValidator (6-dimension scoring, 70pt threshold)         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  workflows ──► sections ──► steps ──► logicRules ──► transformBlocks    │
│                                                                          │
│  ai_settings (global/org/user prompts)                                  │
│  workflow_personalization_settings (per-workflow AI config)             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. AIService (Facade)

**File:** `server/services/AIService.ts`

The main entry point that coordinates all AI operations. Provides a unified API while delegating to specialized services.

```typescript
const aiService = createAIServiceFromEnv();

// Basic generation
const workflow = await aiService.generateWorkflow({ description: "..." });

// Generation with quality loop (auto-improvement)
const result = await aiService.generateWorkflowWithQualityLoop(
  { description: "..." },
  { targetQualityScore: 85, maxIterations: 3 }
);
```

### 2. WorkflowGenerationService

**File:** `server/services/ai/WorkflowGenerationService.ts`

Handles initial workflow creation from natural language descriptions.

**Key Methods:**
- `generateWorkflow()` - Single-shot generation
- `generateWorkflowWithQualityLoop()` - Generation with iterative improvement

### 3. WorkflowRevisionService

**File:** `server/services/ai/WorkflowRevisionService.ts`

Handles iterative workflow modifications. Supports three strategies:

| Strategy | Use Case | Token Limit |
|----------|----------|-------------|
| **Single-Shot** | Small workflows | < 2,500 input tokens |
| **Chunked** | Large workflows | 2,500 - 10,000+ tokens |
| **Two-Pass** | Massive single sections | > 6,000 output tokens |

### 4. IterativeQualityImprover

**File:** `server/services/ai/IterativeQualityImprover.ts`

Automatically refines workflows until quality targets are met or cost limits reached.

**Configuration:**
```typescript
interface QualityImprovementConfig {
  targetQualityScore: number;      // Default: 80
  maxIterations: number;           // Default: 3
  minImprovementThreshold: number; // Default: 5 points
  excellentQualityThreshold: number; // Default: 95
  maxTotalCostCents: number;       // Default: 25
}
```

**Stop Conditions:**
- `target_reached` - Quality score meets target
- `excellent_quality` - Score exceeds 95
- `max_iterations` - Hit iteration limit
- `diminishing_returns` - Improvement below threshold
- `max_cost` - Budget exhausted
- `no_improvement` - Score didn't improve

### 5. WorkflowQualityValidator

**File:** `server/services/WorkflowQualityValidator.ts`

Scores workflows across 6 dimensions:

| Category | Weight | Checks |
|----------|--------|--------|
| **Aliases** | 25% | Descriptive names, camelCase, uniqueness |
| **Types** | 20% | Appropriate field types for context |
| **Structure** | 15% | Logical sections, reasonable sizes |
| **UX** | 15% | Clear questions, proper formatting |
| **Completeness** | 15% | Title, required fields present |
| **Validation** | 10% | Required markers, option counts |

**Scoring:**
- Errors: -20 points
- Warnings: -10 points
- Suggestions: -5 points
- Pass threshold: ≥ 70

### 6. AliasResolver

**File:** `server/services/AliasResolver.ts`

Centralized utility for step alias-to-ID resolution.

```typescript
// Create from steps
const resolver = AliasResolver.fromSteps(steps);
const stepId = resolver.resolve('emailAddress');

// Create from workflow
const resolver = AliasResolver.fromWorkflow(workflow);

// Create inline function for condition evaluation
const resolverFn = AliasResolver.createInlineResolver(steps);

// Create alias map for block runners
const aliasMap = AliasResolver.createAliasMap(steps);
```

### 7. AIProviderClient

**File:** `server/services/ai/AIProviderClient.ts`

Unified interface to all LLM providers with:
- Automatic retry with exponential backoff
- Rate limit detection and handling
- Token usage tracking
- Cost estimation

---

## Data Flow

### Workflow Generation Flow

```
1. User Input (natural language description)
         │
         ▼
2. AIController.generateWorkflow()
   ├── Validates request (Zod schema)
   └── Delegates to AIService
         │
         ▼
3. WorkflowGenerationService.generateWorkflow()
   ├── Builds prompt via AIPromptBuilder
   ├── Calls LLM via AIProviderClient
   ├── Parses JSON response
   ├── Validates with Zod schema
   ├── Normalizes types
   └── Runs quality validation
         │
         ▼
4. [If using quality loop]
   IterativeQualityImprover.generateWithQualityLoop()
   ├── Check if improvement needed
   ├── Build improvement prompt from issues
   ├── Call LLM for refinement
   ├── Validate improved workflow
   ├── Check stopping conditions
   └── Repeat until done
         │
         ▼
5. Return workflow + quality metrics
```

### Revision Flow (Async)

```
1. POST /api/ai/workflows/revise
   └── Returns jobId immediately
         │
         ▼
2. Bull Queue processes job
   ├── WorkflowRevisionService.reviseWorkflow()
   ├── Determines strategy (single/chunked/two-pass)
   ├── Processes workflow
   └── Saves to database
         │
         ▼
3. Client polls GET /api/ai/workflows/revise/{jobId}
   └── Returns status/result
```

---

## Quality System

### Quality Score Structure

```typescript
interface QualityScore {
  overall: number;  // 0-100, weighted average
  breakdown: {
    aliases: number;
    types: number;
    structure: number;
    ux: number;
    completeness: number;
    validation: number;
  };
  issues: QualityIssue[];
  passed: boolean;  // true if overall >= 70
  suggestions: string[];
}

interface QualityIssue {
  type: 'error' | 'warning' | 'suggestion';
  category: string;
  message: string;
  location?: string;  // e.g., "sections[0].steps[2]"
  suggestion?: string;
}
```

### Iterative Improvement Algorithm

```
1. Generate initial workflow
2. Validate quality (score 0-100)
3. If score >= target: DONE
4. For each iteration:
   a. Build improvement prompt from issues
   b. Prioritize: errors > warnings > suggestions
   c. Call LLM with focused instructions
   d. Parse and validate response
   e. Calculate improvement delta
   f. Check stopping conditions:
      - Score >= target? → DONE
      - Score >= 95? → DONE (excellent)
      - Improvement <= 0? → STOP (no progress)
      - Improvement < 5? → STOP (diminishing returns)
      - Cost > budget? → STOP (cost limit)
   g. Continue with improved workflow
5. Return best result
```

---

## Provider Abstraction

### Supported Providers

| Provider | Default Model | Context Window | Cost (per 1M tokens) |
|----------|---------------|----------------|----------------------|
| **Gemini** | gemini-2.0-flash | 1M | $0.10 in / $0.40 out |
| **OpenAI** | gpt-4-turbo-preview | 128K | $10 in / $30 out |
| **Anthropic** | claude-3-5-sonnet | 200K | $3 in / $15 out |

### Environment Configuration

```env
# Primary (Gemini - recommended for cost)
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.0-flash  # optional

# Fallback
AI_PROVIDER=openai  # or 'anthropic'
AI_API_KEY=your-key
AI_MODEL_WORKFLOW=gpt-4-turbo-preview  # optional
```

### Provider Selection Logic

```typescript
// Priority order:
1. GEMINI_API_KEY → Use Gemini
2. AI_API_KEY + AI_PROVIDER → Use specified provider
3. AI_API_KEY only → Default to OpenAI
4. No keys → Throw configuration error
```

---

## Key Files Reference

### Services
| File | Purpose |
|------|---------|
| `server/services/AIService.ts` | Facade/coordinator |
| `server/services/ai/WorkflowGenerationService.ts` | Creates workflows |
| `server/services/ai/WorkflowRevisionService.ts` | Modifies workflows |
| `server/services/ai/WorkflowSuggestionService.ts` | Suggests improvements |
| `server/services/ai/WorkflowLogicService.ts` | Generates logic rules |
| `server/services/ai/IterativeQualityImprover.ts` | Auto-refinement loop |
| `server/services/ai/AIPromptBuilder.ts` | Prompt templates |
| `server/services/ai/AIProviderClient.ts` | LLM API calls |
| `server/services/WorkflowQualityValidator.ts` | Quality scoring |
| `server/services/AliasResolver.ts` | Alias-to-ID resolution |

### Routes & Controllers
| File | Purpose |
|------|---------|
| `server/routes/ai.routes.ts` | API endpoint definitions |
| `server/controllers/AiController.ts` | Request handling |
| `server/middleware/ai.middleware.ts` | Rate limiting, validation |

### Types & Schema
| File | Purpose |
|------|---------|
| `shared/types/ai.ts` | Zod schemas for AI types |
| `shared/schema/ai.ts` | Database schema (ai_settings) |

### Queue
| File | Purpose |
|------|---------|
| `server/queues/AiRevisionQueue.ts` | Async job processing |

---

## See Also

- [API Reference](./API_REFERENCE.md) - Complete API documentation
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
- [User Guide](./USER_GUIDE.md) - End-user documentation
