# Fee Waiver Application Demo Workflow

**Created:** November 26, 2025
**Workflow ID:** `81a73b18-012d-458b-af05-5098eb75c753`
**Project:** Demo Project

## Overview

This is a comprehensive demonstration workflow that showcases VaultLogic's core features through a real-world use case: a court fee waiver application. The workflow demonstrates conditional logic, calculations, file uploads, and data transformations.

## 🎯 Purpose

This workflow helps users:
1. Determine if they qualify for a court fee waiver based on income and household size
2. Collect all necessary information for the application
3. Calculate qualification thresholds automatically
4. Gather supporting documentation
5. Generate a completed application form

## 📋 Workflow Structure

### Page 1: Applicant Information
Collects basic personal details:
- **Name fields** (first, middle, last) - demonstrates multiple related text inputs
- **Date of Birth** - demonstrates date_time field type
- **Address** (street, city, state, ZIP) - demonstrates structured address collection
- **Contact** (phone, email) - demonstrates communication field types

**Variables (Aliases):**
- `firstName`, `middleName`, `lastName`
- `dateOfBirth`
- `streetAddress`, `city`, `state`, `zipCode`
- `phoneNumber`, `emailAddress`

### Page 2: Household & Income
Collects household composition and income information:
- **Household Size** (dropdown 1-8+) - drives poverty level calculations
- **Employment Status** (radio buttons) - triggers conditional logic
- **Employer Name** - conditionally required based on employment
- **Monthly Income** fields - used in calculations
- **Public Benefits** (multi-select) - auto-qualification trigger

**Variables:**
- `householdSize`, `employmentStatus`, `employerName`
- `monthlyIncome`, `otherIncome`
- `publicBenefits`

**Transform Blocks (Calculated Values):**
1. **Total Monthly Income** → `totalMonthlyIncome`
   - Sums employment income + other income

2. **Poverty Threshold (150%)** → `povertyThreshold`
   - Calculates qualification threshold based on household size
   - Uses 2024 Federal Poverty Level guidelines

3. **Qualification Status** → `qualificationStatus`
   - Determines if applicant likely qualifies
   - Returns: "Likely Qualified" or "Additional Review Required"
   - Considers both income threshold and public benefits

### Page 3: Monthly Expenses
Collects detailed expense information:
- Rent/Mortgage, Utilities, Food, Transportation
- Medical, Childcare, Other expenses

**Variables:**
- `expenseRent`, `expenseUtilities`, `expenseFood`
- `expenseTransportation`, `expenseMedical`, `expenseChildcare`
- `expenseOther`

**Transform Blocks:**
1. **Total Monthly Expenses** → `totalMonthlyExpenses`
   - Sums all expense categories

2. **Disposable Income** → `disposableIncome`
   - Calculates: Total Income - Total Expenses
   - Shows financial capacity to pay fees

### Page 4: Assets & Liabilities
Collects financial assets and debts:
- Cash/bank accounts, vehicle value, real estate
- Other assets, total debt

**Variables:**
- `cashAndBank`, `vehicleValue`, `realEstateValue`
- `otherAssets`, `totalDebt`

**Transform Blocks:**
1. **Total Assets** → `totalAssets`
   - Sums all asset categories

2. **Net Worth** → `netWorth`
   - Calculates: Total Assets - Total Debt

**Conditional Logic:**
- **Hidden if qualified by income** - Page skipped if `qualificationStatus` = "Likely Qualified"
- This demonstrates page-level conditional logic

### Page 5: Supporting Documents
File upload page for evidence:
- Pay stubs, bank statements, benefit proof, other documents
- Each accepts PDF, JPG, JPEG, PNG
- 5MB max file size per upload
- Multiple files allowed

**Variables:**
- `payStubs`, `bankStatements`, `benefitProof`, `otherDocuments`

**Conditional Logic:**
- **Pay stubs required if employed** - Triggers when employment status is full-time or part-time

### Page 6: Review & Certification
Final review and certification:
- Additional information (long text field)
- Certification checkbox - required for submission

**Variables:**
- `additionalInfo`, `certification`

## 🧮 Calculations & Logic

### Transform Blocks (7 total)

All transform blocks use JavaScript and execute in a sandboxed environment:

1. **Calculate Total Monthly Income**
   - Inputs: `monthlyIncome`, `otherIncome`
   - Output: `totalMonthlyIncome`
   - Phase: onPageSubmit (Page 2)

2. **Calculate Poverty Level Threshold**
   - Input: `householdSize`
   - Output: `povertyThreshold`
   - Uses 2024 FPL guidelines (150% threshold)
   - Phase: onPageSubmit (Page 2)

3. **Determine Qualification Status**
   - Inputs: `totalMonthlyIncome`, `povertyThreshold`, `publicBenefits`
   - Output: `qualificationStatus`
   - Logic: Qualified if income ≤ threshold OR receives public benefits
   - Phase: onPageSubmit (Page 2)

4. **Calculate Total Monthly Expenses**
   - Inputs: All expense fields
   - Output: `totalMonthlyExpenses`
   - Phase: onPageSubmit (Page 3)

5. **Calculate Disposable Income**
   - Inputs: `totalMonthlyIncome`, `totalMonthlyExpenses`
   - Output: `disposableIncome`
   - Phase: onPageSubmit (Page 3)

6. **Calculate Total Assets**
   - Inputs: All asset fields
   - Output: `totalAssets`
   - Phase: onPageSubmit (Page 4)

7. **Calculate Net Worth**
   - Inputs: `totalAssets`, `totalDebt`
   - Output: `netWorth`
   - Phase: onPageSubmit (Page 4)

### Conditional Logic Rules (5 total)

1. **Require Employer Name (Full-Time)**
   - Condition: `employmentStatus` equals "Employed Full-Time"
   - Action: Require `employerName` field

2. **Require Employer Name (Part-Time)**
   - Condition: `employmentStatus` equals "Employed Part-Time"
   - Action: Require `employerName` field

3. **Hide Assets Page If Qualified**
   - Condition: `qualificationStatus` equals "Likely Qualified"
   - Action: Hide Assets & Liabilities page
   - Purpose: Streamline workflow for clearly qualified applicants

4. **Require Pay Stubs (Full-Time)**
   - Condition: `employmentStatus` equals "Employed Full-Time"
   - Action: Require `payStubs` upload

5. **Require Pay Stubs (Part-Time)**
   - Condition: `employmentStatus` equals "Employed Part-Time"
   - Action: Require `payStubs` upload

## 🎨 Features Demonstrated

### ✅ Step Types
- ✓ **short_text** - Single-line text inputs (name, address, phone)
- ✓ **long_text** - Multi-line text area (additional info)
- ✓ **multiple_choice** - Dropdowns and multi-select (household size, benefits)
- ✓ **radio** - Single selection (employment status)
- ✓ **yes_no** - Boolean confirmation (certification)
- ✓ **date_time** - Date picker (date of birth)
- ✓ **file_upload** - Document uploads (pay stubs, statements)
- ✓ **computed** - Calculated values (all transform block outputs)

### ✅ Advanced Features
- ✓ **Step Aliases (Variables)** - All 41 steps have human-friendly aliases
- ✓ **Transform Blocks** - 7 JavaScript blocks for calculations
- ✓ **Virtual Steps** - Automatically created for transform outputs
- ✓ **Conditional Logic** - 5 rules for dynamic behavior
- ✓ **Page-Level Logic** - Hide entire pages based on conditions
- ✓ **Field-Level Logic** - Conditionally require fields
- ✓ **Welcome Screen** - Custom branded introduction
- ✓ **Thank You Screen** - Custom completion message with next steps
- ✓ **File Validation** - Type and size restrictions on uploads
- ✓ **Multi-File Upload** - Accept multiple files per field

### ✅ Real-World Use Case
- Federal Poverty Level calculations (2024 guidelines)
- Income vs. expense analysis
- Asset and debt tracking
- Document evidence collection
- Legal certification requirements

## 🚀 Testing the Workflow

### Test Scenarios

#### Scenario 1: Low-Income Qualification
1. Household size: 2
2. Monthly income: $1,500
3. No other income
4. **Expected:** Qualification status = "Likely Qualified", Assets page hidden

#### Scenario 2: Public Benefits Auto-Qualify
1. Select any public benefit (SNAP, SSI, etc.)
2. **Expected:** Qualification status = "Likely Qualified" regardless of income

#### Scenario 3: Employed - Conditional Requirements
1. Employment status: "Employed Full-Time"
2. **Expected:** Employer name required, pay stubs required

#### Scenario 4: High Income - Full Application
1. Household size: 1
2. Monthly income: $3,000
3. **Expected:** Must complete all pages including assets

### Testing Calculations

You can verify calculations using the Preview Runner:

**Poverty Thresholds (150% of FPL):**
- 1 person: $1,822.50/month
- 2 people: $2,466/month
- 3 people: $3,108/month
- 4 people: $3,750/month

Example: 2-person household with $2,000/month income → Qualified ✓

## 📊 Data Export

After collecting responses, you can export data in multiple formats:

**JSON Export:** Complete structured data with all calculated values
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "householdSize": "2",
  "monthlyIncome": "1500",
  "totalMonthlyIncome": 1500,
  "povertyThreshold": 2466,
  "qualificationStatus": "Likely Qualified",
  ...
}
```

**CSV Export:** Tabular format for spreadsheet analysis
**PDF Export:** Human-readable application document

## 🔗 Variable Reference

All workflow variables can be referenced in:
- Logic rules (conditions and actions)
- Transform blocks (input and output)
- Templates (document generation)
- API responses (data export)

### Available Variables (41 total)

**Personal Info:**
`firstName`, `middleName`, `lastName`, `dateOfBirth`, `streetAddress`, `city`, `state`, `zipCode`, `phoneNumber`, `emailAddress`

**Household & Income:**
`householdSize`, `employmentStatus`, `employerName`, `monthlyIncome`, `otherIncome`, `publicBenefits`

**Calculated Income:**
`totalMonthlyIncome`, `povertyThreshold`, `qualificationStatus`

**Expenses:**
`expenseRent`, `expenseUtilities`, `expenseFood`, `expenseTransportation`, `expenseMedical`, `expenseChildcare`, `expenseOther`

**Calculated Expenses:**
`totalMonthlyExpenses`, `disposableIncome`

**Assets:**
`cashAndBank`, `vehicleValue`, `realEstateValue`, `otherAssets`, `totalDebt`

**Calculated Assets:**
`totalAssets`, `netWorth`

**Documents:**
`payStubs`, `bankStatements`, `benefitProof`, `otherDocuments`

**Certification:**
`additionalInfo`, `certification`

## 🎓 Learning Resources

This workflow demonstrates patterns from:
- **Transform Blocks Guide:** `/docs/api/TRANSFORM_BLOCKS.md`
- **Step Aliases Guide:** `/docs/guides/STEP_ALIASES.md`
- **Authentication Guide:** `/docs/guides/AUTHENTICATION.md`
- **API Documentation:** `/docs/api/API.md`

## 🛠️ Extending the Workflow

### Ideas for Enhancement

1. **Add Email Notification Node**
   - Notify applicant of submission
   - Send confirmation with application number

2. **Add Review Node**
   - Human review gate for clerk approval
   - Approval/rejection workflow

3. **Add E-Signature Node**
   - Digital signature requirement
   - Token-based signing portal

4. **Generate PDF Document**
   - Create DOCX template
   - Map variables to template placeholders
   - Auto-generate completed form

5. **Add Integration**
   - POST to court case management system
   - Store in external database
   - Trigger downstream workflows

## 📝 Notes

- All transform blocks use 2024 Federal Poverty Level guidelines
- Calculations are for demonstration purposes only
- Actual fee waiver eligibility may vary by jurisdiction
- Supporting documentation requirements may differ by court

## 🔗 Access the Workflow

**Builder URL:** http://localhost:5000/workflows/81a73b18-012d-458b-af05-5098eb75c753/builder

**Preview/Test URL:** Set workflow to "Active" status, then access preview mode

---

**Last Updated:** November 26, 2025
**Created by:** VaultLogic Demo Script
**Version:** 1.0
