import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Users, Shield, ArrowLeft, ChevronUp, ChevronDown, Eye } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: 'admin' | 'creator';
  createdAt: string;
  workflowCount: number;
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

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
      return await apiRequest("PUT", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Success",
        description: data.message || "User role updated successfully",
      });
      setUpdatingUserId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
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
            <Link href="/admin">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Admin
              </Button>
            </Link>
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
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">User</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Email</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Role</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Workflows</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Joined</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-border hover:bg-accent/50">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              {user.profileImageUrl ? (
                                <img
                                  src={user.profileImageUrl}
                                  alt={user.firstName || user.email}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Users className="h-5 w-5 text-primary" />
                                </div>
                              )}
                              <div>
                                <div className="font-medium">
                                  {user.firstName || user.lastName
                                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
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
                            {user.role === 'admin' ? (
                              <Badge className="bg-purple-600">
                                <Shield className="h-3 w-3 mr-1" />
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Creator</Badge>
                            )}
                          </td>
                          <td className="p-3 text-sm">{user.workflowCount}</td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-2">
                              <Link href={`/admin/users/${user.id}/surveys`}>
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4 mr-1" />
                                  View Workflows
                                </Button>
                              </Link>

                              {user.role === 'creator' ? (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={updatingUserId === user.id}
                                    >
                                      <ChevronUp className="h-4 w-4 mr-1" />
                                      Promote
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Promote to Admin</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to promote {user.email} to admin?
                                        This will give them full administrative access to the system.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handlePromoteToAdmin(user.id)}
                                        className="bg-purple-600 hover:bg-purple-700"
                                      >
                                        Promote to Admin
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              ) : (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={updatingUserId === user.id}
                                    >
                                      <ChevronDown className="h-4 w-4 mr-1" />
                                      Demote
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Demote to Creator</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to demote {user.email} to creator?
                                        This will remove their administrative access.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDemoteToCreator(user.id)}
                                        className="bg-destructive hover:bg-destructive/90"
                                      >
                                        Demote to Creator
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
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
