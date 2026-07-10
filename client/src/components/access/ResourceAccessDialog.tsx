import { Crown, Loader2, Shield, Trash2, Users } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationMembers } from "@/hooks/useOrganizations";
import {
  useDatavaultDatabaseAccess,
  useDatavaultTableAccess,
  useGrantDatavaultDatabaseAccess,
  useGrantDatavaultTableAccess,
  useRevokeDatavaultDatabaseAccess,
  useRevokeDatavaultTableAccess,
} from "@/lib/datavault-hooks";
import {
  useGrantProjectAccess,
  useGrantWorkflowAccess,
  useProjectAccessDetails,
  useRevokeProjectAccess,
  useRevokeWorkflowAccess,
  useWorkflowAccess,
} from "@/lib/vault-hooks";

type ResourceType = "project" | "workflow" | "database" | "table";
type AccessRole = "view" | "edit" | "owner";
type EffectiveAccessRole = AccessRole | "none";
type PrincipalType = "user" | "team";

interface AccessEntry {
  id: string;
  principalType: PrincipalType;
  principalId: string;
  role: AccessRole;
}

interface AccessResponse {
  data: AccessEntry[];
  currentUserRole: EffectiveAccessRole;
}

interface ResourceAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: ResourceType;
  resourceId: string | undefined;
  resourceName: string;
  ownerType?: "user" | "org" | null;
  ownerUuid?: string | null;
}

const resourceLabels: Record<ResourceType, string> = {
  project: "project",
  workflow: "workflow",
  database: "database",
  table: "table",
};

const roleLabels: Record<AccessRole, string> = {
  view: "View",
  edit: "Edit",
  owner: "Owner",
};

const roleBadgeVariant: Record<AccessRole, "default" | "secondary" | "outline"> = {
  view: "outline",
  edit: "secondary",
  owner: "default",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

// eslint-disable-next-line complexity
export function ResourceAccessDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceName,
  ownerType,
  ownerUuid,
}: ResourceAccessDialogProps): React.JSX.Element {
  const { toast } = useToast();
  const orgId = ownerType === "org" ? ownerUuid ?? undefined : undefined;
  const organizationMembers = useOrganizationMembers(orgId);

  const projectAccess = useProjectAccessDetails(resourceType === "project" ? resourceId : undefined);
  const workflowAccess = useWorkflowAccess(resourceType === "workflow" ? resourceId : undefined);
  const databaseAccess = useDatavaultDatabaseAccess(resourceType === "database" ? resourceId : undefined);
  const tableAccess = useDatavaultTableAccess(resourceType === "table" ? resourceId : undefined);

  const grantProjectAccess = useGrantProjectAccess();
  const grantWorkflowAccess = useGrantWorkflowAccess();
  const grantDatabaseAccess = useGrantDatavaultDatabaseAccess();
  const grantTableAccess = useGrantDatavaultTableAccess();
  const revokeProjectAccess = useRevokeProjectAccess();
  const revokeWorkflowAccess = useRevokeWorkflowAccess();
  const revokeDatabaseAccess = useRevokeDatavaultDatabaseAccess();
  const revokeTableAccess = useRevokeDatavaultTableAccess();

  const accessQuery = {
    project: projectAccess,
    workflow: workflowAccess,
    database: databaseAccess,
    table: tableAccess,
  }[resourceType];
  const accessResponse = accessQuery.data as AccessResponse | undefined;
  const accessEntries = accessResponse?.data ?? [];
  const currentUserRole = accessResponse?.currentUserRole ?? "none";
  const canManage = currentUserRole === "owner";
  const isBusy = grantProjectAccess.isPending ||
    grantWorkflowAccess.isPending ||
    grantDatabaseAccess.isPending ||
    grantTableAccess.isPending ||
    revokeProjectAccess.isPending ||
    revokeWorkflowAccess.isPending ||
    revokeDatabaseAccess.isPending ||
    revokeTableAccess.isPending;

  const explicitAccessByUser = useMemo(() => {
    return new Map(
      accessEntries
        .filter((entry) => entry.principalType === "user")
        .map((entry) => [entry.principalId, entry])
    );
  }, [accessEntries]);

  const memberIds = useMemo(() => {
    return new Set((organizationMembers.data ?? []).map((member) => member.userId));
  }, [organizationMembers.data]);

  const externalEntries = useMemo(() => {
    return accessEntries.filter((entry) =>
      entry.principalType !== "user" || !memberIds.has(entry.principalId)
    );
  }, [accessEntries, memberIds]);

  const grantAccess = async (principalType: PrincipalType, principalId: string, role: AccessRole): Promise<void> => {
    if (!resourceId) {
      return;
    }

    if (resourceType === "project") {
      await grantProjectAccess.mutateAsync({ projectId: resourceId, entries: [{ principalType, principalId, role }] });
    } else if (resourceType === "workflow") {
      await grantWorkflowAccess.mutateAsync({ workflowId: resourceId, entries: [{ principalType, principalId, role }] });
    } else if (resourceType === "database") {
      await grantDatabaseAccess.mutateAsync({ databaseId: resourceId, entries: [{ principalType, principalId, role }] });
    } else {
      await grantTableAccess.mutateAsync({ tableId: resourceId, entries: [{ principalType, principalId, role }] });
    }
  };

  const revokeAccess = async (principalType: PrincipalType, principalId: string): Promise<void> => {
    if (!resourceId) {
      return;
    }

    if (resourceType === "project") {
      await revokeProjectAccess.mutateAsync({ projectId: resourceId, entries: [{ principalType, principalId }] });
    } else if (resourceType === "workflow") {
      await revokeWorkflowAccess.mutateAsync({ workflowId: resourceId, entries: [{ principalType, principalId }] });
    } else if (resourceType === "database") {
      await revokeDatabaseAccess.mutateAsync({ databaseId: resourceId, entries: [{ principalType, principalId }] });
    } else {
      await revokeTableAccess.mutateAsync({ tableId: resourceId, entries: [{ principalType, principalId }] });
    }
  };

  const handleRoleChange = async (principalId: string, role: AccessRole): Promise<void> => {
    try {
      await grantAccess("user", principalId, role);
      toast({ title: "Access updated" });
    } catch (error) {
      toast({
        title: "Could not update access",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleRevoke = async (principalType: PrincipalType, principalId: string): Promise<void> => {
    try {
      await revokeAccess(principalType, principalId);
      toast({ title: "Access removed" });
    } catch (error) {
      toast({
        title: "Could not remove access",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share {resourceName}</DialogTitle>
          <DialogDescription>
            {resourceLabels[resourceType][0].toUpperCase() + resourceLabels[resourceType].slice(1)} access
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={canManage ? "default" : "outline"}>
            {canManage ? "Owner" : currentUserRole === "none" ? "No access" : roleLabels[currentUserRole]}
          </Badge>
          {ownerType === "org" && (
            <Badge variant="secondary">Organization</Badge>
          )}
        </div>

        {accessQuery.isLoading || organizationMembers.isLoading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading access
          </div>
        ) : accessQuery.isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Access details are unavailable.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            {organizationMembers.data && organizationMembers.data.length > 0 ? (
              <div className="divide-y rounded-md border">
                {organizationMembers.data.map((member) => {
                  const explicitAccess = explicitAccessByUser.get(member.userId);
                  const isOrgAdmin = member.role === "admin";
                  const effectiveRole: AccessRole = isOrgAdmin
                    ? "owner"
                    : explicitAccess?.role ?? "view";
                  const displayName = member.fullName ?? member.email;

                  return (
                    <div key={member.userId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium">
                          {getInitials(displayName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{displayName}</p>
                            {isOrgAdmin ? (
                              <Badge variant="default" className="gap-1">
                                <Crown className="h-3 w-3" />
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <Users className="h-3 w-3" />
                                Member
                              </Badge>
                            )}
                            <Badge variant={roleBadgeVariant[effectiveRole]}>
                              {roleLabels[effectiveRole]}
                            </Badge>
                            {explicitAccess && !isOrgAdmin && (
                              <Badge variant="secondary">Custom</Badge>
                            )}
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:min-w-[240px]">
                        <Select
                          value={effectiveRole}
                          disabled={!canManage || isOrgAdmin || isBusy}
                          onValueChange={(value) => { void handleRoleChange(member.userId, value as AccessRole); }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">View</SelectItem>
                            <SelectItem value="edit">Edit</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={!canManage || !explicitAccess || isOrgAdmin || isBusy}
                          onClick={() => { void handleRevoke("user", member.userId); }}
                          title="Reset access"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border p-6 text-sm text-muted-foreground">
                No organization members are available for this {resourceLabels[resourceType]}.
              </div>
            )}

            {externalEntries.length > 0 && (
              <div className="mt-4 divide-y rounded-md border">
                {externalEntries.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <p className="truncate font-medium">
                          {entry.principalType === "team" ? "Team" : "User"} {entry.principalId}
                        </p>
                        <Badge variant={roleBadgeVariant[entry.role]}>{roleLabels[entry.role]}</Badge>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={!canManage || isBusy}
                      onClick={() => { void handleRevoke(entry.principalType, entry.principalId); }}
                      title="Remove access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
