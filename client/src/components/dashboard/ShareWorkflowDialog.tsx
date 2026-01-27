import {  Copy, UserPlus, X } from "lucide-react";
import React, { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
interface ShareWorkflowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflowId: string;
    workflowTitle: string;
}
type Role = "viewer" | "editor" | "owner";
interface Collaborator {
    email: string;
    role: Role;
    isPending?: boolean;
}
// Mock initial data
const INITIAL_collaborators: Collaborator[] = [
    { email: "you@example.com", role: "owner" },
];
export function ShareWorkflowDialog({ open, onOpenChange, workflowId, workflowTitle }: ShareWorkflowDialogProps) {
    const { toast } = useToast();
    const [collaborators, setCollaborators] = useState<Collaborator[]>(INITIAL_collaborators);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<Role>("viewer");
    const handleCopyLink = () => {
        // In real app, this might be a specific share link
        const link = `${window.location.origin}/workflows/${workflowId}/builder`;
        navigator.clipboard.writeText(link);
        toast({
            title: "Link copied",
            description: "Builder link copied to clipboard.",
        });
    };
    const handleInvite = () => {
        if (!inviteEmail.trim()) {return;}
        // Simulate api call
        setTimeout(() => {
            setCollaborators([...collaborators, { email: inviteEmail, role: inviteRole, isPending: true }]);
            setInviteEmail("");
            toast({
                title: "Invitation sent",
                description: `Invited ${inviteEmail} as ${inviteRole}.`,
            });
        }, 500);
    };
    const removeCollaborator = (email: string) => {
        setCollaborators(collaborators.filter(c => c.email !== email));
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Share "{workflowTitle}"</DialogTitle>
                    <DialogDescription>
                        Invite teammates to collaborate on this workflow.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    {/* Invite Section */}
                    <div className="flex gap-2 items-end">
                        <div className="grid gap-1.5 flex-1">
                            <Label htmlFor="email">Add people</Label>
                            <Input
                                id="email"
                                placeholder="colleague@example.com"
                                value={inviteEmail}
                                onChange={(e) => { void setInviteEmail(e.target.value); }}
                                onKeyDown={(e) => { void e.key === "Enter" && handleInvite(); }}
                            />
                        </div>
                        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                            <SelectTrigger className="w-[110px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="viewer">Viewer</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={() => { void handleInvite(); }} disabled={!inviteEmail.trim()}>
                            <UserPlus className="w-4 h-4 mr-2" />
                            Invite
                        </Button>
                    </div>
                    <Separator />
                    {/* Link Copy Section */}
                    <div className="flex items-center justify-between space-x-2 bg-muted/40 p-2 rounded-md border">
                        <div className="text-sm text-muted-foreground truncate flex-1 pl-1">
                            {window.location.origin}/workflows/{workflowId}/...
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { void handleCopyLink(); }}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Link
                        </Button>
                    </div>
                    {/* Collaborators List */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium">People with access</h4>
                        <ScrollArea className="h-[200px] pr-4">
                            <div className="space-y-4">
                                {collaborators.map((c) => (
                                    <div key={c.email} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="uppercase text-xs">{c.email.substring(0, 2)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-sm font-medium leading-none">{c.email}</div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {c.isPending ? "Pending invite" : c.role === "owner" ? "Owner" : "Collaborator"}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {c.role === "owner" ? (
                                                <span className="text-xs text-muted-foreground px-2">Owner</span>
                                            ) : (
                                                <>
                                                    <Select defaultValue={c.role} disabled>
                                                        <SelectTrigger className="h-8 w-[90px] text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="viewer">Viewer</SelectItem>
                                                            <SelectItem value="editor">Editor</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                        onClick={() => { void removeCollaborator(c.email); }}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}