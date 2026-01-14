import React, { useState } from 'react';

import type { TenantBranding } from '@shared/types/branding';

import { useTenantBranding, useUpdateTenantBranding } from '../../hooks/useBrandingAPI';

/**
 * Stage 17: Branding Settings Page (PLACEHOLDER)
 *
 * Minimal UI for managing tenant branding configuration.
 * This is a scaffolding component - final UI design will be implemented later.
 */

interface BrandingSettingsProps {
  tenantId: string;
}

export function BrandingSettings({ tenantId }: BrandingSettingsProps) {
  const { data: branding, isLoading, error } = useTenantBranding(tenantId);
  const updateBranding = useUpdateTenantBranding(tenantId);

  const [formData, setFormData] = useState<Partial<TenantBranding>>({
    logoUrl: '',
    primaryColor: '#000000',
    accentColor: '#0066cc',
    darkModeEnabled: false,
    intakeHeaderText: '',
    emailSenderName: '',
    emailSenderAddress: '',
  });

  // Update form data when branding loads
  React.useEffect(() => {
    if (branding) {
      setFormData({
        logoUrl: branding.logoUrl || '',
        primaryColor: branding.primaryColor || '#000000',
        accentColor: branding.accentColor || '#0066cc',
        darkModeEnabled: branding.darkModeEnabled || false,
        intakeHeaderText: branding.intakeHeaderText || '',
        emailSenderName: branding.emailSenderName || '',
        emailSenderAddress: branding.emailSenderAddress || '',
      });
    }
  }, [branding]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateBranding.mutateAsync(formData);
      alert('Branding updated successfully');
    } catch (error: any) {
      alert(`Failed to update branding: ${error.message}`);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading branding settings...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error loading branding: {error.message}</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Branding Settings</h1>
      <p className="text-gray-600 mb-4">
        Configure your tenant's branding. This is a placeholder UI - final design coming soon.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Logo URL */}
        <div>
          <label className="block text-sm font-medium mb-1">Logo URL</label>
          <input
            type="url"
            value={formData.logoUrl || ''}
            onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
            placeholder="https://example.com/logo.png"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        {/* Primary Color */}
        <div>
          <label className="block text-sm font-medium mb-1">Primary Color</label>
          <input
            type="color"
            value={formData.primaryColor || '#000000'}
            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
            className="w-full h-10 border rounded"
          />
        </div>

        {/* Accent Color */}
        <div>
          <label className="block text-sm font-medium mb-1">Accent Color</label>
          <input
            type="color"
            value={formData.accentColor || '#0066cc'}
            onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
            className="w-full h-10 border rounded"
          />
        </div>

        {/* Dark Mode */}
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={formData.darkModeEnabled || false}
            onChange={(e) => setFormData({ ...formData, darkModeEnabled: e.target.checked })}
            className="mr-2"
          />
          <label className="text-sm font-medium">Enable Dark Mode</label>
        </div>

        {/* Intake Header Text */}
        <div>
          <label className="block text-sm font-medium mb-1">Intake Portal Header Text</label>
          <input
            type="text"
            value={formData.intakeHeaderText || ''}
            onChange={(e) => setFormData({ ...formData, intakeHeaderText: e.target.value })}
            placeholder="Welcome to our workflow"
            className="w-full px-3 py-2 border rounded"
            maxLength={500}
          />
        </div>

        {/* Email Sender Name */}
        <div>
          <label className="block text-sm font-medium mb-1">Email Sender Name</label>
          <input
            type="text"
            value={formData.emailSenderName || ''}
            onChange={(e) => setFormData({ ...formData, emailSenderName: e.target.value })}
            placeholder="VaultLogic Team"
            className="w-full px-3 py-2 border rounded"
            maxLength={255}
          />
        </div>

        {/* Email Sender Address */}
        <div>
          <label className="block text-sm font-medium mb-1">Email Sender Address</label>
          <input
            type="email"
            value={formData.emailSenderAddress || ''}
            onChange={(e) => setFormData({ ...formData, emailSenderAddress: e.target.value })}
            placeholder="noreply@yourdomain.com"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={updateBranding.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {updateBranding.isPending ? 'Saving...' : 'Save Branding'}
          </button>
        </div>
      </form>
    </div>
  );
}
