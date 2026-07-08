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

function InviteUserDialog({ onInvite }: { onInvite: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "creator">("creator");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const inviteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/users/invite", { email, role });
    },
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "User invited successfully." });
      setOpen(false);
      setEmail("");
      setRole("creator");
      onInvite();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to invite user.", variant: "destructive" });
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
            <Select value={role} onValueChange={(val: any) => setRole(val)}>
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
          <Button disabled={!email || inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
            {inviteMutation.isPending ? "Inviting..." : "Send Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// eslint-disable-next-line max-lines-per-function
export default function AdminUsers() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  type SortColumn = 'name' | 'email' | 'role' | 'workflowCount' | 'createdAt';
  const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'creator' }) => {
      return apiRequest("PUT", `/api/admin/users/${userId}/role`, { role });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (data: any) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Success",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        description: data.message || "User role updated successfully",
      });
      setUpdatingUserId(null);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast({
        title: "Error",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
      setUpdatingUserId(null);
    },
  });

  const handlePromoteToAdmin = (userId: string) => {
    setUpdatingUserId(userId);
    updateRoleMutation.mutate({ userId, role: 'admin' });
  };

  const handleDemoteToCreator = (userId: string) => {
    setUpdatingUserId(userId);
    updateRoleMutation.mutate({ userId, role: 'creator' });
  };

  const resendInviteMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/admin/users/${userId}/resend-invite`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Invitation resent successfully." });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to resend invitation.", variant: "destructive" });
    }
  });

  const updateActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest("PUT", `/api/admin/users/${userId}/active`, { isActive });
    },
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "User active status updated." });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update user status.", variant: "destructive" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Success", description: "User deleted successfully." });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete user.", variant: "destructive" });
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

  const sortedUsers = [...(users || [])].sort((a, b) => {
    let valA: string | number = a[sortColumn as keyof User] as string | number;
    let valB: string | number = b[sortColumn as keyof User] as string | number;

    if (sortColumn === 'name') {
      valA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
      valB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
    } else if (sortColumn === 'role') {
      valA = a.isPlaceholder ? 'invited' : a.role;
      valB = b.isPlaceholder ? 'invited' : b.role;
    } else if (sortColumn === ('isActive' as any)) {
      valA = a.isActive ? 1 : 0;
      valB = b.isActive ? 1 : 0;
    } else if (sortColumn === 'createdAt') {
      valA = new Date(a.createdAt).getTime();
      valB = new Date(b.createdAt).getTime();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
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
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('name')}>
                          <div className="flex items-center gap-1">User {sortColumn === 'name' && (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}</div>
                        </th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('email')}>
                          <div className="flex items-center gap-1">Email {sortColumn === 'email' && (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}</div>
                        </th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('role')}>
                          <div className="flex items-center gap-1">Role {sortColumn === 'role' && (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}</div>
                        </th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort(('isActive' as any))}>
                          <div className="flex items-center gap-1">Status {sortColumn === ('isActive' as any) && (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}</div>
                        </th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('workflowCount')}>
                          <div className="flex items-center gap-1">Workflows {sortColumn === 'workflowCount' && (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}</div>
                        </th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('createdAt')}>
                          <div className="flex items-center gap-1">Joined {sortColumn === 'createdAt' && (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}</div>
                        </th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((user) => (
                        <tr key={user.id} className="border-b border-border hover:bg-accent/50">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              {user.profileImageUrl ? (
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
                                <div className="font-medium">
                                  {user.firstName ?? user.lastName
                                    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
                                    : 'User'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ID: {user.id.slice(-8)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-sm">{user.email}</td>
                          <td className="p-3">
                            {user.isPlaceholder ? (
                              <Badge variant="outline" className="text-muted-foreground border-dashed">
                                <Mail className="h-3 w-3 mr-1" />
                                Invited
                              </Badge>
                            ) : user.role === 'admin' ? (
                              <Badge className="bg-purple-600">
                                <Shield className="h-3 w-3 mr-1" />
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Creator</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant={user.isActive ? "default" : "destructive"} className={user.isActive ? "bg-green-600" : ""}>
                              {user.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
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
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  
                                  {user.isPlaceholder ? (
                                    <DropdownMenuItem onClick={() => resendInviteMutation.mutate(user.id)}>
                                      <RefreshCw className="h-4 w-4 mr-2" />
                                      Resend Invite
                                    </DropdownMenuItem>
                                  ) : user.role === 'creator' ? (
                                    <DropdownMenuItem onClick={() => { 
                                      if (confirm(`Are you sure you want to promote ${user.email} to admin?`)) {
                                        void handlePromoteToAdmin(user.id);
                                      }
                                    }}>
                                      <ChevronUp className="h-4 w-4 mr-2" />
                                      Promote to Admin
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => { 
                                      if (confirm(`Are you sure you want to demote ${user.email} to creator?`)) {
                                        void handleDemoteToCreator(user.id);
                                      }
                                    }}>
                                      <ChevronDown className="h-4 w-4 mr-2" />
                                      Demote to Creator
                                    </DropdownMenuItem>
                                  )}
                                  
                                  {!user.isPlaceholder && (
                                    <DropdownMenuItem 
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} ${user.email}?`)) {
                                          updateActiveMutation.mutate({ userId: user.id, isActive: !user.isActive });
                                        }
                                      }}
                                    >
                                      {user.isActive ? "Deactivate User" : "Activate User"}
                                    </DropdownMenuItem>
                                  )}
                                  
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to permanently delete ${user.email}? This action cannot be undone.`)) {
                                        deleteUserMutation.mutate(user.id);
                                      }
                                    }}
                                  >
                                    Delete User
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
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
