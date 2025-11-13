/**
 * Stage 17: Domain Settings Page
 *
 * Manage custom domains and subdomains for tenant intake portals
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { brandingAPI, type TenantDomain } from '@/lib/vault-api';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Globe,
  Plus,
  ArrowLeft,
  Loader2,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import AddDomainModal from '@/components/branding/AddDomainModal';

export default function DomainSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const tenantId = user?.tenantId;

  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<TenantDomain | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load domains
  useEffect(() => {
    if (tenantId) {
      loadDomains();
    }
  }, [tenantId]);

  const loadDomains = async () => {
    if (!tenantId) return;

    setIsLoading(true);
    try {
      const { domains: fetchedDomains } = await brandingAPI.getDomains(tenantId);
      setDomains(fetchedDomains);
    } catch (error) {
      console.error('Failed to load domains:', error);
      toast({
        title: 'Error',
        description: 'Failed to load domains',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDomain = async (domain: string) => {
    if (!tenantId) return;

    try {
      await brandingAPI.addDomain(tenantId, domain);
      toast({
        title: 'Success',
        description: 'Domain added successfully',
      });
      loadDomains();
      setIsAddModalOpen(false);
    } catch (error: any) {
      console.error('Failed to add domain:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add domain',
        variant: 'destructive',
      });
      throw error; // Re-throw to let modal handle it
    }
  };

  const handleDeleteDomain = async () => {
    if (!tenantId || !domainToDelete) return;

    setIsDeleting(true);
    try {
      await brandingAPI.removeDomain(tenantId, domainToDelete.id);
      toast({
        title: 'Success',
        description: 'Domain removed successfully',
      });
      loadDomains();
      setDomainToDelete(null);
    } catch (error: any) {
      console.error('Failed to delete domain:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove domain',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
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
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  const isVaultLogicDomain = (domain: string) => domain.endsWith('.vaultlogic.com');

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Link href={`/projects/${projectId}/settings/branding`}>
                    <Button variant="ghost" size="sm">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Branding
                    </Button>
                  </Link>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Domain Management</h1>
                <p className="text-muted-foreground">
                  Configure custom domains for your intake portals
                </p>
              </div>
              <Button onClick={() => setIsAddModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Domain
              </Button>
            </div>

            {/* Info Card */}
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      About Custom Domains
                    </p>
                    <ul className="text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                      <li>
                        <strong>Subdomains:</strong> Use *.vaultlogic.com for instant setup
                      </li>
                      <li>
                        <strong>Custom Domains:</strong> Bring your own domain (requires DNS
                        configuration)
                      </li>
                      <li>All domains will display your branded intake portal</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Domains List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Your Domains
                  <span className="text-sm font-normal text-muted-foreground">
                    ({domains.length})
                  </span>
                </CardTitle>
                <CardDescription>
                  Domains configured for your tenant's intake portals
                </CardDescription>
              </CardHeader>
              <CardContent>
                {domains.length === 0 ? (
                  // Empty State
                  <div className="text-center py-12">
                    <Globe className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No domains configured</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                      Add a subdomain or custom domain to create branded intake portal URLs
                    </p>
                    <Button onClick={() => setIsAddModalOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Domain
                    </Button>
                  </div>
                ) : (
                  // Domains Table
                  <div className="space-y-3">
                    {domains.map((domain) => (
                      <div
                        key={domain.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div
                            className={`h-10 w-10 rounded-full flex items-center justify-center ${
                              isVaultLogicDomain(domain.domain)
                                ? 'bg-blue-100 dark:bg-blue-900'
                                : 'bg-purple-100 dark:bg-purple-900'
                            }`}
                          >
                            <Globe
                              className={`h-5 w-5 ${
                                isVaultLogicDomain(domain.domain)
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-purple-600 dark:text-purple-400'
                              }`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{domain.domain}</p>
                              {isVaultLogicDomain(domain.domain) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Subdomain
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                  Custom
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Added {new Date(domain.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`https://${domain.domain}/intake/preview`, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Preview
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDomainToDelete(domain)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Domain Instructions */}
            {domains.some((d) => !isVaultLogicDomain(d.domain)) && (
              <Card>
                <CardHeader>
                  <CardTitle>Custom Domain Setup</CardTitle>
                  <CardDescription>
                    Configure DNS settings for your custom domains
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    To use a custom domain, add the following DNS records:
                  </p>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-2">
                    <div>
                      <span className="text-muted-foreground">Type:</span> CNAME
                    </div>
                    <div>
                      <span className="text-muted-foreground">Name:</span> @{' '}
                      <span className="text-xs text-muted-foreground">(or your subdomain)</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Value:</span> vaultlogic.app
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    DNS propagation can take up to 48 hours. Once configured, your domain will
                    automatically serve your branded intake portal.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>

      {/* Add Domain Modal */}
      <AddDomainModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        onAddDomain={handleAddDomain}
        existingDomains={domains.map((d) => d.domain)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!domainToDelete} onOpenChange={() => setDomainToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{domainToDelete?.domain}</strong>? This
              domain will no longer serve your intake portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDomain}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Domain'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
