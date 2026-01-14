/**
 * Database API Tokens Component
 * Manage API tokens for external access to DataVault databases
 * DataVault v4 Micro-Phase 5: PR 10
 */

import { Loader2, Plus, Trash2, Key, Copy, Check, AlertTriangle, Calendar } from "lucide-react";
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
import {
  useDatavaultApiTokens,
  useCreateApiToken,
  useDeleteApiToken,
} from "@/lib/datavault-hooks";

interface DatabaseApiTokensProps {
  databaseId: string;
}

export function DatabaseApiTokens({ databaseId }: DatabaseApiTokensProps) {
  const { toast } = useToast();
  const { data, isLoading } = useDatavaultApiTokens(databaseId);
  const createMutation = useCreateApiToken();
  const deleteMutation = useDeleteApiToken();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTokenRevealOpen, setIsTokenRevealOpen] = useState(false);
  const [plainToken, setPlainToken] = useState<string>("");
  const [tokenLabel, setTokenLabel] = useState<string>("");
  const [copiedToken, setCopiedToken] = useState(false);
  const [deleteTokenId, setDeleteTokenId] = useState<string | null>(null);

  // Create token form state
  const [label, setLabel] = useState("");
  const [readScope, setReadScope] = useState(true);
  const [writeScope, setWriteScope] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const handleCreateToken = async () => {
    if (!label.trim()) {
      toast({
        title: "Label required",
        description: "Please enter a label for the token",
        variant: "destructive",
      });
      return;
    }

    const scopes: ('read' | 'write')[] = [];
    if (readScope) {scopes.push('read');}
    if (writeScope) {scopes.push('write');}

    if (scopes.length === 0) {
      toast({
        title: "Scope required",
        description: "Please select at least one scope (Read or Write) for the API token",
        variant: "destructive",
      });
      return;
    }

    // Validate expiration date is in the future
    if (expiresAt) {
      const expirationDate = new Date(expiresAt);
      if (expirationDate <= new Date()) {
        toast({
          title: "Invalid expiration date",
          description: "Expiration date must be in the future",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const result = await createMutation.mutateAsync({
        databaseId,
        data: {
          label: label.trim(),
          scopes,
          expiresAt: expiresAt || undefined,
        },
      });

      setPlainToken(result.plainToken);
      setTokenLabel(label);
      setIsCreateOpen(false);
      setIsTokenRevealOpen(true);

      // Reset form
      setLabel("");
      setReadScope(true);
      setWriteScope(false);
      setExpiresAt("");
    } catch (error) {
      toast({
        title: "Failed to create token",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(plainToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleDeleteToken = async () => {
    if (!deleteTokenId) {return;}

    try {
      await deleteMutation.mutateAsync({ tokenId: deleteTokenId, databaseId });
      toast({
        title: "Token revoked",
        description: "API token has been revoked successfully",
      });
      setDeleteTokenId(null);
    } catch (error) {
      toast({
        title: "Failed to revoke token",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const tokens = data?.tokens || [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Access</CardTitle>
              <CardDescription>
                Manage API tokens for external access to this database
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create Token
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No API tokens yet</p>
              <p className="text-sm">Create a token to enable external API access</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{token.label}</p>
                      {token.expiresAt && new Date(token.expiresAt) < new Date() && (
                        <Badge variant="destructive" className="text-xs animate-pulse">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Expired
                        </Badge>
                      )}
                      {token.expiresAt && new Date(token.expiresAt) > new Date() && new Date(token.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 && (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Expires soon
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex gap-1">
                        {token.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                      <span>•</span>
                      <span>Created {token.createdAt ? new Date(token.createdAt).toLocaleDateString() : 'Unknown'}</span>
                      {token.expiresAt && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Expires {new Date(token.expiresAt).toLocaleDateString()}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTokenId(token.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Token Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Token</DialogTitle>
            <DialogDescription>
              Generate a new API token for external access to this database
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Production API"
              />
            </div>

            <div className="grid gap-2">
              <Label>
                Scopes <span className="text-destructive">*</span>
              </Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="read"
                    checked={readScope}
                    onCheckedChange={(checked) => setReadScope(checked === true)}
                  />
                  <Label htmlFor="read" className="font-normal cursor-pointer">
                    Read - View database data
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="write"
                    checked={writeScope}
                    onCheckedChange={(checked) => setWriteScope(checked === true)}
                  />
                  <Label htmlFor="write" className="font-normal cursor-pointer">
                    Write - Create, update, and delete data
                  </Label>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expiresAt">Expiration Date (optional)</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for a token that never expires
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateToken}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token Reveal Dialog */}
      <Dialog open={isTokenRevealOpen} onOpenChange={setIsTokenRevealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your API Token</DialogTitle>
            <DialogDescription>
              Copy and save this token now. For security reasons, it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="font-medium">
              <strong>Important:</strong> This is the only time you will see this token! Copy it now and store it securely.
            </AlertDescription>
          </Alert>
          <div className="space-y-3">
            <div>
              <Label>Token Label</Label>
              <p className="text-sm text-muted-foreground mt-1">{tokenLabel}</p>
            </div>
            <div>
              <Label>API Token</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={plainToken}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyToken}
                >
                  {copiedToken ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsTokenRevealOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTokenId} onOpenChange={() => setDeleteTokenId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Token?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke the token. Any applications using this token will
              lose access immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteToken}>
              Revoke Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
