import { useQuery } from "@tanstack/react-query";
import { MailCheck, UserPlus } from "lucide-react";
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
import { fetchAPI, runAPI, type ApiRun } from "@/lib/vault-api";

interface AssignInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  tenantId?: string;
}

interface CreateAssignedRunResponse {
  data?: { runId?: string };
}

interface TenantUser {
  id: string;
  email: string;
  fullName?: string | null;
}

type RecipientType = 'client' | 'user';
type AssignableRun = ApiRun & { clientEmail?: string | null };

export function AssignInterviewDialog({
  open,
  onOpenChange,
  workflowId,
  tenantId,
}: AssignInterviewDialogProps) {
  const [email, setEmail] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>('client');
  const [selectedRunId, setSelectedRunId] = useState("");
  const [assignedRunId, setAssignedRunId] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState(1_440);
  const [isRevoked, setIsRevoked] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();

  const { data: runs = [] } = useQuery<AssignableRun[]>({
    queryKey: ['workflow-runs', workflowId, 'handoff'],
    queryFn: () => runAPI.list(workflowId),
    enabled: open,
  });
  const { data: tenantUsers = [] } = useQuery<TenantUser[]>({
    queryKey: ['tenant-users', tenantId, 'handoff'],
    queryFn: async () => {
      const response = await fetchAPI<{ users: TenantUser[] }>(`/api/tenants/${tenantId}/users`);
      return response.users;
    },
    enabled: open && Boolean(tenantId),
  });

  const handleAssign = async (): Promise<void> => {
    setIsAssigning(true);
    try {
      let runId = selectedRunId;
      if (!runId) {
        const created = await fetchAPI<CreateAssignedRunResponse>(`/api/workflows/${workflowId}/runs`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        runId = created.data?.runId ?? '';
      }
      if (!runId) {
        throw new Error("Assignment response was incomplete");
      }
      const recipient = recipientType === 'user'
        ? { assigneeUserId }
        : { clientEmail: email.trim().toLowerCase() };
      await fetchAPI(`/api/runs/${runId}/handoff`, {
        method: 'POST',
        body: JSON.stringify({ ...recipient, expiryMinutes }),
      });
      setAssignedRunId(runId);
      toast({ title: "Interview handed off", description: "A private resume link was emailed to the participant." });
    } catch {
      toast({ title: "Handoff failed", description: "Check the recipient and try again.", variant: "destructive" });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRevoke = async (): Promise<void> => {
    try {
      await fetchAPI(`/api/runs/${assignedRunId}/revoke-token`, { method: "POST" });
      setIsRevoked(true);
      toast({ title: "Assignment access revoked", description: "The participant can no longer use the emailed link." });
    } catch {
      toast({ title: "Revocation failed", description: "Try again before closing this dialog.", variant: "destructive" });
    }
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setAssignedRunId("");
      setIsRevoked(false);
      setSelectedRunId("");
    }
    onOpenChange(nextOpen);
  };

  const recipientMissing = recipientType === 'user' ? !assigneeUserId : !email.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Assign or hand off interview</DialogTitle>
          <DialogDescription>
            Start a new interview or transfer an in-progress one to a client or team member.
          </DialogDescription>
        </DialogHeader>
        {assignedRunId ? (
          <div role="status" className="rounded-md border bg-muted/30 p-4 text-sm">
            {isRevoked ? (
              "This assignment access has been revoked."
            ) : (
              <span className="flex items-center gap-2"><MailCheck className="h-4 w-4" />The private, one-time link was emailed.</span>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="handoff-run">Interview</Label>
              <select
                id="handoff-run"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedRunId}
                onChange={(event) => { setSelectedRunId(event.target.value); }}
              >
                <option value="">Start a new interview</option>
                {runs.filter(run => !run.completed).map(run => (
                  <option key={run.id} value={run.id}>
                    In progress #{run.id.slice(0, 8)}{run.clientEmail ? ` — ${run.clientEmail}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient-type">Recipient type</Label>
              <select
                id="recipient-type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={recipientType}
                onChange={(event) => { setRecipientType(event.target.value as RecipientType); }}
              >
                <option value="client">Client email</option>
                <option value="user">Team member</option>
              </select>
            </div>
            {recipientType === 'user' ? (
              <div className="space-y-2">
                <Label htmlFor="assignee-user">Team member</Label>
                <select
                  id="assignee-user"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={assigneeUserId}
                  onChange={(event) => { setAssigneeUserId(event.target.value); }}
                >
                  <option value="">Select a team member</option>
                  {tenantUsers.map(user => (
                    <option key={user.id} value={user.id}>{user.fullName ?? user.email} — {user.email}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="participant-email">Client email</Label>
                <Input
                  id="participant-email"
                  type="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); }}
                  placeholder="client@example.com"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="handoff-expiry">Link expires in</Label>
              <select
                id="handoff-expiry"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={expiryMinutes}
                onChange={(event) => { setExpiryMinutes(Number(event.target.value)); }}
              >
                <option value={60}>1 hour</option>
                <option value={1_440}>24 hours</option>
                <option value={10_080}>7 days</option>
              </select>
            </div>
          </div>
        )}
        <DialogFooter>
          {!assignedRunId ? (
            <Button type="button" disabled={isAssigning || recipientMissing} onClick={() => { void handleAssign(); }}>
              {isAssigning ? "Sending..." : selectedRunId ? "Send handoff" : "Create assignment"}
            </Button>
          ) : (
            <>
              {!isRevoked && (
                <Button type="button" variant="destructive" onClick={() => { void handleRevoke(); }}>
                  Revoke assignment access
                </Button>
              )}
              <Button type="button" onClick={() => { handleOpenChange(false); }}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
