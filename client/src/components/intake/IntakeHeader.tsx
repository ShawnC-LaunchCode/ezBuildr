/**
 * Stage 17: Intake Header Component
 *
 * Branded header for intake portals using tenant branding CSS variables
 */

import { useLogoUrl, useIntakeHeaderText } from '@/components/branding';

export interface IntakeHeaderProps {
  /** Optional custom header text (overrides branding) */
  headerText?: string;

  /** Optional custom logo URL (overrides branding) */
  logoUrl?: string;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Themed intake portal header
 *
 * Uses CSS variables from BrandingProvider:
 * - --brand-primary (background color)
 * - --brand-logo-url (logo)
 * - --brand-heading (text color)
 */
export default function IntakeHeader({
  headerText: customHeaderText,
  logoUrl: customLogoUrl,
  className = '',
}: IntakeHeaderProps) {
  // Get branding from context (falls back to null if not in BrandingProvider)
  const contextLogoUrl = useLogoUrl();
  const contextHeaderText = useIntakeHeaderText();

  // Use custom props or context values
  const logoUrl = customLogoUrl || contextLogoUrl;
  const headerText = customHeaderText || contextHeaderText || 'Welcome';

  return (
    <header
      className={`intake-header ${className}`}
      style={{
        backgroundColor: 'var(--brand-primary, #3B82F6)',
        borderBottom: '1px solid var(--brand-border, #E2E8F0)',
      }}
    >
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Logo */}
        {logoUrl && (
          <div className="mb-4">
            <img
              src={logoUrl}
              alt="Organization Logo"
              className="h-12 object-contain"
              style={{
                maxWidth: '200px',
              }}
            />
          </div>
        )}

        {/* Header Text */}
        <h1
          className="text-2xl md:text-3xl font-bold"
          style={{
            color: 'var(--brand-primary-contrast, #FFFFFF)',
          }}
        >
          {headerText}
        </h1>
      </div>
    </header>
  );
}
