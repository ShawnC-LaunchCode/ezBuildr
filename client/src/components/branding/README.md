# Branding System - Stage 17

This module provides tenant branding and theme customization for VaultLogic.

## Overview

The branding system allows tenants to customize:
- Logo
- Primary and accent colors
- Dark mode preference
- Intake portal header text
- Email sender information

## Architecture

```
BrandingProvider
  ├── Loads tenant branding from API
  ├── Generates theme tokens (CSS variables)
  ├── Optionally applies to document root
  └── Provides hooks for accessing branding
```

## Quick Start

### 1. Wrap your app with BrandingProvider

```tsx
import { BrandingProvider } from '@/components/branding';

function App() {
  return (
    <BrandingProvider tenantId={user.tenantId} enableTheming={true}>
      <YourApp />
    </BrandingProvider>
  );
}
```

### 2. Use branding hooks

```tsx
import { useBranding, usePrimaryColor, useLogoUrl } from '@/components/branding';

function Header() {
  const { branding, isDarkMode } = useBranding();
  const logoUrl = useLogoUrl();
  const primaryColor = usePrimaryColor();

  return (
    <header style={{ backgroundColor: primaryColor }}>
      {logoUrl && <img src={logoUrl} alt="Logo" />}
      <h1>{branding?.intakeHeaderText || 'Welcome'}</h1>
    </header>
  );
}
```

### 3. Use CSS variables

```css
.branded-button {
  background-color: var(--brand-primary);
  color: var(--brand-primary-contrast);
}

.branded-button:hover {
  background-color: var(--brand-primary-dark);
}
```

## Available Hooks

| Hook | Description |
|------|-------------|
| `useBranding()` | Full branding context with all data |
| `useThemeTokens()` | Computed CSS theme tokens |
| `useTenantId()` | Current tenant ID |
| `useIsDarkMode()` | Check if dark mode is enabled |
| `usePrimaryColor()` | Get primary color |
| `useAccentColor()` | Get accent color |
| `useLogoUrl()` | Get logo URL |
| `useIntakeHeaderText()` | Get header text |

## CSS Variables

### Color Variables

**Primary Color:**
- `--brand-primary` - Base primary color
- `--brand-primary-light` - 15% lighter
- `--brand-primary-lighter` - 30% lighter
- `--brand-primary-dark` - 15% darker
- `--brand-primary-darker` - 30% darker
- `--brand-primary-contrast` - Best contrast text color

**Accent Color:**
- `--brand-accent` - Base accent color
- `--brand-accent-light` - 15% lighter
- `--brand-accent-lighter` - 30% lighter
- `--brand-accent-dark` - 15% darker
- `--brand-accent-darker` - 30% darker
- `--brand-accent-contrast` - Best contrast text color

### Surface & Background

- `--brand-bg` - Main background
- `--brand-bg-alt` - Alternative background
- `--brand-surface` - Card/panel surface
- `--brand-surface-hover` - Surface hover state
- `--brand-surface-active` - Surface active state

### Text Colors

- `--brand-text` - Primary text
- `--brand-text-muted` - Muted/secondary text
- `--brand-heading` - Heading text

### Borders

- `--brand-border` - Standard border
- `--brand-border-strong` - Emphasized border

### Links

- `--brand-link` - Link color
- `--brand-link-hover` - Link hover color

### Other

- `--brand-logo-url` - Logo as CSS url() value
- `--brand-dark-mode` - '1' if dark mode, '0' if light

## Color Utilities

```tsx
import {
  lightenColor,
  darkenColor,
  getContrastTextColor,
  meetsWCAGAA,
  generateColorPalette,
} from '@/components/branding';

// Lighten/darken colors
const lighter = lightenColor('#3B82F6', 20); // 20% lighter
const darker = darkenColor('#3B82F6', 20); // 20% darker

// Get best contrast text color
const textColor = getContrastTextColor('#3B82F6'); // '#FFFFFF' or '#000000'

// Check WCAG compliance
const isAccessible = meetsWCAGAA('#3B82F6', '#FFFFFF'); // true/false

// Generate full palette
const palette = generateColorPalette('#3B82F6');
// Returns: { base, light, lighter, dark, darker, contrast }
```

## API Functions

```tsx
import { brandingAPI } from '@/components/branding';

// Get branding
const { branding } = await brandingAPI.getBranding(tenantId);

// Update branding
const result = await brandingAPI.updateBranding(tenantId, {
  primaryColor: '#FF5733',
  logoUrl: 'https://example.com/logo.png',
});

// Manage domains
const { domains } = await brandingAPI.getDomains(tenantId);
await brandingAPI.addDomain(tenantId, 'acme.vaultlogic.com');
await brandingAPI.removeDomain(tenantId, domainId);
```

## Usage Patterns

### Pattern 1: Builder (No Theming)

```tsx
<BrandingProvider tenantId={user.tenantId} enableTheming={false}>
  <WorkflowBuilder />
</BrandingProvider>
```

**Why:** Builder UI should use default VaultLogic branding, not tenant branding.

### Pattern 2: Intake Portal (With Theming)

```tsx
<BrandingProvider tenantId={workflow.tenantId} enableTheming={true}>
  <IntakePortal />
</BrandingProvider>
```

**Why:** Intake portal should be fully branded for the tenant experience.

### Pattern 3: Domain-Based Detection

```tsx
<BrandingProvider skipAutoLoad={true} enableTheming={true}>
  <PublicIntakePage />
</BrandingProvider>
```

**Why:** On public pages with custom domains, let the backend middleware detect tenant.

### Pattern 4: Preview Mode

```tsx
<BrandingProvider tenantId={tenantId} enableTheming={true}>
  <div className="preview-container">
    <IntakePreview />
  </div>
</BrandingProvider>
```

**Why:** Show live preview of branding changes in settings.

## Dark Mode

Dark mode is controlled per-tenant via `branding.darkModeEnabled`:

```tsx
const { isDarkMode } = useBranding();

// CSS automatically adjusts via theme tokens
// All --brand-* variables update when dark mode changes
```

**Automatic Adjustments:**
- Background colors → darker
- Text colors → lighter
- Surface colors → darker with lighter hover states
- Borders → lighter for visibility

## Best Practices

### ✅ Do

- Use CSS variables for all themed elements
- Check `hasLoaded` before showing branded UI
- Handle `isLoading` and `error` states
- Use color utilities for derived colors
- Keep branding updates optimistic

### ❌ Don't

- Hardcode brand colors in components
- Apply theming to builder/admin UI
- Ignore WCAG contrast requirements
- Skip loading/error states
- Directly manipulate CSS variables (use hooks)

## Testing

```tsx
import { render } from '@testing-library/react';
import { BrandingProvider } from '@/components/branding';

test('component uses branding', () => {
  const mockBranding = {
    primaryColor: '#FF5733',
    logoUrl: 'https://test.com/logo.png',
  };

  render(
    <BrandingProvider
      tenantId="test-tenant"
      enableTheming={false}
      // Mock branding by wrapping with test provider
    >
      <YourComponent />
    </BrandingProvider>
  );

  // Test expectations...
});
```

## Examples

See implementation examples in:
- `/client/src/pages/IntakePortal.tsx` - Intake portal theming
- `/client/src/pages/BrandingSettings.tsx` - Branding configuration UI
- `/client/src/components/intake/*` - Themed intake components

## Architecture Decisions

### Why CSS Variables?

- **Performance:** No React re-renders for style changes
- **Flexibility:** Works with any CSS framework
- **Dynamic:** Can be updated at runtime
- **SSR-friendly:** No flash of unstyled content

### Why Context + Hooks?

- **Type-safe:** Full TypeScript support
- **Convenient:** Easy access anywhere in tree
- **Optimized:** Memoized theme token generation
- **Flexible:** Can be used with or without theming

### Why Color Derivation?

- **Consistency:** Automatic light/dark variants
- **Accessibility:** Built-in contrast checking
- **Less config:** Only need 2 colors (primary + accent)
- **Professional:** Generated palettes look polished

## Future Enhancements

- [ ] Font customization
- [ ] Custom CSS injection
- [ ] Multi-brand support per tenant
- [ ] Branding version history
- [ ] A/B testing for branding
- [ ] Brand guidelines export (PDF)

## Support

For questions or issues with the branding system:
1. Check this README
2. See `/docs/STAGE_17_BRANDING.md`
3. Review test files in `/tests/unit/services/BrandingService.test.ts`
4. Contact the VaultLogic team
