/**
 * Stage 17: Branding Preview Component
 *
 * Shows a live preview of how the branding will look in the intake portal
 */
import { Eye, Smartphone, Monitor } from 'lucide-react';
import React, { useMemo , useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { brandingToThemeTokens } from '@/lib/tenantTheme';
import type { TenantBranding } from '@/lib/vault-api';
export interface BrandingPreviewProps {
  branding: Partial<TenantBranding>;
}
export default function BrandingPreview({ branding }: BrandingPreviewProps) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  // Generate theme tokens from branding
  const themeTokens = useMemo(() => {
    return brandingToThemeTokens(branding);
  }, [branding]);
  // Apply tokens to inline styles
  const themeStyles = useMemo(() => {
    const styles: React.CSSProperties = {};
    Object.entries(themeTokens).forEach(([key, value]) => {
      if (value) {
        // Convert CSS variable name to camelCase for React
        const reactKey = key.replace(/--brand-/, '').replace(/-(.)/g, (_, c) => c.toUpperCase());
        (styles as any)[key] = value;
      }
    });
    return styles;
  }, [themeTokens]);
  const primaryColor = branding.primaryColor || '#3B82F6';
  const accentColor = branding.accentColor || '#10B981';
  const isDarkMode = branding.darkModeEnabled || false;
  const logoUrl = branding.logoUrl;
  const headerText = branding.intakeHeaderText || 'Welcome to Our Portal';
  const bgColor = isDarkMode ? '#0F172A' : '#FFFFFF';
  const textColor = isDarkMode ? '#F8FAFC' : '#0F172A';
  const mutedColor = isDarkMode ? '#CBD5E1' : '#64748B';
  const surfaceColor = isDarkMode ? '#1E293B' : '#FFFFFF';
  const borderColor = isDarkMode ? '#334155' : '#E2E8F0';
  const containerClass = viewMode === 'mobile' ? 'max-w-sm' : 'w-full';
  return (
    <Card className="sticky top-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Live Preview
          </CardTitle>
          <div className="flex items-center gap-1 rounded-md border p-1">
            <Button
              variant={viewMode === 'desktop' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('desktop')}
              className="h-7 px-2"
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'mobile' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('mobile')}
              className="h-7 px-2"
            >
              <Smartphone className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Preview Container */}
          <div
            className={`${containerClass} mx-auto border rounded-lg overflow-hidden shadow-lg transition-all`}
            style={{ backgroundColor: bgColor }}
          >
            {/* Header */}
            <div
              className="p-6 border-b"
              style={{ backgroundColor: primaryColor, borderColor }}
            >
              <div className="flex items-center justify-between mb-4">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="h-10 object-contain"
                    style={{ filter: isDarkMode ? 'brightness(1.1)' : 'none' }}
                  />
                ) : (
                  <div
                    className="h-10 w-32 rounded flex items-center justify-center text-sm font-medium"
                    style={{
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      color: isDarkMode ? '#FFFFFF' : '#000000',
                    }}
                  >
                    Your Logo
                  </div>
                )}
              </div>
              <h2
                className="text-2xl font-bold"
                style={{ color: isDarkMode ? '#FFFFFF' : '#FFFFFF' }}
              >
                {headerText}
              </h2>
            </div>
            {/* Progress Bar */}
            <div className="p-6 border-b" style={{ borderColor }}>
              <div className="space-y-2">
                <div className="flex justify-between text-sm" style={{ color: mutedColor }}>
                  <span>Step 2 of 5</span>
                  <span>40%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: borderColor }}>
                  <div
                    className="h-full transition-all"
                    style={{ width: '40%', backgroundColor: primaryColor }}
                  />
                </div>
              </div>
            </div>
            {/* Form Content */}
            <div className="p-6 space-y-6" style={{ backgroundColor: surfaceColor }}>
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: textColor }}>
                  Sample Question
                </label>
                <input
                  type="text"
                  placeholder="Enter your response..."
                  className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 transition-colors"
                  style={{
                    backgroundColor: bgColor,
                    borderColor: borderColor,
                    color: textColor,
                  }}
                />
                <p className="text-xs" style={{ color: mutedColor }}>
                  This is a sample question in your intake portal
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: textColor }}>
                  Another Field
                </label>
                <textarea
                  placeholder="Enter additional details..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 transition-colors resize-none"
                  style={{
                    backgroundColor: bgColor,
                    borderColor: borderColor,
                    color: textColor,
                  }}
                />
              </div>
              {/* Buttons */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  className="flex-1 px-4 py-2 rounded-md font-medium transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: borderColor,
                    color: textColor,
                  }}
                >
                  Previous
                </button>
                <button
                  className="flex-1 px-4 py-2 rounded-md font-medium text-white transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: primaryColor,
                  }}
                >
                  Next
                </button>
              </div>
              {/* Accent Button Example */}
              <button
                className="w-full px-4 py-2 rounded-md font-medium text-white transition-colors hover:opacity-90"
                style={{
                  backgroundColor: accentColor,
                }}
              >
                Submit
              </button>
            </div>
            {/* Footer */}
            <div
              className="p-4 text-center text-xs border-t"
              style={{ color: mutedColor, borderColor }}
            >
              <p>Powered by VaultLogic</p>
            </div>
          </div>
          {/* Color Swatches */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Primary Color</p>
              <div className="flex items-center gap-2">
                <div
                  className="h-10 w-10 rounded border"
                  style={{ backgroundColor: primaryColor }}
                />
                <div>
                  <p className="text-sm font-mono">{primaryColor}</p>
                  <p className="text-xs text-muted-foreground">Headers & Buttons</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Accent Color</p>
              <div className="flex items-center gap-2">
                <div
                  className="h-10 w-10 rounded border"
                  style={{ backgroundColor: accentColor }}
                />
                <div>
                  <p className="text-sm font-mono">{accentColor}</p>
                  <p className="text-xs text-muted-foreground">Highlights</p>
                </div>
              </div>
            </div>
          </div>
          {/* Theme Mode */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Theme Mode:</span>
              <span className="font-medium">
                {isDarkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}