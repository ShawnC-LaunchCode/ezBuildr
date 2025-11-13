# Stage 15: AI-Assisted Workflow Builder

**Status:** Backend Complete, Frontend Pending
**Date:** November 13, 2025
**Version:** 1.3.0

## Overview

Stage 15 introduces AI-powered workflow generation capabilities to VaultLogic, allowing users to create complex workflows from natural language descriptions. This feature integrates with OpenAI and Anthropic APIs to generate workflow structures, suggest improvements, and recommend template variable bindings.

## Features

### 1. AI Workflow Generation
- Generate complete workflow specifications from text descriptions
- Creates sections, steps, logic rules, and transform blocks
- Validates generated structures for consistency and correctness
- Configurable constraints (max sections, max steps per section)

### 2. AI Workflow Suggestions
- Suggest improvements to existing workflows
- Propose new sections, steps, and logic based on user requests
- Identify opportunities for automation and optimization
- Non-destructive suggestions that can be reviewed before applying

### 3. Template Binding Suggestions
- Automatically map DOCX placeholders to workflow variables
- Semantic matching with confidence scores
- Identifies unmatched placeholders and variables
- Saves time on manual template configuration

## Architecture

### Backend Components

#### 1. Type System (`shared/types/ai.ts`)
- **AIGeneratedWorkflow**: Complete workflow specification with sections, steps, rules, and blocks
- **AIGeneratedSection**: Page/section with ordered steps
- **AIGeneratedStep**: Individual question/field with type, config, and alias
- **AIGeneratedLogicRule**: Conditional logic specification
- **AIGeneratedTransformBlock**: JavaScript/Python computation block
- **AIWorkflowSuggestion**: Suggestions for existing workflows
- **AIBindingSuggestion**: Template variable bindings with confidence scores

All types are validated with Zod schemas for runtime type safety.

#### 2. AI Service (`server/services/AIService.ts`)
- **Provider Support**: OpenAI and Anthropic
- **Methods**:
  - `generateWorkflow()`: Create new workflow from description
  - `suggestWorkflowImprovements()`: Suggest enhancements to existing workflow
  - `suggestTemplateBindings()`: Map template placeholders to variables
- **Features**:
  - Robust JSON parsing with error recovery
  - Structured prompts with constraints and examples
  - Validation of AI-generated structures
  - Rate limit and timeout handling
  - Comprehensive error reporting

#### 3. API Routes (`server/routes/ai.routes.ts`)
- **POST /api/ai/workflows/generate**: Generate new workflow
- **POST /api/ai/workflows/:id/suggest**: Suggest improvements
- **POST /api/ai/templates/:templateId/bindings**: Suggest bindings
- **Features**:
  - RBAC: Builder or Owner only
  - Rate limiting: 10 requests per minute per user
  - Comprehensive error handling
  - Structured logging for debugging and monitoring

### Frontend Components (Planned)

#### 1. AI Workflow Creation Page (`/workflows/new/ai`)
- **AIDescribeForm**: Textarea with "Generate Workflow" button
- **AISpecPreview**: Structured view of generated workflow
- **AIInsertButtons**: Accept/reject controls with partial selection

#### 2. Builder AI Panel Integration
- "Ask AI" button in workflow builder toolbar
- Dialog with tabs:
  - **Suggest improvements**: Free text → workflow suggestions
  - **Suggest bindings**: Template placeholder → variable mapping
- Diff-like UI showing proposed changes
- Selective acceptance of suggestions

## Configuration

### Environment Variables

```env
# AI Provider Configuration (Required for AI features)
AI_PROVIDER=openai                     # or 'anthropic'
AI_API_KEY=your-api-key-here           # OpenAI or Anthropic API key
AI_MODEL_WORKFLOW=gpt-4-turbo-preview  # Model for workflow generation

# Optional: Fine-tune behavior
# (These have sensible defaults if not set)
```

### API Keys

**OpenAI:**
1. Sign up at https://platform.openai.com/
2. Create API key: https://platform.openai.com/api-keys
3. Recommended models:
   - `gpt-4-turbo-preview` (best quality)
   - `gpt-4` (stable)
   - `gpt-3.5-turbo` (faster, cheaper)

**Anthropic:**
1. Sign up at https://console.anthropic.com/
2. Create API key in console
3. Recommended models:
   - `claude-3-5-sonnet-20241022` (balanced)
   - `claude-3-opus-20240229` (best quality)

## API Reference

### Generate Workflow

**Endpoint:** `POST /api/ai/workflows/generate`

**Authentication:** Required (Bearer token or session)
**Authorization:** Builder or Owner role
**Rate Limit:** 10 requests per minute per user

**Request Body:**
```json
{
  "description": "Create a client intake form with personal information, business details, and service preferences. Include conditional logic to show business fields only if the client type is 'business'.",
  "projectId": "uuid",
  "placeholders": ["client_name", "company_name"],  // Optional
  "constraints": {                                  // Optional
    "maxSections": 10,
    "maxStepsPerSection": 10,
    "preferredStepTypes": ["short_text", "radio", "checkbox"]
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "workflow": {
    "name": "Client Intake Form",
    "description": "Collects client information with conditional business fields",
    "sections": [
      {
        "id": "section_1",
        "title": "Personal Information",
        "description": "Basic contact details",
        "order": 0,
        "steps": [
          {
            "id": "step_1",
            "type": "radio",
            "title": "Client Type",
            "alias": "clientType",
            "required": true,
            "config": {
              "options": ["Individual", "Business"]
            }
          },
          {
            "id": "step_2",
            "type": "short_text",
            "title": "Full Name",
            "alias": "clientName",
            "required": true
          }
        ]
      },
      {
        "id": "section_2",
        "title": "Business Details",
        "order": 1,
        "steps": [
          {
            "id": "step_3",
            "type": "short_text",
            "title": "Company Name",
            "alias": "companyName",
            "required": true
          }
        ]
      }
    ],
    "logicRules": [
      {
        "id": "rule_1",
        "conditionStepAlias": "clientType",
        "operator": "equals",
        "conditionValue": "Business",
        "targetType": "section",
        "targetAlias": "section_2",
        "action": "show",
        "description": "Show business section only for business clients"
      }
    ],
    "transformBlocks": [],
    "notes": "This workflow uses conditional logic to streamline the intake process based on client type."
  },
  "metadata": {
    "duration": 3245,
    "sectionsGenerated": 2,
    "logicRulesGenerated": 1,
    "transformBlocksGenerated": 0
  }
}
```

**Error Responses:**
- `400`: Invalid request data (Zod validation error)
- `401`: Unauthorized (not authenticated)
- `403`: Forbidden (not builder/owner)
- `422`: AI generated invalid structure
- `429`: Rate limit exceeded (user or AI provider)
- `500`: Internal server error
- `504`: AI request timed out

### Suggest Workflow Improvements

**Endpoint:** `POST /api/ai/workflows/:id/suggest`

**Request Body:**
```json
{
  "description": "Add a signature collection step at the end and include email validation on the email field"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "suggestions": {
    "newSections": [],
    "newLogicRules": [],
    "newTransformBlocks": [],
    "modifications": [
      {
        "type": "step",
        "id": "step_email",
        "changes": {
          "config": {
            "validation": {
              "type": "email",
              "message": "Please enter a valid email address"
            }
          }
        },
        "reason": "Add email validation to prevent invalid email addresses"
      }
    ],
    "notes": "Added email validation and signature collection step to improve data quality and legal compliance."
  },
  "metadata": {
    "duration": 2156,
    "newSectionsCount": 0,
    "newLogicRulesCount": 0,
    "newTransformBlocksCount": 0,
    "modificationsCount": 1
  }
}
```

**Error Responses:**
- `404`: Workflow not found
- (Other errors same as generate endpoint)

### Suggest Template Bindings

**Endpoint:** `POST /api/ai/templates/:templateId/bindings`

**Request Body:**
```json
{
  "workflowId": "uuid",
  "placeholders": [
    "client_name",
    "company_name",
    "contract_date",
    "service_type"
  ]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "bindings": {
    "suggestions": [
      {
        "placeholder": "client_name",
        "variable": "clientName",
        "confidence": 0.98,
        "rationale": "Direct semantic match between placeholder and workflow variable"
      },
      {
        "placeholder": "company_name",
        "variable": "companyName",
        "confidence": 0.95,
        "rationale": "Strong correlation between company name fields"
      },
      {
        "placeholder": "contract_date",
        "variable": "agreementDate",
        "confidence": 0.75,
        "rationale": "Date fields with similar context (contract vs agreement)"
      }
    ],
    "unmatchedPlaceholders": ["service_type"],
    "unmatchedVariables": ["clientEmail", "clientPhone"]
  },
  "metadata": {
    "duration": 1523,
    "suggestionsCount": 3,
    "unmatchedPlaceholdersCount": 1,
    "unmatchedVariablesCount": 2
  }
}
```

## Prompt Engineering

### Workflow Generation Prompt Structure

```
You are a workflow designer for VaultLogic, a document automation platform.
Your task is to design a workflow based on the user's description.

User Description:
{user_description}

{optional_template_placeholders}

Output a JSON object with this exact structure:
{schema_with_examples}

Constraints:
- Maximum {max_sections} sections
- Maximum {max_steps_per_section} steps per section
- All step aliases must be unique
- Logic rules should reference existing steps
- Transform blocks should NOT make network calls

Available Step Types:
{step_types_with_descriptions}

Output ONLY the JSON object, no additional text or markdown.
```

### Key Prompt Features

1. **Clear Role Definition**: AI understands it's a workflow designer
2. **Structured Output**: JSON schema with examples ensures consistency
3. **Constraints**: Prevents overly complex or invalid workflows
4. **Security Guardrails**: No network calls, file access, or dangerous code
5. **Format Enforcement**: "Output ONLY JSON" reduces markdown wrapping issues

## Validation & Safety

### Generated Workflow Validation

1. **Schema Validation** (Zod):
   - All required fields present
   - Correct types for all values
   - Step types from allowed enum
   - Operator types valid

2. **Business Logic Validation**:
   - Unique section IDs
   - Unique step IDs across all sections
   - Unique step aliases across workflow
   - Logic rules reference existing steps
   - Transform blocks reference existing steps
   - No circular dependencies

3. **Security Validation**:
   - Transform block code does NOT contain network calls
   - Transform block code does NOT access file system
   - All user inputs are properly sanitized

### Error Handling

**Client-Side:**
- User-friendly error messages
- Suggestions for fixing validation errors
- Retry mechanism for transient errors

**Server-Side:**
- Structured error codes (RATE_LIMIT, TIMEOUT, VALIDATION_ERROR, etc.)
- Detailed logging for debugging
- Error context preservation for investigation
- Graceful degradation (workflow builder still works without AI)

## Rate Limiting

### Application Layer
- **Limit:** 10 requests per minute per user
- **Window:** Rolling 60-second window
- **Key:** User ID (or IP for unauthenticated)
- **Headers:** Includes rate limit info in response headers

### AI Provider Layer
- **OpenAI:** Typically 60 requests/minute on paid tiers
- **Anthropic:** Varies by plan
- **Handling:** Exponential backoff and user notification

## Testing

### Unit Tests
- **File:** `tests/unit/ai.service.test.ts`
- **Coverage:**
  - OpenAI provider initialization and calls
  - Anthropic provider initialization and calls
  - JSON parsing and validation
  - Error handling (rate limits, timeouts, parse errors)
  - Workflow structure validation
  - Binding suggestion generation

### Integration Tests
- **File:** `tests/integration/api.ai.test.ts`
- **Coverage:**
  - Authentication and authorization
  - RBAC enforcement
  - Rate limiting behavior
  - Request validation
  - Response structure
  - Error responses and status codes

### Running Tests

```bash
# All AI tests
npm test -- ai

# Unit tests only
npm run test:unit -- ai.service

# Integration tests only
npm run test:integration -- api.ai
```

## Monitoring & Observability

### Logging

**Request Logs:**
```json
{
  "userId": "user-uuid",
  "projectId": "project-uuid",
  "descriptionLength": 245,
  "timestamp": "2025-11-13T10:30:00Z",
  "message": "AI workflow generation requested"
}
```

**Success Logs:**
```json
{
  "userId": "user-uuid",
  "projectId": "project-uuid",
  "duration": 3245,
  "sectionsCount": 3,
  "rulesCount": 2,
  "blocksCount": 1,
  "timestamp": "2025-11-13T10:30:03Z",
  "message": "AI workflow generation succeeded"
}
```

**Error Logs:**
```json
{
  "userId": "user-uuid",
  "error": {
    "code": "RATE_LIMIT",
    "message": "AI API rate limit exceeded",
    "details": {...}
  },
  "duration": 1523,
  "timestamp": "2025-11-13T10:30:02Z",
  "message": "AI workflow generation failed"
}
```

### Metrics to Track

1. **Usage Metrics:**
   - Requests per user per day
   - Requests per provider (OpenAI vs Anthropic)
   - Average request duration
   - Success rate

2. **Quality Metrics:**
   - Validation error rate
   - User acceptance rate (future: track edits after generation)
   - Average workflow complexity (sections, steps, rules)

3. **Cost Metrics:**
   - API calls per month
   - Estimated cost per provider
   - Cost per generated workflow

## Costs & Pricing Considerations

### OpenAI Pricing (as of Nov 2025)

| Model | Input (per 1K tokens) | Output (per 1K tokens) | Typical Workflow |
|-------|---------------------|---------------------|-----------------|
| GPT-4 Turbo | $0.01 | $0.03 | ~$0.15 |
| GPT-4 | $0.03 | $0.06 | ~$0.35 |
| GPT-3.5 Turbo | $0.0005 | $0.0015 | ~$0.01 |

### Anthropic Pricing (as of Nov 2025)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Typical Workflow |
|-------|---------------------|---------------------|-----------------|
| Claude 3.5 Sonnet | $3.00 | $15.00 | ~$0.10 |
| Claude 3 Opus | $15.00 | $75.00 | ~$0.50 |

**Note:** Actual costs depend on workflow complexity and user description length.

## Best Practices

### For Users

1. **Be Specific**: More detailed descriptions produce better results
2. **Use Examples**: "Like a contact form, but with..." helps the AI understand
3. **Iterate**: Generate a base workflow, then use suggestions to refine
4. **Review Everything**: Always review AI-generated workflows before publishing
5. **Start Simple**: Test with simple workflows before complex automation

### For Developers

1. **Monitor API Usage**: Track costs and set up alerts
2. **Implement Fallbacks**: Graceful degradation if AI services are down
3. **Version Prompts**: Keep prompt templates in version control
4. **Test Edge Cases**: Invalid descriptions, very long descriptions, special characters
5. **Log Generously**: AI behavior can be unpredictable; logs help debug

## Troubleshooting

### Common Issues

**Problem:** "AI API key not configured" error
**Solution:** Set `AI_API_KEY` environment variable

**Problem:** Rate limit errors
**Solution:** Wait for rate limit window to reset or upgrade AI provider plan

**Problem:** AI generates invalid JSON
**Solution:** Prompt template may need adjustment; check for markdown code blocks

**Problem:** Generated workflows don't match description
**Solution:** Refine user description with more specific details

**Problem:** High API costs
**Solution:** Use GPT-3.5 Turbo or cache common workflow patterns

## Future Enhancements

### Short Term
1. Frontend implementation (React components)
2. Workflow preview before creation
3. Partial generation (sections only, steps only)
4. Template analysis to extract placeholders automatically

### Medium Term
1. Workflow optimization suggestions (performance, UX)
2. Multi-language support (generate in user's language)
3. Custom prompt templates (per organization)
4. A/B testing different prompts

### Long Term
1. Fine-tuned models on VaultLogic data
2. Conversational workflow builder (multi-turn chat)
3. AI-powered testing and validation
4. Intelligent default values based on industry

## Security Considerations

1. **API Key Protection:**
   - Never commit API keys to version control
   - Use environment variables
   - Rotate keys periodically

2. **Input Sanitization:**
   - All user descriptions are sanitized before sending to AI
   - No PII should be sent to AI providers
   - Validate all AI responses before saving

3. **Output Validation:**
   - All AI-generated code is sandboxed
   - No arbitrary code execution
   - Transform blocks are validated before execution

4. **Rate Limiting:**
   - Prevents abuse and cost overruns
   - Per-user limits prevent resource monopolization

## License & Attribution

- **OpenAI SDK:** MIT License
- **Anthropic SDK:** Apache 2.0 License
- **VaultLogic Implementation:** MIT License

---

**Document Version:** 1.0
**Last Updated:** November 13, 2025
**Maintainer:** VaultLogic Development Team
