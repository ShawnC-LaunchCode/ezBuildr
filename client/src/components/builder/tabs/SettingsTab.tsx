/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
/**
 * SettingsTab - Workflow-specific settings
 * PR7: Full UI implementation with stub saves
 * PR2: Added Project Assignment section
 * PR3: Connected to real data and API
 * PR4: Loading states and enhanced UX
 */

import { Save } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ProjectAssignmentSection } from "@/components/workflows/settings/ProjectAssignmentSection";
import { useToast } from "@/hooks/use-toast";
import type { ApiWorkflow } from "@/lib/vault-api";
import { useWorkflow, useProjects, useMoveWorkflow, useUpdateWorkflow, useWorkflows } from "@/lib/vault-hooks";

import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";

import { BehaviorSettingsCard } from "./settings/BehaviorSettingsCard";
import { BrandingSettingsCard } from "./settings/BrandingSettingsCard";
import { ClientAccessSettingsCard } from "./settings/ClientAccessSettingsCard";
import { GeneralSettingsCard } from "./settings/GeneralSettingsCard";
import { IntakeSettingsCard } from "./settings/IntakeSettingsCard";
import { PublishingSettingsCard } from "./settings/PublishingSettingsCard";

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
  ) ?? [];

  // Sync state with loaded workflow data
  useEffect(() => {
    if (workflow) {
      setName(workflow.title ?? "");
      setDescription(workflow.description ?? "");
      setSlug(workflow.slug ?? "");

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
        setIsIntake(workflow.intakeConfig.isIntake ?? false);
        setUpstreamWorkflowId(workflow.intakeConfig.upstreamWorkflowId ?? null);
      }
    }
  }, [workflow]);

  // Update shareable link when dependent values change
  useEffect(() => {
    if (workflow && isPublic) {
      const baseUrl = window.location.origin;
      // Prioritize explicit public link, then current slug (state), then workflow ID
      // using 'slug' state allows the link to update in real-time as user edits the slug field
      const identifier = workflow.publicLink ?? (slug || workflow.id);
      setShareableLink(`${baseUrl}/run/${identifier}`);
    } else {
      setShareableLink("");
    }
  }, [workflow, isPublic, slug]);

  // PR3: Real projects data
  const projects = projectsData?.map(p => ({ id: p.id, name: p.title })) ?? [];
  const currentProjectId = workflow?.projectId ?? null;
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
        : projectsData?.find(p => p.id === projectId)?.title ?? "project";

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
          <GeneralSettingsCard
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            slug={slug}
            setSlug={setSlug}
          />

          {/* Prompt 24: Intake & Data Reuse */}
          <IntakeSettingsCard
            isIntake={isIntake}
            setIsIntake={setIsIntake}
            upstreamWorkflowId={upstreamWorkflowId}
            setUpstreamWorkflowId={setUpstreamWorkflowId}
            eligibleUpstream={eligibleUpstream}
          />

          {/* Project Assignment */}
          <ProjectAssignmentSection
            workflowId={workflowId}
            workflowName={workflow?.title ?? "Workflow"}
            currentProjectId={currentProjectId}
            currentProjectName={currentProjectName}
            projects={projects}
            onMove={handleMoveWorkflow}
            isMoving={moveWorkflowMutation.isPending}
            isLoading={workflowLoading || projectsLoading}
          />

          {/* Branding Settings */}
          <BrandingSettingsCard
            brandingEnabled={brandingEnabled}
            setBrandingEnabled={setBrandingEnabled}
            logoUrl={logoUrl}
            setLogoUrl={setLogoUrl}
            primaryColor={primaryColor}
            setPrimaryColor={setPrimaryColor}
            secondaryColor={secondaryColor}
            setSecondaryColor={setSecondaryColor}
          />

          {/* Behavior Settings */}
          <BehaviorSettingsCard
            completionMessage={completionMessage}
            setCompletionMessage={setCompletionMessage}
            redirectUrl={redirectUrl}
            setRedirectUrl={setRedirectUrl}
            allowSaveAndResume={allowSaveAndResume}
            setAllowSaveAndResume={setAllowSaveAndResume}
          />

          {/* Publishing Settings */}
          <PublishingSettingsCard
            isPublic={isPublic}
            setIsPublic={setIsPublic}
            requireLogin={requireLogin}
            setRequireLogin={setRequireLogin}
            shareableLink={shareableLink}
            linkCopied={linkCopied}
            onCopyLink={handleCopyLink}
          />

          {/* Client Access Settings */}
          <ClientAccessSettingsCard
            allowPortal={allowPortal}
            setAllowPortal={setAllowPortal}
            allowResume={allowResume}
            setAllowResume={setAllowResume}
            allowRedownload={allowRedownload}
            setAllowRedownload={setAllowRedownload}
          />
        </div>
      </BuilderLayoutContent>
    </BuilderLayout >
  );
}
