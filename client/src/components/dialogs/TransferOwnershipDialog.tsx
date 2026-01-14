import { AlertCircle, User, Users } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizations } from '@/hooks/useOrganizations';

export type AssetType = 'workflow' | 'project' | 'database';

interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetType: AssetType;
  assetName: string;
  onTransfer: (targetOwnerType: 'user' | 'org', targetOwnerUuid: string) => Promise<void>;
  isPending?: boolean;
}

export function TransferOwnershipDialog({
  open,
  onOpenChange,
  assetType,
  assetName,
  onTransfer,
  isPending = false,
}: TransferOwnershipDialogProps) {
  const { user } = useAuth();
  const { data: organizations, isLoading: orgsLoading } = useOrganizations();

  const [selectedOwner, setSelectedOwner] = useState<string>('');

  const handleTransfer = async () => {
    if (!selectedOwner) {return;}

    const [ownerType, ownerUuid] = selectedOwner.split(':') as ['user' | 'org', string];

    try {
      await onTransfer(ownerType, ownerUuid);
      onOpenChange(false);
      setSelectedOwner('');
    } catch (error) {
      // Error handling done by parent
      console.error('Transfer failed:', error);
    }
  };

  const getAssetLabel = () => {
    switch (assetType) {
      case 'workflow':
        return 'workflow';
      case 'project':
        return 'project';
      case 'database':
        return 'database';
      default:
        return 'asset';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Ownership</DialogTitle>
          <DialogDescription>
            Transfer {getAssetLabel()} "{assetName}" to a new owner
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning */}
          <div className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Important</p>
              <p>
                Transferring to an organization will make this {getAssetLabel()} available to
                everyone in that organization.
                {assetType === 'project' && ' All workflows in this project will also be transferred.'}
              </p>
            </div>
          </div>

          {/* Owner Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Transfer to...</Label>

            {orgsLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Loading options...</p>
              </div>
            ) : (
              <RadioGroup value={selectedOwner} onValueChange={setSelectedOwner}>
                {/* My Account Option */}
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent cursor-pointer">
                  <RadioGroupItem value={`user:${user?.id}`} id="owner-user" />
                  <Label htmlFor="owner-user" className="flex items-center space-x-3 cursor-pointer flex-1">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">My Account</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                  </Label>
                </div>

                {/* Organizations */}
                {organizations && organizations.length > 0 && (
                  <>
                    <div className="pt-2">
                      <Label className="text-sm text-muted-foreground">Organizations</Label>
                    </div>
                    {organizations.map((org) => (
                      <div
                        key={org.id}
                        className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent cursor-pointer"
                      >
                        <RadioGroupItem value={`org:${org.id}`} id={`owner-${org.id}`} />
                        <Label
                          htmlFor={`owner-${org.id}`}
                          className="flex items-center space-x-3 cursor-pointer flex-1"
                        >
                          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <Users className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <p className="font-medium">{org.name}</p>
                              {org.role === 'admin' && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                  Admin
                                </span>
                              )}
                            </div>
                            {org.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {org.description}
                              </p>
                            )}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </>
                )}

                {(!organizations || organizations.length === 0) && (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    <p>You don't belong to any organizations yet.</p>
                    <p className="mt-1">Create one to transfer assets to your team.</p>
                  </div>
                )}
              </RadioGroup>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedOwner || isPending}
          >
            {isPending ? 'Transferring...' : 'Transfer Ownership'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
