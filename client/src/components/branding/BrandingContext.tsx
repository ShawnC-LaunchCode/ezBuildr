/**
 * Stage 17: BrandingContext
 *
 * React context for managing tenant branding throughout the application.
 * Provides branding configuration, theme tokens, and tenant information.
 */

import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react';

import type { TenantBranding } from '@shared/types/branding';

import {
  brandingToThemeTokens,
  applyThemeTokens,
  removeThemeTokens,
  type ExtendedThemeTokens,
} from '../../lib/tenantTheme';
import { brandingAPI } from '../../lib/vault-api';

/**
 * Branding context value
 */
export interface BrandingContextValue {
  /** Tenant ID (if known) */
  tenantId: string | null;

  /** Current branding configuration */
  branding: TenantBranding | null;

  /** Loading state */
  isLoading: boolean;

  /** Error state */
  error: Error | null;

  /** Computed theme tokens */
  themeTokens: Partial<ExtendedThemeTokens>;

  /** Check if branding is loaded */
  hasLoaded: boolean;

  /** Check if dark mode is enabled */
  isDarkMode: boolean;

  /** Reload branding from server */
  reload: () => Promise<void>;

  /** Update branding (optimistic update) */
  updateBranding: (updates: Partial<TenantBranding>) => void;
}

/**
 * Branding context
 */
const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

/**
 * Branding provider props
 */
export interface BrandingProviderProps {
  children: ReactNode;

  /** Explicit tenant ID to load branding for */
  tenantId?: string | null;

  /** Skip automatic loading (useful for public pages with domain-based detection) */
  skipAutoLoad?: boolean;

  /** Enable theme application (apply CSS variables to document root) */
  enableTheming?: boolean;
}

/**
 * Branding provider component
 *
 * Loads tenant branding and optionally applies theme tokens to document root.
 *
 * Usage:
 * ```tsx
 * // In builder (with explicit tenant ID)
 * <BrandingProvider tenantId={user.tenantId} enableTheming={false}>
 *   <BuilderUI />
 * </BrandingProvider>
 *
 * // In intake portal (with theme application)
 * <BrandingProvider tenantId={workflowTenantId} enableTheming={true}>
 *   <IntakePortal />
 * </BrandingProvider>
 *
 * // With domain-based detection
 * <BrandingProvider skipAutoLoad={true} enableTheming={true}>
 *   <PublicPage />
 * </BrandingProvider>
 * ```
 */
export function BrandingProvider({
  children,
  tenantId,
  skipAutoLoad = false,
  enableTheming = false,
}: BrandingProviderProps) {
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [isLoading, setIsLoading] = useState(!skipAutoLoad);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Compute theme tokens from branding
  const themeTokens = useMemo(() => {
    return brandingToThemeTokens(branding);
  }, [branding]);

  // Check if dark mode is enabled
  const isDarkMode = branding?.darkModeEnabled === true;

  /**
   * Load branding from API
   */
  const loadBranding = useCallback(async () => {
    if (!tenantId) {
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await brandingAPI.getBranding(tenantId);
      setBranding(response.branding);
      setHasLoaded(true);
    } catch (err) {
      console.error('Failed to load tenant branding:', err);
      setError(err as Error);
      setHasLoaded(true);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  /**
   * Reload branding
   */
  const reload = useCallback(async () => {
    await loadBranding();
  }, [loadBranding]);

  /**
   * Optimistically update branding
   */
  /**
   * Optimistically update branding
   */
  const updateBranding = useCallback((updates: Partial<TenantBranding>) => {
    setBranding((prev) => {
      if (!prev) {return null;}
      return {
        ...prev,
        ...updates,
      };
    });
  }, []);

  // Load branding on mount or when tenantId changes
  useEffect(() => {
    if (!skipAutoLoad && tenantId) {
      void loadBranding();
    }
  }, [tenantId, skipAutoLoad, loadBranding]);

  // Apply theme tokens when enabled and branding changes
  useEffect(() => {
    if (enableTheming && hasLoaded) {
      if (branding) {
        applyThemeTokens(themeTokens);
      } else {
        removeThemeTokens();
      }
    }

    // Cleanup: remove theme tokens when component unmounts
    return () => {
      if (enableTheming) {
        removeThemeTokens();
      }
    };
  }, [enableTheming, branding, themeTokens, hasLoaded]);

  const value: BrandingContextValue = useMemo(
    () => ({
      tenantId: tenantId ?? null,
      branding,
      isLoading,
      error,
      themeTokens,
      hasLoaded,
      isDarkMode,
      reload,
      updateBranding,
    }),
    [tenantId, branding, isLoading, error, themeTokens, hasLoaded, isDarkMode, reload, updateBranding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

/**
 * Hook to access branding context
 *
 * @throws Error if used outside of BrandingProvider
 */
export function useBranding(): BrandingContextValue {
  const context = useContext(BrandingContext);

  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }

  return context;
}

/**
 * Hook to access theme tokens
 *
 * Shorthand for useBranding().themeTokens
 */
export function useThemeTokens(): Partial<ExtendedThemeTokens> {
  const { themeTokens } = useBranding();
  return themeTokens;
}

/**
 * Hook to access tenant ID
 *
 * Shorthand for useBranding().tenantId
 */
export function useTenantId(): string | null {
  const { tenantId } = useBranding();
  return tenantId;
}

/**
 * Hook to check if dark mode is enabled
 *
 * Shorthand for useBranding().isDarkMode
 */
export function useIsDarkMode(): boolean {
  const { isDarkMode } = useBranding();
  return isDarkMode;
}

/**
 * Hook to get primary color
 */
export function usePrimaryColor(): string | null {
  const { branding } = useBranding();
  return branding?.primaryColor ?? null;
}

/**
 * Hook to get accent color
 */
export function useAccentColor(): string | null {
  const { branding } = useBranding();
  return branding?.accentColor ?? null;
}

/**
 * Hook to get logo URL
 */
export function useLogoUrl(): string | null {
  const { branding } = useBranding();
  return branding?.logoUrl ?? null;
}

/**
 * Hook to get intake header text
 */
export function useIntakeHeaderText(): string | null {
  const { branding } = useBranding();
  return branding?.intakeHeaderText ?? null;
}
