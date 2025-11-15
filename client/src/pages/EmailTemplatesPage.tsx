/**
 * Stage 17: Email Templates Page
 *
 * Manage email template metadata and branding token bindings
 */

import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { emailTemplateAPI, type EmailTemplateMetadata } from '@/lib/vault-api';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Mail,
  Search,
  Edit,
  Eye,
  ArrowLeft,
  Loader2,
  FileText,
  Tag,
} from 'lucide-react';

export default function EmailTemplatesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<EmailTemplateMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Load templates
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { templates: fetchedTemplates } = await emailTemplateAPI.listTemplates();
      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load email templates',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
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

  // Filter templates by search query
  const filteredTemplates = templates.filter((template) => {
    const query = searchQuery.toLowerCase();
    return (
      template.name.toLowerCase().includes(query) ||
      template.templateKey.toLowerCase().includes(query) ||
      template.description?.toLowerCase().includes(query)
    );
  });

  // Count branding tokens used
  const getBrandingTokenCount = (template: EmailTemplateMetadata): number => {
    if (!template.brandingTokens) return 0;
    return Object.values(template.brandingTokens).filter(Boolean).length;
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header title="Email Templates" />
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
        <Header title="Email Templates" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/projects/${projectId}/settings/branding`)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Branding
                  </Button>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Email Templates</h1>
                <p className="text-muted-foreground">
                  Configure email templates and branding token bindings
                </p>
              </div>
            </div>

            {/* Info Card */}
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                      About Email Templates
                    </p>
                    <p className="text-blue-700 dark:text-blue-300">
                      Email templates define the structure and content of workflow emails. Configure
                      which branding tokens (logo, colors, sender info) are used in each template to
                      ensure consistent branding across all communications.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Search */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Badge variant="secondary">
                {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Templates Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => {
                const tokenCount = getBrandingTokenCount(template);
                return (
                  <Card
                    key={template.id}
                    className="hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/projects/${projectId}/settings/email-templates/${template.id}`)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Mail className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projects/${projectId}/settings/email-templates/${template.id}`);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                      <CardTitle className="text-lg mt-3">{template.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {template.description || 'No description provided'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {template.subjectPreview && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Subject:</span>{' '}
                          <span className="font-medium">{template.subjectPreview}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">
                          {template.templateKey}
                        </code>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {tokenCount} branding token{tokenCount !== 1 ? 's' : ''}
                        </span>
                        <Badge variant={tokenCount > 0 ? 'default' : 'secondary'} className="text-xs">
                          {tokenCount > 0 ? 'Configured' : 'Not configured'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Empty State */}
            {filteredTemplates.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {searchQuery ? 'No templates found' : 'No templates yet'}
                </h3>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  {searchQuery
                    ? 'Try adjusting your search query'
                    : 'Email templates will appear here once workflows start using email actions'}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
