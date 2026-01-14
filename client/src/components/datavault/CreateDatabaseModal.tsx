/**
 * Create Database Modal Component
 * Modal for creating a new database with scope configuration
 * DataVault Phase 2: Databases feature
 */

import { Loader2, Info } from "lucide-react";
import React, { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface CreateDatabaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    scopeType: 'account' | 'project' | 'workflow';
    scopeId?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

export function CreateDatabaseModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: CreateDatabaseModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeType, setScopeType] = useState<'account' | 'project' | 'workflow'>('account');
  const [scopeId, setScopeId] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    // Validate scope configuration
    if ((scopeType === 'project' || scopeType === 'workflow') && !scopeId.trim()) {
      return;
    }

    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      scopeType,
      scopeId: scopeId.trim() || undefined,
    });

    // Reset form
    setName("");
    setDescription("");
    setScopeType('account');
    setScopeId("");
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setScopeType('account');
    setScopeId("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          resetForm();
        }
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Database</DialogTitle>
            <DialogDescription>
              Create a new database to organize your tables by project, workflow, or account.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Customer Data, Product Catalog"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description of this database..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Scope Type */}
            <div className="grid gap-2">
              <Label htmlFor="scopeType">
                Scope Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={scopeType}
                onValueChange={(value) => setScopeType(value as 'account' | 'project' | 'workflow')}
              >
                <SelectTrigger id="scopeType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="account">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-building"></i>
                      <span>Account</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="project">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-folder"></i>
                      <span>Project</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="workflow">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-sitemap"></i>
                      <span>Workflow</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scope ID (conditionally shown) */}
            {(scopeType === 'project' || scopeType === 'workflow') && (
              <div className="grid gap-2">
                <Label htmlFor="scopeId">
                  {scopeType === 'project' ? 'Project ID' : 'Workflow ID'}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="scopeId"
                  placeholder={`Enter ${scopeType} UUID`}
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  required
                />
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This database will be scoped to a specific {scopeType}.
                    Provide the {scopeType} UUID.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {scopeType === 'account' && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Account-level databases are accessible across all projects and workflows in your account.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Database
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
