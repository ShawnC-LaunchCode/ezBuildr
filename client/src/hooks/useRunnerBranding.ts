import { useEffect, useMemo, useRef } from 'react';

import {
  DEFAULT_RESOLVED_BRANDING,
  brandingToRunnerCssVars,
  resolveBranding,
  type ResolvedBranding,
  type WorkflowBrandingSettings,
} from '@shared/types/branding';

const FAVICON_SELECTOR = 'link[rel~="icon"]';

/**
 * Resolve branding for the runner (GH-158).
 *
 * In production the server has already merged tenant + workflow branding onto
 * the runtime payload, so it is used verbatim. In preview there is no run and
 * therefore no server-resolved value, so the workflow's own branding settings
 * are resolved client-side through the same pure function. Tenant-level
 * branding does not reach preview — see the GH-158 note on preview fidelity.
 */
export function useResolvedRunnerBranding(
  runtimeBranding: ResolvedBranding | undefined,
  previewSettings: unknown
): ResolvedBranding {
  return useMemo(() => {
    if (runtimeBranding) {
      return runtimeBranding;
    }

    if (typeof previewSettings === 'object' && previewSettings !== null) {
      return resolveBranding(null, previewSettings as WorkflowBrandingSettings);
    }

    return DEFAULT_RESOLVED_BRANDING;
  }, [runtimeBranding, previewSettings]);
}

/**
 * Swap the document favicon while a branded run is open, restoring the
 * previous icon on unmount so navigating back to the app does not leave the
 * customer's favicon in place.
 */
export function useBrandedFavicon(faviconUrl: string | null): void {
  const previousHrefRef = useRef<string | null>(null);

  useEffect(() => {
    if (faviconUrl === null) {
      return;
    }

    const link = document.querySelector<HTMLLinkElement>(FAVICON_SELECTOR);
    if (!link) {
      return;
    }

    previousHrefRef.current = link.getAttribute('href');
    link.setAttribute('href', faviconUrl);

    return () => {
      const previousHref = previousHrefRef.current;
      if (previousHref === null) {
        link.removeAttribute('href');
      } else {
        link.setAttribute('href', previousHref);
      }
    };
  }, [faviconUrl]);
}

/**
 * The inline style carrying the brand's CSS custom properties.
 *
 * Applied to the runner's root element rather than `document.documentElement`
 * so that a branded run rendered inside the builder's preview pane cannot
 * repaint the surrounding app chrome.
 */
export function useBrandingStyle(branding: ResolvedBranding): React.CSSProperties {
  return useMemo(
    () => brandingToRunnerCssVars(branding) as React.CSSProperties,
    [branding]
  );
}
