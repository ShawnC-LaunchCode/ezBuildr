# VaultLogic Encyclopedia: Variables in Documents

**The Complete Guide to Using Workflow Variables in Document Generation**

Version: 1.1.0
Last Updated: July 8, 2026
Audience: VaultLogic Users (Workflow Creators, Business Users)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Understanding Variables](#understanding-variables)
3. [Creating Variables](#creating-variables)
4. [Basic Variable Usage in Documents](#basic-variable-usage-in-documents)
5. [Advanced Variable Scenarios](#advanced-variable-scenarios)
6. [Real-World Use Cases](#real-world-use-cases)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Reference](#reference)

---

## Introduction

### What This Guide Covers

This comprehensive guide teaches you how to capture data in VaultLogic workflows and use it to generate personalized documents. Whether you're creating engagement letters, invoices, contracts, or reports, this guide will show you:

- How to create meaningful variable names for your workflow steps
- How to reference those variables in document templates
- Dozens of practical scenarios and patterns
- Advanced techniques for complex documents
- Solutions to common problems

### Who Should Read This

- **Workflow Creators** - Building workflows that generate documents
- **Template Designers** - Creating DOCX templates with placeholders
- **Business Users** - Understanding how data flows into documents
- **Administrators** - Setting up document generation workflows

### Prerequisites

Basic familiarity with:
- Creating workflows in VaultLogic
- Adding sections and steps to workflows
- Uploading document templates

---

## Understanding Variables

### What Are Variables?

In VaultLogic, **variables** are human-friendly names you give to workflow steps so you can easily reference the data collected in those steps. Instead of using cryptic step IDs like `step-abc-123-xyz`, you can use meaningful names like `clientName`, `email`, or `signatureDate`.

**Example:**
```
Without Variables:
  Step ID: step-f3a9c2d1-4b8e-4d9f-a1c3-7e8f9a0b1c2d
  Question: "What is your first name?"

With Variables:
  Variable Name: firstName
  Question: "What is your first name?"
```

### Why Use Variables?

1. **Readability** - `{{firstName}}` is easier to understand than `{{step-abc-123}}`
2. **Maintainability** - Variables don't change when you reorganize your workflow
3. **Documentation** - Self-documenting templates that anyone can understand
4. **Collaboration** - Team members can work on templates without confusion
5. **Reusability** - Templates can be adapted to different workflows easily

### How Variables Work

**The Journey of Data:**

1. **Collection** - User fills out workflow step (e.g., enters their name)
2. **Storage** - Data saved with variable name (e.g., `firstName = "John"`)
3. **Reference** - Template uses placeholder (e.g., `{{firstName}}`)
4. **Generation** - Document created with actual value (e.g., "John")

**Visual Flow:**
```
Workflow Step               Variable            Document Template
┌─────────────────┐        ┌──────────┐        ┌─────────────────┐
│ "Enter your     │   →    │firstName │   →    │ Hello {{firstName}}│
│  first name"    │        │ = "John" │        │                 │
│                 │        └──────────┘        │ Output:         │
│ [John      ]    │                             │ Hello John      │
└─────────────────┘                             └─────────────────┘
```

---

## Creating Variables

### Step 1: Add Steps to Your Workflow

First, create the steps that will collect data:

1. Open your workflow in the Visual Builder
2. Add a section (e.g., "Client Information")
3. Add steps (questions) to collect data

### Step 2: Assign Variable Names

For each step that collects data you want to use in documents:

1. **Select the step** in the sidebar
2. **Find "Variable (alias)" field** in the Step Settings panel
3. **Enter a descriptive name** (e.g., `clientName`, `serviceDate`)
4. **See the variable badge** appear next to the step in the sidebar

**Naming Rules:**
- Use camelCase: `firstName`, not `first_name` or `FirstName`
- Be descriptive: `clientEmail` is better than `email1`
- No spaces or special characters
- Must be unique within the workflow
- Cannot start with a number

**Good Variable Names:**
```
✓ firstName
✓ clientName
✓ effectiveDate
✓ totalAmount
✓ serviceType
✓ signatureDate
✓ billingAddress
✓ phoneNumber
```

**Poor Variable Names:**
```
✗ name1              (too generic)
✗ first name         (has space)
✗ First-Name         (has hyphen)
✗ 1stName            (starts with number)
✗ x                  (not descriptive)
✗ temp               (unclear purpose)
```

### Step 3: Document Your Variables

Keep a list of variables for reference:

| Variable Name | Question | Type | Example Value |
|--------------|----------|------|---------------|
| `clientName` | What is your company name? | Short Text | "Acme Corp" |
| `contactEmail` | Primary contact email? | Short Text | "john@acme.com" |
| `serviceType` | Type of service needed? | Radio | "Tax Preparation" |
| `startDate` | When should we begin? | Date | "2025-01-15" |

---

## Basic Variable Usage in Documents

### Simple Text Replacement

The most common use case: replace a placeholder with collected data.

**Template:**
```
Dear {{clientName}},

Thank you for choosing our services. We will contact you at {{contactEmail}}.
```

**Workflow Setup:**
- Step 1: "What is your company name?" → Variable: `clientName`
- Step 2: "Primary contact email?" → Variable: `contactEmail`

**Sample Data:**
```json
{
  "clientName": "Acme Corp",
  "contactEmail": "john@acme.com"
}
```

**Generated Document:**
```
Dear Acme Corp,

Thank you for choosing our services. We will contact you at john@acme.com.
```

---

### Using Multiple Variables

Most documents need many variables. Here's a complete engagement letter example:

**Template:**
```
ENGAGEMENT LETTER

Date: {{formatDate currentDate "MMMM DD, YYYY"}}

Dear {{clientName}},

This letter confirms our engagement to provide {{serviceType}} services for
{{companyName}}, effective {{formatDate effectiveDate "MMMM DD, YYYY"}}.

Point of Contact: {{contactPerson}}
Email: {{contactEmail}}
Phone: {{contactPhone}}

Our fee for this engagement is {{formatCurrency feeAmount "USD"}}.

Sincerely,
{{accountantName}}
{{firmName}}
```

**Workflow Variables:**
```
currentDate      → Current date (auto-populated)
clientName       → "John Smith" (client's name)
serviceType      → "tax preparation" (service selected)
companyName      → "Smith Industries LLC" (company name)
effectiveDate    → "2025-01-01" (start date)
contactPerson    → "Jane Doe" (main contact)
contactEmail     → "jane@smithind.com" (email)
contactPhone     → "(555) 123-4567" (phone)
feeAmount        → 2500.00 (fee amount)
accountantName   → "Robert Johnson, CPA" (your name)
firmName         → "Johnson & Associates" (your firm)
```

**Generated Document:**
```
ENGAGEMENT LETTER

Date: November 14, 2025

Dear John Smith,

This letter confirms our engagement to provide tax preparation services for
Smith Industries LLC, effective January 01, 2025.

Point of Contact: Jane Doe
Email: jane@smithind.com
Phone: (555) 123-4567

Our fee for this engagement is $2,500.00.

Sincerely,
Robert Johnson, CPA
Johnson & Associates
```

---

### Nested Variables (Grouped Data)

Organize related variables using dot notation:

**Template:**
```
CLIENT INFORMATION

Name: {{client.firstName}} {{client.lastName}}
Company: {{client.companyName}}
Address: {{client.address.street}}
         {{client.address.city}}, {{client.address.state}} {{client.address.zip}}

PRIMARY CONTACT

Name: {{contact.name}}
Email: {{contact.email}}
Phone: {{contact.phone}}
```

**Workflow Variables:**
```
client.firstName      → "John"
client.lastName       → "Smith"
client.companyName    → "Acme Corp"
client.address.street → "123 Main Street"
client.address.city   → "Springfield"
client.address.state  → "IL"
client.address.zip    → "62701"
contact.name          → "Jane Doe"
contact.email         → "jane@acme.com"
contact.phone         → "(555) 123-4567"
```

**Note:** You can create nested structures by using dots in your variable names when setting up workflow steps.

---

## Advanced Variable Scenarios

### Scenario 1: Conditional Content

Show or hide content based on variable values.

**Use Case:** Show premium benefits only if client selected premium service.

**Template:**
```
SERVICES INCLUDED

All clients receive:
- Monthly financial statements
- Quarterly tax estimates
- Annual tax return preparation

{{#isPremium}}
PREMIUM BENEFITS

As a premium client, you also receive:
- Weekly financial analysis
- Unlimited consulting calls
- Priority support
- Dedicated account manager
{{/isPremium}}
```

**Workflow Setup:**
- Step: "Select service tier" → Radio buttons: Standard, Premium
- Variable: `isPremium` → Set to `true` when "Premium" selected

**Result (Standard):**
```
SERVICES INCLUDED

All clients receive:
- Monthly financial statements
- Quarterly tax estimates
- Annual tax return preparation
```

**Result (Premium):**
```
SERVICES INCLUDED

All clients receive:
- Monthly financial statements
- Quarterly tax estimates
- Annual tax return preparation

PREMIUM BENEFITS

As a premium client, you also receive:
- Weekly financial analysis
- Unlimited consulting calls
- Priority support
- Dedicated account manager
```

---

### Scenario 2: Lists and Loops

Generate repeating content from arrays of data.

**Use Case:** Invoice with multiple line items.

**Template:**
```
INVOICE #{{invoiceNumber}}

Bill To: {{customer.name}}
Date: {{formatDate invoiceDate "MM/DD/YYYY"}}

ITEMS

{{#lineItems}}
{{description}} - {{formatCurrency amount "USD"}}
{{/lineItems}}

---
Subtotal: {{formatCurrency subtotal "USD"}}
Tax ({{taxRate}}%): {{formatCurrency taxAmount "USD"}}
TOTAL: {{formatCurrency total "USD"}}
```

**Workflow Variables:**
```json
{
  "invoiceNumber": "INV-2025-001",
  "customer": {
    "name": "Acme Corp"
  },
  "invoiceDate": "2025-11-14",
  "lineItems": [
    { "description": "Consulting - Q1 2025", "amount": 5000 },
    { "description": "Software License (Annual)", "amount": 1200 },
    { "description": "Training Services", "amount": 800 }
  ],
  "subtotal": 7000,
  "taxRate": 8.5,
  "taxAmount": 595,
  "total": 7595
}
```

**Generated Document:**
```
INVOICE #INV-2025-001

Bill To: Acme Corp
Date: 11/14/2025

ITEMS

Consulting - Q1 2025 - $5,000.00
Software License (Annual) - $1,200.00
Training Services - $800.00

---
Subtotal: $7,000.00
Tax (8.5%): $595.00
TOTAL: $7,595.00
```

---

### Scenario 3: Date Formatting

Display dates in various formats.

**Template:**
```
AGREEMENT DATES

Effective Date: {{formatDate effectiveDate "MMMM DD, YYYY"}}
Start Date: {{formatDate startDate "MM/DD/YYYY"}}
End Date: {{formatDate endDate "YYYY-MM-DD"}}
Review Date: {{formatDate reviewDate "MMM D, 'YY"}}

This agreement was signed on {{formatDate signatureDate "dddd, MMMM Do, YYYY"}}.
```

**Workflow Variables:**
```json
{
  "effectiveDate": "2025-01-15",
  "startDate": "2025-01-15",
  "endDate": "2026-01-15",
  "reviewDate": "2025-07-15",
  "signatureDate": "2025-01-10"
}
```

**Generated Document:**
```
AGREEMENT DATES

Effective Date: January 15, 2025
Start Date: 01/15/2025
End Date: 2026-01-15
Review Date: Jul 15, '25

This agreement was signed on Friday, January 10th, 2025.
```

**Common Date Formats:**
```
"MM/DD/YYYY"           → 11/14/2025
"YYYY-MM-DD"           → 2025-11-14
"MMMM DD, YYYY"        → November 14, 2025
"MMM D, YYYY"          → Nov 14, 2025
"dddd, MMMM Do, YYYY"  → Friday, November 14th, 2025
"M/D/YY"               → 11/14/25
```

---

### Scenario 4: Currency Formatting

Format monetary amounts correctly.

**Template:**
```
FEE SCHEDULE

Base Fee: {{formatCurrency baseFee "USD"}}
Additional Services: {{formatCurrency additionalFees "USD"}}
Subtotal: {{formatCurrency subtotal "USD"}}
Discount ({{discountPercent}}%): -{{formatCurrency discountAmount "USD"}}

TOTAL DUE: {{formatCurrency totalDue "USD"}}

Payment is due in {{paymentTerms}} days.
```

**Workflow Variables:**
```json
{
  "baseFee": 5000.00,
  "additionalFees": 1250.50,
  "subtotal": 6250.50,
  "discountPercent": 10,
  "discountAmount": 625.05,
  "totalDue": 5625.45,
  "paymentTerms": 30
}
```

**Generated Document:**
```
FEE SCHEDULE

Base Fee: $5,000.00
Additional Services: $1,250.50
Subtotal: $6,250.50
Discount (10%): -$625.05

TOTAL DUE: $5,625.45

Payment is due in 30 days.
```

**Supported Currencies:**
```
"USD" → $1,234.56
"EUR" → €1.234,56
"GBP" → £1,234.56
"CAD" → CA$1,234.56
"AUD" → A$1,234.56
"JPY" → ¥1,235 (no decimals)
```

---

### Scenario 5: Number Formatting

Format numbers with commas, decimals, percentages.

**Template:**
```
STATISTICS

Total Transactions: {{formatNumber transactionCount 0 true}}
Average Transaction: {{formatCurrency avgTransaction "USD"}}
Success Rate: {{formatNumber successRate 2 false}}%
Completion Rate: {{formatNumber completionRate 1 false}}%

{{#showDetailed}}
Peak Hour Volume: {{formatNumber peakVolume 0 true}}
Off-Peak Volume: {{formatNumber offPeakVolume 0 true}}
{{/showDetailed}}
```

**Workflow Variables:**
```json
{
  "transactionCount": 15847,
  "avgTransaction": 127.50,
  "successRate": 99.87,
  "completionRate": 98.5,
  "showDetailed": true,
  "peakVolume": 8923,
  "offPeakVolume": 6924
}
```

**Generated Document:**
```
STATISTICS

Total Transactions: 15,847
Average Transaction: $127.50
Success Rate: 99.87%
Completion Rate: 98.5%

Peak Hour Volume: 8,923
Off-Peak Volume: 6,924
```

---

### Scenario 6: Text Transformation

Change text case and formatting.

**Template:**
```
CLIENT: {{upper clientName}}
Email: {{lower clientEmail}}
Position: {{titleCase jobTitle}}

Legal Notice: {{upper legalText}}

Notes: {{capitalize notes}}
```

**Workflow Variables:**
```json
{
  "clientName": "john smith",
  "clientEmail": "John.Smith@ACME.COM",
  "jobTitle": "chief financial officer",
  "legalText": "this agreement is binding",
  "notes": "please review section 3 carefully"
}
```

**Generated Document:**
```
CLIENT: JOHN SMITH
Email: john.smith@acme.com
Position: Chief Financial Officer

Legal Notice: THIS AGREEMENT IS BINDING

Notes: Please review section 3 carefully
```

**Text Helpers:**
- `{{upper text}}` → UPPERCASE
- `{{lower text}}` → lowercase
- `{{capitalize text}}` → First letter uppercase
- `{{titleCase text}}` → Title Case Format

---

### Scenario 7: Default Values

Provide fallback values for optional fields.

**Template:**
```
CONTACT INFORMATION

Name: {{clientName}}
Company: {{defaultValue companyName "N/A"}}
Phone: {{defaultValue phoneNumber "Not provided"}}
Fax: {{defaultValue faxNumber "N/A"}}
Website: {{defaultValue website "Not provided"}}

PREFERENCES

Newsletter: {{defaultValue newsletter "No preference indicated"}}
```

**Workflow Variables (with missing values):**
```json
{
  "clientName": "John Smith",
  "companyName": "",
  "phoneNumber": "(555) 123-4567",
  "faxNumber": null,
  "website": "",
  "newsletter": ""
}
```

**Generated Document:**
```
CONTACT INFORMATION

Name: John Smith
Company: N/A
Phone: (555) 123-4567
Fax: N/A
Website: Not provided

PREFERENCES

Newsletter: No preference indicated
```

---

### Scenario 8: Mathematical Calculations

Simple two-value math can be done inline with the math helpers; each
argument can be a workflow variable or a literal number. For chained
calculations (subtotal → tax → total) or for formatting a calculated
result as currency, compute the value in the workflow first (a computed
step, transform block, or `beforeGeneration` document hook) — nested
sub-expressions with parentheses are not supported in templates.

**Template:**
```
PRICING BREAKDOWN

Base Price: {{formatCurrency basePrice "USD"}}
Quantity: {{quantity}}
Units + spares: {{add quantity 2}}

Subtotal: {{formatCurrency subtotal "USD"}}
Tax Rate: {{taxRate}}%
Tax Amount: {{formatCurrency taxAmount "USD"}}

TOTAL: {{formatCurrency total "USD"}}

Per Unit Cost: {{formatCurrency perUnitCost "USD"}}
```

**Workflow Variables** (subtotal, taxAmount, total, and perUnitCost
computed in the workflow):
```json
{
  "basePrice": 99.99,
  "quantity": 5,
  "taxRate": 8.5,
  "subtotal": 499.95,
  "taxAmount": 42.5,
  "total": 542.45,
  "perUnitCost": 108.49
}
```

**Generated Document:**
```
PRICING BREAKDOWN

Base Price: $99.99
Quantity: 5
Units + spares: 7

Subtotal: $499.95
Tax Rate: 8.5%
Tax Amount: $42.50

TOTAL: $542.45

Per Unit Cost: $108.49
```

**Math Helpers** (arguments may be variables or literal numbers; the
result renders as a plain number — compute in the workflow if you need
to format the result as currency):
- `{{add a b}}` → Addition
- `{{subtract a b}}` → Subtraction
- `{{multiply a b}}` → Multiplication
- `{{divide a b}}` → Division

---

### Scenario 9: Pluralization

Adjust text based on quantity.

**Template:**
```
ORDER SUMMARY

You have ordered {{itemCount}} {{pluralize itemCount "item" "items"}}.

Delivery will take {{deliveryDays}} {{pluralize deliveryDays "day" "days"}}.

{{#hasMultipleAddresses}}
Your order will be shipped to {{addressCount}} different {{pluralize addressCount "address" "addresses"}}.
{{/hasMultipleAddresses}}

Thank you for your {{pluralize orderCount "order" "orders"}}!
```

**Workflow Variables:**
```json
{
  "itemCount": 3,
  "deliveryDays": 1,
  "hasMultipleAddresses": true,
  "addressCount": 2,
  "orderCount": 1
}
```

**Generated Document:**
```
ORDER SUMMARY

You have ordered 3 items.

Delivery will take 1 day.

Your order will be shipped to 2 different addresses.

Thank you for your order!
```

---

### Scenario 10: Array Operations

Work with lists of items.

**Template:**
```
TEAM MEMBERS

Team Size: {{length teamMembers}}
Team Lead: {{first teamMembers}}
Newest Member: {{last teamMembers}}

All Members: {{join teamMembers ", "}}

{{#teamMembers}}
- {{name}} ({{role}})
{{/teamMembers}}
```

**Workflow Variables:**
```json
{
  "teamMembers": [
    { "name": "Alice Johnson", "role": "Project Manager" },
    { "name": "Bob Smith", "role": "Developer" },
    { "name": "Carol White", "role": "Designer" },
    { "name": "David Brown", "role": "QA Engineer" }
  ]
}
```

**Generated Document:**
```
TEAM MEMBERS

Team Size: 4
Team Lead: Alice Johnson
Newest Member: David Brown

All Members: Alice Johnson, Bob Smith, Carol White, David Brown

- Alice Johnson (Project Manager)
- Bob Smith (Developer)
- Carol White (Designer)
- David Brown (QA Engineer)
```

**Array Helpers:**
- `{{length array}}` → Number of items
- `{{first array}}` → First item
- `{{last array}}` → Last item
- `{{join array ", "}}` → Join with separator

---

### Scenario 11: Truncating Long Text

Limit text length with ellipsis.

**Template:**
```
SUMMARY

Full Description:
{{description}}

Short Version: {{truncate description 100 "..."}}

Preview: {{truncate description 50}}
```

**Workflow Variables:**
```json
{
  "description": "This is a comprehensive document generation system that allows you to create complex templates with variables, loops, conditionals, and 25+ helper functions for transforming data."
}
```

**Generated Document:**
```
SUMMARY

Full Description:
This is a comprehensive document generation system that allows you to create complex templates with variables, loops, conditionals, and 25+ helper functions for transforming data.

Short Version: This is a comprehensive document generation system that allows you to create complex templates with...

Preview: This is a comprehensive document generation system
```

---

### Scenario 12: Empty Value Checks

Conditionally show content based on whether fields are empty.

> **Closing-tag rule:** a closing tag must repeat the opening tag's text
> exactly (`{{#isPremium}}...{{/isPremium}}`) or be the empty close
> `{{/}}`. Helper-driven sections like `{{#isNotEmpty notes}}` should be
> closed with `{{/}}`.

**Template:**
```
OPTIONAL INFORMATION

{{#isNotEmpty middleName}}
Middle Name: {{middleName}}
{{/}}

{{#isNotEmpty suffix}}
Suffix: {{suffix}}
{{/}}

{{#isEmpty notes}}
No additional notes provided.
{{/}}

{{#isNotEmpty notes}}
Additional Notes: {{notes}}
{{/}}
```

**Workflow Variables:**
```json
{
  "middleName": "Allen",
  "suffix": "",
  "notes": ""
}
```

**Generated Document:**
```
OPTIONAL INFORMATION

Middle Name: Allen

No additional notes provided.
```

---

## Real-World Use Cases

### Use Case 1: Law Firm Engagement Letter

**Business Need:** Generate personalized engagement letters for new clients with service details and fee structure.

**Workflow Steps:**
1. Client name, company, address
2. Matter description
3. Service type selection (checkboxes)
4. Hourly rates by attorney
5. Estimated hours
6. Retainer amount
7. Billing terms

**Template Excerpt:**
```
ENGAGEMENT LETTER

{{formatDate currentDate "MMMM DD, YYYY"}}

{{client.firstName}} {{client.lastName}}
{{client.companyName}}
{{client.address.street}}
{{client.address.city}}, {{client.address.state}} {{client.address.zip}}

Re: {{matterDescription}}

Dear {{client.firstName}}:

We are pleased that you have selected {{firmName}} to represent you. This letter
confirms the terms of our engagement.

SCOPE OF SERVICES

We will provide the following services:
{{#selectedServices}}
- {{serviceName}}
{{/selectedServices}}

FEES AND BILLING

Our hourly rates are as follows:
{{#attorneys}}
{{name}} ({{title}}): {{formatCurrency hourlyRate "USD"}}/hour
{{/attorneys}}

We estimate this matter will require approximately {{estimatedHours}} hours,
resulting in an estimated fee of {{formatCurrency estimatedFee "USD"}}.

We require a retainer of {{formatCurrency retainerAmount "USD"}}, which will be
applied against fees and costs incurred.

Invoices are issued monthly and payment is due within {{paymentTerms}} days.

{{#clientApprovalRequired}}
APPROVAL REQUIREMENT

For any single task expected to exceed {{formatCurrency approvalThreshold "USD"}},
we will seek your approval before proceeding.
{{/clientApprovalRequired}}

Please sign and return a copy of this letter to confirm your acceptance.

Sincerely,

{{partner.name}}
{{partner.title}}
{{firmName}}


ACCEPTED AND AGREED:

_________________________    Date: ___________
{{client.firstName}} {{client.lastName}}
```

---

### Use Case 2: Healthcare Intake Form Summary

**Business Need:** Generate patient intake summary for medical records.

**Workflow Steps:**
1. Patient demographics
2. Insurance information
3. Medical history (checkboxes)
4. Current medications (repeating section)
5. Allergies
6. Emergency contact

**Template Excerpt:**
```
PATIENT INTAKE SUMMARY

Date: {{formatDate intakeDate "MM/DD/YYYY"}}

PATIENT INFORMATION

Name: {{patient.lastName}}, {{patient.firstName}} {{patient.middleInitial}}
Date of Birth: {{formatDate patient.dob "MM/DD/YYYY"}} (Age: {{patient.age}})
Gender: {{patient.gender}}
SSN: {{patient.ssn}}
Phone: {{patient.phone}}
Email: {{patient.email}}

Address:
{{patient.address.street}}
{{patient.address.city}}, {{patient.address.state}} {{patient.address.zip}}

INSURANCE

Primary Insurance: {{insurance.primary.carrier}}
Policy #: {{insurance.primary.policyNumber}}
Group #: {{insurance.primary.groupNumber}}
Subscriber: {{insurance.primary.subscriberName}}

{{#insurance.hasSecondary}}
Secondary Insurance: {{insurance.secondary.carrier}}
Policy #: {{insurance.secondary.policyNumber}}
{{/insurance.hasSecondary}}

MEDICAL HISTORY

{{#medicalConditions}}
☑ {{conditionName}}
{{/medicalConditions}}

{{#isEmpty medicalConditions}}
No pre-existing conditions reported.
{{/}}

CURRENT MEDICATIONS

{{#medications}}
{{#isNotEmpty medications}}
{{medicationName}} - {{dosage}} - {{frequency}}
Prescribing Doctor: {{prescribingDoctor}}
{{/}}
{{/medications}}

{{#isEmpty medications}}
No current medications.
{{/}}

ALLERGIES

{{#allergies}}
⚠ {{allergyName}} - Reaction: {{reactionType}}
{{/allergies}}

{{#isEmpty allergies}}
No known allergies.
{{/}}

EMERGENCY CONTACT

Name: {{emergency.name}}
Relationship: {{emergency.relationship}}
Phone: {{emergency.phone}}
Alternate Phone: {{defaultValue emergency.alternatePhone "N/A"}}
```

---

### Use Case 3: Real Estate Purchase Agreement

**Business Need:** Generate property purchase agreements with buyer/seller details, property information, and terms.

**Template Excerpt:**
```
REAL ESTATE PURCHASE AGREEMENT

This Purchase Agreement ("Agreement") is entered into on
{{formatDate agreementDate "MMMM DD, YYYY"}}, by and between:

SELLER: {{seller.name}}
Address: {{seller.address}}
Phone: {{seller.phone}}
Email: {{seller.email}}

BUYER: {{buyer.name}}
Address: {{buyer.address}}
Phone: {{buyer.phone}}
Email: {{buyer.email}}

PROPERTY DESCRIPTION

The Seller agrees to sell and the Buyer agrees to purchase the following property:

Property Address: {{property.address}}
Legal Description: {{property.legalDescription}}
Parcel ID: {{property.parcelId}}
Lot Size: {{property.lotSize}} acres
Year Built: {{property.yearBuilt}}

PURCHASE TERMS

Purchase Price: {{formatCurrency purchasePrice "USD"}}

Earnest Money Deposit: {{formatCurrency earnestMoney "USD"}}
  Due: {{formatDate earnestMoneyDueDate "MM/DD/YYYY"}}

Down Payment: {{formatCurrency downPayment "USD"}} ({{downPaymentPercent}}%)
  Due: {{formatDate downPaymentDueDate "MM/DD/YYYY"}}

Loan Amount: {{formatCurrency loanAmount "USD"}}

Closing Costs (estimated): {{formatCurrency closingCosts "USD"}}
  Paid by: {{closingCostsPaidBy}}

CONTINGENCIES

This offer is contingent upon:

{{#contingencies}}
☐ {{contingencyType}}
   Deadline: {{formatDate deadline "MM/DD/YYYY"}}
   {{#notes}}Notes: {{notes}}{{/notes}}
{{/contingencies}}

CLOSING

Closing Date: {{formatDate closingDate "MMMM DD, YYYY"}}
Closing Location: {{closingLocation}}

INCLUSIONS

The following items are included in the sale:
{{#inclusions}}
- {{itemName}}
{{/inclusions}}

EXCLUSIONS

The following items are excluded from the sale:
{{#exclusions}}
- {{itemName}}
{{/exclusions}}

{{#hasHomeWarranty}}
HOME WARRANTY

A home warranty covering {{homeWarranty.coverage}} will be provided for
{{homeWarranty.duration}} months at a cost of {{formatCurrency homeWarranty.cost "USD"}},
to be paid by {{homeWarranty.paidBy}}.
{{/hasHomeWarranty}}
```

---

### Use Case 4: SaaS Customer Onboarding Report

**Business Need:** Generate onboarding completion report for internal team with customer setup details.

**Template Excerpt:**
```
CUSTOMER ONBOARDING REPORT

Generated: {{formatDate reportDate "MMMM DD, YYYY 'at' h:mm A"}}

CUSTOMER INFORMATION

Company: {{customer.companyName}}
Industry: {{customer.industry}}
Size: {{customer.employeeCount}} employees
Plan: {{upper customer.planTier}} Plan
MRR: {{formatCurrency customer.monthlyRevenue "USD"}}

Primary Contact: {{contact.name}} ({{contact.title}})
Email: {{contact.email}}
Phone: {{contact.phone}}

ONBOARDING STATUS

Start Date: {{formatDate onboarding.startDate "MM/DD/YYYY"}}
Target Completion: {{formatDate onboarding.targetDate "MM/DD/YYYY"}}
Actual Completion: {{defaultValue onboarding.completionDateFormatted "In Progress"}}

Overall Progress: {{onboarding.progressPercent}}%

CHECKLIST

{{#checklistItems}}
{{#completed}}✓{{/completed}}{{^completed}}☐{{/completed}} {{taskName}}
   Assigned to: {{assignedTo}}
   {{#completed}}Completed: {{formatDate completedDate "MM/DD/YYYY"}}{{/completed}}
   {{^completed}}Status: {{status}}{{/completed}}
{{/checklistItems}}

CONFIGURATION DETAILS

Features Enabled: {{length enabledFeatures}}
{{#enabledFeatures}}
- {{featureName}} (enabled {{formatDate enabledDate "MM/DD/YYYY"}})
{{/enabledFeatures}}

Integrations Configured:
{{#integrations}}
- {{integrationName}}: {{status}}
  {{#isNotEmpty notes}}Notes: {{notes}}{{/}}
{{/integrations}}

{{#isEmpty integrations}}
No integrations configured yet.
{{/}}

TRAINING

Sessions Scheduled: {{length trainingSessions}}
{{#trainingSessions}}
{{sessionName}}
  Date: {{formatDate sessionDate "MM/DD/YYYY 'at' h:mm A"}}
  Attendees: {{join attendees ", "}}
  Duration: {{duration}} minutes
  {{#completed}}✓ Completed{{/completed}}{{^completed}}⏳ Upcoming{{/completed}}
{{/trainingSessions}}

SUPPORT TICKETS

Total Tickets: {{length supportTickets}}
Open: {{openTicketCount}}
Resolved: {{resolvedTicketCount}}
Avg Resolution Time: {{avgResolutionHours}} hours

{{#hasOpenTickets}}
OPEN TICKETS:
{{#supportTickets}}
{{^resolved}}
Ticket #{{ticketNumber}}: {{subject}}
  Priority: {{upper priority}}
  Age: {{ageInDays}} days
{{/resolved}}
{{/supportTickets}}
{{/hasOpenTickets}}

HEALTH SCORE

Overall: {{healthScore}}/100
Login Frequency: {{loginFrequency}}/week
Feature Adoption: {{featureAdoptionPercent}}%
Support Satisfaction: {{supportSatisfactionScore}}/5

NEXT STEPS

{{#nextSteps}}
{{stepNumber}}. {{actionItem}}
    Owner: {{owner}}
    Due: {{formatDate dueDate "MM/DD/YYYY"}}
{{/nextSteps}}

NOTES

{{defaultValue additionalNotes "No additional notes."}}

---
Report prepared by: {{preparedBy.name}}
Account Manager: {{accountManager.name}} ({{accountManager.email}})
```

---

### Use Case 5: Financial Advisory Client Report

**Business Need:** Generate quarterly investment performance report with portfolio details.

**Template Excerpt:**
```
QUARTERLY INVESTMENT REPORT

{{upper reportPeriod}} Quarter {{reportYear}}

CONFIDENTIAL

Prepared for:
{{client.name}}
Account #: {{client.accountNumber}}

Report Date: {{formatDate reportDate "MMMM DD, YYYY"}}
Reporting Period: {{formatDate periodStart "MM/DD/YYYY"}} - {{formatDate periodEnd "MM/DD/YYYY"}}

PORTFOLIO SUMMARY

Beginning Balance: {{formatCurrency beginningBalance "USD"}}
Ending Balance: {{formatCurrency endingBalance "USD"}}
Net Change: {{formatCurrency netChange "USD"}} ({{formatNumber changePercent 2}}%)

Contributions: {{formatCurrency contributions "USD"}}
Withdrawals: {{formatCurrency withdrawals "USD"}}
Investment Gain/Loss: {{formatCurrency investmentChange "USD"}}

ASSET ALLOCATION

Target vs. Actual:

{{#assetClasses}}
{{className}}:
  Target: {{targetPercent}}%
  Actual: {{actualPercent}}%
  Value: {{formatCurrency currentValue "USD"}}
  {{#needsRebalancing}}⚠ Rebalancing recommended{{/needsRebalancing}}
{{/assetClasses}}

PERFORMANCE BY HOLDING

{{#holdings}}
{{securityName}} ({{ticker}})
  Shares: {{formatNumber shares 2}}
  Price: {{formatCurrency currentPrice "USD"}}
  Value: {{formatCurrency marketValue "USD"}}
  Cost Basis: {{formatCurrency costBasis "USD"}}
  Gain/Loss: {{formatCurrency gainLoss "USD"}} ({{formatNumber gainLossPercent 2}}%)
  Yield: {{formatNumber yieldPercent 2}}%
{{/holdings}}

INCOME SUMMARY

Dividends: {{formatCurrency dividends "USD"}}
Interest: {{formatCurrency interest "USD"}}
Capital Gains: {{formatCurrency capitalGains "USD"}}
Total Income: {{formatCurrency totalIncome "USD"}}

TRANSACTIONS

This quarter, we executed {{transactionCount}} {{pluralize transactionCount "transaction" "transactions"}}:

{{#transactions}}
{{formatDate transactionDate "MM/DD/YYYY"}} - {{transactionType}}: {{securityName}}
  {{#isBuy}}Purchased{{/isBuy}}{{#isSell}}Sold{{/isSell}} {{formatNumber shares 2}} shares at {{formatCurrency price "USD"}}
  Amount: {{formatCurrency amount "USD"}}
{{/transactions}}

FEES

Management Fee: {{formatCurrency managementFee "USD"}} ({{managementFeePercent}}% annually)
Other Fees: {{formatCurrency otherFees "USD"}}
Total Fees: {{formatCurrency totalFees "USD"}}

RECOMMENDATIONS

{{#recommendations}}
{{recommendationNumber}}. {{recommendationText}}
   Rationale: {{rationale}}
   {{#urgency}}{{upper urgency}} Priority{{/urgency}}
{{/recommendations}}

{{#isEmpty recommendations}}
No recommendations at this time. Portfolio is well-positioned.
{{/}}

MARKET COMMENTARY

{{marketCommentary}}

NEXT REVIEW

Your next quarterly review is scheduled for {{formatDate nextReviewDate "MMMM DD, YYYY"}}.

---
Prepared by: {{advisor.name}}, {{advisor.credentials}}
{{firmName}}
Phone: {{advisor.phone}} | Email: {{advisor.email}}

This report is for informational purposes only and does not constitute
investment advice. Past performance does not guarantee future results.
```

---

## Best Practices

### 1. Variable Naming Conventions

**Use Consistent Patterns:**
```
✓ Good Pattern (camelCase):
  firstName, lastName, emailAddress
  companyName, streetAddress, zipCode
  startDate, endDate, effectiveDate
  basePrice, taxRate, totalAmount

✗ Inconsistent:
  FirstName, last_name, email-address
  Company_Name, StreetAddr, zip
```

**Group Related Variables:**
```
✓ Grouped:
  client.firstName
  client.lastName
  client.email

  billing.address
  billing.city
  billing.state

✗ Flat (harder to manage):
  clientFirstName
  clientLastName
  clientEmail
  billingAddress
  billingCity
  billingState
```

---

### 2. Document Your Templates

Create a "Template Guide" document for each template:

**Example Template Guide:**

```markdown
# Engagement Letter Template - Variable Reference

## Required Variables
- clientName (text) - Client's full name or company name
- serviceType (text) - Type of service being provided
- effectiveDate (date) - When services begin
- feeAmount (number) - Total fee amount

## Optional Variables
- discountPercent (number) - Discount percentage if applicable
- paymentTerms (number) - Days until payment due (default: 30)
- specialProvisions (text) - Additional contract terms

## Loops
- selectedServices (array) - List of services selected
  - serviceName (text)
  - serviceDescription (text)

## Conditionals
- hasDiscount (boolean) - Show discount section
- requiresApproval (boolean) - Show approval clause
```

---

### 3. Test with Sample Data

Always test templates before using in production:

**Testing Checklist:**
- [ ] All required variables populated
- [ ] Optional variables with empty/null values
- [ ] Arrays with 0, 1, and multiple items
- [ ] Conditionals in both true and false states
- [ ] Date formats display correctly
- [ ] Currency formats show proper symbols
- [ ] Numbers format with correct decimals
- [ ] Text transformations work (upper, lower, etc.)
- [ ] Default values appear when expected
- [ ] No unexpected blank spots (missing variables render as empty strings)

---

### 4. Handle Missing Data Gracefully

**Use Default Values:**
```
✓ Good:
  Middle Initial: {{defaultValue middleInitial "N/A"}}
  Fax: {{defaultValue faxNumber "Not provided"}}

✗ Bad:
  Middle Initial: {{middleInitial}}
  (Shows nothing if empty)
```

**Check Before Displaying:**
```
✓ Good:
  {{#isNotEmpty phoneNumber}}
  Phone: {{phoneNumber}}
  {{/}}

✗ Bad:
  Phone: {{phoneNumber}}
  (Shows "Phone: " with no number)
```

---

### 5. Format Data Appropriately

**Dates - Always Format:**
```
✓ Good: {{formatDate signatureDate "MMMM DD, YYYY"}}
✗ Bad: {{signatureDate}}
  (Shows: 2025-11-14T00:00:00Z - not user-friendly)
```

**Currency - Always Format:**
```
✓ Good: {{formatCurrency totalAmount "USD"}}
✗ Bad: ${totalAmount}
  (Shows: $5000 instead of $5,000.00)
```

**Large Numbers - Use Commas:**
```
✓ Good: {{formatNumber quantity 0 true}}
✗ Bad: {{quantity}}
  (Shows: 150000 instead of 150,000)
```

---

### 6. Keep Templates Maintainable

**Document Your Sections:**

Template comments are not supported — any `{{...}}` tag is treated as a
variable or section. Keep authoring notes outside the merge area (for
example in the template's description in ezBuildr, or in a separate
reference copy of the document).

**Break Complex Expressions:**

Nested sub-expressions with parentheses are **not supported**. Compute
derived values in the workflow (a computed step, transform block, or a
`beforeGeneration` document hook), then reference the result:

```
✗ Not supported:
  Total: {{formatCurrency (add subtotal taxAmount) "USD"}}

✓ Supported (compute subtotal/taxAmount/total in the workflow):
  Subtotal: {{formatCurrency subtotal "USD"}}
  Tax: {{formatCurrency taxAmount "USD"}}
  Total: {{formatCurrency total "USD"}}

✓ Simple two-variable math works inline:
  Line total: {{multiply price quantity}}
```

---

### 7. Version Control Your Templates

**Track Changes:**
- Save template files with version numbers
- Document what changed in each version
- Keep old versions as backups
- Test new versions before deploying

**Example Versioning:**
```
engagement-letter-v1.0.docx  (Initial version)
engagement-letter-v1.1.docx  (Added discount section)
engagement-letter-v2.0.docx  (Major redesign)
```

---

### 8. Provide User Guidance

**In Workflow Questions:**
```
Question: "Client's First Name"
Helptext: "This will appear in the engagement letter greeting"
Variable: firstName

Question: "Effective Date"
Helptext: "The date when services will officially begin (used in all generated documents)"
Variable: effectiveDate
```

---

## Troubleshooting

### Problem: Variable Not Showing in Document

**Symptom:** The spot where a value should appear is **blank** in the
generated document. (Unmatched variables render as an empty string —
you will not see `{{variableName}}` left behind. If you DO see the raw
`{{...}}` text, the template was not processed at all, or the tag is
malformed/split by Word formatting.)

**Possible Causes:**

1. **Variable name mismatch**
   ```
   Template: {{firstName}}
   Workflow Variable: first_name

   Fix: Make sure names match exactly (case-sensitive)
   ```

2. **Variable not set**
   ```
   User skipped the question or field was optional

   Fix: Use default value:
   {{defaultValue firstName "Not provided"}}
   ```

3. **Wrong template mapping**
   ```
   Template expects: clientName
   Workflow has: customerName

   Fix: Update template or add alias in workflow
   ```

**How to Debug:**
1. Check variable names in workflow (look for badges in sidebar)
2. Download template and search for placeholder
3. Verify spelling and case match exactly
4. Test with sample data using Template Test Runner

---

### Problem: Date Shows as Long String

**Symptom:** Date shows as `2025-11-14T00:00:00.000Z`

**Cause:** Missing `formatDate` helper

**Fix:**
```
✗ Wrong: {{effectiveDate}}
✓ Correct: {{formatDate effectiveDate "MMMM DD, YYYY"}}
```

---

### Problem: Currency Missing Commas or Decimals

**Symptom:** Amount shows as `5000` instead of `$5,000.00`

**Cause:** Missing `formatCurrency` helper

**Fix:**
```
✗ Wrong: ${totalAmount}
✓ Correct: {{formatCurrency totalAmount "USD"}}
```

---

### Problem: Loop Not Repeating

**Symptom:** Loop only shows first item or nothing

**Possible Causes:**

1. **Incorrect syntax**
   ```
   ✗ Wrong: {{#items}}{{name}}{{/item}}
   ✓ Correct: {{#items}}{{name}}{{/items}}

   (Opening and closing tags must match)
   ```

2. **Variable is not an array**
   ```
   Variable should be array of objects:
   [
     { "name": "Item 1" },
     { "name": "Item 2" }
   ]

   Not a single object:
   { "name": "Item 1" }
   ```

3. **Empty array**
   ```
   Add fallback:

   {{#items}}
   - {{name}}
   {{/items}}

   {{#isEmpty items}}
   No items available.
   {{/}}
   ```

---

### Problem: Conditional Always/Never Shows

**Symptom:** Content shows when it shouldn't or never shows

**Possible Causes:**

1. **Boolean value not set correctly**
   ```
   Must be: true or false
   Not: "yes", "no", 1, 0, "true", "false"
   ```

2. **Wrong variable in condition**
   ```
   Template: {{#isPremium}}
   Workflow Variable: premium_status

   Fix: Names must match exactly
   ```

3. **Inverted logic**
   ```
   To show when FALSE, use caret:
   {{^isPremium}}
   This shows for standard clients
   {{/isPremium}}
   ```

---

### Problem: Numbers Don't Format

**Symptom:** Numbers show too many decimals or no commas

**Fix:**
```
{{formatNumber value decimalPlaces useCommas}}

Examples:
{{formatNumber count 0 true}}      → 1,234
{{formatNumber percent 2 false}}   → 99.99
{{formatNumber amount 2 true}}     → 1,234.56
```

---

### Problem: Helper Function Not Working

**Symptom:** Helper shows as text instead of transforming

**Cause:** Template engine version

**Fix:**
Make sure Template Node config uses engine v2:
```json
{
  "templateKey": "engagement_letter",
  "bindings": { ... },
  "engine": "v2",
  "toPdf": true
}
```

---

### Problem: Special Characters Look Wrong

**Symptom:** Accented letters, symbols, or emoji don't display correctly

**Possible Causes:**

1. **Font doesn't support character**
   ```
   Fix: Use a Unicode font (Arial, Times New Roman, Calibri)
   ```

2. **Encoding issue**
   ```
   Ensure data is UTF-8 encoded
   ```

**Test String:**
```
Test: ñ é ü ö ā € £ ¥ © ® ™ • – — " " ' '
```

---

## Reference

### Complete Helper Function List

| Helper | Syntax | Example Input | Example Output |
|--------|--------|---------------|----------------|
| **Text Transformation** |
| `upper` | `{{upper text}}` | "hello" | "HELLO" |
| `lower` | `{{lower text}}` | "HELLO" | "hello" |
| `capitalize` | `{{capitalize text}}` | "hello world" | "Hello world" |
| `titleCase` | `{{titleCase text}}` | "hello world" | "Hello World" |
| **Date Formatting** |
| `formatDate` | `{{formatDate date "format"}}` | "2025-11-14", "MM/DD/YYYY" | "11/14/2025" |
| **Currency Formatting** |
| `formatCurrency` | `{{formatCurrency amount "currency"}}` | 1234.56, "USD" | "$1,234.56" |
| **Number Formatting** |
| `formatNumber` | `{{formatNumber num decimals commas}}` | 1234.567, 2, true | "1,234.57" |
| **Array Operations** |
| `length` | `{{length array}}` | [1,2,3] | 3 |
| `first` | `{{first array}}` | ["a","b","c"] | "a" |
| `last` | `{{last array}}` | ["a","b","c"] | "c" |
| `join` | `{{join array "separator"}}` | ["a","b","c"], ", " | "a, b, c" |
| **Conditional** |
| `isEmpty` | `{{isEmpty value}}` | "" | true |
| `isNotEmpty` | `{{isNotEmpty value}}` | "text" | true |
| `defaultValue` | `{{defaultValue value "default"}}` | "", "N/A" | "N/A" |
| **Math** |
| `add` | `{{add a b}}` | 5, 3 | 8 |
| `subtract` | `{{subtract a b}}` | 5, 3 | 2 |
| `multiply` | `{{multiply a b}}` | 5, 3 | 15 |
| `divide` | `{{divide a b}}` | 6, 3 | 2 |
| **String Operations** |
| `pluralize` | `{{pluralize count "sing" "plur"}}` | 2, "item", "items" | "items" |
| `truncate` | `{{truncate text length "suffix"}}` | "Hello World", 5, "..." | "Hello..." |
| `replace` | `{{replace text "old" "new"}}` | "Hello World", "World", "There" | "Hello There" |

---

### Date Format Tokens

| Token | Meaning | Example |
|-------|---------|---------|
| `YYYY` | 4-digit year | 2025 |
| `YY` | 2-digit year | 25 |
| `MMMM` | Full month name | November |
| `MMM` | Short month name | Nov |
| `MM` | 2-digit month | 11 |
| `M` | Month | 11 |
| `DD` | 2-digit day | 14 |
| `D` | Day | 14 |
| `Do` | Day with ordinal | 14th |
| `dddd` | Full day name | Friday |
| `ddd` | Short day name | Fri |
| `HH` | 24-hour (00-23) | 14 |
| `hh` | 12-hour (01-12) | 02 |
| `h` | 12-hour (1-12) | 2 |
| `mm` | Minutes | 30 |
| `ss` | Seconds | 45 |
| `A` | AM/PM | PM |

Literal text goes in single quotes: `"MMMM DD, YYYY 'at' h:mm A"` →
`November 14, 2025 at 3:30 PM`.

**Common Combinations:**
```
"MM/DD/YYYY"           → 11/14/2025
"MMMM DD, YYYY"        → November 14, 2025
"MMM D, YYYY"          → Nov 14, 2025
"YYYY-MM-DD"           → 2025-11-14
"dddd, MMMM D, YYYY"   → Friday, November 14, 2025
"M/D/YY"               → 11/14/25
"MMMM Do, YYYY"        → November 14th, 2025
```

---

### Currency Codes

| Code | Currency | Symbol | Example |
|------|----------|--------|---------|
| `USD` | US Dollar | $ | $1,234.56 |
| `EUR` | Euro | € | €1.234,56 |
| `GBP` | British Pound | £ | £1,234.56 |
| `CAD` | Canadian Dollar | CA$ | CA$1,234.56 |
| `AUD` | Australian Dollar | A$ | A$1,234.56 |
| `JPY` | Japanese Yen | ¥ | ¥1,235 |
| `CHF` | Swiss Franc | CHF | CHF 1'234.56 |
| `CNY` | Chinese Yuan | ¥ | ¥1,234.56 |
| `INR` | Indian Rupee | ₹ | ₹1,234.56 |
| `MXN` | Mexican Peso | $ | $1,234.56 |

---

### Variable Naming Quick Reference

**Valid Characters:**
- Letters: a-z, A-Z
- Numbers: 0-9 (not as first character)
- No spaces, hyphens, or special characters

**Naming Styles:**

| Style | Example | Use Case |
|-------|---------|----------|
| camelCase | `firstName` | Recommended |
| PascalCase | `FirstName` | Avoid |
| snake_case | `first_name` | Avoid |
| kebab-case | `first-name` | Invalid |

**Length:**
- Minimum: 2 characters
- Maximum: 100 characters
- Optimal: 10-20 characters

**Examples by Category:**

```
Contact Information:
  firstName, lastName, middleName
  email, phoneNumber, mobileNumber
  faxNumber, website

Address:
  streetAddress, addressLine2
  city, state, stateCode
  zipCode, postalCode, country

Business:
  companyName, businessName
  taxId, ein, vatNumber
  industry, businessType

Financial:
  amount, totalAmount, subtotal
  taxAmount, discountAmount
  balance, payment, fee

Dates:
  startDate, endDate, effectiveDate
  dueDate, expiryDate, completionDate
  createdDate, modifiedDate

Identifiers:
  customerId, accountNumber, orderId
  invoiceNumber, referenceNumber
  transactionId, confirmationCode
```

---

## Appendix: Complete Examples

### Example A: Multi-Section Client Onboarding

**Workflow Structure:**
```
Section 1: Company Information
  - companyName
  - industry
  - yearFounded
  - employeeCount
  - annualRevenue

Section 2: Primary Contact
  - contact.firstName
  - contact.lastName
  - contact.title
  - contact.email
  - contact.phone

Section 3: Billing Information
  - billing.address
  - billing.city
  - billing.state
  - billing.zip
  - billing.paymentMethod

Section 4: Service Selection
  - services (array with checkboxes)
  - startDate
  - contractTerm
```

**Template:**
```
CLIENT ONBOARDING SUMMARY

Generated: {{formatDate today "MMMM DD, YYYY"}}

══════════════════════════════════════════════════

COMPANY PROFILE

Company Name: {{companyName}}
Industry: {{industry}}
Founded: {{yearFounded}}
Size: {{formatNumber employeeCount 0 true}} employees
Annual Revenue: {{formatCurrency annualRevenue "USD"}}

══════════════════════════════════════════════════

PRIMARY CONTACT

{{contact.firstName}} {{contact.lastName}}
{{contact.title}}

📧 {{contact.email}}
📱 {{contact.phone}}

══════════════════════════════════════════════════

BILLING INFORMATION

{{billing.address}}
{{billing.city}}, {{billing.state}} {{billing.zip}}

Payment Method: {{billing.paymentMethod}}

══════════════════════════════════════════════════

SELECTED SERVICES

{{#services}}
✓ {{serviceName}}
  {{#description}}Description: {{description}}{{/description}}
  {{#pricing}}Price: {{formatCurrency monthlyPrice "USD"}}/month{{/pricing}}
{{/services}}

Total Services: {{length services}}

══════════════════════════════════════════════════

CONTRACT DETAILS

Start Date: {{formatDate startDate "MMMM DD, YYYY"}}
Initial Term: {{contractTerm}} months
End Date: {{formatDate endDate "MMMM DD, YYYY"}}

══════════════════════════════════════════════════

NEXT STEPS

1. Review and sign service agreement
2. Complete payment setup
3. Attend kickoff meeting on {{formatDate kickoffDate "MMMM DD, YYYY"}}
4. Begin onboarding process

Questions? Contact your Account Manager:
{{accountManager.name}}
{{accountManager.email}}
{{accountManager.phone}}
```

---

### Example B: Dynamic Pricing Proposal

**Template with Complex Calculations:**
```
PRICING PROPOSAL

{{upper companyName}}
Prepared for: {{contact.name}}
Date: {{formatDate proposalDate "MMMM DD, YYYY"}}

═══════════════════════════════════════════════════════

BASE SERVICES

{{#baseServices}}
{{serviceName}}
{{description}}

  Base Price: {{formatCurrency basePrice "USD"}}
  {{#hasDiscount}}
  Discount ({{discountPercent}}%): -{{formatCurrency discountAmount "USD"}}
  Discounted Price: {{formatCurrency discountedPrice "USD"}}
  {{/hasDiscount}}

{{/baseServices}}

═══════════════════════════════════════════════════════

ADD-ON SERVICES

{{^addOns}}
No add-on services selected.
{{/addOns}}

{{#addOns}}
{{serviceName}}: {{formatCurrency price "USD"}}
  {{#description}}{{description}}{{/description}}
{{/addOns}}

═══════════════════════════════════════════════════════

PRICING SUMMARY

Base Services Total: {{formatCurrency baseTotal "USD"}}
Add-On Services: {{formatCurrency addOnsTotal "USD"}}
Subtotal: {{formatCurrency subtotal "USD"}}

{{#hasVolumeDiscount}}
Volume Discount ({{volumeDiscountPercent}}%): -{{formatCurrency volumeDiscountAmount "USD"}}
{{/hasVolumeDiscount}}

Tax ({{taxRate}}%): {{formatCurrency taxAmount "USD"}}

═══════════════════════════════════════════════════════

TOTAL: {{formatCurrency grandTotal "USD"}}

{{#paymentPlan}}
Payment Plan: {{planName}}
{{#installments}}
- Payment {{installmentNumber}}: {{formatCurrency amount "USD"}} due {{formatDate dueDate "MM/DD/YYYY"}}
{{/installments}}
{{/paymentPlan}}

═══════════════════════════════════════════════════════

PROPOSAL VALID UNTIL: {{formatDate expirationDate "MMMM DD, YYYY"}}

To accept this proposal, please sign and return by {{formatDate acceptanceDeadline "MMMM DD, YYYY"}}.

_____________________________    Date: ___________
{{contact.name}}
{{contact.title}}, {{companyName}}
```

---

## Summary

This guide has covered:

✅ **Understanding Variables** - What they are and why they matter
✅ **Creating Variables** - How to assign meaningful names
✅ **Basic Usage** - Simple text replacement
✅ **Advanced Scenarios** - Loops, conditionals, formatting
✅ **Real-World Use Cases** - Complete examples from various industries
✅ **Best Practices** - Professional patterns and conventions
✅ **Troubleshooting** - Solutions to common problems
✅ **Complete Reference** - All helpers, formats, and patterns

### Key Takeaways

1. **Use descriptive variable names** - `clientName` not `x`
2. **Always format data** - Dates, currency, numbers
3. **Handle missing data** - Use defaults and conditionals
4. **Test thoroughly** - Try edge cases before production
5. **Document templates** - List all variables used
6. **Keep it simple** - Break complex logic into steps
7. **Version control** - Track template changes over time

### Getting Help

- **Documentation**: See [STAGE_21_DOCUMENT_ENGINE_2.0.md](../STAGE_21_DOCUMENT_ENGINE_2.0.md)
- **Support**: Contact your VaultLogic administrator
- **Issues**: Report problems via GitHub Issues

---

**End of Guide**

*Last Updated: July 7, 2026*
*Version: 1.1.0 — syntax aligned with the shipped engine: double-brace `{{...}}` delimiters, missing values render as empty strings, helper arguments may reference variables, nested parenthesized expressions are not supported.*
*Maintained by: VaultLogic Documentation Team*
