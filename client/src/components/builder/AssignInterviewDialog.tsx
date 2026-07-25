import { Check, Copy, UserPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
import { fetchAPI } from "@/lib/vault-api";

interface AssignInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
}

interface CreateAssignedRunResponse {
  data?: {
    runId?: string;
    runToken?: string;
  };
}

export function AssignInterviewDialog({ open, onOpenChange, workflowId }: AssignInterviewDialogProps) {
  const [email, setEmail] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleAssign = async (): Promise<void> => {
    setIsAssigning(true);
    try {
      const response = await fetchAPI<CreateAssignedRunResponse>(`/api/workflows/${workflowId}/runs`, {
        method: "POST",
        body: JSON.stringify({ clientEmail: email.trim().toLowerCase() }),
      });
      const runId = response.data?.runId;
      const runToken = response.data?.runToken;
      if (!runId || !runToken) {
        throw new Error("Assignment response was incomplete");
      }
      setResumeUrl(`${window.location.origin}/run/${runId}#token=${encodeURIComponent(runToken)}`);
      toast({ title: "Interview assigned", description: "The interview is now available in the participant portal." });
    } catch {
      toast({ title: "Assignment failed", description: "Check the email and try again.", variant: "destructive" });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(resumeUrl);
    setCopied(true);
    toast({ title: "Assignment link copied" });
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setResumeUrl("");
      setCopied(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Assign interview</DialogTitle>
          <DialogDescription>
            Create a private interview for a participant. It will appear in their portal after they sign in with this email.
          </DialogDescription>
        </DialogHeader>
        {!resumeUrl ? (
          <div className="space-y-2">
            <Label htmlFor="participant-email">Participant email</Label>
            <Input
              id="participant-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="client@example.com"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="assignment-link">Private assignment link</Label>
            <div className="flex gap-2">
              <Input id="assignment-link" value={resumeUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => { void handleCopy(); }}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only">Copy assignment link</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Keep this link private. It grants access to the participant&apos;s answers.</p>
          </div>
        )}
        <DialogFooter>
          {!resumeUrl ? (
            <Button type="button" disabled={isAssigning || email.trim() === ""} onClick={() => { void handleAssign(); }}>
              {isAssigning ? "Assigning..." : "Create assignment"}
            </Button>
          ) : (
            <Button type="button" onClick={() => handleOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
