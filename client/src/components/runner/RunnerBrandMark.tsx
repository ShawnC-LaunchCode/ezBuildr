import { useEffect, useState } from "react";

import type { ResolvedBranding } from "@shared/types/branding";

export const DEFAULT_BRAND_NAME = "ezBuildr";

interface RunnerBrandMarkProps {
    branding: ResolvedBranding;
}

/**
 * The brand lockup in the runner header (GH-158).
 *
 * Falls back through three states: the customer's logo, then their
 * organization name beside the brand swatch, then the ezBuildr default. A logo
 * that fails to load degrades to the name rather than leaving a broken image
 * on a client-facing screen — participant surfaces are the one place we cannot
 * ask the author to notice and fix it.
 */
export function RunnerBrandMark({ branding }: RunnerBrandMarkProps) {
    const { logoUrl, organizationName } = branding;
    const [logoFailed, setLogoFailed] = useState(false);

    // A new logo URL deserves a fresh attempt, even if the previous one failed.
    useEffect(() => {
        setLogoFailed(false);
    }, [logoUrl]);

    const name = organizationName ?? DEFAULT_BRAND_NAME;

    if (logoUrl !== null && !logoFailed) {
        return (
            <img
                src={logoUrl}
                alt={organizationName ?? "Organization logo"}
                // Capped tighter on small screens: a wide logo otherwise pushes
                // the step counter in the same header row onto two lines.
                className="h-6 w-auto max-w-[110px] sm:max-w-[180px] object-contain object-left"
                onError={() => setLogoFailed(true)}
            />
        );
    }

    return (
        <>
            <div className="w-6 h-6 bg-primary rounded-sm" />
            <span className="font-semibold text-sm tracking-tight text-foreground">{name}</span>
        </>
    );
}
