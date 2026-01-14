/**
 * Database Settings Component
 * Settings tab for database configuration
 * DataVault Phase 2: Databases feature
 */

import { Loader2, Save, Info, X } from "lucide-react";
import React, { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import type { DatavaultDatabase } from "@/lib/datavault-api";
import { useUpdateDatavaultDatabase } from "@/lib/datavault-hooks";

import { DatabaseApiTokens } from "./DatabaseApiTokens";

interface DatabaseSettingsProps {
  database: DatavaultDatabase;
  onClose?: () => void;
}

export function DatabaseSettings({ database, onClose }: DatabaseSettingsProps) {
  const { toast } = useToast();
  const updateMutation = useUpdateDatavaultDatabase();

  const [name, setName] = useState(database.name);
  const [description, setDescription] = useState(database.description || "");
  const [scopeType, setScopeType] = useState(database.scopeType);
  const [scopeId, setScopeId] = useState(database.scopeId || "");

  const hasChanges =
    name !== database.name ||
    description !== (database.description || "") ||
    scopeType !== database.scopeType ||
    scopeId !== (database.scopeId || "");

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: database.id,
        name: name.trim(),
        description: description.trim() || undefined,
        scopeType,
        scopeId: scopeId.trim() || undefined,
      });

      toast({
        title: "Settings saved",
        description: "Database settings have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setName(database.name);
    setDescription(database.description || "");
    setScopeType(database.scopeType);
    setScopeId(database.scopeId || "");
  };

  const scopeIcons = {
    account: "fas fa-building",
    project: "fas fa-folder",
    workflow: "fas fa-sitemap",
  };

  return (
    <div className="space-y-6 max-w-2xl relative">
      {/* Close Button */}
      {onClose && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="absolute -top-2 -right-2 h-8 w-8 rounded-full p-0 hover:bg-destructive/10"
          aria-label="Close settings"
        >
          <div className="rounded-full bg-background border-2 border-muted-foreground/20 hover:border-destructive/50 h-8 w-8 flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </div>
        </Button>
      )}
      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>
            Update database name and description
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Database name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Scope Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Scope Settings</CardTitle>
          <CardDescription>
            Configure database scope and access level
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                    <i className={scopeIcons.account}></i>
                    <span>Account</span>
                  </div>
                </SelectItem>
                <SelectItem value="project">
                  <div className="flex items-center gap-2">
                    <i className={scopeIcons.project}></i>
                    <span>Project</span>
                  </div>
                </SelectItem>
                <SelectItem value="workflow">
                  <div className="flex items-center gap-2">
                    <i className={scopeIcons.workflow}></i>
                    <span>Workflow</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(scopeType === 'project' || scopeType === 'workflow') && (
            <div className="grid gap-2">
              <Label htmlFor="scopeId">
                {scopeType === 'project' ? 'Project ID' : 'Workflow ID'}
              </Label>
              <Input
                id="scopeId"
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder={`Enter ${scopeType} UUID`}
              />
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  This database is scoped to a specific {scopeType}.
                  {scopeId && ` Current ID: ${scopeId.slice(0, 8)}...`}
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
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
          <CardDescription>
            Database information and statistics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Database ID</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {database.id}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Tables</span>
            <Badge variant="secondary">
              {database.tableCount || 0} {database.tableCount === 1 ? 'table' : 'tables'}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Created</span>
            <span className="text-sm">{new Date(database.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Last Updated</span>
            <span className="text-sm">{new Date(database.updatedAt).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* API Access */}
      <DatabaseApiTokens databaseId={database.id} />

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
        >
          {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={!hasChanges || updateMutation.isPending}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
