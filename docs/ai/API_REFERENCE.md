# AI API Reference

Complete API documentation for ezBuildr's AI workflow generation endpoints.

## Table of Contents

- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
  - [Generate Workflow](#generate-workflow)
  - [Revise Workflow](#revise-workflow)
  - [Suggest Improvements](#suggest-improvements)
  - [Generate Logic](#generate-logic)
  - [Debug Logic](#debug-logic)
  - [Template Bindings](#template-bindings)
- [Quality Scores](#quality-scores)
- [Error Handling](#error-handling)

---

## Authentication

All AI endpoints require authentication via one of:

- **Bearer Token**: `Authorization: Bearer <jwt_token>`
- **Session Cookie**: Automatic with browser requests
- **Run Token**: For public workflow execution

Additionally, most endpoints require the `builder` role (enforced by `requireBuilder` middleware).

---

## Rate Limiting

| Limit | Value |
|-------|-------|
| Requests per minute | 100 per user |
| Max sections per workflow | 50 |
| Max steps per section | 50 |
| Max JSON payload | 5MB |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Endpoints

### Generate Workflow

Create a new workflow from a natural language description.

```
POST /api/ai/workflows/generate
```

**Request Body:**
```json
{
  "projectId": "uuid",
  "description": "A customer feedback form that collects ratings and comments",
  "constraints": {
    "maxSections": 10,
    "maxStepsPerSection": 10
  },
  "placeholders": ["customerName", "orderNumber"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | Yes | Project to create workflow in |
| `description` | string | Yes | Natural language description |
| `constraints.maxSections` | number | No | Max sections (default: 10) |
| `constraints.maxStepsPerSection` | number | No | Max steps per section (default: 10) |
| `placeholders` | string[] | No | Pre-defined variable names to use |

**Response (200 OK):**
```json
{
  "success": true,
  "workflow": {
    "title": "Customer Feedback Form",
    "description": "Collects customer ratings and feedback",
    "sections": [
      {
        "id": "section-1",
        "title": "Rating",
        "order": 0,
        "steps": [
          {
            "id": "step-1",
            "type": "scale",
            "title": "How would you rate your experience?",
            "alias": "experienceRating",
            "required": true,
            "config": { "min": 1, "max": 5 }
          }
        ]
      }
    ],
    "logicRules": [],
    "transformBlocks": []
  },
  "metadata": {
    "duration": 2340,
    "sectionsGenerated": 3,
    "stepsGenerated": 8,
    "logicRulesGenerated": 2
  },
  "quality": {
    "score": 85,
    "breakdown": {
      "aliases": 90,
      "types": 85,
      "structure": 80,
      "ux": 85,
      "completeness": 90,
      "validation": 80
    },
    "passed": true,
    "issues": [],
    "suggestions": []
  }
}
```

---

### Revise Workflow

Modify an existing workflow based on natural language instructions. Uses async job processing for large workflows.

**Step 1: Start Revision**
```
POST /api/ai/workflows/revise
```

**Request Body:**
```json
{
  "workflowId": "uuid",
  "currentWorkflow": {
    "title": "My Workflow",
    "sections": [...],
    "logicRules": [],
    "transformBlocks": []
  },
  "userInstruction": "Add a section for contact information with email and phone fields",
  "conversationHistory": [
    { "role": "user", "content": "Create a feedback form" },
    { "role": "assistant", "content": "I've created a basic feedback form..." }
  ],
  "mode": "easy"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workflowId` | string | Yes | Workflow ID to revise |
| `currentWorkflow` | object | Yes | Current workflow structure |
| `userInstruction` | string | Yes | What to change |
| `conversationHistory` | array | No | Previous conversation context |
| `mode` | string | No | `"easy"` (auto-apply) or `"advanced"` (manual review) |

**Response (202 Accepted):**
```json
{
  "jobId": "job-uuid",
  "status": "pending"
}
```

**Step 2: Poll for Result**
```
GET /api/ai/workflows/revise/{jobId}
```

**Response (200 OK - Pending):**
```json
{
  "status": "active",
  "progress": 50
}
```

**Response (200 OK - Completed):**
```json
{
  "status": "completed",
  "result": {
    "updatedWorkflow": {
      "title": "My Workflow",
      "sections": [...],
      "logicRules": [],
      "transformBlocks": []
    },
    "diff": {
      "changes": [
        {
          "type": "add",
          "target": "sections[2]",
          "after": { "title": "Contact Information", ... },
          "explanation": "Added contact information section"
        }
      ]
    },
    "explanation": [
      "Added a new 'Contact Information' section",
      "Included email and phone fields with validation"
    ],
    "suggestions": [
      "Consider adding address fields for complete contact info"
    ]
  }
}
```

---

### Suggest Improvements

Get AI-powered suggestions for improving an existing workflow.

```
POST /api/ai/workflows/{workflowId}/suggest
```

**Request Body:**
```json
{
  "focus": "ux",
  "context": "This form is for mobile users"
}
```

**Response (200 OK):**
```json
{
  "suggestions": [
    {
      "type": "structure",
      "description": "Break long sections into smaller pages",
      "impact": "high",
      "changes": [...]
    }
  ],
  "overallAssessment": "The workflow is well-structured but could benefit from..."
}
```

---

### Generate Logic

Create conditional logic rules from natural language.

```
POST /api/ai/workflows/generate-logic
```

**Request Body:**
```json
{
  "workflowId": "uuid",
  "steps": [
    { "id": "step-1", "alias": "hasInsurance", "type": "yes_no", "title": "Do you have insurance?" },
    { "id": "step-2", "alias": "insuranceProvider", "type": "short_text", "title": "Insurance Provider" }
  ],
  "sections": [
    { "id": "section-1", "title": "Insurance Details" }
  ],
  "instruction": "Only show the insurance provider question if they have insurance"
}
```

**Response (200 OK):**
```json
{
  "rules": [
    {
      "id": "rule-1",
      "conditionStepAlias": "hasInsurance",
      "operator": "equals",
      "value": "yes",
      "targetType": "step",
      "targetAlias": "insuranceProvider",
      "action": "show",
      "description": "Show insurance provider when user has insurance"
    }
  ],
  "diff": {
    "changes": [
      {
        "type": "add",
        "target": "logicRules[0]",
        "explanation": "Added visibility rule for insurance provider field"
      }
    ]
  },
  "explanation": [
    "Created a conditional visibility rule",
    "The insurance provider field will only appear when the user selects 'yes' for having insurance"
  ]
}
```

---

### Debug Logic

Analyze logic rules for issues and contradictions.

```
POST /api/ai/workflows/debug-logic
```

**Request Body:**
```json
{
  "workflowId": "uuid",
  "steps": [...],
  "sections": [...],
  "logicRules": [...]
}
```

**Response (200 OK):**
```json
{
  "issues": [
    {
      "severity": "error",
      "type": "circular_dependency",
      "description": "Rule A shows field B, but Rule B hides field A",
      "affectedRules": ["rule-1", "rule-2"],
      "recommendation": "Remove one of the conflicting rules"
    }
  ],
  "recommendations": [
    "Consider combining rules 3 and 4 for better maintainability"
  ],
  "summary": "Found 1 error and 2 warnings in your logic configuration"
}
```

---

### Template Bindings

Suggest mappings between workflow variables and document template placeholders.

```
POST /api/ai/templates/{templateId}/bindings
```

**Request Body:**
```json
{
  "workflowId": "uuid",
  "variables": [
    { "alias": "firstName", "label": "First Name", "type": "short_text" },
    { "alias": "lastName", "label": "Last Name", "type": "short_text" },
    { "alias": "emailAddress", "label": "Email", "type": "email" }
  ],
  "placeholders": [
    "{{customer_name}}",
    "{{email}}",
    "{{phone_number}}"
  ]
}
```

**Response (200 OK):**
```json
{
  "suggestions": [
    {
      "placeholder": "{{customer_name}}",
      "variable": "firstName",
      "confidence": 0.85,
      "rationale": "firstName is likely part of the customer name"
    },
    {
      "placeholder": "{{email}}",
      "variable": "emailAddress",
      "confidence": 0.95,
      "rationale": "Direct match for email field"
    }
  ],
  "unmatchedPlaceholders": ["{{phone_number}}"],
  "unmatchedVariables": ["lastName"]
}
```

---

## Quality Scores

Every generated or revised workflow includes a quality assessment:

### Score Breakdown

| Category | Weight | Description |
|----------|--------|-------------|
| `aliases` | 25% | Descriptive, camelCase, unique names |
| `types` | 20% | Appropriate field types for content |
| `structure` | 15% | Logical sections, reasonable sizes |
| `ux` | 15% | Clear questions, good formatting |
| `completeness` | 15% | All required fields present |
| `validation` | 10% | Proper required markers, options |

### Issue Types

| Type | Points Deducted | Description |
|------|-----------------|-------------|
| `error` | -20 | Must be fixed (e.g., missing alias) |
| `warning` | -10 | Should be fixed (e.g., wrong field type) |
| `suggestion` | -5 | Nice to have (e.g., short title) |

### Pass Threshold

- **Passing Score**: ≥ 70
- **Excellent Score**: ≥ 95

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "AI response does not match expected schema",
    "details": {
      "path": "sections[0].steps[0].alias",
      "expected": "string",
      "received": "null"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `RATE_LIMIT` | 429 | Too many requests |
| `VALIDATION_ERROR` | 400 | Invalid request or response |
| `INVALID_RESPONSE` | 500 | AI returned unparseable response |
| `TIMEOUT` | 504 | Request took too long |
| `API_ERROR` | 502 | AI provider error |
| `UNAUTHORIZED` | 401 | Missing or invalid auth |
| `FORBIDDEN` | 403 | Insufficient permissions |

### Retry Behavior

The system automatically retries on:
- Rate limits (with exponential backoff)
- Timeouts (up to 6 attempts)
- Transient API errors

Clients should implement their own retry for 5xx errors.

---

## See Also

- [Architecture Guide](./ARCHITECTURE.md) - System design overview
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
- [User Guide](./USER_GUIDE.md) - End-user documentation
