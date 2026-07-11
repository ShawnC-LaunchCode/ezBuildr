import { Copy, Database, Table2, User, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizations } from "@/hooks/useOrganizations";
import type { ApiAssetCopyOptions } from "@/lib/vault-api";

export type CopyAssetType = "workflow" | "project";

interface CopyAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetType: CopyAssetType;
  assetName: string;
  onCopy: (options: ApiAssetCopyOptions) => Promise<void>;
  isPending?: boolean;
}

function defaultCopyName(name: string): string {
  const trimmed = name.trim() || "Untitled";
  return trimmed.toLowerCase().startsWith("dev_") ? trimmed : `dev_${trimmed}`;
}

export function CopyAssetDialog({
  open,
  onOpenChange,
  assetType,
  assetName,
  onCopy,
  isPending = false,
}: CopyAssetDialogProps) {
  const { user } = useAuth();
  const { data: organizations, isLoading: orgsLoading } = useOrganizations();
  const defaultOwner = useMemo(() => `user:${user?.id ?? ""}`, [user?.id]);
  const [name, setName] = useState(defaultCopyName(assetName));
  const [selectedOwner, setSelectedOwner] = useState(defaultOwner);
  const [includeRelatedDatavault, setIncludeRelatedDatavault] = useState(true);
  const [includeDatavaultData, setIncludeDatavaultData] = useState(false);
  const [clearAccess, setClearAccess] = useState(true);

  useEffect(() => {
    if (open) {
      setName(defaultCopyName(assetName));
      setSelectedOwner(defaultOwner);
      setIncludeRelatedDatavault(true);
      setIncludeDatavaultData(false);
      setClearAccess(true);
    }
  }, [assetName, defaultOwner, open]);

  const handleCopy = async () => {
    if (!selectedOwner || !name.trim()) {
      return;
    }
    const [targetOwnerType, targetOwnerUuid] = selectedOwner.split(":") as ["user" | "org", string];
    await onCopy({
      name: name.trim(),
      targetOwnerType,
      targetOwnerUuid,
      includeRelatedDatavault,
      includeDatavaultData: includeRelatedDatavault ? includeDatavaultData : false,
      clearAccess,
    });
    onOpenChange(false);
  };

  const assetLabel = assetType === "project" ? "project" : "workflow";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy {assetLabel}</DialogTitle>
          <DialogDescription>
            Create a separate copy of &quot;{assetName}&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="copy-asset-name">Copy name</Label>
            <Input
              id="copy-asset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <Label className="text-base font-medium">Owner</Label>
            {orgsLoading ? (
              <div className="text-sm text-muted-foreground">Loading owners...</div>
            ) : (
              <RadioGroup value={selectedOwner} onValueChange={setSelectedOwner}>
                <div className="flex items-center space-x-2 p-3 rounded-md border">
                  <RadioGroupItem value={defaultOwner} id="copy-owner-user" disabled={!user?.id} />
                  <Label htmlFor="copy-owner-user" className="flex items-center gap-3 cursor-pointer flex-1">
                    <span className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </span>
                    <span>
                      <span className="block font-medium">My account</span>
                      <span className="block text-sm text-muted-foreground">{user?.email}</span>
                    </span>
                  </Label>
                </div>

                {(organizations ?? []).map((org) => {
                  const disabled = org.role !== "admin";
                  return (
                    <div key={org.id} className="flex items-center space-x-2 p-3 rounded-md border">
                      <RadioGroupItem value={`org:${org.id}`} id={`copy-owner-${org.id}`} disabled={disabled} />
                      <Label
                        htmlFor={`copy-owner-${org.id}`}
                        className={`flex items-center gap-3 flex-1 ${disabled ? "opacity-60" : "cursor-pointer"}`}
                      >
                        <span className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
                          <Users className="h-4 w-4 text-purple-700" />
                        </span>
                        <span>
                          <span className="block font-medium">{org.name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {disabled ? "Admin required" : "Organization"}
                          </span>
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-base font-medium">Copy options</Label>
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
              <Checkbox
                checked={includeRelatedDatavault}
                onCheckedChange={(checked) => {
                  const enabled = checked === true;
                  setIncludeRelatedDatavault(enabled);
                  if (!enabled) {
                    setIncludeDatavaultData(false);
                  }
                }}
              />
              <span className="flex-1">
                <span className="flex items-center gap-2 font-medium">
                  <Database className="h-4 w-4" />
                  Related tables and databases
                </span>
              </span>
            </label>

            <label className={`flex items-start gap-3 rounded-md border p-3 ${includeRelatedDatavault ? "cursor-pointer" : "opacity-60"}`}>
              <Checkbox
                checked={includeDatavaultData}
                disabled={!includeRelatedDatavault}
                onCheckedChange={(checked) => setIncludeDatavaultData(checked === true)}
              />
              <span className="flex-1">
                <span className="flex items-center gap-2 font-medium">
                  <Table2 className="h-4 w-4" />
                  Include table rows
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
              <Checkbox checked={clearAccess} onCheckedChange={(checked) => setClearAccess(checked === true)} />
              <span className="flex-1">
                <span className="font-medium">Clear shared visibility</span>
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => { void handleCopy(); }} disabled={isPending || !name.trim() || !selectedOwner}>
            <Copy className="w-4 h-4 mr-2" />
            {isPending ? "Copying..." : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
