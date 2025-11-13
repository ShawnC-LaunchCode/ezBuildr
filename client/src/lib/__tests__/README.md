# Stage 17 Branding System Tests

This directory contains frontend unit tests for the VaultLogic branding system.

## Test Files

### `colorUtils.test.ts`
Tests for color manipulation and WCAG accessibility utilities:
- Hex/RGB conversion
- Color lightening and darkening
- Luminance calculation
- Contrast ratio calculation
- WCAG AA/AAA compliance checking
- Automatic contrast text color selection
- Color palette generation
- Hex color validation and normalization

**Coverage:** 100% of colorUtils.ts functions

### `tenantTheme.test.ts`
Tests for theme token generation and application:
- Theme token generation from branding
- Primary and accent color palette derivation
- Dark mode vs light mode token generation
- Logo URL token creation
- Token application to DOM
- Token removal and cleanup
- Utility functions (getPrimaryColor, getAccentColor, etc.)

**Coverage:** Core theme engine functionality

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only branding tests
npm test -- colorUtils
npm test -- tenantTheme
```

## Test Structure

Each test file follows this pattern:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature Name', () => {
  describe('functionName', () => {
    it('should do something', () => {
      // Arrange
      const input = '...';

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

## Key Test Scenarios

### Color Utilities

**WCAG Compliance**
- White on black: 21:1 ratio (AAA)
- Blue on white: ~8.6:1 ratio (AAA)
- Yellow on white: ~1.07:1 ratio (Fails AA)

**Color Derivation**
- Lighten #3B82F6 by 15% → #60A5FA
- Darken #3B82F6 by 15% → #2563EB
- Generate 6-color palette from single base color

**Auto Contrast**
- Dark backgrounds → White text
- Light backgrounds → Black text
- Meets WCAG AA minimum (4.5:1)

### Theme Tokens

**Token Count**
- Complete branding generates 25+ CSS variables
- Primary color generates 6 tokens
- Accent color generates 4 tokens
- Mode (dark/light) generates 10+ surface/text tokens

**Dark Mode**
- Background: #0F172A (Slate 900)
- Surface: #1E293B (Slate 800)
- Text: #F8FAFC (Slate 50)
- Border: #334155 (Slate 700)

**Light Mode**
- Background: #FFFFFF
- Surface: #FFFFFF
- Text: #0F172A (Slate 900)
- Border: #E2E8F0 (Slate 200)

## Future Test Coverage

Backend tests are complete. Frontend component tests are TODO:

### Components to Test
- [ ] BrandingContext and hooks
- [ ] IntakeHeader
- [ ] IntakeFooter
- [ ] IntakeProgressBar
- [ ] ThemedButton
- [ ] ThemedInput
- [ ] IntakeLayout
- [ ] BrandingPreview
- [ ] EmailPreview

### Pages to Test
- [ ] BrandingSettingsPage
- [ ] DomainSettingsPage
- [ ] EmailTemplatesPage
- [ ] EmailTemplateEditorPage
- [ ] IntakePreviewPage

### Integration Tests
- [ ] End-to-end branding flow
- [ ] Domain addition and removal
- [ ] Email template configuration
- [ ] Live preview updates

## CI/CD

Tests run automatically on:
- Pre-commit (via git hooks)
- Pull requests
- Main branch pushes
- Nightly builds

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [WCAG Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
