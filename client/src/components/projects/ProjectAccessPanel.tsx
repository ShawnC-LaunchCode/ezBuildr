import { Crown, Shield, Trash2, Users } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationMembers } from "@/hooks/useOrganizations";
import { useGrantProjectAccess, useProjectAccess, useRevokeProjectAccess } from "@/lib/vault-hooks";

import type { ApiProjectWithWorkflows } from "@/lib/vault-api";

type ProjectRole = "view" | "edit" | "owner";

interface ProjectAccessPanelProps {
  project: ApiProjectWithWorkflows;
}

const roleLabels: Record<ProjectRole, string> = {
  view: "View",
  edit: "Edit",
  owner: "Owner",
};

const roleBadgeVariant: Record<ProjectRole, "default" | "secondary" | "outline"> = {
  view: "outline",
  edit: "secondary",
  owner: "default",
};

export function ProjectAccessPanel({ project }: ProjectAccessPanelProps) {
  const { toast } = useToast();
  const orgId = project.ownerType === "org" ? project.ownerUuid ?? undefined : undefined;
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(orgId);
  const accessQuery = useProjectAccess(project.id, {
    enabled: !!orgId,
  });
  const grantAccess = useGrantProjectAccess();
  const revokeAccess = useRevokeProjectAccess();

  const explicitAccessByUser = useMemo(() => {
    const entries = accessQuery.data ?? [];
    return new Map(
      entries
        .filter((entry) => entry.principalType === "user")
        .map((entry) => [entry.principalId, entry])
    );
  }, [accessQuery.data]);

  if (!orgId) {
    return null;
  }

  const canManageProjectRoles = accessQuery.isSuccess;

  const handleRoleChange = async (principalId: string, role: ProjectRole) => {
    try {
      await grantAccess.mutateAsync({
        projectId: project.id,
        entries: [{ principalType: "user", principalId, role }],
      });
      toast({
        title: "Project role updated",
        description: "Access changes are saved",
      });
    } catch (error) {
      toast({
        title: "Could not update role",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleRevokeRole = async (principalId: string) => {
    try {
      await revokeAccess.mutateAsync({
        projectId: project.id,
        entries: [{ principalType: "user", principalId }],
      });
      toast({
        title: "Project role removed",
        description: "Member returned to organization default access",
      });
    } catch (error) {
      toast({
        title: "Could not remove role",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Project Access</CardTitle>
            <CardDescription>Organization members and project roles</CardDescription>
          </div>
          <Badge variant={canManageProjectRoles ? "default" : "outline"}>
            {canManageProjectRoles ? "Manager" : "Read Only"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              Org Member
            </div>
            <p className="mt-1 text-sm text-muted-foreground">View</p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4" />
              Project Edit
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Build</p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Crown className="h-4 w-4" />
              Owner
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Manage</p>
          </div>
        </div>

        {membersLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading members...</div>
        ) : !members || members.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No organization members</div>
        ) : (
          <div className="divide-y rounded-lg border">
            {members.map((member) => {
              const explicitAccess = explicitAccessByUser.get(member.userId);
              const effectiveRole: ProjectRole = member.role === "admin"
                ? "owner"
                : (explicitAccess?.role as ProjectRole | undefined) ?? "view";
              const isOrgAdmin = member.role === "admin";
              const isBusy = grantAccess.isPending || revokeAccess.isPending;

              return (
                <div key={member.userId} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{member.fullName ?? member.email}</p>
                      <Badge variant={member.role === "admin" ? "default" : "outline"}>
                        {member.role === "admin" ? "Org Admin" : "Org Member"}
                      </Badge>
                      <Badge variant={roleBadgeVariant[effectiveRole]}>
                        {roleLabels[effectiveRole]}
                      </Badge>
                      {explicitAccess && !isOrgAdmin && (
                        <Badge variant="secondary">Project Role</Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{member.email}</p>
                  </div>

                  <div className="flex items-center gap-2 md:min-w-[260px]">
                    <Select
                      value={effectiveRole}
                      disabled={!canManageProjectRoles || isOrgAdmin || isBusy}
                      onValueChange={(value) => { void handleRoleChange(member.userId, value as ProjectRole); }}
                    >
                      <SelectTrigger>
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
                      disabled={!canManageProjectRoles || !explicitAccess || isOrgAdmin || isBusy}
                      onClick={() => { void handleRevokeRole(member.userId); }}
                      title="Remove project role"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
