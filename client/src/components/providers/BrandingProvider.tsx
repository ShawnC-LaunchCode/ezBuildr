import React, { createContext, useContext, useEffect, useState } from 'react';
import type { TenantBranding } from '@shared/types/branding';
import { brandingToThemeTokens, applyThemeTokens, removeThemeTokens } from '../../lib/tenantTheme';

/**
 * Stage 17: BrandingProvider
 *
 * Provides tenant branding context and applies CSS theme tokens.
 * Loads branding on mount and injects CSS variables into document root.
 */

interface BrandingContextValue {
  branding: TenantBranding | null;
  isLoading: boolean;
  error: Error | null;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

interface BrandingProviderProps {
  children: React.ReactNode;
  tenantId?: string;
  domain?: string;
}

export function BrandingProvider({ children, tenantId, domain }: BrandingProviderProps) {
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadBranding = async () => {
    // Skip if neither tenantId nor domain is provided
    if (!tenantId && !domain) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      let url: string;
      if (tenantId) {
        url = `/api/tenants/${tenantId}/branding`;
      } else if (domain) {
        // For domain-based lookup, we'd need a dedicated endpoint
        // For now, fallback to tenantId approach
        console.warn('Domain-based branding lookup not yet implemented');
        setIsLoading(false);
        return;
      } else {
        setIsLoading(false);
        return;
      }

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load branding: ${response.statusText}`);
      }

      const data = await response.json();
      setBranding(data.branding);

      // Apply theme tokens to document root
      if (data.branding) {
        const tokens = brandingToThemeTokens(data.branding);
        applyThemeTokens(tokens);
      }
    } catch (err) {
      console.error('Error loading tenant branding:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBranding();

    // Cleanup: remove theme tokens on unmount
    return () => {
      removeThemeTokens();
    };
  }, [tenantId, domain]);

  const value: BrandingContextValue = {
    branding,
    isLoading,
    error,
    refreshBranding: loadBranding,
  };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

/**
 * Hook to access branding context
 */
export function useBranding(): BrandingContextValue {
  const context = useContext(BrandingContext);

  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }

  return context;
}

/**
 * Hook to access branding context (optional - returns null if not in provider)
 */
export function useBrandingOptional(): BrandingContextValue | null {
  const context = useContext(BrandingContext);
  return context || null;
}
