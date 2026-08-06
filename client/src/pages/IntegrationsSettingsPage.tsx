import { ArrowLeft, Workflow } from 'lucide-react';
import { Link, useParams } from 'wouter';

import { IntegrationHub } from '@/components/builder/integrations/IntegrationHub';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/button';

export default function IntegrationsSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Project integrations" />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Link href={`/projects/${projectId}`}>
                  <Button variant="ghost" size="sm" className="mb-3 -ml-3">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to project
                  </Button>
                </Link>
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Delivery stack</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight">Legal integrations</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Connect the systems that turn a completed interview into a filed matter, signed document, or confirmed payment.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Workflow className="h-4 w-4" aria-hidden="true" />
                Project scoped
              </div>
            </div>
            <IntegrationHub projectId={projectId} />
          </div>
        </main>
      </div>
    </div>
  );
}
