/**
 * Stage 17: Branding Settings Page
 *
 * Allows users to configure tenant branding including logo, colors, dark mode,
 * header text, and email sender information.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { brandingAPI, type TenantBranding } from '@/lib/vault-api';
import { useBranding } from '@/components/branding';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Palette,
  Upload,
  Moon,
  Sun,
  Mail,
  User,
  MessageSquare,
  Loader2,
  Save,
  RotateCcw,
  Eye,
  Globe,
  ExternalLink,
} from 'lucide-react';
import BrandingPreview from '@/components/branding/BrandingPreview';
import { isValidHexColor, normalizeHexColor } from '@/lib/colorUtils';

export default function BrandingSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const tenantId = user?.tenantId;

  // Local form state
  const [formData, setFormData] = useState<Partial<TenantBranding>>({
    logoUrl: '',
    primaryColor: '',
    accentColor: '',
    darkModeEnabled: false,
    intakeHeaderText: '',
    emailSenderName: '',
    emailSenderAddress: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Load initial branding
  useEffect(() => {
    if (tenantId) {
      loadBranding();
    }
  }, [tenantId]);

  const loadBranding = async () => {
    if (!tenantId) return;

    setIsLoading(true);
    try {
      const { branding } = await brandingAPI.getBranding(tenantId);
      if (branding) {
        setFormData(branding);
      }
    } catch (error) {
      console.error('Failed to load branding:', error);
      toast({
        title: 'Error',
        description: 'Failed to load branding settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof TenantBranding, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleColorChange = (field: 'primaryColor' | 'accentColor', value: string) => {
    // Only update if valid hex or empty
    if (value === '' || isValidHexColor(value)) {
      const normalized = value ? normalizeHexColor(value) : '';
      handleChange(field, normalized);
    }
  };

  const handleSave = async () => {
    if (!tenantId) {
      toast({
        title: 'Error',
        description: 'No tenant ID found',
        variant: 'destructive',
      });
      return;
    }

    // Validate colors
    if (formData.primaryColor && !isValidHexColor(formData.primaryColor)) {
      toast({
        title: 'Invalid Color',
        description: 'Primary color must be a valid hex color (e.g., #FF5733)',
        variant: 'destructive',
      });
      return;
    }

    if (formData.accentColor && !isValidHexColor(formData.accentColor)) {
      toast({
        title: 'Invalid Color',
        description: 'Accent color must be a valid hex color (e.g., #33FF57)',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      await brandingAPI.updateBranding(tenantId, formData);
      setHasUnsavedChanges(false);
      toast({
        title: 'Success',
        description: 'Branding settings saved successfully',
      });
    } catch (error: any) {
      console.error('Failed to save branding:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save branding settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    loadBranding();
    setHasUnsavedChanges(false);
    toast({
      title: 'Reset',
      description: 'Changes have been discarded',
    });
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: 'Unauthorized',
        description: 'Please log in to access settings.',
        variant: 'destructive',
      });
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Branding Settings</h1>
                <p className="text-muted-foreground mt-2">
                  Customize your tenant's branding, colors, and appearance
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/intake/preview?tenantId=${tenantId}`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Full Preview
                </Button>
                <Link href={`/projects/${projectId}/settings/branding/domains`}>
                  <Button variant="outline" size="sm">
                    <Globe className="h-4 w-4 mr-2" />
                    Manage Domains
                  </Button>
                </Link>
                <Link href={`/projects/${projectId}/settings/email-templates`}>
                  <Button variant="outline" size="sm">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Templates
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {showPreview ? 'Hide' : 'Show'} Preview
                </Button>
              </div>
            </div>

            {hasUnsavedChanges && (
              <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-amber-900 dark:text-amber-100">
                        You have unsaved changes
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Save your changes to apply them to your tenant
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleReset}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Discard
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              {/* Left Column: Form */}
              <div className="space-y-6">
                {/* Logo */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Logo
                    </CardTitle>
                    <CardDescription>
                      Upload your organization's logo (displayed in intake portal header)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="logoUrl">Logo URL</Label>
                      <Input
                        id="logoUrl"
                        type="url"
                        placeholder="https://example.com/logo.png"
                        value={formData.logoUrl || ''}
                        onChange={(e) => handleChange('logoUrl', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter a URL to your logo image. Recommended size: 200x60px
                      </p>
                    </div>
                    {formData.logoUrl && (
                      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                        <p className="text-sm font-medium mb-2">Logo Preview:</p>
                        <img
                          src={formData.logoUrl}
                          alt="Logo preview"
                          className="h-12 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Colors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="h-5 w-5" />
                      Colors
                    </CardTitle>
                    <CardDescription>
                      Customize your brand colors (used throughout the intake portal)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="primaryColor"
                          type="text"
                          placeholder="#3B82F6"
                          value={formData.primaryColor || ''}
                          onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="color"
                          value={formData.primaryColor || '#3B82F6'}
                          onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                          className="w-14 h-10 p-1 cursor-pointer"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Used for headers, buttons, and primary UI elements
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="accentColor">Accent Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="accentColor"
                          type="text"
                          placeholder="#10B981"
                          value={formData.accentColor || ''}
                          onChange={(e) => handleColorChange('accentColor', e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="color"
                          value={formData.accentColor || '#10B981'}
                          onChange={(e) => handleColorChange('accentColor', e.target.value)}
                          className="w-14 h-10 p-1 cursor-pointer"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Used for secondary actions and highlights
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Dark Mode */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {formData.darkModeEnabled ? (
                        <Moon className="h-5 w-5" />
                      ) : (
                        <Sun className="h-5 w-5" />
                      )}
                      Dark Mode
                    </CardTitle>
                    <CardDescription>
                      Enable dark mode for the intake portal
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Enable Dark Mode</Label>
                        <p className="text-sm text-muted-foreground">
                          Use dark background and light text
                        </p>
                      </div>
                      <Switch
                        checked={formData.darkModeEnabled || false}
                        onCheckedChange={(checked) => handleChange('darkModeEnabled', checked)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Intake Portal */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Intake Portal
                    </CardTitle>
                    <CardDescription>
                      Customize the intake portal experience
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="intakeHeaderText">Header Text</Label>
                      <Textarea
                        id="intakeHeaderText"
                        placeholder="Welcome to our intake portal"
                        value={formData.intakeHeaderText || ''}
                        onChange={(e) => handleChange('intakeHeaderText', e.target.value)}
                        rows={3}
                        maxLength={500}
                      />
                      <p className="text-xs text-muted-foreground">
                        Displayed at the top of the intake portal ({formData.intakeHeaderText?.length || 0}/500)
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Email Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Email Sender
                    </CardTitle>
                    <CardDescription>
                      Configure the sender information for workflow emails
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="emailSenderName">Sender Name</Label>
                      <Input
                        id="emailSenderName"
                        type="text"
                        placeholder="Acme Corporation"
                        value={formData.emailSenderName || ''}
                        onChange={(e) => handleChange('emailSenderName', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="emailSenderAddress">Sender Email Address</Label>
                      <Input
                        id="emailSenderAddress"
                        type="email"
                        placeholder="noreply@acme.com"
                        value={formData.emailSenderAddress || ''}
                        onChange={(e) => handleChange('emailSenderAddress', e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Preview */}
              {showPreview && (
                <div className="space-y-6">
                  <BrandingPreview branding={formData} />
                </div>
              )}
            </div>

            {/* Save Actions (Bottom) */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Changes will be applied to all workflow intake portals and emails
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={!hasUnsavedChanges || isSaving}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Discard Changes
                    </Button>
                    <Button onClick={handleSave} disabled={!hasUnsavedChanges || isSaving}>
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
