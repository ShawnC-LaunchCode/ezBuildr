/**
 * SettingsTab - Workflow-specific settings
 * PR7: Full UI implementation with stub saves
 * PR2: Added Project Assignment section
 * PR3: Connected to real data and API
 * PR4: Loading states and enhanced UX
 */

import { Save, Link as LinkIcon, Palette, Settings as SettingsIcon, Eye, Copy, Check, FileText, ArrowRight, Database } from "lucide-react";
import React, { useState, useEffect } from "react";


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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ProjectAssignmentSection } from "@/components/workflows/settings/ProjectAssignmentSection";
import { useToast } from "@/hooks/use-toast";
import type { ApiWorkflow } from "@/lib/vault-api";
import { useWorkflow, useProjects, useMoveWorkflow, useUpdateWorkflow, useWorkflows } from "@/lib/vault-hooks";

import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";

interface SettingsTabProps {
  workflowId: string;
}

export function SettingsTab({ workflowId }: SettingsTabProps) {
  const { toast } = useToast();

  // PR3: Fetch real data
  const { data: workflow, isLoading: workflowLoading } = useWorkflow(workflowId);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(true); // activeOnly = true
  const moveWorkflowMutation = useMoveWorkflow();

  // General Settings
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");

  // Branding Settings
  const [brandingEnabled, setBrandingEnabled] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3b82f6");
  const [secondaryColor, setSecondaryColor] = useState("#8b5cf6");

  // Behavior Settings
  const [completionMessage, setCompletionMessage] = useState("Thank you for completing this workflow!");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [allowSaveAndResume, setAllowSaveAndResume] = useState(true);

  // Publishing Settings
  const [isPublic, setIsPublic] = useState(false);
  const [requireLogin, setRequireLogin] = useState(false);
  const [shareableLink, setShareableLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);



  // Access Settings
  const [allowPortal, setAllowPortal] = useState(false);
  const [allowResume, setAllowResume] = useState(true);
  const [allowRedownload, setAllowRedownload] = useState(true);

  // Prompt 24: Intake Settings
  const [isIntake, setIsIntake] = useState(false);
  const [upstreamWorkflowId, setUpstreamWorkflowId] = useState<string | null>(null);

  // Fetch all workflows to select upstream (simple approach for now)
  const { data: allWorkflows } = useWorkflows();
  // Filter eligible upstream workflows: Active, Is Intake, Not current workflow
  const eligibleUpstream = allWorkflows?.filter(w =>
    w.id !== workflowId &&
    w.intakeConfig?.isIntake === true &&
    w.status !== 'archived'
  ) || [];

  // Sync state with loaded workflow data
  useEffect(() => {
    if (workflow) {
      setName(workflow.title || "");
      setDescription(workflow.description || "");
      setSlug(workflow.slug || "");

      // Branding
      // Note: backend support for branding config might vary, check type definition
      // Assuming branding is stored in config or separate fields?
      // Based on previous files, branding might be tenant level or workflow config
      // For now, let's look for known fields or leave defaults if not present

      // Behavior
      setAllowSaveAndResume(true); // Default

      // Publishing
      setIsPublic(workflow.status === 'active' || !!workflow.publicLink);

      // Access Settings
      if (workflow.accessSettings) {
        setAllowPortal(workflow.accessSettings.allow_portal ?? false);
        setAllowResume(workflow.accessSettings.allow_resume ?? true);
        setAllowRedownload(workflow.accessSettings.allow_redownload ?? true);
      }

      // Intake Config
      if (workflow.intakeConfig) {
        setIsIntake(workflow.intakeConfig.isIntake || false);
        setUpstreamWorkflowId(workflow.intakeConfig.upstreamWorkflowId || null);
      }
    }
  }, [workflow]);

  // Update shareable link when dependent values change
  useEffect(() => {
    if (workflow && isPublic) {
      const baseUrl = window.location.origin;
      // Prioritize explicit public link, then current slug (state), then workflow ID
      // using 'slug' state allows the link to update in real-time as user edits the slug field
      const identifier = workflow.publicLink || slug || workflow.id;
      setShareableLink(`${baseUrl}/run/${identifier}`);
    } else {
      setShareableLink("");
    }
  }, [workflow, isPublic, slug]);

  // PR3: Real projects data
  const projects = projectsData?.map(p => ({ id: p.id, name: p.title })) || [];
  const currentProjectId = workflow?.projectId || null;
  const currentProjectName = projectsData?.find(p => p.id === currentProjectId)?.title;

  const updateWorkflowMutation = useUpdateWorkflow();

  const handleSaveSettings = () => {
    updateWorkflowMutation.mutate({
      id: workflowId,
      title: name,
      description,
      slug: slug || undefined,

      // status: isPublic ? 'active' : 'draft', // Careful changing status here?
      // Other fields handled by mutation...
      accessSettings: {
        allow_portal: allowPortal,
        allow_resume: allowResume,
        allow_redownload: allowRedownload
      },
      intakeConfig: {
        isIntake,
        upstreamWorkflowId: isIntake ? null : upstreamWorkflowId // Cannot be intake AND have upstream intake (for now to avoid cycles)
      }
    }, {
      onSuccess: (updated: ApiWorkflow) => {
        toast({
          title: "Settings Saved",
          description: "Workflow settings have been updated successfully",
        });
        // Update slug in UI if it changed (sanitization/uniqueness)
        if (updated.slug) { setSlug(updated.slug); }
      },
      onError: (error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to save workflow settings";
        toast({
          title: "Error Saving Settings",
          description: message,
          variant: "destructive"
        });
      }
    });
  };

  // Copy shareable link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);

    toast({
      title: "Link Copied",
      description: "Shareable link copied to clipboard",
    });
  };

  // PR3: Handle project assignment move with API
  const handleMoveWorkflow = async (projectId: string | null) => {
    try {
      await moveWorkflowMutation.mutateAsync({
        id: workflowId,
        projectId,
      });

      const targetName = projectId === null
        ? "Main Folder"
        : projectsData?.find(p => p.id === projectId)?.title || "project";

      toast({
        title: "Workflow Moved",
        description: `Workflow moved to ${targetName}.`,
      });
    } catch (error) {
      toast({
        title: "Failed to Move Workflow",
        description: error instanceof Error ? error.message : "An error occurred while moving the workflow.",
        variant: "destructive",
      });
    }
  };

  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Workflow Settings</h2>
            <p className="text-sm text-muted-foreground">
              Configure general settings, branding, behavior, and publishing options
            </p>
          </div>

          <Button onClick={() => { void handleSaveSettings(); }}>
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </BuilderLayoutHeader>

      <BuilderLayoutContent>
        <div className="max-w-3xl space-y-6">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" />
                <CardTitle>General</CardTitle>
              </div>
              <CardDescription>
                Basic workflow information and identification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Workflow Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => { void setName(e.target.value); }}
                  placeholder="Enter workflow name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => { void setDescription(e.target.value); }}
                  placeholder="Describe the purpose of this workflow"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => { void setSlug(e.target.value); }}
                  placeholder="my-workflow"
                />
                <p className="text-xs text-muted-foreground">
                  Used in public URLs: /run/{slug}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Prompt 24: Intake & Data Reuse */}
          <Card className="border-indigo-100 shadow-sm">
            <CardHeader className="bg-indigo-50/30 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                <CardTitle className="text-indigo-900">Intake & Data Reuse</CardTitle>
              </div>
              <CardDescription>
                Configure how this workflow collects or consumes data from other workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">

              {/* Option A: Is Intake? */}
              <div className="flex items-start justify-between space-x-4">
                <div className="space-y-1">
                  <Label htmlFor="is-intake" className="text-base font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    Mark as Client Intake Workflow
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Designate this workflow as a primary source of client data. Answers collected here can be reused in downstream workflows.
                  </p>
                </div>
                <Switch
                  id="is-intake"
                  checked={isIntake}
                  onCheckedChange={(checked) => {
                    setIsIntake(checked);
                    if (checked) { setUpstreamWorkflowId(null); } // Clear upstream if becoming intake
                  }}
                />
              </div>

              {isIntake && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-md p-3 text-xs text-indigo-800 flex items-start gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Active Intake Source:</strong> Questions in this workflow will export their variables (aliases) to the global client context.
                  </div>
                </div>
              )}

              <Separator />

              {/* Option B: Consume Intake? */}
              <div className={isIntake ? "opacity-50 pointer-events-none" : ""}>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-base font-medium flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-emerald-500" />
                      Link to Upstream Intake
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Connect this workflow to an existing Client Intake workflow to pre-fill answers.
                    </p>
                  </div>

                  <div className="max-w-md">
                    <Select
                      value={upstreamWorkflowId || "none"}
                      onValueChange={(val) => setUpstreamWorkflowId(val === "none" ? null : val)}
                      disabled={isIntake}
                    >
                      <SelectTrigger disabled={isIntake} className="bg-background">
                        <SelectValue placeholder="Select an intake workflow..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- None --</SelectItem>
                        {eligibleUpstream.map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            <div className="flex items-center gap-2">
                              <FileText className="w-3 h-3 text-muted-foreground" />
                              <span>{w.title}</span>
                              <Badge variant="outline" className="text-[10px] h-4 px-1 ml-2">Intake</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {upstreamWorkflowId && (
                    <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 p-2 rounded flex items-center gap-2 mt-2">
                      <Check className="w-3 h-3" />
                      Linked to <strong>{eligibleUpstream.find(u => u.id === upstreamWorkflowId)?.title}</strong>. You can now use its variables as default values.
                    </div>
                  )}

                </div>
              </div>
            </CardContent>
          </Card>

          {/* Project Assignment (PR4: Full integration with loading states) */}
          <ProjectAssignmentSection
            workflowId={workflowId}
            workflowName={workflow?.title || "Workflow"}
            currentProjectId={currentProjectId}
            currentProjectName={currentProjectName}
            projects={projects}
            onMove={handleMoveWorkflow}
            isMoving={moveWorkflowMutation.isPending}
            isLoading={workflowLoading || projectsLoading}
          />

          {/* Branding Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                <CardTitle>Branding</CardTitle>
              </div>
              <CardDescription>
                Customize the appearance of your workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="branding-enabled">Enable Custom Branding</Label>
                  <p className="text-xs text-muted-foreground">
                    Apply custom colors and logo to this workflow
                  </p>
                </div>
                <Switch
                  id="branding-enabled"
                  checked={brandingEnabled}
                  onCheckedChange={setBrandingEnabled}
                />
              </div>

              {brandingEnabled && (
                <>
                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="logo">Logo URL</Label>
                    <Input
                      id="logo"
                      value={logoUrl}
                      onChange={(e) => { void setLogoUrl(e.target.value); }}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primary-color">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primary-color"
                          type="color"
                          value={primaryColor}
                          onChange={(e) => { void setPrimaryColor(e.target.value); }}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={primaryColor}
                          onChange={(e) => { void setPrimaryColor(e.target.value); }}
                          placeholder="#3b82f6"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="secondary-color">Secondary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondary-color"
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => { void setSecondaryColor(e.target.value); }}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={secondaryColor}
                          onChange={(e) => { void setSecondaryColor(e.target.value); }}
                          placeholder="#8b5cf6"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Behavior Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" />
                <CardTitle>Behavior</CardTitle>
              </div>
              <CardDescription>
                Configure workflow completion and user experience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="completion-message">Completion Message</Label>
                <Textarea
                  id="completion-message"
                  value={completionMessage}
                  onChange={(e) => { void setCompletionMessage(e.target.value); }}
                  placeholder="Thank you message shown after completion"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="redirect-url">Redirect URL (Optional)</Label>
                <Input
                  id="redirect-url"
                  value={redirectUrl}
                  onChange={(e) => { void setRedirectUrl(e.target.value); }}
                  placeholder="https://example.com/thank-you"
                />
                <p className="text-xs text-muted-foreground">
                  Redirect users to this URL after completion instead of showing completion message
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="save-resume">Allow Save & Resume</Label>
                  <p className="text-xs text-muted-foreground">
                    Let users save progress and return later
                  </p>
                </div>
                <Switch
                  id="save-resume"
                  checked={allowSaveAndResume}
                  onCheckedChange={setAllowSaveAndResume}
                />
              </div>
            </CardContent>
          </Card>

          {/* Publishing Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                <CardTitle>Publishing</CardTitle>
              </div>
              <CardDescription>
                Control who can access and run this workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="is-public">Public Access</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow anyone with the link to run this workflow
                  </p>
                </div>
                <Switch
                  id="is-public"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
              </div>

              {isPublic && (
                <>
                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="require-login">Require Login</Label>
                      <p className="text-xs text-muted-foreground">
                        Users must sign in to run this workflow
                      </p>
                    </div>
                    <Switch
                      id="require-login"
                      checked={requireLogin}
                      onCheckedChange={setRequireLogin}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Shareable Link</Label>
                    <div className="flex gap-2">
                      <Input
                        value={shareableLink}
                        readOnly
                        className="flex-1 font-mono text-sm"
                      />
                      <Button variant="outline" onClick={() => { void handleCopyLink(); }}>
                        {linkCopied ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Share this link with participants to access the workflow
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>


          {/* Client Access Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5" />
                <CardTitle>Client Access & Portal</CardTitle>
              </div>
              <CardDescription>
                Configure how clients can access their results and history
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="allow-portal">Enable Client Portal Access</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow clients to sign in via email to view past runs and documents
                  </p>
                </div>
                <Switch
                  id="allow-portal"
                  checked={allowPortal}
                  onCheckedChange={setAllowPortal}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="allow-resume">Allow Resuming</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow clients to resume incomplete or outdated workflows from the portal
                  </p>
                </div>
                <Switch
                  id="allow-resume"
                  checked={allowResume}
                  onCheckedChange={setAllowResume}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="allow-redownload">Allow Re-downloading</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow clients to access generated documents after completion
                  </p>
                </div>
                <Switch
                  id="allow-redownload"
                  checked={allowRedownload}
                  onCheckedChange={setAllowRedownload}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </BuilderLayoutContent>
    </BuilderLayout >
  );
}
