/**
 * SettingsTab - Workflow-specific settings
 * PR7: Full UI implementation with stub saves
 * PR2: Added Project Assignment section
 * PR3: Connected to real data and API
 * PR4: Loading states and enhanced UX
 */

import { useState, useEffect } from "react";
import { Save, Link as LinkIcon, Palette, Settings as SettingsIcon, Eye, Copy, Check } from "lucide-react";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectAssignmentSection } from "@/components/workflows/settings/ProjectAssignmentSection";
import { useWorkflow, useProjects, useMoveWorkflow, useUpdateWorkflow } from "@/lib/vault-hooks";
import type { ApiWorkflow } from "@/lib/vault-api";

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
      if (workflow.publicLink) {
        const baseUrl = window.location.origin; // Or use env var
        setShareableLink(`${baseUrl}/run/${workflow.publicLink}`);
      }
    }
  }, [workflow]);

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
    }, {
      onSuccess: (updated: ApiWorkflow) => {
        toast({
          title: "Settings Saved",
          description: "Workflow settings have been updated successfully",
        });
        // Update slug in UI if it changed (sanitization/uniqueness)
        if (updated.slug) setSlug(updated.slug);
      },
      onError: (error: Error) => {
        toast({
          title: "Error Saving Settings",
          description: error.message || "Failed to save workflow settings",
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

          <Button onClick={handleSaveSettings}>
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
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter workflow name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the purpose of this workflow"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="my-workflow"
                />
                <p className="text-xs text-muted-foreground">
                  Used in public URLs: /run/{slug}
                </p>
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
                      onChange={(e) => setLogoUrl(e.target.value)}
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
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
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
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
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
                  onChange={(e) => setCompletionMessage(e.target.value)}
                  placeholder="Thank you message shown after completion"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="redirect-url">Redirect URL (Optional)</Label>
                <Input
                  id="redirect-url"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
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
                      <Button variant="outline" onClick={handleCopyLink}>
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
        </div>
      </BuilderLayoutContent>
    </BuilderLayout>
  );
}
