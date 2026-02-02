import { useMemo } from 'react';

import type { TenantBranding } from '@/lib/vault-api';

export function useResolvedBranding(
    branding: TenantBranding | null,
    enabledTokens: Record<string, boolean>
): Partial<TenantBranding> {
    return useMemo(() => {
        const resolved: Partial<TenantBranding> = {};

        if (branding) {
            const keys: Array<keyof TenantBranding> = [
                'logoUrl',
                'primaryColor',
                'accentColor',
                'emailSenderName',
                'emailSenderAddress',
                'intakeHeaderText'
            ];

            keys.forEach((key) => {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (enabledTokens[key] && branding[key]) {
                    // @ts-expect-error - Partial<TenantBranding> assignment is safe here
                    resolved[key] = branding[key];
                }
            });
        }

        return resolved;
    }, [branding, enabledTokens]);
}
