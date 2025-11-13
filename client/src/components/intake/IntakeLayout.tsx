/**
 * Stage 17: Intake Layout Component
 *
 * Complete layout wrapper for branded intake portals
 */

import { ReactNode } from 'react';
import IntakeHeader from './IntakeHeader';
import IntakeFooter from './IntakeFooter';

export interface IntakeLayoutProps {
  /** Page content */
  children: ReactNode;

  /** Optional custom header text */
  headerText?: string;

  /** Optional custom logo URL */
  logoUrl?: string;

  /** Optional custom footer text */
  footerText?: string;

  /** Show "Powered by VaultLogic" in footer */
  showPoweredBy?: boolean;

  /** Additional CSS classes for main content area */
  className?: string;
}

/**
 * Complete intake portal layout with header and footer
 *
 * Uses CSS variables from BrandingProvider for theming.
 *
 * Example:
 * ```tsx
 * <BrandingProvider tenantId={tenantId} enableTheming={true}>
 *   <IntakeLayout headerText="Welcome to Our Portal">
 *     <YourIntakeForm />
 *   </IntakeLayout>
 * </BrandingProvider>
 * ```
 */
export default function IntakeLayout({
  children,
  headerText,
  logoUrl,
  footerText,
  showPoweredBy = true,
  className = '',
}: IntakeLayoutProps) {
  return (
    <div
      className="intake-layout min-h-screen flex flex-col"
      style={{
        backgroundColor: 'var(--brand-bg, #FFFFFF)',
        color: 'var(--brand-text, #0F172A)',
      }}
    >
      {/* Header */}
      <IntakeHeader headerText={headerText} logoUrl={logoUrl} />

      {/* Main Content */}
      <main className={`flex-1 ${className}`}>
        {children}
      </main>

      {/* Footer */}
      <IntakeFooter footerText={footerText} showPoweredBy={showPoweredBy} />
    </div>
  );
}
