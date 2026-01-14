import { Loader2, Mail, User, X, Eye, Pencil, CheckCircle, Clock } from "lucide-react";
import React, { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useConfetti } from "@/hooks/useConfetti";
import { useTemplateSharing } from "@/hooks/useTemplates";

interface ShareTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateName: string;
}

export default function ShareTemplateModal({
  open,
  onOpenChange,
  templateId,
  templateName,
}: ShareTemplateModalProps) {
  const { toast } = useToast();
  const { fire } = useConfetti();
  const { listShares, share, updateAccess, revoke } = useTemplateSharing(templateId);

  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<"use" | "edit">("use");
  const [isSharing, setIsSharing] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setEmail("");
      setAccess("use");
    }
  }, [open]);

  const handleShare = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      toast({
        title: "Email required",
        description: "Please enter an email address to share with",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsSharing(true);
    try {
      await share.mutateAsync({
        templateId,
        email: trimmedEmail,
        access,
      });

      fire("party");
      toast({
        title: "Invitation sent",
        description: `${trimmedEmail} has been invited with ${access} access`,
      });

      setEmail("");
      setAccess("use");
    } catch (error: any) {
      toast({
        title: "Failed to share template",
        description: error.response?.data?.error || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleUpdateAccess = async (shareId: string, newAccess: "use" | "edit") => {
    try {
      await updateAccess.mutateAsync({ shareId, access: newAccess });
      toast({
        title: "Access updated",
        description: `Access level changed to ${newAccess}`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to update access",
        description: error.response?.data?.error || "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleRevoke = async (shareId: string, email: string) => {
    try {
      await revoke.mutateAsync(shareId);
      toast({
        title: "Access revoked",
        description: `${email} no longer has access to this template`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to revoke access",
        description: error.response?.data?.error || "An error occurred",
        variant: "destructive",
      });
    }
  };

  const shares = listShares.data || [];
  const isLoading = listShares.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Template</DialogTitle>
          <DialogDescription>
            Invite collaborators to use or edit "{templateName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invite Form */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <div className="space-y-2">
              <Label htmlFor="email">Invite by email</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isSharing) {
                      handleShare();
                    }
                  }}
                  disabled={isSharing}
                />
                <Select
                  value={access}
                  onValueChange={(value: "use" | "edit") => setAccess(value)}
                  disabled={isSharing}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="use">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Use
                      </div>
                    </SelectItem>
                    <SelectItem value="edit">
                      <div className="flex items-center gap-2">
                        <Pencil className="h-4 w-4" />
                        Edit
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleShare} disabled={isSharing}>
                  {isSharing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Invite"
                  )}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Use:</strong> Can insert template into surveys</p>
              <p><strong>Edit:</strong> Can modify template content and insert into surveys</p>
            </div>
          </div>

          {/* Collaborators List */}
          <div className="space-y-2">
            <Label>Collaborators ({shares.length})</Label>

            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : shares.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground border rounded-lg">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No collaborators yet</p>
                <p className="text-xs mt-1">Invite someone to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shares.map((share) => {
                  const displayEmail = share.userEmail || share.pendingEmail || "Unknown";
                  const isPending = !share.acceptedAt;

                  return (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex-shrink-0">
                          {isPending ? (
                            <Clock className="h-5 w-5 text-amber-500" />
                          ) : (
                            <User className="h-5 w-5 text-primary" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {displayEmail}
                            </p>
                            {isPending ? (
                              <Badge variant="outline" className="text-xs">
                                Pending
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Accepted
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Invited {new Date(share.invitedAt).toLocaleDateString()}
                            {share.acceptedAt && (
                              <> · Accepted {new Date(share.acceptedAt).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Select
                          value={share.access}
                          onValueChange={(value: "use" | "edit") =>
                            handleUpdateAccess(share.id, value)
                          }
                          disabled={updateAccess.isPending}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="use">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3" />
                                Use
                              </div>
                            </SelectItem>
                            <SelectItem value="edit">
                              <div className="flex items-center gap-2">
                                <Pencil className="h-3 w-3" />
                                Edit
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(share.id, displayEmail)}
                          disabled={revoke.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
