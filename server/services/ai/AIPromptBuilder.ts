/**
 * AI Prompt Builder Service
 *
 * Centralizes prompt construction for all AI operations
 */

import type {
  AIWorkflowGenerationRequest,
  AIWorkflowSuggestionRequest,
  AITemplateBindingsRequest,
  AIWorkflowRevisionRequest,
  AIConnectLogicRequest,
  AIDebugLogicRequest,
  AIVisualizeLogicRequest,
} from '../../../shared/types/ai';

export class AIPromptBuilder {
  /**
   * Build the prompt for workflow generation
   */
  buildWorkflowGenerationPrompt(request: AIWorkflowGenerationRequest): string {
    const constraints = request.constraints || {};
    const maxSections = constraints.maxSections || 10;
    const maxStepsPerSection = constraints.maxStepsPerSection || 10;

    return `You are an expert workflow designer for VaultLogic, a professional document automation and workflow platform.
Your task is to design a HIGH-QUALITY, PRODUCTION-READY workflow based on the user's description.

User Description:
${request.description}

${request.placeholders ? `Template Placeholders Available:\n${request.placeholders.join(', ')}\n` : ''}

QUALITY REQUIREMENTS:
1. **Logical Flow**: Questions should follow a natural, intuitive order
2. **Clear Language**: Use professional, unambiguous language
3. **Appropriate Granularity**: Break complex inputs into manageable steps
4. **User Experience**: Minimize cognitive load, group related questions
5. **Data Quality**: Use appropriate validation and input types
6. **Completeness**: Capture ALL necessary information for the use case

Output a JSON object with this exact structure:
{
  "title": "Workflow Title",
  "description": "Brief description",
  "sections": [
    {
      "id": "unique_section_id",
      "title": "Section Title",
      "description": "Optional description",
      "order": 0,
      "steps": [
        {
          "id": "unique_step_id",
          "type": "short_text|long_text|multiple_choice|radio|checkbox|yes_no|date_time|file_upload",
          "title": "Question or field title",
          "description": "Optional description",
          "alias": "camelCaseVariableName",
          "required": true|false,
          "config": {}
        }
      ]
    }
  ],
  "logicRules": [
    {
      "id": "unique_rule_id",
      "conditionStepAlias": "stepVariableName",
      "operator": "equals|not_equals|contains|greater_than|less_than|is_empty|is_not_empty",
      "conditionValue": "value to compare",
      "targetType": "section|step",
      "targetAlias": "targetVariableName",
      "action": "show|hide|require|make_optional|skip_to",
      "description": "What this rule does"
    }
  ],
  "transformBlocks": [
    {
      "id": "unique_block_id",
      "name": "Block Name",
      "language": "javascript|python",
      "code": "code to execute",
      "inputKeys": ["alias1", "alias2"],
      "outputKey": "outputAlias",
      "phase": "onSectionSubmit|onWorkflowComplete",
      "timeoutMs": 1000
    }
  ],
  "notes": "Optional notes about design decisions"
}

CRITICAL CONSTRAINTS:
- Maximum ${maxSections} sections
- Maximum ${maxStepsPerSection} steps per section
- All step aliases MUST be unique across the workflow and use camelCase (e.g., "firstName", "emailAddress")
- ALWAYS generate a descriptive, meaningful alias for EVERY step - NEVER leave empty
- All IDs must be unique and use lowercase_with_underscores format
- Step titles must be clear questions or instructions (e.g., "What is your full name?" not "Name")
- For multiple_choice, radio types, ALWAYS include config.options as array of strings (minimum 2 options)
- Transform block code MUST call emit(value) exactly once
- NO network calls or file system access in transform blocks

STEP TYPE SELECTION GUIDE:
- **short_text**: Names, titles, single-line answers (< 100 chars)
- **long_text**: Descriptions, explanations, comments (> 100 chars)
- **email**: Email addresses (use this instead of short_text for emails)
- **phone**: Phone numbers with formatting
- **number**: Numeric values, quantities, counts
- **currency**: Money amounts (auto-formats with $ symbol)
- **date**: Date selection without time
- **date_time**: Date with time selection
- **radio**: Single selection from 2-7 options (mutually exclusive)
- **multiple_choice**: Multi-select from 2-10 options (checkboxes)
- **yes_no**: Simple binary choice
- **scale**: Rating or scale (1-5, 1-10, etc.)
- **address**: Full mailing address
- **website**: URLs with validation
- **file_upload**: Document or image uploads
- **display**: Information-only, no input required

BEST PRACTICES:
1. Group related questions into logical sections (e.g., "Personal Information", "Contact Details")
2. Start with basic identifying information before complex questions
3. Use appropriate field types for better validation (email vs short_text, phone vs short_text)
4. Provide clear, actionable descriptions for complex questions
5. Use logic rules to show/hide conditional questions based on previous answers
6. Keep sections focused - don't mix unrelated topics
7. Use transform blocks for calculated fields (full name from first+last, total from sum, etc.)

LOGIC RULES GUIDANCE:
- Use show/hide for optional sections based on answers
- Use require/make_optional for conditional required fields
- Use skip_to for branching workflows
- Keep conditions simple: prefer equals/not_equals over complex operators

TRANSFORM BLOCK PATTERNS:
- Concatenation: \`emit(input.firstName + ' ' + input.lastName);\`
- Calculations: \`emit(input.quantity * input.price);\`
- Formatting: \`emit(input.rawValue.toUpperCase());\`
- Date math: Use helpers.date methods for date calculations

Output ONLY valid JSON, NO markdown code blocks, NO additional text.`;
  }

  /**
   * Build the prompt for workflow suggestions
   */
  buildWorkflowSuggestionPrompt(
    request: AIWorkflowSuggestionRequest,
    existingWorkflow: any,
  ): string {
    return `You are a workflow improvement assistant for VaultLogic.
You are reviewing an existing workflow and suggesting improvements based on user request.

User Request:
${request.description}

Existing Workflow:
${JSON.stringify(existingWorkflow, null, 2)}

Output a JSON object with this exact structure:
{
  "newSections": [ /* array of new sections to add, same schema as workflow generation */ ],
  "newLogicRules": [ /* array of new logic rules, same schema as workflow generation */ ],
  "newTransformBlocks": [ /* array of new transform blocks, same schema as workflow generation */ ],
  "modifications": [
    {
      "type": "section|step|logic_rule|transform_block",
      "id": "existing_item_id",
      "changes": { "field": "newValue" },
      "reason": "Why this change is suggested"
    }
  ],
  "notes": "Additional context about the suggestions"
}

Guidelines:
- Suggest additions and modifications separately
- Only suggest changes that align with the user's request
- Reuse existing step aliases when referencing them in new logic rules
- Maintain consistency with existing workflow structure
- Keep suggestions practical and implementable
- For new elements, follow the same schema and constraints as workflow generation

Output ONLY the JSON object, no additional text or markdown.`;
  }

  /**
   * Build the prompt for binding suggestions
   */
  buildBindingSuggestionPrompt(
    variables: Array<{ alias: string; label: string; type: string }>,
    placeholders: string[],
  ): string {
    return `You are a template binding assistant for VaultLogic.
Your task is to match DOCX template placeholders to workflow variables.

Available Workflow Variables:
${variables.map((v) => `- ${v.alias} (${v.type}): ${v.label}`).join('\n')}

Template Placeholders to Match:
${placeholders.map((p) => `- {{${p}}}`).join('\n')}

Output a JSON object with this exact structure:
{
  "suggestions": [
    {
      "placeholder": "placeholder_name",
      "variable": "workflowVariableAlias",
      "confidence": 0.95,
      "rationale": "Why this binding makes sense"
    }
  ],
  "unmatchedPlaceholders": ["placeholder1", "placeholder2"],
  "unmatchedVariables": ["variable1", "variable2"]
}

Guidelines:
- Match placeholders to variables based on semantic similarity
- Confidence should be 0-1, where 1.0 is perfect match
- Only suggest matches with confidence >= 0.5
- Consider both the variable alias and label when matching
- Placeholders and variables that don't have a good match go in unmatched arrays
- Provide clear rationale for each suggestion

Output ONLY the JSON object, no additional text or markdown.`;
  }

  /**
   * Build prompt for value suggestion
   */
  buildValueSuggestionPrompt(
    steps: Array<{
      key: string;
      type: string;
      label?: string;
      options?: string[];
      description?: string;
    }>,
    mode: 'full' | 'partial',
  ): string {
    const stepDescriptions = steps
      .map((step) => {
        let desc = `- ${step.key} (${step.type})`;
        if (step.label) {desc += `: ${step.label}`;}
        if (step.description) {desc += ` - ${step.description}`;}
        if (step.options && step.options.length > 0) {
          desc += ` [Options: ${step.options.join(', ')}]`;
        }
        return desc;
      })
      .join('\n');

    return `You are a test data generator. Generate realistic, plausible values for the following workflow fields.

Fields to populate:
${stepDescriptions}

Requirements:
- Generate realistic values that make sense for each field type
- For text fields, use natural language appropriate to the label
- For radio/checkbox/select fields, choose from the provided options only
- For yes_no fields, return boolean true or false
- For date_time fields, return ISO 8601 date-time strings
- For number fields, return numeric values
- Make the data cohesive and realistic (e.g., if there's firstName and lastName, make them match a person)
- ${mode === 'full' ? 'Generate values for ALL fields' : 'Generate values only for the fields listed'}

Return ONLY a JSON object with this structure:
{
  "values": {
    "key1": "value1",
    "key2": "value2",
    ...
  }
}

Do not include any markdown formatting, code blocks, or additional text. Return raw JSON only.`;
  }

  /**
   * Build prompt for workflow revision
   */
  buildWorkflowRevisionPrompt(request: AIWorkflowRevisionRequest): string {
    return `You are a VaultLogic Workflow Revision Engine.
Your task is to modify the Current Workflow based on the User Instruction and Conversation History.

Current Workflow JSON:
${JSON.stringify(request.currentWorkflow, null, 2)}

User Instruction: "${request.userInstruction}"

Conversation History:
${request.conversationHistory ? request.conversationHistory.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n') : 'None'}

Mode: ${request.mode} (Respect constraints of this mode)

Output a JSON object with this exact structure:
{
  "updatedWorkflow": {
    "title": "Workflow Title",
    "description": "Description",
    "sections": [
      {
        "id": "section-1",
        "title": "Section Title",
        "description": null,
        "order": 0,
        "steps": [
          {
            "id": "step-1",
            "type": "short_text",
            "title": "What is your name?",  // REQUIRED - question text
            "description": null,
            "alias": "name",
            "required": true,
            "config": {}
          }
        ]
      }
    ],
    "logicRules": [
      {
        "id": "rule-1",
        "conditionStepAlias": "step_alias",  // REQUIRED - alias of step to check
        "operator": "equals",  // REQUIRED - use: equals, not_equals, contains, greater_than, less_than, is_empty, etc. (never use "is")
        "value": "some value",  // Value to compare against
        "targetType": "step",  // REQUIRED - "step" or "section"
        "targetAlias": "other_step",  // REQUIRED - alias of step/section to affect
        "action": "show",  // REQUIRED - "show", "hide", "require", "make_optional", or "skip_to"
        "description": "Show other_step if step_alias equals 'some value'"
      }
    ],
    "transformBlocks": [],
    "notes": null
  },
  "diff": {
    "changes": [
      {
        "type": "add|remove|update|move",
        "target": "path.to.element",
        "before": null,
        "after": { ... },
        "explanation": "Added a new specific question"
      }
    ]
  },
  "explanation": ["Point 1 about what changed", "Point 2"],
  "suggestions": ["Follow-up suggestion 1"]
}

CRITICAL REQUIREMENTS:
    1. **FULL RESPONSE REQUIRED**: You MUST return the ENTIRE workflow structure in 'updatedWorkflow', including ALL existing sections and steps that you did not change.
    2. **DELETION WARNING**: Any section or step that is missing from your 'updatedWorkflow' will be PERMANENTLY DELETED. Do not be lazy.
    3. **TITLES**: Every step MUST have a "title" field.
    4. **IDS**: Preserve existing IDs. Generate new UUIDs for new items.
    5. **CONTENT GENERATION**: If the User Instruction asks to "build", "create", or "automate" a form/workflow, and the current workflow has few or no questions, you MUST generate the full structure (multiple sections, relevant questions). DO NOT just update the title. YOU MUST BUILD THE CONTENT.
    6. **ALIASES**: Every step MUST have a unique "alias" in camelCase (e.g., "firstName", "driverLicenseNumber"). Do not leave it null or empty.

    Valid Step Types:
    - Text: "short_text", "long_text", "email", "phone", "website", "number", "currency"
    - Choice: "radio", "multiple_choice", "yes_no"
    - Date: "date", "time", "date_time"
    - Other: "scale", "address", "file_upload", "display", "signature_block"

    Output ONLY the JSON object.`;
  }

  /**
   * Build prompt for logic generation
   */
  buildLogicGenerationPrompt(request: AIConnectLogicRequest): string {
    return `You are a Logic Architect for VaultLogic.
Task: Generate logical conditions (logicRules) to connect steps based on the user's description.
Workflow Context:
${JSON.stringify(request.currentWorkflow, null, 2)}
User Request: "${request.description}"

Output JSON exactly matching AIConnectLogicResponse schema:
{
  "updatedWorkflow": { ... },
  "diff": { "changes": [...] },
  "explanation": ["..."],
  "suggestions": ["..."]
}
Only return JSON.`;
  }

  /**
   * Build prompt for logic debugging
   */
  buildLogicDebugPrompt(request: AIDebugLogicRequest): string {
    return `Analyze this workflow's logic for infinite loops, contradictions, or unreachable branches.
Workflow: ${JSON.stringify(request.currentWorkflow, null, 2)}
Output JSON matching AIDebugLogicResponse.`;
  }

  /**
   * Build prompt for logic visualization
   */
  buildLogicVisualizationPrompt(request: AIVisualizeLogicRequest): string {
    return `Generate a node-edge graph representation of this workflow's logic flow.
Workflow: ${JSON.stringify(request.currentWorkflow, null, 2)}
Output JSON matching AIVisualizeLogicResponse with "graph": { "nodes": [], "edges": [] }.`;
  }
}

// Export singleton instance
export const aiPromptBuilder = new AIPromptBuilder();
