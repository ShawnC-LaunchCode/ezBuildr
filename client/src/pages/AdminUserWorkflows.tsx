import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Copy, FileStack, Trash2, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface AdminWorkflow {
  id: string;
  title: string;
  name: string | null;
  description: string | null;
  slug: string | null;
  status: 'draft' | 'active' | 'archived';
  ownerType: 'user' | 'org' | null;
  ownerName: string | null;
  runCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AdminWorkflowOwner {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface AdminUserWorkflowsResponse {
  user: AdminWorkflowOwner;
  workflows: AdminWorkflow[];
}

const ADMIN_USERS_QUERY_KEY = ["/api/admin/users"] as const;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getOwnerDisplayName(user: AdminWorkflowOwner): string {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name !== '' ? name : user.email;
}

function getWorkflowTitle(workflow: AdminWorkflow): string {
  const title = workflow.name ?? workflow.title;
  return title.trim() !== '' ? title : 'Untitled workflow';
}

function formatDate(value: string | null): string {
  if (value === null) {
    return '—';
  }
  return new Date(value).toLocaleDateString();
}

function WorkflowStatusBadge({ status }: { status: AdminWorkflow['status'] }) {
  if (status === 'active') {
    return <Badge className="bg-green-600">Active</Badge>;
  }
  if (status === 'archived') {
    return <Badge variant="outline" className="text-muted-foreground">Archived</Badge>;
  }
  return <Badge variant="secondary">Draft</Badge>;
}

/**
 * Org-owned workflows survive their creator's deletion and belong to the org,
 * not the user — flag them so an admin clearing an account doesn't delete
 * something the org still depends on.
 */
function WorkflowOwnerBadge({ workflow }: { workflow: AdminWorkflow }) {
  if (workflow.ownerType === 'org') {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
        <Building2 className="h-3 w-3 mr-1" />
        {workflow.ownerName ?? 'Organization'}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <UserIcon className="h-3 w-3 mr-1" />
      Personal
    </Badge>
  );
}

function CopyWorkflowDialog({
  workflow,
  onClose,
  onConfirm,
  isPending,
}: {
  workflow: AdminWorkflow | null;
  onClose: () => void;
  onConfirm: (options: { name: string; includeDatavaultData: boolean }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [includeData, setIncludeData] = useState(false);

  // Re-seed the form each time a different workflow opens the dialog.
  useEffect(() => {
    if (workflow !== null) {
      setName(`Copy of ${getWorkflowTitle(workflow)}`.substring(0, 255));
      setIncludeData(false);
    }
  }, [workflow]);

  return (
    <Dialog open={workflow !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy to your account</DialogTitle>
          <DialogDescription>
            Copies the workflow, its sections, steps, logic and linked DataVault structure into
            your own account. The original is left untouched, and responses (runs) are never copied.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="copy-name">Name for your copy</Label>
            <Input
              id="copy-name"
              value={name}
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            <Checkbox
              id="include-data"
              checked={includeData}
              onCheckedChange={(checked) => setIncludeData(checked === true)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="include-data" className="cursor-pointer">
                Also copy DataVault rows
              </Label>
              <p className="text-xs text-muted-foreground">
                Copies the actual data in linked tables, not just their structure. Leave off unless
                you need the records.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={() => onConfirm({ name: name.trim(), includeDatavaultData: includeData })}
            disabled={isPending || name.trim() === ''}
          >
            {isPending ? "Copying…" : "Copy workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkflowDialog({
  workflow,
  onClose,
  onConfirm,
  isPending,
}: {
  workflow: AdminWorkflow | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const runCount = workflow?.runCount ?? 0;
  const runClause = runCount === 0
    ? ''
    : runCount === 1
      ? ' and its 1 response'
      : ` and all ${runCount} of its responses`;

  return (
    <Dialog open={workflow !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete workflow</DialogTitle>
          <DialogDescription>
            Permanently delete <span className="font-medium text-foreground">{workflow === null ? '' : getWorkflowTitle(workflow)}</span>
            {runClause}. Sections, steps, logic and documents go with it. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {workflow?.ownerType === 'org' && (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            This workflow is owned by {workflow.ownerName ?? 'an organization'}, not by this user.
            Deleting it removes it for everyone in that organization.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileStack className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">No workflows left</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        This user owns nothing that needs salvaging, so deleting the account will not orphan any
        work.
      </p>
      <Link href="/admin/users">
        <Button variant="outline" className="mt-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Manage Users
        </Button>
      </Link>
    </div>
  );
}

function WorkflowRow({
  workflow,
  onCopy,
  onDelete,
  isBusy,
}: {
  workflow: AdminWorkflow;
  onCopy: (workflow: AdminWorkflow) => void;
  onDelete: (workflow: AdminWorkflow) => void;
  isBusy: boolean;
}) {
  return (
    <tr className="border-b border-border transition-colors hover:bg-accent/50">
      <td className="p-3">
        <Link
          href={`/workflows/${workflow.id}/builder`}
          className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {getWorkflowTitle(workflow)}
        </Link>
        <div className="text-xs text-muted-foreground">ID: {workflow.id.slice(-8)}</div>
      </td>
      <td className="whitespace-nowrap p-3"><WorkflowOwnerBadge workflow={workflow} /></td>
      <td className="whitespace-nowrap p-3"><WorkflowStatusBadge status={workflow.status} /></td>
      <td className="p-3 text-sm tabular-nums">{workflow.runCount}</td>
      <td className="whitespace-nowrap p-3 text-sm text-muted-foreground">{formatDate(workflow.updatedAt)}</td>
      <td className="whitespace-nowrap p-3">
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="sm" onClick={() => onCopy(workflow)} disabled={isBusy}>
            <Copy className="mr-1 h-4 w-4" />
            Copy
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title={`Delete ${getWorkflowTitle(workflow)}`}
            onClick={() => onDelete(workflow)}
            disabled={isBusy}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete {getWorkflowTitle(workflow)}</span>
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminUserWorkflows() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [, params] = useRoute<{ userId: string }>("/admin/users/:userId/workflows");
  const userId = params?.userId ?? "";

  const [copyTarget, setCopyTarget] = useState<AdminWorkflow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminWorkflow | null>(null);

  const workflowsQueryKey = ["/api/admin/users", userId, "workflows"] as const;

  const { data, isLoading, error } = useQuery<AdminUserWorkflowsResponse>({
    queryKey: workflowsQueryKey,
    enabled: !!isAuthenticated && userId !== "",
    retry: false,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You must be logged in",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Access Denied",
        description: "You must be an admin to access this page",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    }
  }, [error, toast]);

  const invalidateAfterChange = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    queryClient.invalidateQueries({ queryKey: workflowsQueryKey });
    // Counts on the user list move with every copy or delete.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
  };

  const copyMutation = useMutation({
    mutationFn: async ({ workflowId, name, includeDatavaultData }: {
      workflowId: string;
      name: string;
      includeDatavaultData: boolean;
    }) => {
      return apiRequest("POST", `/api/admin/workflows/${workflowId}/copy`, {
        name,
        includeDatavaultData,
      });
    },
    onSuccess: () => {
      invalidateAfterChange();
      setCopyTarget(null);
      toast({
        title: "Workflow copied",
        description: "The copy is now in your own workflow list.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to copy workflow."),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      return apiRequest("DELETE", `/api/admin/workflows/${workflowId}`);
    },
    onSuccess: () => {
      invalidateAfterChange();
      setDeleteTarget(null);
      toast({ title: "Workflow deleted", description: "The workflow and its responses are gone." });
    },
    onError: (err: unknown) => {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to delete workflow."),
        variant: "destructive",
      });
    },
  });

  if (authLoading || !isAuthenticated || error) {
    return null;
  }

  const workflows = data?.workflows ?? [];
  const isBusy = copyMutation.isPending || deleteMutation.isPending;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex flex-1 flex-col overflow-hidden">
        <Header
          title="User Workflows"
          description={
            data === undefined
              ? "Copy or delete a user's workflows before removing their account"
              : `${getOwnerDisplayName(data.user)} · ${data.user.email}`
          }
          actions={
            <Link href="/admin/users">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Users
              </Button>
            </Link>
          }
        />

        <div className="flex-1 overflow-auto p-6">
          <CopyWorkflowDialog
            workflow={copyTarget}
            onClose={() => setCopyTarget(null)}
            isPending={copyMutation.isPending}
            onConfirm={({ name, includeDatavaultData }) => {
              if (copyTarget !== null) {
                copyMutation.mutate({ workflowId: copyTarget.id, name, includeDatavaultData });
              }
            }}
          />
          <DeleteWorkflowDialog
            workflow={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            isPending={deleteMutation.isPending}
            onConfirm={() => {
              if (deleteTarget !== null) {
                deleteMutation.mutate(deleteTarget.id);
              }
            }}
          />

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-16 rounded bg-muted"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileStack className="h-5 w-5" />
                  Workflows ({workflows.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {workflows.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          {/* w-full lets the title column absorb all slack so the
                              rest shrink to their content instead of pushing the
                              actions off the edge. */}
                          <th className="w-full p-3 text-left text-sm font-medium text-muted-foreground">Workflow</th>
                          <th className="whitespace-nowrap p-3 text-left text-sm font-medium text-muted-foreground">Owner</th>
                          <th className="whitespace-nowrap p-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                          <th className="whitespace-nowrap p-3 text-left text-sm font-medium text-muted-foreground">Responses</th>
                          <th className="whitespace-nowrap p-3 text-left text-sm font-medium text-muted-foreground">Updated</th>
                          <th className="whitespace-nowrap p-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workflows.map((workflow) => (
                          <WorkflowRow
                            key={workflow.id}
                            workflow={workflow}
                            isBusy={isBusy}
                            onCopy={setCopyTarget}
                            onDelete={setDeleteTarget}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
