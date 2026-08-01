import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Shield, ArrowLeft, ChevronUp, ChevronDown, Eye, Mail, UserPlus, RefreshCw, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: 'admin' | 'creator';
  createdAt: string;
  workflowCount: number;
  personalWorkflowCount: number;
  orgWorkflowCount: number;
  isActive: boolean;
  isPlaceholder?: boolean;
}

const ADMIN_ROLE = "admin";
const CREATOR_ROLE = "creator";
const ADMIN_USERS_QUERY_KEY = ["/api/admin/users"] as const;
const ADMIN_STATS_QUERY_KEY = ["/api/admin/stats"] as const;

type Role = typeof ADMIN_ROLE | typeof CREATOR_ROLE;
type SortColumn = 'name' | 'email' | 'role' | 'isActive' | 'workflowCount' | 'createdAt';
type SortDirection = 'asc' | 'desc';

interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}

function isRole(value: string): value is Role {
  return value === ADMIN_ROLE || value === CREATOR_ROLE;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getResponseMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "message" in data) {
    const message = (data as { message?: unknown }).message;
    return typeof message === "string" && message !== "" ? message : fallback;
  }
  return fallback;
}

function getUserDisplayName(user: User): string {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name !== '' ? name : 'User';
}

function getSortValue(user: User, column: SortColumn): string | number {
  switch (column) {
    case 'name':
      return getUserDisplayName(user).toLowerCase();
    case 'role':
      return user.isPlaceholder === true ? 'invited' : user.role;
    case 'isActive':
      return user.isActive ? 1 : 0;
    case 'createdAt':
      return new Date(user.createdAt).getTime();
    case 'email':
      return user.email;
    case 'workflowCount':
      return user.workflowCount;
  }
}

function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: SortColumn;
  label: string;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}) {
  const isActive = sortColumn === column;
  return (
    <th className="text-left p-3 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort(column)}>
      <div className="flex items-center gap-1">
        {label}
        {isActive && (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
      </div>
    </th>
  );
}

function UserRoleBadge({ user }: { user: User }) {
  if (user.isPlaceholder === true) {
    return (
      <Badge variant="outline" className="text-muted-foreground border-dashed">
        <Mail className="h-3 w-3 mr-1" />
        Invited
      </Badge>
    );
  }
  if (user.role === ADMIN_ROLE) {
    return (
      <Badge className="bg-purple-600">
        <Shield className="h-3 w-3 mr-1" />
        Admin
      </Badge>
    );
  }
  return <Badge variant="secondary">Creator</Badge>;
}

function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "default" : "destructive"} className={isActive ? "bg-green-600" : ""}>
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}

function ConfirmActionDialog({
  action,
  onClose,
}: {
  action: PendingAction | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.title}</DialogTitle>
          <DialogDescription>{action?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={action?.destructive === true ? "destructive" : "default"}
            onClick={() => {
              action?.onConfirm();
              onClose();
            }}
          >
            {action?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserActions({
  user,
  onResendInvite,
  onPromote,
  onDemote,
  onToggleActive,
  onDelete,
  onRequestConfirm,
}: {
  user: User;
  onResendInvite: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onToggleActive: (userId: string, isActive: boolean) => void;
  onDelete: (userId: string) => void;
  onRequestConfirm: (action: PendingAction) => void;
}) {
  const requestRoleChange = (): void => {
    const promote = user.role === CREATOR_ROLE;
    onRequestConfirm({
      title: promote ? "Promote user" : "Demote user",
      description: promote
        ? `Promote ${user.email} to admin?`
        : `Demote ${user.email} to creator?`,
      confirmLabel: promote ? "Promote" : "Demote",
      onConfirm: () => (promote ? onPromote(user.id) : onDemote(user.id)),
    });
  };

  const requestActiveChange = (): void => {
    onRequestConfirm({
      title: user.isActive ? "Deactivate user" : "Activate user",
      description: `${user.isActive ? "Deactivate" : "Activate"} ${user.email}?`,
      confirmLabel: user.isActive ? "Deactivate" : "Activate",
      onConfirm: () => onToggleActive(user.id, !user.isActive),
    });
  };

  const requestDelete = (): void => {
    onRequestConfirm({
      title: "Delete user",
      description: `Permanently delete ${user.email}? This action cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () => onDelete(user.id),
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.isPlaceholder === true ? (
          <DropdownMenuItem onClick={() => onResendInvite(user.id)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Resend Invite
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={requestRoleChange}>
              {user.role === CREATOR_ROLE ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
              {user.role === CREATOR_ROLE ? "Promote to Admin" : "Demote to Creator"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={requestActiveChange}>
              {user.isActive ? "Deactivate User" : "Activate User"}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={requestDelete}>
          Delete User
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserRow({
  user,
  onResendInvite,
  onPromote,
  onDemote,
  onToggleActive,
  onDelete,
  onRequestConfirm,
}: {
  user: User;
  onResendInvite: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onToggleActive: (userId: string, isActive: boolean) => void;
  onDelete: (userId: string) => void;
  onRequestConfirm: (action: PendingAction) => void;
}) {
  return (
    <tr key={user.id} className="border-b border-border hover:bg-accent/50">
      <td className="p-3">
        <div className="flex items-center gap-3">
          {user.profileImageUrl !== null ? (
            <img
              src={user.profileImageUrl}
              alt={user.firstName ?? user.email}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
          )}
          <div>
            <div className="font-medium">{getUserDisplayName(user)}</div>
            <div className="text-xs text-muted-foreground">ID: {user.id.slice(-8)}</div>
          </div>
        </div>
      </td>
      <td className="p-3 text-sm">{user.email}</td>
      <td className="p-3"><UserRoleBadge user={user} /></td>
      <td className="p-3"><UserStatusBadge isActive={user.isActive} /></td>
      <td className="p-3">
        <Link href={`/admin/users/${user.id}/surveys`}>
          <Button variant="outline" size="sm" className="whitespace-nowrap">
            <Eye className="h-4 w-4 mr-1" />
            View Workflows ({user.personalWorkflowCount}/{user.orgWorkflowCount})
          </Button>
        </Link>
      </td>
      <td className="p-3 text-sm text-muted-foreground">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="p-3">
        <div className="flex items-center justify-end gap-2">
          <UserActions
            user={user}
            onResendInvite={onResendInvite}
            onPromote={onPromote}
            onDemote={onDemote}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
            onRequestConfirm={onRequestConfirm}
          />
        </div>
      </td>
    </tr>
  );
}

function InviteUserDialog({ onInvite }: { onInvite: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(CREATOR_ROLE);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const inviteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/users/invite", { email, role });
    },
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
      toast({ title: "Success", description: "User invited successfully." });
      setOpen(false);
      setEmail("");
      setRole(CREATOR_ROLE);
      onInvite();
    },
    onError: (err: unknown) => {
      toast({ title: "Error", description: getErrorMessage(err, "Failed to invite user."), variant: "destructive" });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite New User</DialogTitle>
          <DialogDescription>
            Send an invitation email to a new user. They will receive a link to set their password and complete their account setup.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(val) => isRole(val) && setRole(val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="creator">Creator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={email === "" || inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
            {inviteMutation.isPending ? "Inviting..." : "Send Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function AdminUsers() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data: users, isLoading: usersLoading, error } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!isAuthenticated,
    retry: false,
  });

  // Redirect if not authenticated
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

  // Show error if access denied
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

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      return apiRequest("PUT", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: (data: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ADMIN_STATS_QUERY_KEY });
      toast({
        title: "Success",
        description: getResponseMessage(data, "User role updated successfully"),
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to update user role"),
        variant: "destructive",
      });
    },
  });

  const handlePromoteToAdmin = (userId: string) => {
    updateRoleMutation.mutate({ userId, role: ADMIN_ROLE });
  };

  const handleDemoteToCreator = (userId: string) => {
    updateRoleMutation.mutate({ userId, role: CREATOR_ROLE });
  };

  const resendInviteMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/admin/users/${userId}/resend-invite`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Invitation resent successfully." });
    },
    onError: (err: unknown) => {
      toast({ title: "Error", description: getErrorMessage(err, "Failed to resend invitation."), variant: "destructive" });
    }
  });

  const updateActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest("PUT", `/api/admin/users/${userId}/active`, { isActive });
    },
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
      toast({ title: "Success", description: "User active status updated." });
    },
    onError: (err: unknown) => {
      toast({ title: "Error", description: getErrorMessage(err, "Failed to update user status."), variant: "destructive" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ADMIN_STATS_QUERY_KEY });
      toast({ title: "Success", description: "User deleted successfully." });
    },
    onError: (err: unknown) => {
      toast({ title: "Error", description: getErrorMessage(err, "Failed to delete user."), variant: "destructive" });
    }
  });

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedUsers = [...(users ?? [])].sort((a, b) => {
    const valA = getSortValue(a, sortColumn);
    const valB = getSortValue(b, sortColumn);

    if (valA < valB) {return sortDirection === 'asc' ? -1 : 1;}
    if (valA > valB) {return sortDirection === 'asc' ? 1 : -1;}
    return 0;
  });

  if (authLoading || !isAuthenticated || error) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <Header
          title="User Management"
          description="Manage user accounts and permissions"
          actions={
            <div className="flex items-center gap-2">
              <InviteUserDialog onInvite={() => {}} />
              <Link href="/admin">
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Admin
                </Button>
              </Link>
            </div>
          }
        />

        <div className="flex-1 overflow-auto p-6">
          <ConfirmActionDialog action={pendingAction} onClose={() => setPendingAction(null)} />
          {usersLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-16 bg-muted rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : users && users.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Users ({users.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <SortableHeader column="name" label="User" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                        <SortableHeader column="email" label="Email" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                        <SortableHeader column="role" label="Role" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                        <SortableHeader column="isActive" label="Status" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                        <SortableHeader column="workflowCount" label="Workflows" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                        <SortableHeader column="createdAt" label="Joined" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((user) => (
                        <UserRow
                          key={user.id}
                          user={user}
                          onResendInvite={(userId) => resendInviteMutation.mutate(userId)}
                          onPromote={handlePromoteToAdmin}
                          onDemote={handleDemoteToCreator}
                          onToggleActive={(userId, isActive) => updateActiveMutation.mutate({ userId, isActive })}
                          onDelete={(userId) => deleteUserMutation.mutate(userId)}
                          onRequestConfirm={setPendingAction}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Users Found</h3>
                <p className="text-muted-foreground">There are no users in the system yet.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
