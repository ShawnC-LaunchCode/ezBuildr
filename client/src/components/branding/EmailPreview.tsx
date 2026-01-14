/**
 * Stage 17: Email Preview Component
 *
 * Shows a live preview of how an email will look with branding applied
 */

import { Mail } from 'lucide-react';
import React, { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TenantBranding } from '@/lib/vault-api';

export interface EmailPreviewProps {
  templateName: string;
  subjectPreview?: string | null;
  branding: TenantBranding | null;
  enabledTokens: Record<string, boolean>;
}

export default function EmailPreview({
  templateName,
  subjectPreview,
  branding,
  enabledTokens,
}: EmailPreviewProps) {
  // Extract enabled branding values
  const resolvedBranding = useMemo(() => {
    const resolved: Partial<TenantBranding> = {};

    if (branding) {
      if (enabledTokens.logoUrl && branding.logoUrl) {
        resolved.logoUrl = branding.logoUrl;
      }
      if (enabledTokens.primaryColor && branding.primaryColor) {
        resolved.primaryColor = branding.primaryColor;
      }
      if (enabledTokens.accentColor && branding.accentColor) {
        resolved.accentColor = branding.accentColor;
      }
      if (enabledTokens.emailSenderName && branding.emailSenderName) {
        resolved.emailSenderName = branding.emailSenderName;
      }
      if (enabledTokens.emailSenderAddress && branding.emailSenderAddress) {
        resolved.emailSenderAddress = branding.emailSenderAddress;
      }
      if (enabledTokens.intakeHeaderText && branding.intakeHeaderText) {
        resolved.intakeHeaderText = branding.intakeHeaderText;
      }
    }

    return resolved;
  }, [branding, enabledTokens]);

  const primaryColor = resolvedBranding.primaryColor || '#3B82F6';
  const accentColor = resolvedBranding.accentColor || '#10B981';
  const logoUrl = resolvedBranding.logoUrl;
  const senderName = resolvedBranding.emailSenderName || 'VaultLogic';
  const senderAddress = resolvedBranding.emailSenderAddress || 'noreply@vaultlogic.com';
  const headerText = resolvedBranding.intakeHeaderText || 'Welcome';

  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Email Header (From/To) */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-100 dark:bg-gray-800 p-4 space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="font-medium text-gray-600 dark:text-gray-400 w-16">From:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {senderName} &lt;{senderAddress}&gt;
                </span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-gray-600 dark:text-gray-400 w-16">To:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  recipient@example.com
                </span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-gray-600 dark:text-gray-400 w-16">Subject:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {subjectPreview || 'Email Subject Line'}
                </span>
              </div>
            </div>

            {/* Email Body */}
            <div className="bg-white p-6 space-y-6">
              {/* Email Header with Logo and Color */}
              <div
                className="p-6 rounded-lg"
                style={{
                  backgroundColor: primaryColor,
                  color: '#FFFFFF',
                }}
              >
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="h-10 object-contain mb-4"
                    style={{ filter: 'brightness(0) invert(1)' }}
                  />
                )}
                <h2 className="text-2xl font-bold">{headerText}</h2>
              </div>

              {/* Email Content */}
              <div className="space-y-4 text-gray-700">
                <p className="text-sm">Hi there,</p>

                <p className="text-sm">
                  This is a preview of the <strong>{templateName}</strong> email template with your
                  branding applied.
                </p>

                <p className="text-sm">
                  The content shown here is just a placeholder. Your actual email will contain
                  workflow-specific information and dynamic content.
                </p>

                {/* Action Button */}
                <div className="pt-4">
                  <a
                    href="#"
                    className="inline-block px-6 py-3 rounded-md text-white font-medium no-underline"
                    style={{ backgroundColor: accentColor }}
                  >
                    Take Action
                  </a>
                </div>

                <p className="text-sm pt-4">
                  Best regards,
                  <br />
                  The {senderName} Team
                </p>
              </div>

              {/* Email Footer */}
              <div className="pt-6 border-t text-xs text-gray-500 space-y-2">
                <p>This email was sent by {senderName}</p>
                <p className="text-xs">
                  If you have any questions, please contact us at {senderAddress}
                </p>
              </div>
            </div>
          </div>

          {/* Branding Summary */}
          <div className="pt-4 border-t space-y-3">
            <p className="text-sm font-medium">Active Branding Tokens:</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(enabledTokens).map(([key, enabled]) => {
                if (!enabled) {return null;}

                const labels: Record<string, string> = {
                  logoUrl: 'Logo',
                  primaryColor: 'Primary Color',
                  accentColor: 'Accent Color',
                  emailSenderName: 'Sender Name',
                  emailSenderAddress: 'Sender Address',
                  intakeHeaderText: 'Header Text',
                };

                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 text-xs bg-muted px-2 py-1.5 rounded"
                  >
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span>{labels[key]}</span>
                  </div>
                );
              })}
            </div>
            {Object.values(enabledTokens).every((v) => !v) && (
              <p className="text-sm text-muted-foreground">
                No branding tokens enabled. Enable tokens to customize this email.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
