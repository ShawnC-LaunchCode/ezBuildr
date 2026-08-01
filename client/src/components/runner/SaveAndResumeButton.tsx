import { useMemo, useState } from "react";
import { Check, Copy, Save } from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";

interface SaveAndResumeButtonProps {
  runId: string;
  runToken: string;
  saveNow: () => Promise<void>;
}

export function SaveAndResumeButton({ runId, runToken, saveNow }: SaveAndResumeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const resumeUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}/run/${runId}#token=${encodeURIComponent(runToken)}`;
  }, [runId, runToken]);

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

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(resumeUrl);
      setCopied(true);
      toast({
        title: "Resume link copied",
        description: "Keep this private—it gives access to your saved interview.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select and copy the link manually.",
        variant: "destructive",
      });
    }
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
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your progress is saved</DialogTitle>
            <DialogDescription>
              Use this private link to continue this interview on any device. Anyone with the link can access your answers.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              aria-label="Private resume link"
              value={resumeUrl}
              readOnly
              onFocus={(event) => { event.currentTarget.select(); }}
            />
            <Button type="button" variant="outline" onClick={() => { void handleCopy(); }}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="sr-only">Copy resume link</span>
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => { setIsOpen(false); }}>
              Continue interview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
