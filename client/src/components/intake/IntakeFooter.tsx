/**
 * Stage 17: Intake Footer Component
 *
 * Branded footer for intake portals using tenant branding CSS variables
 */

export interface IntakeFooterProps {
  /** Optional custom footer text */
  footerText?: string;

  /** Show "Powered by VaultLogic" branding */
  showPoweredBy?: boolean;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Themed intake portal footer
 *
 * Uses CSS variables from BrandingProvider:
 * - --brand-surface (background color)
 * - --brand-text-muted (text color)
 * - --brand-border (border color)
 */
export default function IntakeFooter({
  footerText,
  showPoweredBy = true,
  className = '',
}: IntakeFooterProps) {
  return (
    <footer
      className={`intake-footer ${className}`}
      style={{
        backgroundColor: 'var(--brand-surface, #FFFFFF)',
        borderTop: '1px solid var(--brand-border, #E2E8F0)',
      }}
    >
      <div className="max-w-4xl mx-auto px-6 py-4">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* Custom Footer Text */}
          {footerText && (
            <p
              className="text-sm"
              style={{
                color: 'var(--brand-text-muted, #64748B)',
              }}
            >
              {footerText}
            </p>
          )}

          {/* Powered By */}
          {showPoweredBy && (
            <p
              className="text-xs"
              style={{
                color: 'var(--brand-text-muted, #64748B)',
              }}
            >
              Powered by{' '}
              <a
                href="https://vaultlogic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{
                  color: 'var(--brand-link, #3B82F6)',
                }}
              >
                VaultLogic
              </a>
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
