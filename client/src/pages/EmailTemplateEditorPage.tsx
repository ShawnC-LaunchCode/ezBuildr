/**
 * Stage 17: Email Template Editor Page
 *
 * Edit email template metadata and configure branding token bindings
 */
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Loader2,
  Mail,
  Eye,
  Tag,
  Image,
  Palette,
  User,
  AtSign,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';

import { useBranding } from '@/components/branding';
import EmailPreview from '@/components/branding/EmailPreview';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  emailTemplateAPI,
  type EmailTemplateMetadata,
  type UpdateEmailTemplateMetadataRequest,
} from '@/lib/vault-api';
// Available branding tokens
const BRANDING_TOKENS = [
  { key: 'logoUrl', label: 'Logo URL', description: 'Organization logo image', icon: Image },
  { key: 'primaryColor', label: 'Primary Color', description: 'Main brand color', icon: Palette },
  { key: 'accentColor', label: 'Accent Color', description: 'Secondary brand color', icon: Palette },
  {
    key: 'emailSenderName',
    label: 'Sender Name',
    description: 'From name in email header',
    icon: User,
  },
  {
    key: 'emailSenderAddress',
    label: 'Sender Address',
    description: 'From email address',
    icon: AtSign,
  },
  {
    key: 'intakeHeaderText',
    label: 'Header Text',
    description: 'Welcome text in emails',
    icon: Mail,
  },
];
export default function EmailTemplateEditorPage() {
  const { id: projectId, templateId } = useParams<{ id: string; templateId: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId;
  const { branding } = useBranding();
  const [template, setTemplate] = useState<EmailTemplateMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Form state
  const [formData, setFormData] = useState<UpdateEmailTemplateMetadataRequest>({
    name: '',
    description: '',
    subjectPreview: '',
    brandingTokens: {},
  });
  // Load template
  useEffect(() => {
    if (templateId) {
      loadTemplate();
    }
  }, [templateId]);
  const loadTemplate = async () => {
    if (!templateId) {return;}
    setIsLoading(true);
    try {
      const { template: fetchedTemplate } = await emailTemplateAPI.getTemplate(templateId);
      setTemplate(fetchedTemplate);
      setFormData({
        name: fetchedTemplate.name,
        description: fetchedTemplate.description || '',
        subjectPreview: fetchedTemplate.subjectPreview || '',
        brandingTokens: fetchedTemplate.brandingTokens || {},
      });
    } catch (error) {
      console.error('Failed to load template:', error);
      toast({
        title: 'Error',
        description: 'Failed to load email template',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  const handleChange = <K extends keyof UpdateEmailTemplateMetadataRequest>(
    field: K,
    value: UpdateEmailTemplateMetadataRequest[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };
  const handleTokenToggle = (tokenKey: string, enabled: boolean) => {
    setFormData((prev) => ({
      ...prev,
      brandingTokens: {
        ...prev.brandingTokens,
        [tokenKey]: enabled,
      },
    }));
    setHasUnsavedChanges(true);
  };
  const handleSave = async () => {
    if (!templateId) {return;}
    setIsSaving(true);
    try {
      await emailTemplateAPI.updateTemplateMetadata(templateId, formData);
      setHasUnsavedChanges(false);
      await loadTemplate(); // Reload to get updated data
      toast({
        title: 'Success',
        description: 'Template metadata saved successfully',
      });
    } catch (error: any) {
      console.error('Failed to save template:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save template metadata',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };
  const handleReset = () => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        subjectPreview: template.subjectPreview || '',
        brandingTokens: template.brandingTokens || {},
      });
      setHasUnsavedChanges(false);
      toast({
        title: 'Reset',
        description: 'Changes have been discarded',
      });
    }
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
          <Header title="Edit Email Template" />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }
  if (!template) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header title="Edit Email Template" />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Template not found</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => { void navigate(`/projects/${projectId}/settings/email-templates`); }}
              >
                Back to Templates
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const enabledTokenCount = Object.values(formData.brandingTokens || {}).filter(Boolean).length;
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Edit Email Template" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { void navigate(`/projects/${projectId}/settings/email-templates`); }}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Templates
                  </Button>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Edit Email Template</h1>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Tag className="h-4 w-4" />
                  <code className="text-sm">{template.templateKey}</code>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void setShowPreview(!showPreview); }}
              >
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Hide' : 'Show'} Preview
              </Button>
            </div>
            {/* Unsaved Changes Banner */}
            {hasUnsavedChanges && (
              <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-amber-900 dark:text-amber-100">
                        You have unsaved changes
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Save your changes to update the template configuration
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => { void handleReset(); }}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Discard
                      </Button>
                      <Button size="sm" onClick={() => { void handleSave(); }} disabled={isSaving}>
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
                {/* Basic Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Template Information</CardTitle>
                    <CardDescription>
                      Configure the template name and description
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Template Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => { void handleChange('name', e.target.value); }}
                        placeholder="Workflow Invitation"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description || ''}
                        onChange={(e) => { void handleChange('description', e.target.value); }}
                        placeholder="Brief description of when this template is used"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subjectPreview">Subject Preview</Label>
                      <Input
                        id="subjectPreview"
                        value={formData.subjectPreview || ''}
                        onChange={(e) => { void handleChange('subjectPreview', e.target.value); }}
                        placeholder="You've been invited to complete a workflow"
                      />
                      <p className="text-xs text-muted-foreground">
                        Example subject line for preview purposes
                      </p>
                    </div>
                  </CardContent>
                </Card>
                {/* Branding Tokens */}
                <Card>
                  <CardHeader>
                    <CardTitle>Branding Tokens</CardTitle>
                    <CardDescription>
                      Enable branding tokens used in this template ({enabledTokenCount}/
                      {BRANDING_TOKENS.length} enabled)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {BRANDING_TOKENS.map((token) => {
                      const Icon = token.icon;
                      const isEnabled = formData.brandingTokens?.[token.key] === true;
                      return (
                        <div
                          key={token.key}
                          className="flex items-start justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center mt-1">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{token.label}</p>
                              <p className="text-xs text-muted-foreground">{token.description}</p>
                            </div>
                          </div>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(checked) => handleTokenToggle(token.key, checked)}
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
              {/* Right Column: Preview */}
              {showPreview && (
                <div className="space-y-6">
                  <EmailPreview
                    templateName={formData.name || template.name}
                    subjectPreview={formData.subjectPreview || template.subjectPreview}
                    branding={branding}
                    enabledTokens={formData.brandingTokens || {}}
                  />
                </div>
              )}
            </div>
            {/* Save Actions (Bottom) */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Changes will be applied to all emails using this template
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => { void handleReset(); }}
                      disabled={!hasUnsavedChanges || isSaving}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Discard Changes
                    </Button>
                    <Button onClick={() => { void handleSave(); }} disabled={!hasUnsavedChanges || isSaving}>
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