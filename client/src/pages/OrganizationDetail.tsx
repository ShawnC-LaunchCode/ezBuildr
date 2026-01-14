import { ArrowLeft, Users, Mail, Crown, UserMinus, Shield, AlertCircle, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  useOrganization,
  useOrganizationMembers,
  useOrganizationInvites,
  useUpdateOrganization,
  usePromoteMember,
  useDemoteMember,
  useRemoveMember,
  useCreateInvite,
  useRevokeInvite,
  useLeaveOrganization,
  useDeleteOrganization,
} from '@/hooks/useOrganizations';

export default function OrganizationDetail() {
  const { id: orgId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: organization, isLoading: orgLoading, error: orgError } = useOrganization(orgId);
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(orgId);
  const { data: invites, isLoading: invitesLoading } = useOrganizationInvites(orgId);

  const updateOrg = useUpdateOrganization(orgId);
  const promoteMember = usePromoteMember(orgId);
  const demoteMember = useDemoteMember(orgId);
  const removeMember = useRemoveMember(orgId);
  const createInvite = useCreateInvite(orgId);
  const revokeInvite = useRevokeInvite(orgId);
  const leaveOrg = useLeaveOrganization();
  const deleteOrg = useDeleteOrganization(orgId);

  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');

  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const isAdmin = organization?.role === 'admin';

  const handleEditOrg = () => {
    setOrgName(organization?.name || '');
    setOrgDescription(organization?.description || '');
    setIsEditingOrg(true);
  };

  const handleSaveOrg = async () => {
    if (!orgName.trim()) {
      toast({
        title: 'Name required',
        description: 'Organization name cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateOrg.mutateAsync({
        name: orgName.trim(),
        description: orgDescription.trim() || undefined,
      });

      toast({
        title: 'Organization updated',
        description: 'Changes saved successfully',
      });

      setIsEditingOrg(false);
    } catch (error) {
      console.error('Failed to update organization:', error);
      toast({
        title: 'Error',
        description: 'Failed to update organization. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handlePromote = async (userId: string) => {
    try {
      await promoteMember.mutateAsync(userId);
      toast({
        title: 'Member promoted',
        description: 'Member has been promoted to admin',
      });
    } catch (error) {
      console.error('Failed to promote member:', error);
      toast({
        title: 'Error',
        description: 'Failed to promote member. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDemote = async (userId: string) => {
    try {
      await demoteMember.mutateAsync(userId);
      toast({
        title: 'Member demoted',
        description: 'Admin has been demoted to member',
      });
    } catch (error) {
      console.error('Failed to demote member:', error);
      toast({
        title: 'Error',
        description: 'Failed to demote member. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeMember.mutateAsync(userId);
      toast({
        title: 'Member removed',
        description: 'Member has been removed from the organization',
      });
      setRemovingMemberId(null);
    } catch (error) {
      console.error('Failed to remove member:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove member. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteEmail.trim()) {
      toast({
        title: 'Email required',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createInvite.mutateAsync({ email: inviteEmail.trim() });
      toast({
        title: 'Invite sent',
        description: `Invitation sent to ${inviteEmail}`,
      });
      setIsInviteDialogOpen(false);
      setInviteEmail('');
    } catch (error) {
      console.error('Failed to create invite:', error);
      toast({
        title: 'Error',
        description: 'Failed to send invitation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInvite.mutateAsync(inviteId);
      toast({
        title: 'Invite revoked',
        description: 'Invitation has been revoked',
      });
    } catch (error) {
      console.error('Failed to revoke invite:', error);
      toast({
        title: 'Error',
        description: 'Failed to revoke invitation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleLeaveOrganization = async () => {
    if (!orgId) {return;}

    try {
      await leaveOrg.mutateAsync(orgId);
      toast({
        title: 'Left organization',
        description: `You have left ${organization?.name}`,
      });
      navigate('/organizations');
    } catch (error) {
      console.error('Failed to leave organization:', error);
      toast({
        title: 'Error',
        description: 'Failed to leave organization. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteOrganization = async () => {
    if (!orgId) {return;}

    try {
      await deleteOrg.mutateAsync();
      toast({
        title: 'Organization deleted',
        description: `${organization?.name} has been permanently deleted`,
      });
      setIsDeleteDialogOpen(false);
      navigate('/organizations');
    } catch (error: any) {
      console.error('Failed to delete organization:', error);
      toast({
        title: 'Failed to delete organization',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading organization...</p>
        </div>
      </div>
    );
  }

  if (orgError || !organization) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Organization not found</h2>
          <p className="text-muted-foreground mb-6">
            {orgError instanceof Error ? orgError.message : 'This organization does not exist or you do not have access to it'}
          </p>
          <Button onClick={() => navigate('/organizations')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Organizations
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" onClick={() => navigate('/organizations')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Organizations
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {isEditingOrg ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="orgName">Organization Name</Label>
                      <Input
                        id="orgName"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Organization name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="orgDescription">Description</Label>
                      <Textarea
                        id="orgDescription"
                        value={orgDescription}
                        onChange={(e) => setOrgDescription(e.target.value)}
                        placeholder="Organization description"
                        rows={3}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <CardTitle className="text-2xl">{organization.name}</CardTitle>
                    {organization.description && (
                      <CardDescription className="mt-2">{organization.description}</CardDescription>
                    )}
                  </>
                )}
              </div>
              {isAdmin && (
                <div className="ml-4">
                  {isEditingOrg ? (
                    <div className="space-x-2">
                      <Button variant="outline" onClick={() => setIsEditingOrg(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveOrg} disabled={updateOrg.isPending}>
                        {updateOrg.isPending ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={handleEditOrg}>
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Members Section */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Members</CardTitle>
              <CardDescription>People who belong to this organization</CardDescription>
            </div>
            {isAdmin && (
              <Button onClick={() => setIsInviteDialogOpen(true)}>
                <Mail className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading members...</p>
            </div>
          ) : !members || members.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No members yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium">{member.fullName || member.email}</p>
                        {member.role === 'admin' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                            <Crown className="h-3 w-3 mr-1" />
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>

                  {isAdmin && member.userId !== user?.id && (
                    <div className="flex items-center space-x-2">
                      {member.role === 'member' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePromote(member.userId)}
                          disabled={promoteMember.isPending}
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          Promote
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDemote(member.userId)}
                          disabled={demoteMember.isPending}
                        >
                          Demote
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRemovingMemberId(member.userId)}
                        disabled={removeMember.isPending}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invites Section (Admin Only) */}
      {isAdmin && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>Invitations that have not yet been accepted</CardDescription>
          </CardHeader>
          <CardContent>
            {invitesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading invitations...</p>
              </div>
            ) : !invites || invites.length === 0 ? (
              <div className="text-center py-8">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No pending invitations</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invites.map((invite) => (
                  <div
                    key={invite.inviteId}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{invite.invitedEmail}</p>
                        <p className="text-sm text-muted-foreground">
                          Invited by {invite.invitedByName || invite.invitedByEmail}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevokeInvite(invite.inviteId)}
                      disabled={revokeInvite.isPending}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Actions that cannot be undone</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Leave Organization</p>
              <p className="text-sm text-muted-foreground">
                You will lose access to all projects and workflows owned by this organization
              </p>
            </div>
            <Button variant="destructive" onClick={() => setIsLeaveDialogOpen(true)}>
              Leave Organization
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Organization (Admins Only) */}
      {isAdmin && (
        <Card className="border-destructive mt-4">
          <CardHeader>
            <CardTitle className="text-destructive">Delete Organization</CardTitle>
            <CardDescription>
              Permanently delete this organization and all its data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete this organization</p>
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. All members will lose access.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete Organization
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join {organization.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateInvite}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">Email Address</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  placeholder="member@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createInvite.isPending}>
                {createInvite.isPending ? 'Sending...' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Leave Confirmation Dialog */}
      <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Organization</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave {organization.name}? You will lose access to all
              organization resources.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLeaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeaveOrganization}
              disabled={leaveOrg.isPending}
            >
              {leaveOrg.isPending ? 'Leaving...' : 'Leave Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete {organization.name}?
              This will remove all members and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleteOrg.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteOrganization}
              disabled={deleteOrg.isPending}
            >
              {deleteOrg.isPending ? 'Deleting...' : 'Delete Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog open={!!removingMemberId} onOpenChange={() => setRemovingMemberId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member from the organization? They will lose
              access to all organization resources.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingMemberId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removingMemberId && handleRemoveMember(removingMemberId)}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? 'Removing...' : 'Remove Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
