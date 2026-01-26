# AI Workflow Generation - User Guide

Learn how to use ezBuildr's AI features to create and improve workflows.

## Table of Contents

- [Getting Started](#getting-started)
- [Creating a Workflow with AI](#creating-a-workflow-with-ai)
- [Revising Workflows with AI](#revising-workflows-with-ai)
- [Understanding Quality Scores](#understanding-quality-scores)
- [AI-Generated Logic Rules](#ai-generated-logic-rules)
- [Tips for Better Results](#tips-for-better-results)
- [FAQ](#faq)

---

## Getting Started

ezBuildr's AI assistant helps you create professional workflows in seconds. Instead of building forms field-by-field, describe what you need in plain English and let AI do the heavy lifting.

### What AI Can Do

| Feature | Description |
|---------|-------------|
| **Generate Workflows** | Create complete forms from a text description |
| **Revise Workflows** | Modify existing workflows with natural language |
| **Add Logic Rules** | Create conditional visibility and validation |
| **Suggest Improvements** | Get recommendations for better UX |
| **Map Template Variables** | Connect workflow fields to document templates |

---

## Creating a Workflow with AI

### Step 1: Start a New Workflow

1. Go to your project dashboard
2. Click **"Create New Workflow"**
3. Select the **"Create with AI"** tab

### Step 2: Describe Your Workflow

Write a clear description of what you want to build. The more detail, the better!

**Example descriptions:**

> "A customer feedback form that asks for their overall satisfaction rating on a 1-5 scale, what they liked most about our service, what we could improve, and optionally their email if they want us to follow up."

> "An employee onboarding checklist with sections for personal information (name, email, phone, address), emergency contacts, tax forms (W-4 selections), and IT equipment requests."

> "A loan application that collects applicant information, employment details, income verification, and loan preferences. Include logic to show additional questions for self-employed applicants."

### Step 3: Generate and Review

1. Click **"Generate Workflow"**
2. Wait for AI to create your workflow (usually 5-15 seconds)
3. Review the generated structure
4. Check the **quality score** - aim for 80+

### Step 4: Refine with AI Assistant

If the workflow needs changes:
1. Open the **AI Assistant** panel (robot icon)
2. Describe what you want to change
3. Review proposed changes
4. Click **Apply** or **Discard**

---

## Revising Workflows with AI

### Opening the AI Assistant

In the workflow builder, click the **AI Assistant** icon in the toolbar to open the chat panel.

### Making Changes

Type natural language instructions:

- "Add a section for payment information"
- "Make the phone number field required"
- "Add a dropdown for selecting department with options: Sales, Support, Engineering"
- "Show the 'spouse information' section only if marital status is 'Married'"

### Easy vs Advanced Mode

| Mode | Behavior |
|------|----------|
| **Easy** | Changes are applied automatically |
| **Advanced** | Review changes before applying |

Switch modes using the toggle in the AI Assistant panel.

### Reviewing Changes

In Advanced mode, you'll see:
- **Proposed Changes** card showing what will change
- Color-coded badges: 🟢 Add, 🟡 Modify, 🔴 Remove
- **Apply** to accept, **Discard** to reject

---

## Understanding Quality Scores

Every AI-generated workflow receives a quality score (0-100).

### Score Categories

| Category | What It Measures |
|----------|------------------|
| **Aliases** | Are field names descriptive? (e.g., `customerEmail` vs `field1`) |
| **Types** | Are the right field types used? (email fields use email type) |
| **Structure** | Is the workflow logically organized? |
| **UX** | Are questions clear and well-formatted? |
| **Completeness** | Does it have all necessary fields? |
| **Validation** | Are important fields marked required? |

### Score Ranges

| Score | Rating | Action |
|-------|--------|--------|
| 90-100 | Excellent | Ready to use |
| 80-89 | Good | Minor tweaks recommended |
| 70-79 | Acceptable | Review and improve |
| Below 70 | Needs Work | Significant improvements needed |

### Improving Low Scores

If your score is low, the AI will show specific issues:

- **Errors** (red): Must fix - e.g., "Step 'Email' is missing an alias"
- **Warnings** (yellow): Should fix - e.g., "Phone field should use 'phone' type"
- **Suggestions** (blue): Nice to have - e.g., "Consider adding question mark"

Use the AI Assistant to fix issues: "Fix all the alias issues" or "Use proper field types"

---

## AI-Generated Logic Rules

### Creating Logic with Natural Language

Instead of configuring logic rules manually, describe what you want:

> "Only show the insurance details section if the user says they have insurance"

> "Make the company name field required if employment type is 'Employed'"

> "Skip to the summary section if the user selects 'No changes needed'"

### Supported Logic Actions

| Action | Description |
|--------|-------------|
| **Show** | Display a field/section when condition is met |
| **Hide** | Hide a field/section when condition is met |
| **Require** | Make a field required when condition is met |
| **Make Optional** | Remove required status when condition is met |
| **Skip To** | Jump to a specific section |

### Logic Conditions

| Operator | Example |
|----------|---------|
| equals | "If status equals 'Active'" |
| not equals | "If country is not 'USA'" |
| contains | "If comments contain 'urgent'" |
| greater than | "If age is greater than 18" |
| less than | "If income is less than 50000" |
| is empty | "If phone number is empty" |
| is not empty | "If email is provided" |

---

## Tips for Better Results

### Writing Good Descriptions

**Do:**
- Be specific about fields needed
- Mention field types when important (email, phone, date)
- Describe conditional logic upfront
- Include section groupings

**Don't:**
- Use vague descriptions ("make a form")
- Assume AI knows your business context
- Skip mentioning required fields

### Example: Good vs Bad

❌ **Bad:**
> "Create an application form"

✅ **Good:**
> "Create a job application form with sections for:
> 1. Personal info (name, email, phone - all required)
> 2. Education (degree level dropdown, school name, graduation year)
> 3. Work experience (current employer, job title, years of experience)
> 4. References (at least 2 references with name, relationship, and contact info)
> Include logic to show additional questions for candidates with 5+ years of experience."

### Iterative Refinement

Don't try to get everything perfect in one shot:

1. **Start simple** - Generate a basic structure
2. **Review quality** - Check the score and issues
3. **Refine step by step** - Use AI Assistant for changes
4. **Manual polish** - Fine-tune in the visual builder

### Using Templates as Starting Points

If you have a similar workflow:
1. Duplicate it
2. Use AI to modify: "Convert this customer survey into an employee satisfaction survey"

---

## FAQ

### How accurate is AI generation?

AI typically generates 80-90% of what you need correctly. Plan to spend a few minutes reviewing and refining the result.

### Can AI see my existing workflows?

When revising, AI sees the current workflow structure. It doesn't access other workflows or your data.

### What if AI generates something wrong?

- In Easy mode: Use the AI Assistant to fix it
- In Advanced mode: Discard changes and try different instructions
- Always: You can manually edit in the builder

### Is my data sent to AI providers?

Workflow descriptions and structures are sent to AI providers (Google Gemini, OpenAI, or Anthropic) for processing. No actual submission data is sent.

### Why is my quality score low?

Common reasons:
- Generic field names (field1, field2)
- Wrong field types (text instead of email)
- Missing required markers
- Too many fields in one section

### Can I use AI for existing workflows?

Yes! Open any workflow and use the AI Assistant to make changes.

### How do I add complex logic?

Describe it step by step:
1. "Add a yes/no question asking if they have dependents"
2. "Show the dependents section only if they answered yes"
3. "Make at least one dependent required if the section is shown"

### What's the difference between Generate and Revise?

- **Generate**: Creates a new workflow from scratch
- **Revise**: Modifies an existing workflow

---

## Need More Help?

- **Developer Documentation**: See [Architecture Guide](./ARCHITECTURE.md)
- **API Reference**: See [API Documentation](./API_REFERENCE.md)
- **Troubleshooting**: See [Troubleshooting Guide](./TROUBLESHOOTING.md)
