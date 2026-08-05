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
 * Both paths get a server-resolved value so preview and production render the
 * same thing (O-9): production reads it off the run runtime payload, preview off
 * the single-workflow GET. Either way tenant-level branding is already merged in.
 *
 * `settingsFallback` resolves the workflow's own branding client-side and is only
 * reached when neither payload carried a resolved value — an older cached
 * response, or a caller that has only the workflow's settings. It cannot see
 * tenant branding, so it is a floor, not the normal path.
 */
export function useResolvedRunnerBranding(
  resolvedBranding: ResolvedBranding | undefined,
  settingsFallback: unknown
): ResolvedBranding {
  return useMemo(() => {
    if (resolvedBranding) {
      return resolvedBranding;
    }

    if (typeof settingsFallback === 'object' && settingsFallback !== null) {
      return resolveBranding(null, settingsFallback as WorkflowBrandingSettings);
    }

    return DEFAULT_RESOLVED_BRANDING;
  }, [resolvedBranding, settingsFallback]);
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
