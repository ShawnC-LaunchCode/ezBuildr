# Stage 17: Branding & Tenant Customization System

**Last Updated:** November 13, 2025
**Status:** ✅ Complete
**Pull Requests:** 7, 8, 10, 11, 12

---

## Overview

The VaultLogic Branding System enables multi-tenant customization with:
- **Tenant Branding:** Logo, colors, dark mode, header text, email sender info
- **Custom Domains:** Subdomains (*.vaultlogic.com) and custom domains
- **Theme Token Engine:** 25+ CSS variables derived from branding
- **Themed Components:** Intake portal components (buttons, inputs, headers)
- **Email Templates:** Branded email templates with token bindings
- **Live Preview:** Real-time preview of branded intake portals

---

## Architecture

### Database Schema

**`tenants.branding`** (JSONB column)
```typescript
{
  logoUrl?: string;
  primaryColor?: string;           // Hex color (e.g., #3B82F6)
  accentColor?: string;            // Hex color (e.g., #10B981)
  darkModeEnabled?: boolean;
  intakeHeaderText?: string;       // Max 500 chars
  emailSenderName?: string;
  emailSenderAddress?: string;     // Valid email
}
```

**`tenant_domains`** table
- `id`, `tenantId`, `domain`, `createdAt`, `updatedAt`
- Supports both *.vaultlogic.com subdomains and custom domains

**`email_template_metadata`** table
- `id`, `templateKey`, `name`, `description`, `subjectPreview`
- `brandingTokens`: JSONB mapping of enabled branding tokens

### Backend Services

**BrandingService** (`server/services/BrandingService.ts`)
- `getBrandingByTenantId(tenantId)` - Get tenant branding
- `updateBranding(tenantId, branding)` - Update branding
- `addDomain(tenantId, domain)` - Add custom domain
- `removeDomain(tenantId, domainId)` - Remove custom domain
- `getDomains(tenantId)` - List domains

**EmailTemplateMetadataService** (`server/services/EmailTemplateMetadataService.ts`)
- `listEmailTemplates()` - List all templates
- `getTemplateById(id)` - Get specific template
- `updateTemplateMetadata(id, metadata)` - Update template
- `getTemplatesWithBrandingToken(tokenKey)` - Filter by token

### Frontend Architecture

**BrandingContext** (`client/src/components/branding/BrandingContext.tsx`)
- React context providing branding state and theme tokens
- Auto-loads tenant branding on mount
- Applies CSS variables to `<body>` when `enableTheming={true}`
- 8 custom hooks for accessing branding properties

**Theme Token Engine** (`client/src/lib/tenantTheme.ts`)
- `brandingToThemeTokens(branding)` - Generate 25+ CSS variables
- `applyThemeTokens(tokens)` - Apply to DOM
- `removeThemeTokens()` - Clean up
- Automatic color derivation (light/dark variants, contrast colors)

**Color Utilities** (`client/src/lib/colorUtils.ts`)
- `generateColorPalette(baseColor)` - 6-color palette
- `getContrastRatio(color1, color2)` - WCAG contrast calculation
- `meetsWCAGAA(color1, color2)` - Accessibility check
- `lightenColor(color, percent)` / `darkenColor(color, percent)`
- `getContrastTextColor(bgColor)` - Auto white/black text

---

## Theme Tokens

The theme engine generates 25+ CSS variables from branding:

### Core Tokens
- `--brand-primary` - Primary brand color
- `--brand-primary-light` - 15% lighter
- `--brand-primary-lighter` - 30% lighter
- `--brand-primary-dark` - 15% darker
- `--brand-primary-darker` - 30% darker
- `--brand-primary-contrast` - Contrasting text color (auto white/black)

### Accent Tokens
- `--brand-accent` - Accent color
- `--brand-accent-light` / `--brand-accent-dark` / `--brand-accent-contrast`

### Surface & Text Tokens
- `--brand-bg` - Background color (auto dark/light)
- `--brand-surface` - Card/surface color
- `--brand-text` - Primary text color
- `--brand-text-muted` - Muted text color
- `--brand-heading` - Heading text color
- `--brand-border` - Border color

### Component Tokens
- `--brand-button-bg` - Button background
- `--brand-button-text` - Button text
- `--brand-input-bg` - Input background
- `--brand-input-border` - Input border

### Asset Tokens
- `--brand-logo-url` - Logo URL (as CSS `url()`)

---

## Components

### Intake Portal Components

**IntakeLayout** - Complete branded layout
```tsx
<IntakeLayout
  headerText="Welcome to Our Portal"
  logoUrl="https://example.com/logo.png"
>
  {children}
</IntakeLayout>
```

**IntakeHeader** - Branded header
```tsx
<IntakeHeader
  headerText="Welcome"
  logoUrl="..."
/>
```

**IntakeFooter** - Branded footer
```tsx
<IntakeFooter
  footerText="© 2025 Acme Corp"
  showPoweredBy={true}
/>
```

**IntakeProgressBar** - Progress indicator
```tsx
<IntakeProgressBar
  currentStep={2}
  totalSteps={5}
  showPercentage={true}
  showStepCount={true}
/>
```

**ThemedButton** - Branded button (5 variants)
```tsx
<ThemedButton
  variant="primary|secondary|accent|outline|ghost"
  size="sm|md|lg"
  fullWidth
  isLoading
>
  Click Me
</ThemedButton>
```

**ThemedInput / ThemedTextarea** - Branded inputs
```tsx
<ThemedInput
  label="Full Name"
  helperText="Enter your legal name"
  error="This field is required"
  showRequired
/>

<ThemedTextarea
  label="Message"
  rows={5}
  showRequired
/>
```

**IntakeDemo** - 3-step demo form
```tsx
<BrandingProvider tenantId={tenantId} enableTheming={true}>
  <IntakeDemo
    headerText="Custom Header"
    logoUrl="..."
  />
</BrandingProvider>
```

### Preview Components

**BrandingPreview** - Live branding preview (for settings page)
```tsx
<BrandingPreview branding={formData} />
```

**EmailPreview** - Email template preview
```tsx
<EmailPreview
  templateName="Workflow Invitation"
  subjectPreview="You've been invited"
  branding={branding}
  enabledTokens={{ logoUrl: true, primaryColor: true }}
/>
```

### Modals

**AddDomainModal** - Add subdomain or custom domain
```tsx
<AddDomainModal
  open={isOpen}
  onOpenChange={setIsOpen}
  onAddDomain={handleAdd}
  existingDomains={domains}
/>
```

---

## Usage

### 1. Branding Provider Setup

Wrap your application or intake routes with `BrandingProvider`:

```tsx
import { BrandingProvider } from '@/components/branding';

function IntakeApp() {
  const tenantId = getTenantId(); // From auth, URL, or domain

  return (
    <BrandingProvider
      tenantId={tenantId}
      enableTheming={true}  // Apply CSS variables to DOM
    >
      <IntakeLayout>
        <YourIntakePortal />
      </IntakeLayout>
    </BrandingProvider>
  );
}
```

### 2. Using Theme Tokens in Components

**Option A: CSS Variables (Recommended)**
```tsx
function MyComponent() {
  return (
    <div style={{
      backgroundColor: 'var(--brand-primary)',
      color: 'var(--brand-primary-contrast)',
      borderColor: 'var(--brand-border)',
    }}>
      Branded Content
    </div>
  );
}
```

**Option B: React Context Hooks**
```tsx
import { usePrimaryColor, useLogoUrl, useBranding } from '@/components/branding';

function MyComponent() {
  const primaryColor = usePrimaryColor();
  const logoUrl = useLogoUrl();
  const { branding, isLoading } = useBranding();

  return (
    <div style={{ backgroundColor: primaryColor }}>
      {logoUrl && <img src={logoUrl} alt="Logo" />}
    </div>
  );
}
```

### 3. Manual Theme Application

```tsx
import { brandingToThemeTokens, applyThemeTokens } from '@/components/branding';

const tokens = brandingToThemeTokens(branding);
applyThemeTokens(tokens);  // Applies to <body> element
```

---

## API Endpoints

### Branding

**GET** `/api/tenants/:tenantId/branding`
- Returns: `{ branding: TenantBranding | null }`

**PATCH** `/api/tenants/:tenantId/branding`
- Body: Partial<TenantBranding>
- Returns: `{ message, branding }`

**GET** `/api/branding/by-domain?domain=acme.vaultlogic.com`
- Returns: `{ tenantId, branding }`
- Public endpoint (no auth)

### Domains

**GET** `/api/tenants/:tenantId/domains`
- Returns: `{ domains: TenantDomain[], total }`

**POST** `/api/tenants/:tenantId/domains`
- Body: `{ domain: string }`
- Returns: `{ message, domain }`

**DELETE** `/api/tenants/:tenantId/domains/:domainId`
- Returns: `{ message }`

### Email Templates

**GET** `/api/email-templates`
- Returns: `{ templates: EmailTemplateMetadata[], total }`

**GET** `/api/email-templates/:id`
- Returns: `{ template: EmailTemplateMetadata }`

**PATCH** `/api/email-templates/:id/metadata`
- Body: `{ name?, description?, subjectPreview?, brandingTokens? }`
- Returns: `{ message, template }`

**GET** `/api/email-templates/token/:tokenKey`
- Returns: `{ templates, total, tokenKey }`

---

## Routes

### Authenticated Routes

- `/projects/:id/settings/branding` - Branding settings page
- `/projects/:id/settings/branding/domains` - Domain management page
- `/projects/:id/settings/email-templates` - Email templates list
- `/projects/:id/settings/email-templates/:templateId` - Email template editor

### Public Routes

- `/intake/preview?tenantId=xxx` - Public intake portal preview
  - Also supports: `/intake/preview` (uses logged-in user's tenant)

---

## Features

### Color Derivation

The system automatically generates full color palettes:

```typescript
Input:
  primaryColor: '#3B82F6'

Generated Tokens:
  --brand-primary: #3B82F6
  --brand-primary-light: #60A5FA      (15% lighter)
  --brand-primary-lighter: #DBEAFE    (30% lighter)
  --brand-primary-dark: #2563EB       (15% darker)
  --brand-primary-darker: #1E40AF     (30% darker)
  --brand-primary-contrast: #FFFFFF   (auto black/white)
```

### Dark Mode Support

When `darkModeEnabled: true`, the system generates dark-optimized tokens:

```css
--brand-bg: #0F172A           /* Slate 900 */
--brand-surface: #1E293B      /* Slate 800 */
--brand-text: #F8FAFC         /* Slate 50 */
--brand-text-muted: #CBD5E1   /* Slate 300 */
--brand-border: #334155       /* Slate 700 */
--brand-heading: #F1F5F9      /* Slate 100 */
```

### WCAG Accessibility

All generated contrast colors meet WCAG AA standards (4.5:1 ratio for normal text):

```typescript
const bgColor = '#3B82F6';
const textColor = getContrastTextColor(bgColor);  // '#FFFFFF'

const ratio = getContrastRatio(bgColor, textColor);  // 8.59:1
const meetsAA = meetsWCAGAA(bgColor, textColor);     // true
const meetsAAA = meetsWCAGAAA(bgColor, textColor);   // true
```

### Domain Management

**Reserved Subdomains** (25+)
- System: `www`, `api`, `app`, `admin`, `staging`, `dev`, `test`, `demo`, `prod`
- Features: `portal`, `dashboard`, `login`, `auth`, `docs`, `blog`, `support`
- Email: `mail`, `smtp`, `webmail`, `email`
- Storage: `cdn`, `static`, `assets`, `media`, `files`

**Subdomain Validation**
- Min 3 characters
- Alphanumeric + hyphens only
- Must start/end with alphanumeric
- Cannot be reserved

**Custom Domain Validation**
- Valid FQDN format
- Min 3 characters
- Standard domain regex

---

## Testing

### Unit Tests

**BrandingService** (`tests/unit/services/BrandingService.test.ts`)
- ✅ Get branding by tenant ID
- ✅ Update branding
- ✅ Add/remove domains
- ✅ Check domain availability
- ✅ Error handling

**EmailTemplateMetadataService** (`tests/unit/services/EmailTemplateMetadataService.test.ts`)
- ✅ List all templates
- ✅ Get template by ID/key
- ✅ Update template metadata
- ✅ Filter by branding token
- ✅ Unique constraint handling

### Integration Tests

**Branding Routes** (`tests/integration/branding.routes.test.ts`)
- ✅ GET /api/tenants/:tenantId/branding
- ✅ PATCH /api/tenants/:tenantId/branding
- ✅ GET /api/tenants/:tenantId/domains
- ✅ POST /api/tenants/:tenantId/domains
- ✅ DELETE /api/tenants/:tenantId/domains/:id

### Manual Testing

1. **Branding Settings Page**
   - Upload logo URL
   - Select primary/accent colors
   - Toggle dark mode
   - Set header text and email sender info
   - Verify live preview updates

2. **Domain Management**
   - Add subdomain (e.g., `acme.vaultlogic.com`)
   - Add custom domain (e.g., `portal.acme.com`)
   - Preview intake portal on domain
   - Delete domain

3. **Email Templates**
   - Browse templates list
   - Edit template metadata
   - Toggle branding tokens
   - Verify email preview updates

4. **Intake Portal Preview**
   - Access `/intake/preview?tenantId=xxx`
   - Verify branding applied correctly
   - Test 3-step form navigation
   - Check responsive layout

---

## Migration

Run migration `0017_add_branding_and_domains.sql`:

```sql
-- Add branding JSONB column to tenants
ALTER TABLE tenants ADD COLUMN branding JSONB;

-- Create tenant_domains table
CREATE TABLE tenant_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain)
);

-- Create email_template_metadata table
CREATE TABLE email_template_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject_preview TEXT,
  branding_tokens JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default email templates
INSERT INTO email_template_metadata (template_key, name, description, subject_preview, branding_tokens)
VALUES
  ('workflow_invitation', 'Workflow Invitation', 'Sent when inviting users to complete a workflow', 'You''ve been invited to complete a workflow', '{"logoUrl":true,"primaryColor":true,"emailSenderName":true,"emailSenderAddress":true}'),
  ('workflow_reminder', 'Workflow Reminder', 'Reminder for incomplete workflows', 'Reminder: Complete your workflow', '{"logoUrl":true,"primaryColor":true,"emailSenderName":true,"emailSenderAddress":true}'),
  ('workflow_completed', 'Workflow Completed', 'Confirmation after workflow completion', 'Thank you for completing the workflow', '{"logoUrl":true,"accentColor":true,"emailSenderName":true}');
```

---

## Troubleshooting

### Theme tokens not applying
- **Check:** Is `BrandingProvider` wrapping your component?
- **Check:** Is `enableTheming={true}` set?
- **Fix:** Verify branding data is loaded (`useBranding()` hook)

### Colors not updating in preview
- **Check:** Are CSS variables being used correctly?
- **Fix:** Use `var(--brand-primary)` not `{primaryColor}`

### Domain already exists error
- **Check:** Domain might be registered by another tenant
- **Fix:** Choose a different subdomain or contact support

### Email preview not showing branding
- **Check:** Are branding tokens enabled for the template?
- **Fix:** Toggle tokens in template editor

---

## Future Enhancements

1. **File Upload for Logos** - Direct upload instead of URL
2. **Font Customization** - Custom font families
3. **Advanced Theme Editor** - Visual theme builder
4. **Template Library** - Pre-built color schemes
5. **White Labeling** - Remove "Powered by VaultLogic"
6. **Domain Verification** - DNS validation for custom domains
7. **SSL Certificates** - Auto-provision SSL for custom domains

---

## Resources

- **Migration:** `/migrations/0017_add_branding_and_domains.sql`
- **Backend Service:** `/server/services/BrandingService.ts`
- **Frontend Context:** `/client/src/components/branding/BrandingContext.tsx`
- **Theme Engine:** `/client/src/lib/tenantTheme.ts`
- **Color Utils:** `/client/src/lib/colorUtils.ts`
- **API Routes:** `/server/routes/branding.routes.ts`
- **Tests:** `/tests/unit/services/BrandingService.test.ts`

---

**Document Maintainer:** Development Team
**Last Review:** November 13, 2025
**Next Review:** December 13, 2025
