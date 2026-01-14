/**
 * Stage 17: Intake Portal Preview Page
 *
 * Public page for previewing branded intake portals
 * Used for testing branding configuration
 */

import { Loader2, AlertCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import { BrandingProvider } from '@/components/branding';
import IntakeDemo from '@/components/intake/IntakeDemo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

/**
 * Extracts tenant ID from:
 * 1. URL query parameter (?tenantId=xxx)
 * 2. User's current tenant (if authenticated)
 * 3. Domain-based tenant detection (future enhancement)
 */
function useTenantIdFromContext(): string | null {
  const [location] = useLocation();
  const { user } = useAuth();

  // 1. Try URL query parameter
  const params = new URLSearchParams(window.location.search);
  const tenantIdFromQuery = params.get('tenantId');
  if (tenantIdFromQuery) {
    return tenantIdFromQuery;
  }

  // 2. Try authenticated user's tenant
  if (user?.tenantId) {
    return user.tenantId;
  }

  // 3. Domain-based detection (future)
  // Could extract from subdomain or custom domain
  // e.g., acme.vaultlogic.com -> lookup tenant by domain

  return null;
}

export default function IntakePreviewPage() {
  const tenantId = useTenantIdFromContext();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Small delay to ensure context is ready
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // No tenant ID available
  if (!tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-6 p-8">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Tenant Not Found</h1>
            <p className="text-gray-600 mb-6">
              No tenant ID was provided. To preview an intake portal, you need to either:
            </p>
          </div>

          <div className="bg-white rounded-lg border p-6 space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-1">Option 1: Query Parameter</h3>
              <p className="text-sm text-gray-600">
                Add <code className="bg-gray-100 px-1 py-0.5 rounded">?tenantId=your-tenant-id</code> to
                the URL
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Example: /intake/preview?tenantId=123e4567-e89b-12d3-a456-426614174000
              </p>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-1">Option 2: Login</h3>
              <p className="text-sm text-gray-600">
                Log in to your account to use your tenant's branding automatically
              </p>
              <Button className="mt-3 w-full" onClick={() => (window.location.href = '/')}>
                Go to Login
              </Button>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-1">Option 3: Custom Domain</h3>
              <p className="text-sm text-gray-600">
                Access via your custom domain (e.g., acme.vaultlogic.com)
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Domain-based tenant detection coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading preview...</p>
        </div>
      </div>
    );
  }

  // Render preview with BrandingProvider
  return (
    <BrandingProvider tenantId={tenantId} enableTheming={true}>
      <IntakeDemo />
    </BrandingProvider>
  );
}
