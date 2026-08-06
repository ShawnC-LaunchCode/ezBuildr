import { useState } from "react";
import { Mail, Save } from "lucide-react";

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

interface SaveAndResumeButtonProps {
  runId: string;
  saveNow: () => Promise<void>;
}

export function SaveAndResumeButton({ runId, saveNow }: SaveAndResumeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [email, setEmail] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState(1_440);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await saveNow();
      setIsOpen(true);
    } catch {
      toast({
        title: "We couldn't save your progress",
        description: "Check your connection and try again before leaving this page.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async (): Promise<void> => {
    setIsSending(true);
    try {
      const response = await fetchAPI<{ data: { expiresAt: string } }>(`/api/runs/${runId}/resume-links`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), expiryMinutes }),
      });
      setExpiresAt(response.data.expiresAt);
      toast({
        title: "Resume link sent",
        description: `Check ${email.trim().toLowerCase()} for your private link.`,
      });
    } catch {
      toast({
        title: "We couldn't send the resume link",
        description: "Check the email address and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setExpiresAt(null);
    }
    setIsOpen(nextOpen);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 text-xs text-muted-foreground"
        disabled={isSaving}
        onClick={() => { void handleSave(); }}
      >
        <Save className="mr-1.5 h-3.5 w-3.5" />
        {isSaving ? "Saving..." : "Save and finish later"}
      </Button>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{expiresAt ? "Resume link sent" : "Email a resume link"}</DialogTitle>
            <DialogDescription>
              {expiresAt
                ? "Your answers and current place are saved. The private link can be used once."
                : "Choose where to send a private, expiring link for this saved interview."}
            </DialogDescription>
          </DialogHeader>
          {expiresAt ? (
            <div role="status" className="rounded-md border bg-muted/30 p-3 text-sm">
              The link expires {new Date(expiresAt).toLocaleString()}.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resume-email">Email address</Label>
                <Input
                  id="resume-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); }}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resume-expiry">Link expires in</Label>
                <select
                  id="resume-expiry"
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
            {expiresAt ? (
              <Button type="button" onClick={() => { handleOpenChange(false); }}>Continue interview</Button>
            ) : (
              <Button
                type="button"
                disabled={isSending || email.trim() === ""}
                onClick={() => { void handleSend(); }}
              >
                <Mail className="mr-2 h-4 w-4" />
                {isSending ? "Sending..." : "Send resume link"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
