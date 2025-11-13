# Stage 12.5 - Intake Portal Extras

**Date:** November 13, 2025
**Status:** ✅ Backend Complete, Frontend Pending
**Version:** 1.2.0

---

## Overview

Stage 12.5 enhances the public Intake Portal (Stage 12) with three key features:
1. **URL-based Prefill** - Pre-populate form fields from query parameters
2. **CAPTCHA / Anti-bot** - Simple math puzzle for bot protection
3. **Email Receipts** - Send confirmation emails to users after submission

These features improve the user experience, security, and automation capabilities of the intake workflow system.

---

## Architecture Changes

### 1. Database Schema

#### New Column: `workflows.intake_config`
- **Type:** JSONB
- **Default:** `{}`
- **Purpose:** Stores intake portal configuration
- **Migration:** `migrations/0014_add_intake_config.sql`

**IntakeConfig Structure:**
```typescript
{
  allowPrefill?: boolean;
  allowedPrefillKeys?: string[];  // Step aliases that can be prefilled
  requireCaptcha?: boolean;
  captchaType?: "simple" | "recaptcha";
  sendEmailReceipt?: boolean;
  receiptEmailVar?: string;       // Step alias containing user's email
  receiptTemplateId?: string;     // Optional template ID (future use)
}
```

#### Index Added
- `workflows_intake_config_idx` (GIN) - For efficient JSONB queries

---

### 2. Type Definitions

**New File:** `shared/types/intake.ts`

```typescript
export interface IntakeConfig {
  allowPrefill?: boolean;
  allowedPrefillKeys?: string[];
  requireCaptcha?: boolean;
  captchaType?: CaptchaType;
  sendEmailReceipt?: boolean;
  receiptEmailVar?: string;
  receiptTemplateId?: string;
}

export type CaptchaType = "simple" | "recaptcha";

export interface CaptchaChallenge {
  type: CaptchaType;
  question?: string;
  token: string;
  expiresAt: number;
}

export interface CaptchaResponse {
  type: CaptchaType;
  token: string;
  answer?: string;
  recaptchaToken?: string;
}

export interface IntakeSubmitResult {
  runId: string;
  status: "success" | "error" | "validation_error";
  errors?: string[];
  emailReceipt?: IntakeEmailReceipt;
  outputs?: {
    pdf?: string;
    docx?: string;
  };
}
```

---

## Feature Implementation

### 1. URL-based Prefill

#### Backend Logic (`IntakeService.createIntakeRun`)

**Behavior:**
- Accepts `prefillParams` as query string key-value pairs
- Only prefills keys listed in `intakeConfig.allowedPrefillKeys`
- Maps step aliases to step IDs for value insertion
- Prefilled values can be overwritten by user

**Security:**
- Whitelist-based: Only allowed keys are processed
- No prefill for file uploads or sensitive fields (enforced by field type)
- Initial answers take precedence over prefill

**Example Request:**
```http
POST /intake/runs
Content-Type: application/json

{
  "slug": "onboarding",
  "prefillParams": {
    "client_name": "Acme Corp",
    "email": "contact@acme.com"
  }
}
```

**Example URL:**
```
https://app.vaultlogic.com/intake/onboarding?client_name=Acme%20Corp&email=contact@acme.com
```

#### Configuration

Workflow owners/builders can enable prefill via:
```http
PUT /api/workflows/:workflowId/intake-config
Authorization: Bearer <token>
Content-Type: application/json

{
  "allowPrefill": true,
  "allowedPrefillKeys": ["client_name", "email", "state"]
}
```

---

### 2. CAPTCHA / Anti-bot Protection

#### Simple Math CAPTCHA (MVP)

**Service:** `server/services/CaptchaService.ts`

**Features:**
- Generates random addition problems (1-20 range)
- 10-minute expiry per challenge
- 3 attempt limit per token
- In-memory token storage (would use Redis in production)
- Token cleanup on expiry

**Flow:**
1. Frontend fetches challenge: `GET /intake/captcha/challenge`
2. User solves math problem
3. Frontend submits answer with form: `POST /intake/runs/:token/submit`
4. Backend validates answer before processing submission

**API Endpoints:**

```http
# Generate Challenge
GET /intake/captcha/challenge

Response:
{
  "success": true,
  "data": {
    "type": "simple",
    "question": "What is 12 + 8?",
    "token": "abc123...",
    "expiresAt": 1699999999999
  }
}
```

```http
# Submit with CAPTCHA
POST /intake/runs/:token/submit
Content-Type: application/json

{
  "answers": { ... },
  "captcha": {
    "type": "simple",
    "token": "abc123...",
    "answer": "20"
  }
}
```

#### reCAPTCHA Support (Optional)

**Configuration:**
- Set `RECAPTCHA_SECRET` environment variable
- Update `intakeConfig.captchaType` to `"recaptcha"`

**Validation:**
- Verifies token via Google API
- Falls back to simple CAPTCHA if not configured

**Future Enhancement:**
- Support for hCaptcha, Cloudflare Turnstile

---

### 3. Email Receipts

#### Email Service (`emailService.ts`)

**New Function:** `sendIntakeReceipt(data: IntakeReceiptData)`

**Features:**
- Sends confirmation email after successful submission
- Includes summary of non-sensitive fields
- Provides run reference ID
- Supports download links (when document generation is implemented)

**Security:**
- Filters out sensitive fields (password, ssn, credit_card, etc.)
- Redacts personal info based on field name patterns

**Implementation:**
- **Development:** Logs to console with formatted output
- **Production:** Ready for SendGrid/Mailgun/AWS SES integration

**Configuration:**
```json
{
  "sendEmailReceipt": true,
  "receiptEmailVar": "client_email"
}
```

**Backend Logic:**
1. After successful `completeRunNoAuth()`
2. Lookup email value from step with alias matching `receiptEmailVar`
3. Build summary of all non-sensitive step values
4. Call `sendIntakeReceipt({ to, summary, ... })`
5. Return `emailReceipt` status in submission result

**Email Template (Console Log):**
```
=== INTAKE RECEIPT ===
To: client@example.com
Subject: Confirmation - Client Onboarding

Thank you for completing "Client Onboarding".

Your submission:
  - client_name: Acme Corp
  - email: client@example.com
  - state: CA

Reference ID: 123e4567-e89b-12d3-a456-426614174000

Best regards,
VaultLogic Team
=====================
```

---

## API Changes

### New Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `GET` | `/intake/captcha/challenge` | Public | Generate CAPTCHA challenge |
| `PUT` | `/api/workflows/:id/intake-config` | Required | Update intake configuration |

### Modified Endpoints

#### `GET /intake/workflows/:slug/published`
**Added:** `intakeConfig` field in response

```json
{
  "success": true,
  "data": {
    "workflow": { ... },
    "sections": [ ... ],
    "intakeConfig": {
      "allowPrefill": true,
      "allowedPrefillKeys": ["name", "email"],
      "requireCaptcha": true,
      "captchaType": "simple",
      "sendEmailReceipt": true,
      "receiptEmailVar": "email"
    },
    "tenantBranding": { ... }
  }
}
```

#### `POST /intake/runs`
**Added:** `prefillParams` field in request body

```json
{
  "slug": "onboarding",
  "prefillParams": {
    "client_name": "Acme Corp",
    "email": "contact@acme.com"
  }
}
```

#### `POST /intake/runs/:token/submit`
**Added:** `captcha` field in request body
**Modified:** Response includes `emailReceipt` status

Request:
```json
{
  "answers": { ... },
  "captcha": {
    "type": "simple",
    "token": "abc123",
    "answer": "20"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "runId": "123e4567-...",
    "status": "success",
    "emailReceipt": {
      "attempted": true,
      "to": "client@example.com",
      "success": true
    }
  }
}
```

---

## Service Layer Changes

### CaptchaService (New)
**File:** `server/services/CaptchaService.ts`

**Methods:**
- `generateSimpleChallenge(): CaptchaChallenge`
- `validateCaptcha(response, workflowId): Promise<{ valid, error? }>`
- `validateSimpleChallenge(response): { valid, error? }`
- `validateRecaptcha(token): Promise<{ valid, error? }>`
- `cleanupExpired(): void`
- `getStats(): { activeChallenges }`

### IntakeService (Updated)
**File:** `server/services/IntakeService.ts`

**Modified Methods:**
- `getPublishedWorkflow()` - Returns `intakeConfig` field
- `createIntakeRun()` - Accepts `prefillParams`, processes whitelist
- `submitIntakeRun()` - Validates CAPTCHA, sends email receipt

**New Helper:**
- `isSensitiveField(fieldName): boolean` - Filters sensitive data

### WorkflowService (Updated)
**File:** `server/services/WorkflowService.ts`

**New Method:**
- `updateIntakeConfig(workflowId, userId, intakeConfig, tx?): Promise<Workflow>`

### emailService (Updated)
**File:** `server/services/emailService.ts`

**New Function:**
- `sendIntakeReceipt(data: IntakeReceiptData): Promise<{ success, error? }>`

---

## Testing

### Unit Tests
**File:** `tests/unit/captcha.service.test.ts`

**Coverage:**
- ✅ Challenge generation
- ✅ Correct answer validation
- ✅ Incorrect answer rejection
- ✅ Token expiry
- ✅ Attempt limits (3 max)
- ✅ Token cleanup
- ✅ Invalid token handling

### Integration Tests
**File:** `tests/integration/intake.stage12.5.test.ts`

**Test Suites:**
- URL-based Prefill
  - Allowed keys only
  - Disallowed keys ignored
  - Disabled when `allowPrefill: false`
  - Security checks for file/password fields
- CAPTCHA Validation
  - Challenge generation
  - Required validation
  - Correct/incorrect answers
  - Disabled when `requireCaptcha: false`
- Email Receipts
  - Sent when configured
  - Skipped when disabled
  - Email field lookup
  - Sensitive field filtering
- IntakeConfig API
  - Owner/builder permissions
  - Viewer rejection
  - Schema validation

**Status:** Test templates created, ready for implementation with test database

---

## Security Considerations

### Prefill
- ✅ Whitelist-based validation (only allowed keys)
- ✅ Step alias mapping prevents injection
- ✅ File uploads excluded by design
- ❌ **Future:** Rate limiting on run creation

### CAPTCHA
- ✅ 10-minute expiry
- ✅ 3 attempt limit
- ✅ Token cleanup after use
- ✅ Unique tokens per challenge
- ❌ **Future:** Redis for distributed systems
- ❌ **Future:** Honeypot fields for bots

### Email Receipts
- ✅ Sensitive field filtering (password, ssn, credit_card, etc.)
- ✅ Email validation via step alias
- ✅ Non-blocking (errors don't fail submission)
- ✅ Logged for audit trail
- ❌ **Future:** Rate limiting on email sends
- ❌ **Future:** Email verification

---

## Performance Considerations

### In-Memory CAPTCHA Store
- **Current:** `Map<string, StoredChallenge>` in Node.js memory
- **Limitation:** Not suitable for multi-instance deployments
- **Recommendation:** Migrate to Redis for production

### Prefill Step Lookup
- **Current:** Fetches all workflow steps to build alias map
- **Optimization:** Cache step aliases per workflow
- **Impact:** Additional DB query per run creation

### Email Sending
- **Current:** Synchronous call during submission
- **Recommendation:** Queue-based system (Bull, BullMQ) for:
  - Retry logic
  - Rate limiting
  - Background processing

---

## Environment Variables

### Optional
```env
# For reCAPTCHA support (optional)
RECAPTCHA_SECRET=your-recaptcha-secret-key

# For production email service (SendGrid example)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@vaultlogic.com
```

---

## Migration Guide

### Database Migration
```bash
# Apply migration
npm run db:migrate

# Or push schema changes
npm run db:push
```

### Enabling Features for Existing Workflows

```javascript
// Update workflow intakeConfig via API
const intakeConfig = {
  allowPrefill: true,
  allowedPrefillKeys: ["client_name", "email"],
  requireCaptcha: true,
  captchaType: "simple",
  sendEmailReceipt: true,
  receiptEmailVar: "email",
};

await fetch(`/api/workflows/${workflowId}/intake-config`, {
  method: "PUT",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(intakeConfig),
});
```

---

## Frontend Implementation (Pending)

### Required Components
1. **Intake Form Page** (`/intake/:slug`)
   - Read query params for prefill
   - Populate form fields if allowed
   - Show CAPTCHA challenge when required
   - Submit with CAPTCHA response

2. **CAPTCHA Component** (`components/intake/SimpleCaptcha.tsx`)
   - Fetch challenge on mount
   - Display math question
   - Input field for answer
   - Auto-refresh on expiry

3. **Completion Screen** (`components/intake/CompletionScreen.tsx`)
   - Success message
   - Email receipt confirmation (if sent)
   - Download buttons (PDF/DOCX)
   - Reference ID display

4. **Workflow Settings** (`components/workflow/IntakeConfigPanel.tsx`)
   - Toggle prefill (with multi-select for allowed keys)
   - Toggle CAPTCHA
   - Toggle email receipts (with variable picker)
   - Save to API

### Example Frontend Flow
```typescript
// 1. Load workflow and check intakeConfig
const { data } = await fetch(`/intake/workflows/${slug}/published`);
const { workflow, intakeConfig } = data;

// 2. Handle prefill from URL
if (intakeConfig.allowPrefill) {
  const urlParams = new URLSearchParams(window.location.search);
  for (const key of intakeConfig.allowedPrefillKeys) {
    const value = urlParams.get(key);
    if (value) {
      prefillField(key, value);
    }
  }
}

// 3. Load CAPTCHA if required
let captchaChallenge;
if (intakeConfig.requireCaptcha) {
  const res = await fetch('/intake/captcha/challenge');
  captchaChallenge = res.data;
}

// 4. Submit with CAPTCHA
await fetch(`/intake/runs/${token}/submit`, {
  method: 'POST',
  body: JSON.stringify({
    answers: formData,
    captcha: {
      type: 'simple',
      token: captchaChallenge.token,
      answer: captchaAnswer,
    },
  }),
});
```

---

## Roadmap & Future Enhancements

### Phase 1 (Complete)
- ✅ Backend API for prefill, CAPTCHA, email
- ✅ Database schema and migrations
- ✅ Service layer implementation
- ✅ Unit and integration test templates

### Phase 2 (Next)
- ⏳ Frontend intake form UI
- ⏳ CAPTCHA component
- ⏳ Completion screen enhancements
- ⏳ Workflow settings panel

### Phase 3 (Future)
- ⏳ Redis-based CAPTCHA store
- ⏳ Email queue system (Bull/BullMQ)
- ⏳ Advanced email templates
- ⏳ reCAPTCHA v3 (score-based)
- ⏳ hCaptcha / Cloudflare Turnstile support
- ⏳ Prefill from external APIs (CRM integration)
- ⏳ Conditional email receipts (based on workflow logic)
- ⏳ Multi-language support for CAPTCHA

---

## Breaking Changes

**None.** All changes are backward compatible.

Workflows without `intakeConfig` default to:
```json
{
  "allowPrefill": false,
  "requireCaptcha": false,
  "sendEmailReceipt": false
}
```

---

## Support & Troubleshooting

### Common Issues

**Issue:** CAPTCHA challenges expiring too quickly
**Solution:** Increase `CHALLENGE_EXPIRY_MS` in `CaptchaService.ts` (default: 10 minutes)

**Issue:** Email receipts not sending
**Solution:**
1. Check logs for email service errors
2. Verify `receiptEmailVar` matches a step alias
3. Ensure email field is populated in run

**Issue:** Prefill not working
**Solution:**
1. Verify `allowPrefill: true` in workflow config
2. Check step aliases in `allowedPrefillKeys`
3. Confirm query params match allowed keys

---

## References

- **Schema:** `shared/schema.ts` (line 846)
- **Types:** `shared/types/intake.ts`
- **Service:** `server/services/IntakeService.ts`
- **CAPTCHA:** `server/services/CaptchaService.ts`
- **Routes:** `server/routes/intake.routes.ts`
- **Tests:** `tests/unit/captcha.service.test.ts`, `tests/integration/intake.stage12.5.test.ts`
- **Migration:** `migrations/0014_add_intake_config.sql`

---

**Last Updated:** November 13, 2025
**Maintainer:** Development Team
**Next Review:** December 13, 2025
