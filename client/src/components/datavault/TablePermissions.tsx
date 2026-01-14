/**
 * Table Permissions Component
 * Manages per-table RBAC permissions (owner/write/read)
 * DataVault v4 Micro-Phase 6: Table-Level Permissions
 */

import { Loader2, Plus, Trash2, ShieldAlert, User, Eye, Edit, Shield } from "lucide-react";
import React, { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useTablePermissions, useGrantTablePermission, useRevokeTablePermission } from "@/lib/datavault-hooks";
import type { DatavaultTablePermission } from "@shared/schema";

interface TablePermissionsProps {
  tableId: string;
}

export function TablePermissions({ tableId }: TablePermissionsProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: permissions, isLoading, error } = useTablePermissions(tableId);
  const grantMutation = useGrantTablePermission();
  const revokeMutation = useRevokeTablePermission();

  const [addUserMode, setAddUserMode] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserRole, setNewUserRole] = useState<"owner" | "write" | "read">("read");
  const [deletePermissionId, setDeletePermissionId] = useState<string | null>(null);
  const [editingPermission, setEditingPermission] = useState<string | null>(null);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    permissionId: string;
    oldRole: string;
    newRole: string;
    userId: string;
  } | null>(null);

  const handleAddUser = async () => {
    if (!newUserId.trim()) {
      toast({
        title: "Invalid input",
        description: "User ID or email is required",
        variant: "destructive",
      });
      return;
    }

    try {
      await grantMutation.mutateAsync({
        tableId,
        data: {
          userId: newUserId.trim(),
          role: newUserRole,
        },
      });

      toast({
        title: "Permission granted",
        description: `User added with ${newUserRole} role`,
      });

      setNewUserId("");
      setNewUserRole("read");
      setAddUserMode(false);
    } catch (error) {
      toast({
        title: "Failed to grant permission",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleUpdateRole = async (permissionId: string, newRole: "owner" | "write" | "read") => {
    const permission = permissions?.find((p) => p.id === permissionId);
    if (!permission) {return;}

    // If downgrading from owner, show confirmation
    if (permission.role === "owner" && newRole !== "owner") {
      setRoleChangeConfirm({
        permissionId,
        oldRole: permission.role,
        newRole,
        userId: permission.userId,
      });
      return;
    }

    try {
      await grantMutation.mutateAsync({
        tableId,
        data: {
          userId: permission.userId,
          role: newRole,
        },
      });

      toast({
        title: "Permission updated",
        description: `Role changed to ${newRole}`,
      });

      setEditingPermission(null);
    } catch (error) {
      toast({
        title: "Failed to update permission",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const confirmRoleChange = async () => {
    if (!roleChangeConfirm) {return;}

    try {
      const permission = permissions?.find((p) => p.id === roleChangeConfirm.permissionId);
      if (!permission) {return;}

      await grantMutation.mutateAsync({
        tableId,
        data: {
          userId: permission.userId,
          role: roleChangeConfirm.newRole as "owner" | "write" | "read",
        },
      });

      toast({
        title: "Permission updated",
        description: `Role changed to ${roleChangeConfirm.newRole}`,
      });

      setEditingPermission(null);
      setRoleChangeConfirm(null);
    } catch (error) {
      toast({
        title: "Failed to update permission",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleRevoke = async () => {
    if (!deletePermissionId) {return;}

    try {
      await revokeMutation.mutateAsync({
        permissionId: deletePermissionId,
        tableId,
      });

      toast({
        title: "Permission revoked",
        description: "User access has been removed",
      });

      setDeletePermissionId(null);
    } catch (error) {
      toast({
        title: "Failed to revoke permission",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Shield className="w-4 h-4" />;
      case "write":
        return <Edit className="w-4 h-4" />;
      case "read":
        return <Eye className="w-4 h-4" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    switch (role) {
      case "owner":
        return "default";
      case "write":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to load permissions";

    // If access denied, show info message instead of error
    if (errorMessage.includes("Access denied")) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Permissions
            </CardTitle>
            <CardDescription>Manage table access for team members</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Only table owners can view and manage permissions.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                Permissions
              </CardTitle>
              <CardDescription>Manage table access for team members</CardDescription>
            </div>
            {!addUserMode && (
              <Button onClick={() => setAddUserMode(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {addUserMode && (
            <div className="border rounded-lg p-4 bg-muted/50 space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="userId">User ID or Email</Label>
                <Input
                  id="userId"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="Enter user ID or email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newUserRole} onValueChange={(value: any) => setNewUserRole(value)}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        <span>Owner</span>
                        <span className="text-xs text-muted-foreground ml-2">Full control</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="write">
                      <div className="flex items-center gap-2">
                        <Edit className="w-4 h-4" />
                        <span>Write</span>
                        <span className="text-xs text-muted-foreground ml-2">Read + write data</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="read">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        <span>Read</span>
                        <span className="text-xs text-muted-foreground ml-2">Read-only</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddUser} disabled={grantMutation.isPending}>
                  {grantMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add User
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddUserMode(false);
                    setNewUserId("");
                    setNewUserRole("read");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : permissions && permissions.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.map((permission) => {
                    const isCurrentUser = user?.id === permission.userId;
                    const isOnlyOwner = permission.role === "owner" && permissions.filter(p => p.role === "owner").length === 1;
                    const cannotDelete = isCurrentUser && permission.role === "owner";

                    return (
                      <TableRow key={permission.id}>
                        <TableCell className="font-mono text-sm">
                          {permission.userId}
                          {isCurrentUser && <span className="ml-2 text-xs text-muted-foreground">(You)</span>}
                        </TableCell>
                        <TableCell>
                          {editingPermission === permission.id ? (
                            <Select
                              value={permission.role}
                              onValueChange={(value: any) => handleUpdateRole(permission.id, value)}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">
                                  <div className="flex items-center gap-2">
                                    <Shield className="w-4 h-4" />
                                    <span>Owner</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="write">
                                  <div className="flex items-center gap-2">
                                    <Edit className="w-4 h-4" />
                                    <span>Write</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="read">
                                  <div className="flex items-center gap-2">
                                    <Eye className="w-4 h-4" />
                                    <span>Read</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={getRoleBadgeVariant(permission.role)} className="gap-1">
                              {getRoleIcon(permission.role)}
                              {permission.role.charAt(0).toUpperCase() + permission.role.slice(1)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {editingPermission === permission.id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingPermission(null)}
                              >
                                Cancel
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingPermission(permission.id)}
                                  disabled={isOnlyOwner}
                                  title={isOnlyOwner ? "Cannot edit the only owner" : "Edit role"}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeletePermissionId(permission.id)}
                                  disabled={cannotDelete || isOnlyOwner}
                                  title={
                                    cannotDelete
                                      ? "Cannot remove your own owner role"
                                      : isOnlyOwner
                                      ? "Cannot remove the only owner"
                                      : "Remove access"
                                  }
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="mb-2">No permissions assigned</p>
              <p className="text-sm">Add users to grant them access to this table</p>
            </div>
          )}

          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Permission levels:</strong>
              <ul className="mt-2 space-y-1">
                <li>• <strong>Owner:</strong> Full control (edit table, manage permissions)</li>
                <li>• <strong>Write:</strong> Read and write data (cannot edit table structure)</li>
                <li>• <strong>Read:</strong> View data only</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletePermissionId} onOpenChange={(open) => !open && setDeletePermissionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Permission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke this user's access? They will no longer be able to view or
              interact with this table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={revokeMutation.isPending}>
              {revokeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Role Downgrade Confirmation Dialog */}
      <AlertDialog open={!!roleChangeConfirm} onOpenChange={(open) => !open && setRoleChangeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade Permission?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to downgrade this user from <strong>{roleChangeConfirm?.oldRole}</strong> to{" "}
              <strong>{roleChangeConfirm?.newRole}</strong>. This will reduce their access to the table.
              {roleChangeConfirm?.userId === user?.id && (
                <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950 rounded border border-amber-200 dark:border-amber-800">
                  <strong>Warning:</strong> You are downgrading your own role. Make sure there's another owner!
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoleChange} disabled={grantMutation.isPending}>
              {grantMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Downgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
